import { app, BrowserWindow, WebContentsView, WebContents } from 'electron';
import * as path from 'node:path';
import { pathToFileURL } from 'node:url';
import { normalizeUrl, isHttpUrl, isSameDocument } from './url-policy';
import { guardWebNavigation } from './navigation';
import {
  moveTabOrder,
  nextZoom,
  browserShortcutAction,
  BrowserShortcut,
  crashAutoReload,
} from './tab-utils';
import { AppTheme, DEFAULT_HOMEPAGE, MAX_TABS, TabInfo, VIEW_TOP_OFFSET } from './shared';
import { loadSettings } from './settings';
import { attachContextMenu } from './context-menu';

/** 所有分頁共用的持久化 session：登入狀態、Cookie 都存在這裡，App 重開不會掉登入。 */
export const ARENA_PARTITION = 'persist:arena';

/** 離線時顯示的本機頁面（開發模式讀 public/，正式版讀打包後的 dist/）。 */
function offlinePagePath(): string {
  const root = path.join(__dirname, '..');
  return app.isPackaged
    ? path.join(root, 'dist', 'offline.html')
    : path.join(root, 'public', 'offline.html');
}

/** 斷線以外的載入失敗都導向離線頁；-3（ERR_ABORTED）通常是 SPA 內部跳轉，直接忽略。 */
const ERR_ABORTED = -3;

interface Tab {
  id: number;
  view: WebContentsView;
  /** 最後一次成功載入的 http(s) 網址（顯示在網址列；離線頁是 file:// 不覆蓋它）。 */
  url: string;
  favicon: string;
  /** render-process-gone 的時間戳；滾動窗口內重複崩潰時停止自動重載（見 crashAutoReload）。 */
  crashTimes: number[];
}

let nextId = 1;

export interface TabHooks {
  onChanged: () => void;
  onPersist: () => void;
  onOpenPopup: (url: string, sourceTabId: number) => void;
}

export class TabManager {
  private tabs = new Map<number, Tab>();
  private order: number[] = [];
  private activeId = -1;
  private contentObscured = false;
  private clearing = false;

  constructor(
    private win: BrowserWindow,
    private preloadPath: string,
    private hooks: TabHooks,
  ) {}

  // ---------- 建立 / 關閉 / 切換 ----------

  createTab(rawUrl?: string, opts: { activate?: boolean } = {}): number {
    if (this.clearing) throw new Error('正在清除瀏覽資料');
    if (this.tabs.size >= MAX_TABS) {
      throw new Error(`已達到分頁上限（${MAX_TABS} 個），請先關閉部分分頁`);
    }
    const id = nextId++;
    const url = normalizeUrl(rawUrl === undefined ? loadSettings().homepage : rawUrl);

    const view = new WebContentsView({
      webPreferences: {
        partition: ARENA_PARTITION,
        preload: this.preloadPath,
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false,
        backgroundThrottling: true,
        spellcheck: true,
      },
    });
    view.setBackgroundColor(loadSettings().theme === 'dark' ? '#1c1917' : '#f5f0e8');

    const tab: Tab = { id, view, url, favicon: '', crashTimes: [] };
    this.tabs.set(id, tab);
    this.order.push(id);
    if (opts.activate !== false || this.activeId === -1) this.activeId = id;

    this.wireEvents(tab);
    attachContextMenu(view.webContents);
    this.win.contentView.addChildView(view);

    const defaultZoom = loadSettings().defaultZoomPercent;
    if (defaultZoom !== 100) view.webContents.setZoomFactor(defaultZoom / 100);

    void view.webContents.loadURL(url).catch((err) => console.warn(`[tabs] load failed:`, err));
    this.layout();
    if (this.activeId === id) this.focusActive();
    this.hooks.onChanged();
    this.hooks.onPersist();
    return id;
  }

  closeTab(id: number): void {
    const tab = this.tabs.get(id);
    if (!tab) return;
    this.tabs.delete(id);
    this.order = this.order.filter((t) => t !== id);
    if (!this.win.isDestroyed()) {
      this.win.contentView.removeChildView(tab.view);
    }
    if (!tab.view.webContents.isDestroyed()) tab.view.webContents.close();

    // 至少保留一個分頁：關掉最後一個時自動開一個首頁
    if (this.order.length === 0) {
      this.activeId = -1;
      this.createTab(loadSettings().homepage || DEFAULT_HOMEPAGE);
      return;
    }
    if (this.activeId === id) {
      this.activeId = this.order[this.order.length - 1];
    }
    this.layout();
    this.focusActive();
    this.hooks.onChanged();
    this.hooks.onPersist();
  }

