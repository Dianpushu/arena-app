// 主進程 / Preload / Renderer 共用的型別與常數。
// 注意：這個檔案刻意不 import 'electron'，所以 Renderer（Vite）也能安全 import。

/** 分頁列 + 工具列的總高度（px）。內容 WebContentsView 會從這個 Y 座標開始排列。
 *  Renderer 會把這個值寫入 CSS 變數 --chrome-h，兩邊永遠同步。 */
export const VIEW_TOP_OFFSET = 88;

export const DEFAULT_HOMEPAGE = 'https://arena.ai';
export const DEFAULT_SHORTCUT = 'CommandOrControl+Shift+A';

export interface TabInfo {
  id: number;
  title: string;
  url: string;
  favicon: string;
  active: boolean;
  loading: boolean;
  canGoBack: boolean;
  canGoForward: boolean;
  zoomPercent: number;
}

export type CloseBehavior = 'tray' | 'quit';

/** 外觀主題：arena = 跟官網一樣的暖米色，dark = 暖深色 */
export type AppTheme = 'arena' | 'dark';

export interface AppSettings {
  theme: AppTheme;
  /** 按下視窗關閉鈕的行為：tray = 縮到系統匣，quit = 直接結束 */
  closeBehavior: CloseBehavior;
  launchAtStartup: boolean;
  globalShortcutEnabled: boolean;
  /** Electron accelerator 格式，例如 CommandOrControl+Shift+A */
  globalShortcut: string;
  notificationsEnabled: boolean;
  /** 新分頁的預設縮放（50–200） */
  defaultZoomPercent: number;
  homepage: string;
  windowBounds: { width: number; height: number; x?: number; y?: number } | null;
  /** 上次開啟的分頁（重啟後還原用） */
  restoreTabs: string[];
}

export const DEFAULT_SETTINGS: AppSettings = {
  theme: 'arena',
  closeBehavior: 'tray',
  launchAtStartup: false,
  globalShortcutEnabled: true,
  globalShortcut: DEFAULT_SHORTCUT,
  notificationsEnabled: true,
  defaultZoomPercent: 100,
  homepage: DEFAULT_HOMEPAGE,
  windowBounds: null,
  restoreTabs: [],
};

export type UpdateState =
  | 'idle'
  | 'checking'
  | 'available'
  | 'downloading'
  | 'downloaded'
  | 'uptodate'
  | 'error';

export interface UpdateStatus {
  state: UpdateState;
  percent?: number;
  version?: string;
  message?: string;
}

/** Preload 透過 contextBridge 暴露給 Renderer 的 API（window.arena）。 */
export interface ArenaAPI {
  tabs: {
    list: () => Promise<TabInfo[]>;
    create: (url?: string) => Promise<number>;
    close: (id: number) => Promise<void>;
    activate: (id: number) => Promise<void>;
    reload: (id?: number) => Promise<void>;
    reloadActive: () => Promise<void>;
    goBack: (id?: number) => Promise<void>;
    goForward: (id?: number) => Promise<void>;
    navigate: (id: number | undefined, url: string) => Promise<void>;
    zoomIn: (id?: number) => Promise<void>;
    zoomOut: (id?: number) => Promise<void>;
    zoomReset: (id?: number) => Promise<void>;
    onChanged: (cb: (tabs: TabInfo[]) => void) => () => void;
  };
  window: {
    minimize: () => Promise<void>;
    toggleMaximize: () => Promise<void>;
    close: () => Promise<void>;
    hide: () => Promise<void>;
    isMaximized: () => Promise<boolean>;
    onMaximized: (cb: (max: boolean) => void) => () => void;
  };
  settings: {
    get: () => Promise<AppSettings>;
    set: (patch: Partial<AppSettings>) => Promise<{ settings: AppSettings; shortcutError: string | null }>;
    onChanged: (cb: (s: AppSettings) => void) => () => void;
  };
  app: {
    version: () => Promise<string>;
    checkUpdate: () => Promise<UpdateStatus>;
    quitAndInstall: () => Promise<void>;
    openExternal: (url: string) => Promise<void>;
    clearData: () => Promise<void>;
    quit: () => Promise<void>;
    onUpdateStatus: (cb: (s: UpdateStatus) => void) => () => void;
  };
}
