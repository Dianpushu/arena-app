import { app, BrowserWindow, ipcMain, session, shell } from 'electron';
import * as path from 'node:path';
import { loadSettings, saveSettings } from './settings';
import { ARENA_PARTITION, TabManager } from './tabs';
import { appIconPng, createTray } from './tray';
import { clearGlobalShortcuts, setGlobalShortcut } from './shortcuts';
import { AppUpdater } from './updater';
import { attachContextMenu } from './context-menu';
import { AppSettings, DEFAULT_HOMEPAGE } from './shared';

const isDev = !app.isPackaged && process.env.ARENA_DEV === '1';
const VITE_URL = process.env.ARENA_VITE_URL ?? 'http://127.0.0.1:5173';

app.setName('Arena');
if (process.platform === 'win32') app.setAppUserModelId('ai.arena.desktop');

let win: BrowserWindow | null = null;
let tabs: TabManager | null = null;
let updater: AppUpdater | null = null;
let forceQuit = false;
let persistTimer: NodeJS.Timeout | null = null;

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
  app.on('before-quit', () => {
    clearGlobalShortcuts();
    updater?.stop();
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
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  win.setMenu(null);

  // 權限：通知開關由設定控制，其餘一律拒絕
  session
    .fromPartition(ARENA_PARTITION)
    .setPermissionRequestHandler((_wc, permission, callback) => {
      callback(permission === 'notifications' ? loadSettings().notificationsEnabled : false);
    });

  updater = new AppUpdater((s) => win?.webContents.send('arena:update:status', s));

  tabs = new TabManager(win, path.join(__dirname, 'preload.js'), {
    onChanged: () => {
      sendTabs();
      schedulePersistTabs();
    },
    onOpenPopup: (url) => openPopup(url),
  });

  registerIpc();
  attachContextMenu(win.webContents);

  win.once('ready-to-show', () => win?.show());
  win.on('close', (e) => {
    if (!forceQuit && loadSettings().closeBehavior === 'tray') {
      e.preventDefault(); // 縮到系統匣而不是結束
      win?.hide();
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

  createTray({
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

function homepageOrigin(): string {
  try {
    return new URL(loadSettings().homepage || DEFAULT_HOMEPAGE).origin;
  } catch {
    return new URL(DEFAULT_HOMEPAGE).origin;
  }
}

// ---------- App 內彈窗（登入用）：跟主視窗共用同一個 session ----------

function openPopup(url: string): void {
  if (!win) {
    void shell.openExternal(url);
    return;
  }
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
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  popup.setMenu(null);
  attachContextMenu(popup.webContents);
  // 彈窗裡再開彈窗就丟給系統瀏覽器，避免無限疊
  popup.webContents.setWindowOpenHandler(({ url: u }) => {
    void shell.openExternal(u);
    return { action: 'deny' };
  });
  // OAuth 登入完成、跳回 arena.ai 時自動關閉彈窗並重整當前分頁
  popup.webContents.on('did-navigate', (_e, navUrl) => {
    if (navUrl.startsWith(homepageOrigin()) && !popup.isDestroyed()) {
      popup.close();
      tabs?.reloadActive();
    }
  });
  void popup.loadURL(url).catch((err) => console.warn('[popup] load failed:', err));
}

// ---------- IPC ----------

function sendTabs(): void {
  win?.webContents.send('arena:tabs:changed', tabs?.list() ?? []);
}

/** 分頁變動後 1.5 秒才寫檔，避免拖曳/載入時頻繁寫入。 */
function schedulePersistTabs(): void {
  if (persistTimer) clearTimeout(persistTimer);
  persistTimer = setTimeout(() => {
    persistTimer = null;
    if (tabs) saveSettings({ restoreTabs: tabs.allUrls() });
  }, 1500);
}

function registerIpc(): void {
  // 分頁
  ipcMain.handle('arena:tabs:list', () => tabs?.list() ?? []);
  ipcMain.handle('arena:tabs:create', (_e, url?: string) => tabs?.createTab(url) ?? -1);
  ipcMain.handle('arena:tabs:close', (_e, id: number) => tabs?.closeTab(id));
  ipcMain.handle('arena:tabs:activate', (_e, id: number) => tabs?.activateTab(id));
  ipcMain.handle('arena:tabs:reload', (_e, id?: number) => tabs?.reload(id));
  ipcMain.handle('arena:tabs:reload-active', () => tabs?.reloadActive());
  ipcMain.handle('arena:tabs:go-back', (_e, id?: number) => tabs?.goBack(id));
  ipcMain.handle('arena:tabs:go-forward', (_e, id?: number) => tabs?.goForward(id));
  ipcMain.handle('arena:tabs:navigate', (_e, id: number | undefined, url: string) =>
    tabs?.navigate(id, url),
  );
  ipcMain.handle('arena:tabs:zoom-in', (_e, id?: number) => tabs?.zoomIn(id));
  ipcMain.handle('arena:tabs:zoom-out', (_e, id?: number) => tabs?.zoomOut(id));
  ipcMain.handle('arena:tabs:zoom-reset', (_e, id?: number) => tabs?.zoomReset(id));

  // 視窗
  ipcMain.handle('arena:window:minimize', () => win?.minimize());
  ipcMain.handle('arena:window:toggle-maximize', () => {
    if (!win) return;
    if (win.isMaximized()) win.unmaximize();
    else win.maximize();
  });
  ipcMain.handle('arena:window:close', () => win?.close());
  ipcMain.handle('arena:window:hide', () => win?.hide());
  ipcMain.handle('arena:window:is-maximized', () => win?.isMaximized() ?? false);

  // 設定
  ipcMain.handle('arena:settings:get', () => loadSettings());
  ipcMain.handle('arena:settings:set', (_e, patch: Partial<AppSettings>) => {
    const settings = saveSettings(patch);
    applyLoginItem(settings);
    const shortcutError = setGlobalShortcut(
      settings.globalShortcut,
      settings.globalShortcutEnabled,
      toggleWindow,
    );
    win?.webContents.send('arena:settings:changed', settings);
    return { settings, shortcutError };
  });

  // App
  ipcMain.handle('arena:app:version', () => app.getVersion());
  ipcMain.handle('arena:app:check-update', () => updater?.check() ?? { state: 'idle' as const });
  ipcMain.handle('arena:app:quit-and-install', () => {
    forceQuit = true;
    updater?.quitAndInstall();
  });
  ipcMain.handle('arena:app:open-external', (_e, url: string) => shell.openExternal(url));
  ipcMain.handle('arena:app:clear-data', async () => {
    const ses = session.fromPartition(ARENA_PARTITION);
    await ses.clearStorageData();
    await ses.clearCache();
    tabs?.reloadActive();
  });
  ipcMain.handle('arena:app:quit', () => {
    forceQuit = true;
    app.quit();
  });
}