  activateTab(id: number): void {
    if (!this.tabs.has(id)) return;
    this.activeId = id;
    this.layout();
    this.focusActive();
    this.hooks.onChanged();
  }

  /** 從 React UI（分頁列／工具列）操作後，鍵盤焦點會留在 UI WebContents 上。
   * Chromium 的 Clipboard API 要求 document.hasFocus()，焦點沒回到網頁時
   * 「複製」會以 NotAllowedError: Document is not focused 失敗，所以要主動交還焦點。 */
  focusActive(): void {
    if (this.win.isDestroyed() || this.contentObscured) return;
    const wc = this.target()?.view.webContents;
    if (wc && !wc.isDestroyed()) wc.focus();
  }

  /** 拖曳排序：toIndex 是「拿掉被拖分頁之後」陣列的插入位置。 */
  moveTab(id: number, toIndex: number): void {
    if (!this.order.includes(id)) return;
    const next = moveTabOrder(this.order, id, toIndex);
    // 順序沒變就不廣播，避免拖放抖動造成多餘渲染
    if (next.every((v, i) => v === this.order[i])) return;
    this.order = next;
    this.hooks.onChanged();
    this.hooks.onPersist();
  }

  // ---------- 瀏覽操作（id 省略時作用於當前分頁） ----------

  private target(id?: number): Tab | undefined {
    return this.tabs.get(id ?? this.activeId);
  }

  reload(id?: number): void {
    const tab = this.target(id);
    if (!tab || this.clearing) return;
    if (isSameDocument(tab.view.webContents.getURL(), pathToFileURL(offlinePagePath()).href)) {
      void tab.view.webContents.loadURL(tab.url).catch(console.error);
    } else tab.view.webContents.reload();
  }

  reloadActive(): void {
    this.reload(this.activeId);
  }

  goBack(id?: number): void {
    const t = this.target(id);
    if (t && t.view.webContents.navigationHistory.canGoBack()) t.view.webContents.goBack();
  }

  goForward(id?: number): void {
    const t = this.target(id);
    if (t && t.view.webContents.navigationHistory.canGoForward()) t.view.webContents.goForward();
  }

  navigate(id: number | undefined, rawUrl: string): void {
    if (this.clearing) throw new Error('正在清除瀏覽資料');
    const t = this.target(id);
    if (!t) return;
    const url = normalizeUrl(rawUrl);
    if (t.url !== url) this.hooks.onPersist();
    t.url = url;
    void t.view.webContents
      .loadURL(url)
      .catch((err) => console.warn('[tabs] navigate failed:', err));
    if (id !== undefined) this.activeId = t.id;
    this.layout();
    this.focusActive();
    this.hooks.onChanged();
  }

  zoomIn(id?: number): void {
    this.stepZoom(id, 1);
  }

  zoomOut(id?: number): void {
    this.stepZoom(id, -1);
  }

  zoomReset(id?: number): void {
    const t = this.target(id);
    if (!t) return;
    t.view.webContents.setZoomFactor(1);
    this.hooks.onChanged();
  }

  private stepZoom(id: number | undefined, dir: 1 | -1): void {
    const t = this.target(id);
    if (!t) return;
    const current = Math.round(t.view.webContents.getZoomFactor() * 100);
    const next = nextZoom(current, dir);
    t.view.webContents.setZoomFactor(next / 100);
    this.hooks.onChanged();
  }

  // ---------- 版面：只有當前分頁可見，佔滿工具列下方的區域 ----------

  /** 原生子視圖永遠在 Renderer DOM 上方；顯示設定時必須隱藏，而非調整 CSS z-index。
   * 保留 WebContents / session，關閉設定後恢復目前分頁，不重新載入網頁。 */
  setContentObscured(obscured: boolean): void {
    if (this.win.isDestroyed() || this.contentObscured === obscured) return;
    this.contentObscured = obscured;
    this.layout();
    const target = obscured ? this.win.webContents : this.target()?.view.webContents;
    if (target && !target.isDestroyed()) target.focus();
  }

