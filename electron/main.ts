import { app, BrowserWindow, ipcMain, session, Tray } from 'electron';
import type { IpcMainInvokeEvent } from 'electron';
import * as path from 'node:path';
import { pathToFileURL } from 'node:url';
import { assertTrustedUI } from './ipc-security';
import { isHttpUrl, isSameDocument, isSameOrigin } from './url-policy';
import { guardWebNavigation, openExternalHttp } from './navigation';
import { editableSettingsPatch } from './settings-schema';
import { flushSettings, loadSettings, saveSettings } from './settings';
import { ARENA_PARTITION, TabManager } from './tabs';
import { appIconPng, createTray } from './tray';
import { clearGlobalShortcuts, setGlobalShortcut } from './shortcuts';
import { AppUpdater } from './updater';
import { attachContextMenu } from './context-menu';
import { AppSettings, DEFAULT_HOMEPAGE } from './shared';

const isDev = !app.isPackaged && process.env.ARENA_DEV === '1';
const VITE_URL = process.env.ARENA_VITE_URL ?? 'http://127.0.0.1:5173';
const UI_URL = isDev
  ? new URL(VITE_URL).href
  : pathToFileURL(path.join(__dirname, '..', 'dist', 'index.html')).href;

app.setName('Arena');
if (process.platform === 'win32') app.setAppUserModelId('ai.arena.desktop');

let win: BrowserWindow | null = null;
let tabs: TabManager | null = null;
let updater: AppUpdater | null = null;
let forceQuit = false;
let persistTimer: NodeJS.Timeout | null = null;
let uiTimer: NodeJS.Timeout | null = null;
let tray: Tray | null = null;
const popups = new Set<BrowserWindow>();
let quitting = false;
let quitReady = false;
let quitPreparation: Promise<void> | null = null;
let dataClear: Promise<void> | null = null;

// ---------- 單一實例：重複開啟時聚焦舊視窗 ----------

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (!win) return;
    if (win.isMinimized()) win.restore();
    win.show();
    win.focus();
  });
  void app.whenReady().then(startup);
  app.on('before-quit', (event) => {
    forceQuit = true;
    if (quitReady) return;
    event.preventDefault();
    void prepareQuit().then(() => app.quit());
  });
  app.on('will-quit', () => {
    tray?.destroy();
    tray = null;
    for (const popup of popups) popup.destroy();
    popups.clear();
  });
  // Windows 上關掉所有視窗就結束（除非設定了縮到系統匣，那時視窗只是隱藏）
  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });
}

/** 依主題回傳視窗/內容區還沒載入好之前顯示的底色。 */
function themeBackground(): string {
  return loadSettings().theme === 'dark' ? '#1c1917' : '#f5f0e8';
}

async function startup(): Promise<void> {
  const settings = loadSettings();
  applyLoginItem(settings);

  win = new BrowserWindow({
    width: settings.windowBounds?.width ?? 1280,
    height: settings.windowBounds?.height ?? 800,
    x: settings.windowBounds?.x,
    y: settings.windowBounds?.y,
    minWidth: 960,
    minHeight: 640,
    frame: false, // 自繪標題列 + 分頁列
    backgroundColor: themeBackground(),
    show: false,
    icon: appIconPng(),
    webPreferences: {
      preload: path.join(__dirname, 'ui-preload.js'),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  win.setMenu(null);
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', (event, url) => {
    if (!isSameDocument(url, UI_URL)) event.preventDefault();
  });
  win.webContents.on('will-frame-navigate', (event) => {
    if (!event.isMainFrame || !isSameDocument(event.url, UI_URL)) event.preventDefault();
  });
  win.webContents.on('will-redirect', (event, url) => {
    if (!isSameDocument(url, UI_URL)) event.preventDefault();
  });
  win.webContents.on('will-attach-webview', (event) => event.preventDefault());

  // 權限：通知開關由設定控制，其餘一律拒絕
  session
    .fromPartition(ARENA_PARTITION)
    .setPermissionRequestHandler((_wc, permission, callback) => {
      callback(permission === 'notifications' ? loadSettings().notificationsEnabled : false);
    });

  updater = new AppUpdater((s) => win?.webContents.send('arena:update:status', s));

  tabs = new TabManager(win, path.join(__dirname, 'content-preload.js'), {
    onChanged: scheduleSendTabs,
    onPersist: schedulePersistTabs,
    onOpenPopup: openPopup,
  });

  // UI 重載或崩潰後，舊的設定面板已不存在，不能讓內容永遠保持隱藏。
  win.webContents.on('did-start-navigation', (_e, _url, isInPlace, isMainFrame) => {
    if (isMainFrame && !isInPlace) tabs?.setContentObscured(false);
  });
  win.webContents.on('render-process-gone', () => tabs?.setContentObscured(false));

  registerIpc();
  attachContextMenu(win.webContents);

  win.once('ready-to-show', () => win?.show());
  win.on('close', (e) => {
    if (!forceQuit && loadSettings().closeBehavior === 'tray') {
      e.preventDefault(); // 縮到系統匣而不是結束
      win?.hide();
    } else if (!quitReady) {
      e.preventDefault();
      app.quit();
    }
  });
  win.on('closed', () => {
    tabs?.destroy();
    tabs = null;
    win = null;
  });
  win.on('resize', () => tabs?.layout());
  win.on('maximize', () => {
    tabs?.layout();
    win?.webContents.send('arena:window:maximized', true);
  });
  win.on('unmaximize', () => {
    tabs?.layout();
    win?.webContents.send('arena:window:maximized', false);
  });
  win.on('resized', saveBounds);
  win.on('moved', saveBounds);

  tray = createTray({
    onToggle: toggleWindow,
    onCheckUpdate: () => void updater?.check(),
    onToggleAutostart: () => {
      const s = saveSettings({ launchAtStartup: !loadSettings().launchAtStartup });
      applyLoginItem(s);
      win?.webContents.send('arena:settings:changed', s);
    },
    isAutostart: () => loadSettings().launchAtStartup,
    onQuit: () => {
      forceQuit = true;
      app.quit();
    },
  });

  const shortcutError = setGlobalShortcut(
    settings.globalShortcut,
    settings.globalShortcutEnabled,
    toggleWindow,
  );
  if (shortcutError) console.warn('[shortcut]', shortcutError);

  if (isDev) {
    await win.loadURL(`${VITE_URL}#theme=${settings.theme}`);
    win.webContents.openDevTools({ mode: 'detach' });
  } else {
    await win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'), {
      query: { theme: settings.theme },
    });
  }

  // 還原上次的分頁；沒有紀錄就開首頁
  const restore =
    settings.restoreTabs.length > 0
      ? settings.restoreTabs
      : [settings.homepage || DEFAULT_HOMEPAGE];
  restore.forEach((url, i) => tabs?.createTab(url, { activate: i === restore.length - 1 }));
  sendTabs();

  updater.start();
}

