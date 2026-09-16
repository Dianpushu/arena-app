import type { AppSettings, ArenaAPI, TabInfo, UpdateStatus } from '../electron/shared';
import { DEFAULT_HOMEPAGE, DEFAULT_SETTINGS } from '../electron/shared';

export type { AppSettings, TabInfo, UpdateStatus };
export type { ArenaAPI } from '../electron/shared';

declare global {
  interface Window {
    arena?: ArenaAPI;
  }
}

/** 是否跑在真正的 Electron 裡（false = 瀏覽器預覽模式，用 mock 資料渲染 UI）。 */
export const isDesktop = typeof window !== 'undefined' && !!window.arena;

// ---------------------------------------------------------------------------
// Mock：在瀏覽器裡 `vite dev` 也能預覽整個 UI（分頁列 / 工具列 / 設定面板）。
// ---------------------------------------------------------------------------

type Listener<T> = (data: T) => void;

function createMockApi(): ArenaAPI {
  let seq = 3;
  let tabs: TabInfo[] = [
    {
      id: 1,
      title: 'Arena',
      url: 'https://arena.ai',
      favicon: '',
      active: true,
      loading: false,
      canGoBack: false,
      canGoForward: false,
      zoomPercent: 100,
    },
    {
      id: 2,
      title: 'Leaderboard | Arena',
      url: 'https://arena.ai/leaderboard',
      favicon: '',
      active: false,
      loading: false,
      canGoBack: true,
      canGoForward: false,
      zoomPercent: 100,
    },
  ];
  let settings: AppSettings = { ...DEFAULT_SETTINGS };
  let maximized = false;
  let update: UpdateStatus = { state: 'uptodate', message: '已是最新版本（預覽模式）' };

  const tabListeners = new Set<Listener<TabInfo[]>>();
  const settingsListeners = new Set<Listener<AppSettings>>();
  const maxListeners = new Set<Listener<boolean>>();
  const updateListeners = new Set<Listener<UpdateStatus>>();

  const emitTabs = () => tabListeners.forEach((cb) => cb([...tabs]));
  const active = () => tabs.find((t) => t.active) ?? tabs[0];

  const sub =
    <T,>(set: Set<Listener<T>>) =>
    (cb: Listener<T>) => {
      set.add(cb);
      return () => {
        set.delete(cb);
      };
    };

  // 假裝第二個分頁正在載入，幾秒後完成（展示 loading 動畫用）
  tabs = tabs.map((t) => (t.id === 2 ? { ...t, loading: true, title: '載入中…' } : t));
  setTimeout(() => {
    tabs = tabs.map((t) =>
      t.id === 2 ? { ...t, loading: false, title: 'Leaderboard | Arena' } : t,
    );
    emitTabs();
  }, 2500);

  console.info('[arena mock] 跑在瀏覽器預覽模式，所有操作都是假資料。');

  return {
    tabs: {
      list: async () => [...tabs],
      create: async (url?: string) => {
        const id = seq++;
        tabs = [
          ...tabs.map((t) => ({ ...t, active: false })),
          {
            id,
            title: '新分頁',
            url: url ?? settings.homepage,
            favicon: '',
            active: true,
            loading: true,
            canGoBack: false,
            canGoForward: false,
            zoomPercent: settings.defaultZoomPercent,
          },
        ];
        emitTabs();
        setTimeout(() => {
          tabs = tabs.map((t) =>
            t.id === id ? { ...t, loading: false, title: new URL(t.url).hostname } : t,
          );
          emitTabs();
        }, 1200);
        return id;
      },
      close: async (id: number) => {
        if (tabs.length <= 1) return;
        const wasActive = tabs.find((t) => t.id === id)?.active;
        tabs = tabs.filter((t) => t.id !== id);
        if (wasActive) tabs[tabs.length - 1].active = true;
        emitTabs();
      },
      activate: async (id: number) => {
        tabs = tabs.map((t) => ({ ...t, active: t.id === id }));
        emitTabs();
      },
      move: async (id: number, toIndex: number) => {
        const from = tabs.findIndex((t) => t.id === id);
        if (from === -1) return;
        const rest = tabs.filter((t) => t.id !== id);
        const clamped = Math.max(0, Math.min(rest.length, toIndex));
        const next = [...rest];
        next.splice(clamped, 0, tabs[from]);
        if (next.every((t, i) => t.id === tabs[i].id)) return;
        tabs = next;
        emitTabs();
      },
      reload: async () => {
        const a = active();
        tabs = tabs.map((t) => (t.id === a.id ? { ...t, loading: true } : t));
        emitTabs();
        setTimeout(() => {
          tabs = tabs.map((t) => (t.id === a.id ? { ...t, loading: false } : t));
          emitTabs();
        }, 900);
      },
      reloadActive: async () => {},
      goBack: async () => {},
      goForward: async () => {},
      navigate: async (id: number | undefined, url: string) => {
        const target = id ?? active().id;
        tabs = tabs.map((t) =>
          t.id === target ? { ...t, url, title: '載入中…', loading: true } : t,
        );
        emitTabs();
        setTimeout(() => {
          tabs = tabs.map((t) =>
            t.id === target
              ? { ...t, loading: false, title: hostOf(t.url), canGoBack: true }
              : t,
          );
          emitTabs();
        }, 900);
      },
      zoomIn: async () => bumpZoom(10),
      zoomOut: async () => bumpZoom(-10),
      zoomReset: async () => setZoom(100),
      onChanged: sub(tabListeners),
    },
    window: {
      minimize: async () => {},
      toggleMaximize: async () => {
        maximized = !maximized;
        maxListeners.forEach((cb) => cb(maximized));
      },
      close: async () => {},
      hide: async () => {},
      isMaximized: async () => maximized,
      onMaximized: sub(maxListeners),
    },
    settings: {
      setOpen: async () => {},
      get: async () => ({ ...settings }),
      set: async (patch: Partial<AppSettings>) => {
        settings = { ...settings, ...patch };
        settingsListeners.forEach((cb) => cb({ ...settings }));
        return { settings: { ...settings }, shortcutError: null };
      },
      onChanged: sub(settingsListeners),
    },
    app: {
      version: async () => '0.1.0-preview',
      checkUpdate: async () => {
        update = { state: 'checking' };
        updateListeners.forEach((cb) => cb(update));
        setTimeout(() => {
          update = { state: 'uptodate', message: '已是最新版本（預覽模式）' };
          updateListeners.forEach((cb) => cb(update));
        }, 1200);
        return update;
      },
      quitAndInstall: async () => {},
      openExternal: async (url: string) => {
        window.open(url, '_blank');
      },
      clearData: async () => {},
      quit: async () => {},
      onUpdateStatus: sub(updateListeners),
    },
  };

  function hostOf(url: string): string {
    try {
      return new URL(url).hostname;
    } catch {
      return url;
    }
  }
  function bumpZoom(delta: number): void {
    const a = active();
    setZoom(Math.min(500, Math.max(25, a.zoomPercent + delta)));
  }
  function setZoom(pct: number): void {
    const a = active();
    tabs = tabs.map((t) => (t.id === a.id ? { ...t, zoomPercent: pct } : t));
    emitTabs();
  }
}

export const arena: ArenaAPI = window.arena ?? createMockApi();

/** 網址列輸入正規化：沒打協定就補 https://；像搜尋關鍵字就丟 Google。 */
export function normalizeUserInput(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) return DEFAULT_HOMEPAGE;
  if (/^\w+:\/\//.test(trimmed)) return trimmed;
  if (trimmed.includes(' ') || !trimmed.includes('.')) {
    return `https://www.google.com/search?q=${encodeURIComponent(trimmed)}`;
  }
  return `https://${trimmed}`;
}