  layout(): void {
    if (this.win.isDestroyed()) return;
    const [w, h] = this.win.getContentSize();
    for (const [id, tab] of this.tabs) {
      const active = id === this.activeId;
      tab.view.setVisible(active && !this.contentObscured);
      if (active) {
        tab.view.setBounds({
          x: 0,
          y: VIEW_TOP_OFFSET,
          width: Math.max(0, w),
          height: Math.max(0, h - VIEW_TOP_OFFSET),
        });
      }
    }
  }

  list(): TabInfo[] {
    return this.order
      .map((id) => this.tabs.get(id))
      .filter((t): t is Tab => !!t && !t.view.webContents.isDestroyed())
      .map((t) => {
        const wc = t.view.webContents;
        const loading = wc.isLoading();
        return {
          id: t.id,
          title: wc.getTitle() || (loading ? '載入中…' : '新分頁'),
          url: t.url,
          favicon: t.favicon,
          active: t.id === this.activeId,
          loading,
          canGoBack: wc.navigationHistory.canGoBack(),
          canGoForward: wc.navigationHistory.canGoForward(),
          zoomPercent: Math.round(wc.getZoomFactor() * 100),
        };
      });
  }

  /** 目前所有分頁的網址（給「重啟還原分頁」用）。 */
  allUrls(): string[] {
    return this.list()
      .map((t) => t.url)
      .filter(isHttpUrl);
  }

  /** 彈窗（OAuth 等）完成後應該跳回的 origin：來源分頁最後載入的 http(s) origin。
   *  找不到分頁或網址無效時回 null，由呼叫端決定 fallback。 */
  tabOrigin(id: number): string | null {
    const tab = this.tabs.get(id);
    if (!tab) return null;
    try {
      return new URL(tab.url).origin;
    } catch {
      return null;
    }
  }

  destroy(): void {
    for (const tab of this.tabs.values()) {
      if (!this.win.isDestroyed()) this.win.contentView.removeChildView(tab.view);
      tab.view.webContents.removeAllListeners();
      if (!tab.view.webContents.isDestroyed())
        tab.view.webContents.close({ waitForBeforeUnload: false });
    }
    this.tabs.clear();
    this.order = [];
    this.activeId = -1;
  }

  retryOffline(sender: WebContents, frame: Electron.WebFrameMain | null): void {
    const tab = [...this.tabs.values()].find((t) => t.view.webContents === sender);
    if (
      !tab ||
      frame !== sender.mainFrame ||
      !frame ||
      !isSameDocument(frame.url, pathToFileURL(offlinePagePath()).href)
    ) {
      throw new Error('Only the managed offline page may retry its own tab');
    }
    this.reload(tab.id);
  }

  updateTheme(theme: AppTheme): void {
    for (const tab of this.tabs.values()) {
      tab.view.setBackgroundColor(theme === 'dark' ? '#1c1917' : '#f5f0e8');
      if (isSameDocument(tab.view.webContents.getURL(), pathToFileURL(offlinePagePath()).href)) {
        void tab.view.webContents
          .loadFile(offlinePagePath(), { query: { theme } })
          .catch(console.error);
      }
    }
  }

  /** 先銷毀舊 document，清除期間不能再以記憶體內的 token／Cookie 寫回 storage。 */
  async clearBrowsingData(clear: () => Promise<void>): Promise<void> {
    if (this.clearing) throw new Error('正在清除瀏覽資料');
    this.clearing = true;
    const urls = this.allUrls().slice(0, MAX_TABS);
    const activeIndex = this.order.indexOf(this.activeId);
    this.destroy();
    this.hooks.onChanged();
    try {
      await clear();
    } finally {
      this.clearing = false;
      (urls.length ? urls : [loadSettings().homepage]).forEach((url, index) => {
        try {
          this.createTab(url, { activate: index === Math.max(0, activeIndex) });
        } catch (err) {
          console.warn('[tabs] recreate after clear failed:', err);
        }
      });
    }
  }

  // ---------- 事件接線 ----------