// ---------- 視窗 / 登入項 ----------

function toggleWindow(): void {
  if (!win) return;
  if (win.isVisible() && !win.isMinimized()) {
    win.hide();
  } else {
    if (win.isMinimized()) win.restore();
    win.show();
    win.focus();
  }
}

function saveBounds(): void {
  if (!win || win.isMinimized() || win.isMaximized()) return;
  try {
    const b = win.getBounds();
    saveSettings({ windowBounds: { width: b.width, height: b.height, x: b.x, y: b.y } });
  } catch {
    /* 忽略 */
  }
}

function applyLoginItem(s: AppSettings): void {
  try {
    app.setLoginItemSettings({ openAtLogin: s.launchAtStartup });
  } catch (err) {
    console.warn('[login-item] failed:', err);
  }
}

/** 關窗、系統結束、Tray quit 與安裝更新都走同一條 flush 路徑。 */
async function prepareQuit(): Promise<void> {
  if (quitPreparation) return quitPreparation;
  quitting = true;
  clearGlobalShortcuts();
  updater?.stop();
  if (persistTimer) clearTimeout(persistTimer);
  if (uiTimer) clearTimeout(uiTimer);
  persistTimer = uiTimer = null;
  quitPreparation = (async () => {
    if (dataClear) await dataClear.catch(console.error);
    saveBounds();
    if (tabs) saveSettings({ restoreTabs: tabs.allUrls() });
    try {
      await flushSettings();
    } catch (err) {
      console.error('[quit] settings flush failed:', err);
    }
    quitReady = true;
  })();
  return quitPreparation;
}

// ---------- App 內彈窗（登入用）：跟主視窗共用同一個 session ----------