  /** 執行內容分頁發出的瀏覽器快捷鍵（作用於發出事件的那個分頁）。 */
  private runBrowserShortcut(tabId: number, action: BrowserShortcut): void {
    switch (action) {
      case 'new-tab':
        if (this.clearing) return;
        try {
          this.createTab();
        } catch (err) {
          console.warn('[tabs] shortcut new-tab failed:', err);
          return;
        }
        // 跟 UI 端 Ctrl+T 行為一致：開新分頁後聚焦網址列。
        this.focusUIUrlBar();
        return;
      case 'close-tab':
        this.closeTab(tabId);
        return;
      case 'reload':
        this.reload(tabId);
        return;
      case 'back':
        this.goBack(tabId);
        return;
      case 'forward':
        this.goForward(tabId);
        return;
      case 'zoom-in':
        this.zoomIn(tabId);
        return;
      case 'zoom-out':
        this.zoomOut(tabId);
        return;
      case 'zoom-reset':
        this.zoomReset(tabId);
        return;
      case 'focus-url':
        this.focusUIUrlBar();
        return;
    }
  }

  /** 把鍵盤焦點交回主 UI 並要求聚焦網址列（Ctrl+L / Ctrl+T 用）。 */
  private focusUIUrlBar(): void {
    if (this.win.isDestroyed()) return;
    this.win.webContents.focus();
    this.win.webContents.send('arena:ui:focus-url');
  }

  private wireEvents(tab: Tab): void {
    const wc = tab.view.webContents;
    const emit = () => this.hooks.onChanged();
    guardWebNavigation(wc);
    const navigated = (url: string) => {
      if (isHttpUrl(url) && tab.url !== url) {
        tab.url = url;
        this.hooks.onPersist();
      }
      emit();
    };

    wc.on('page-title-updated', emit);
    wc.on('page-favicon-updated', (_e, favicons) => {
      if (favicons.length > 0) tab.favicon = favicons[favicons.length - 1];
      emit();
    });
    wc.on('did-start-loading', emit);
    wc.on('did-stop-loading', emit);
    wc.on('did-navigate', (_e, url) => {
      navigated(url);
    });
    wc.on('did-navigate-in-page', (_e, url, isMainFrame) => {
      if (isMainFrame) navigated(url);
    });
    wc.on('zoom-changed', emit);

    // 內容分頁持有鍵盤焦點時，React UI 收不到 keydown，瀏覽器級快捷鍵
    // （Ctrl+T / Ctrl+W / Ctrl+L / 縮放 / F5 / Alt+方向鍵）會完全失效。
    // 在主進程的輸入管線攔截：只攔瀏覽器組合鍵，其餘按鍵原樣放行給網頁，
    // 不影響聊天輸入與網頁自身的快捷鍵（例如送出訊息）。
    wc.on('before-input-event', (event, input) => {
      const action = browserShortcutAction(input);
      if (!action) return;
      event.preventDefault();
      this.runBrowserShortcut(tab.id, action);
    });

    wc.on('did-fail-load', (_e, code, _desc, validatedURL, isMainFrame) => {
      if (!isMainFrame || code === ERR_ABORTED) return;
      if (validatedURL.startsWith('file:')) return; // 離線頁自己掛了就別再跳轉，避免無限迴圈
      void wc
        .loadFile(offlinePagePath(), { query: { theme: loadSettings().theme } })
        .catch(() => {});
      emit();
    });

    // 渲染進程崩潰時自動重載，比白畫面體驗好得多；但同一分頁在滾動窗口內
    // 重複崩潰時停止自動重載、改顯示離線頁，避免「崩潰→重載→崩潰」無限迴圈
    // 持續燒 CPU（例如頁面一載入就崩潰）。
    wc.on('render-process-gone', (_e, details) => {
      console.warn('[tabs] render-process-gone:', details.reason);
      if (details.reason === 'clean-exit' || wc.isDestroyed()) return;
      const verdict = crashAutoReload(tab.crashTimes, Date.now());
      tab.crashTimes = verdict.crashTimes;
      if (!verdict.reload) {
        console.warn(`[tabs] tab ${tab.id} 崩潰過於頻繁，改顯示離線頁而非自動重載`);
        void wc
          .loadFile(offlinePagePath(), {
            query: { theme: loadSettings().theme, reason: 'crash' },
          })
          .catch(() => {});
        emit();
        return;
      }
      wc.reload();
    });
    wc.on('unresponsive', () => console.warn(`[tabs] tab ${tab.id} unresponsive`));

    // target=_blank / window.open（例如 Google 登入彈窗）：一律用 App 內彈窗開啟，
    // 這樣 OAuth 回跳時 Cookie 還在同一個 session，登入才不會斷掉。
    wc.setWindowOpenHandler(({ url }) => {
      if (isHttpUrl(url)) this.hooks.onOpenPopup(url, tab.id);
      return { action: 'deny' };
    });
  }
}