function openPopup(url: string, sourceTabId: number): void {
  if (!win || quitting || dataClear || !isHttpUrl(url)) return;
  const returnOrigin = loadSettings().homepage;
  const popup = new BrowserWindow({
    width: 560,
    height: 700,
    parent: win,
    modal: false,
    autoHideMenuBar: true,
    backgroundColor: themeBackground(),
    icon: appIconPng(),
    webPreferences: {
      partition: ARENA_PARTITION,
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  popups.add(popup);
  popup.once('closed', () => popups.delete(popup));
  popup.setMenu(null);
  guardWebNavigation(popup.webContents);
  attachContextMenu(popup.webContents);
  // 彈窗裡再開彈窗就丟給系統瀏覽器，避免無限疊
  popup.webContents.setWindowOpenHandler(({ url: u }) => {
    if (isHttpUrl(u)) void openExternalHttp(u).catch(console.error);
    return { action: 'deny' };
  });
  // OAuth 登入完成、跳回 arena.ai 時自動關閉彈窗並重整當前分頁
  popup.webContents.on('did-navigate', (_e, navUrl) => {
    if (isSameOrigin(navUrl, returnOrigin) && !popup.isDestroyed()) {
      popup.close();
      tabs?.reload(sourceTabId);
    }
  });
  void popup.loadURL(url).catch((err) => console.warn('[popup] load failed:', err));
}

// ---------- IPC ----------

function sendTabs(): void {
  if (win && !win.isDestroyed()) win.webContents.send('arena:tabs:changed', tabs?.list() ?? []);
}

function scheduleSendTabs(): void {
  if (quitting || uiTimer) return;
  uiTimer = setTimeout(() => {
    uiTimer = null;
    sendTabs();
  }, 32);
}

/** 分頁變動後 1.5 秒才寫檔，避免拖曳/載入時頻繁寫入。 */
function schedulePersistTabs(): void {
  if (quitting) return;
  if (persistTimer) clearTimeout(persistTimer);
  persistTimer = setTimeout(() => {
    persistTimer = null;
    if (tabs) saveSettings({ restoreTabs: tabs.allUrls() });
  }, 1500);
}

function handleUI<Args extends unknown[]>(
  channel: string,
  listener: (event: IpcMainInvokeEvent, ...args: Args) => unknown,
): void {
  ipcMain.handle(channel, (event, ...args: Args) => {
    assertTrustedUI(event, win?.webContents, UI_URL);
    if (quitting) throw new Error('App is quitting');
    return listener(event, ...args);
  });
}

function registerIpc(): void {
  ipcMain.handle('arena:content:retry', (event) => {
    if (quitting) throw new Error('App is quitting');
    tabs?.retryOffline(event.sender, event.senderFrame);
  });
  // 分頁
  handleUI('arena:tabs:list', () => tabs?.list() ?? []);
  handleUI('arena:tabs:create', (_e, url?: string) => tabs?.createTab(url) ?? -1);
  handleUI('arena:tabs:close', (_e, id: number) => tabs?.closeTab(id));
  handleUI('arena:tabs:activate', (_e, id: number) => tabs?.activateTab(id));
  handleUI('arena:tabs:move', (_e, id: number, toIndex: number) => tabs?.moveTab(id, toIndex));
  handleUI('arena:tabs:reload', (_e, id?: number) => tabs?.reload(id));
  handleUI('arena:tabs:reload-active', () => tabs?.reloadActive());
  handleUI('arena:tabs:go-back', (_e, id?: number) => tabs?.goBack(id));
  handleUI('arena:tabs:go-forward', (_e, id?: number) => tabs?.goForward(id));
  handleUI('arena:tabs:navigate', (_e, id: number | undefined, url: string) =>
    tabs?.navigate(id, url),
  );
  handleUI('arena:tabs:zoom-in', (_e, id?: number) => tabs?.zoomIn(id));
  handleUI('arena:tabs:zoom-out', (_e, id?: number) => tabs?.zoomOut(id));
  handleUI('arena:tabs:zoom-reset', (_e, id?: number) => tabs?.zoomReset(id));

  // 視窗
  handleUI('arena:window:minimize', () => win?.minimize());
  handleUI('arena:window:toggle-maximize', () => {
    if (!win) return;
    if (win.isMaximized()) win.unmaximize();
    else win.maximize();
  });
  handleUI('arena:window:close', () => win?.close());
  handleUI('arena:window:hide', () => win?.hide());
  handleUI('arena:window:is-maximized', () => win?.isMaximized() ?? false);

  // 設定
  handleUI('arena:settings:set-open', (_event, open: unknown) => {
    if (typeof open !== 'boolean') throw new TypeError('open must be a boolean');
    tabs?.setContentObscured(open);
  });
  handleUI('arena:settings:get', () => loadSettings());
  handleUI('arena:settings:set', (_e, patch: unknown) => {
    const before = loadSettings();
    const settings = saveSettings(editableSettingsPatch(patch));
    if (before.theme !== settings.theme) {
      tabs?.updateTheme(settings.theme);
      win?.setBackgroundColor(themeBackground());
      for (const popup of popups) popup.setBackgroundColor(themeBackground());
    }
    if (before.launchAtStartup !== settings.launchAtStartup) applyLoginItem(settings);
    const shortcutError =
      before.globalShortcut !== settings.globalShortcut ||
      before.globalShortcutEnabled !== settings.globalShortcutEnabled
        ? setGlobalShortcut(settings.globalShortcut, settings.globalShortcutEnabled, toggleWindow)
        : null;
    win?.webContents.send('arena:settings:changed', settings);
    return { settings, shortcutError };
  });

  // App
  handleUI('arena:app:version', () => app.getVersion());
  handleUI('arena:app:check-update', () => updater?.check() ?? { state: 'idle' as const });
  handleUI('arena:app:quit-and-install', async () => {
    if (updater?.status.state !== 'downloaded') return;
    forceQuit = true;
    await prepareQuit();
    updater.quitAndInstall();
  });
  handleUI('arena:app:open-external', (_e, url: unknown) => openExternalHttp(url));
  handleUI('arena:app:clear-data', async () => {
    if (dataClear) return dataClear;
    for (const popup of popups) popup.destroy();
    const ses = session.fromPartition(ARENA_PARTITION);
    dataClear =
      tabs?.clearBrowsingData(async () => {
        await ses.closeAllConnections();
        await ses.clearStorageData();
        await ses.clearCache();
        await ses.clearAuthCache();
      }) ?? Promise.resolve();
    try {
      await dataClear;
    } finally {
      dataClear = null;
    }
  });
  handleUI('arena:app:quit', () => {
    forceQuit = true;
    app.quit();
  });
}
