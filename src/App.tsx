import { useCallback, useEffect, useState } from 'react';
import { VIEW_TOP_OFFSET } from '../electron/shared';
import { arena, isDesktop } from './api';
import type { AppSettings, TabInfo, UpdateStatus } from './api';
import ArenaMark from './components/ArenaMark';
import TitleBar from './components/TitleBar';
import ToolBar from './components/ToolBar';
import SettingsPanel from './components/SettingsPanel';
import Toasts from './components/Toasts';

export interface Notice {
  id: number;
  text: string;
}

let noticeSeq = 1;

export default function App() {
  const [tabs, setTabs] = useState<TabInfo[]>([]);
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [maximized, setMaximized] = useState(false);
  const [version, setVersion] = useState('');
  const [update, setUpdate] = useState<UpdateStatus>({ state: 'idle' });
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [shortcutError, setShortcutError] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [urlFocusToken, setUrlFocusToken] = useState(0);

  const activeTab = tabs.find((t) => t.active);
  const settingsVisible = settingsOpen && settings !== null;

  const notify = useCallback((text: string) => {
    setNotice({ id: noticeSeq++, text });
  }, []);

  useEffect(() => {
    const t = setTimeout(() => setNotice(null), 4000);
    return () => clearTimeout(t);
  }, [notice]);

  // 頂部 Chrome 高度 → CSS 變數（跟主進程的 VIEW_TOP_OFFSET 同步）
  useEffect(() => {
    document.documentElement.style.setProperty('--chrome-h', `${VIEW_TOP_OFFSET}px`);
  }, []);

  // 外觀主題（index.html 的內嵌腳本已先套用初始值避免閃爍，這裡跟設定同步）
  useEffect(() => {
    document.documentElement.dataset.theme = settings?.theme ?? 'arena';
  }, [settings?.theme]);

  // 初始資料 + 訂閱主進程推送
  useEffect(() => {
    void arena.tabs.list().then(setTabs);
    void arena.settings.get().then(setSettings);
    void arena.window.isMaximized().then(setMaximized);
    void arena.app.version().then(setVersion);

    const offTabs = arena.tabs.onChanged(setTabs);
    const offSettings = arena.settings.onChanged(setSettings);
    const offMax = arena.window.onMaximized(setMaximized);
    const offUpdate = arena.app.onUpdateStatus(setUpdate);
    return () => {
      offTabs();
      offSettings();
      offMax();
      offUpdate();
    };
  }, []);

  // WebContentsView 不受 CSS z-index 控制；讓主進程同步原生視圖可見性。
  useEffect(() => {
    void arena.settings.setOpen(settingsVisible).catch((err) => {
      console.error('[settings] could not update native view visibility:', err);
      if (settingsVisible) {
        setSettingsOpen(false);
        notify('無法開啟設定，請重試');
      }
    });
    return () => {
      void arena.settings.setOpen(false).catch(console.error);
    };
  }, [settingsVisible, notify]);

  const newTab = useCallback(() => {
    void arena.tabs
      .create()
      .then(() => setUrlFocusToken((n) => n + 1))
      .catch((err) => notify(String(err)));
  }, [notify]);

  // 桌面版快捷鍵（瀏覽器預覽模式不攔截，避免關掉預覽分頁）
  useEffect(() => {
    if (!isDesktop) return;
    const onKey = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey;
      if (settingsOpen) {
        if (e.key === 'Escape') {
          e.preventDefault();
          setSettingsOpen(false);
        }
        return; // 設定輸入時不要觸發分頁／縮放快捷鍵
      }
      if (!mod && !e.altKey) {
        if (e.key === 'F5') {
          e.preventDefault();
          void arena.tabs.reload();
        }
        return;
      }
      if (mod && e.key.toLowerCase() === 't') {
        e.preventDefault();
        newTab();
      } else if (mod && e.key.toLowerCase() === 'w') {
        e.preventDefault();
        if (activeTab) void arena.tabs.close(activeTab.id);
      } else if (mod && e.key.toLowerCase() === 'r') {
        e.preventDefault();
        void arena.tabs.reload();
      } else if (mod && e.key.toLowerCase() === 'l') {
        e.preventDefault();
        setUrlFocusToken((n) => n + 1);
      } else if (mod && (e.key === '+' || e.key === '=')) {
        e.preventDefault();
        void arena.tabs.zoomIn();
      } else if (mod && e.key === '-') {
        e.preventDefault();
        void arena.tabs.zoomOut();
      } else if (mod && e.key === '0') {
        e.preventDefault();
        void arena.tabs.zoomReset();
      } else if (e.altKey && e.key === 'ArrowLeft') {
        e.preventDefault();
        void arena.tabs.goBack();
      } else if (e.altKey && e.key === 'ArrowRight') {
        e.preventDefault();
        void arena.tabs.goForward();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [activeTab, newTab, settingsOpen]);

  const patchSettings = useCallback(
    (patch: Partial<AppSettings>) => {
      void arena.settings
        .set(patch)
        .then(({ settings: s, shortcutError: err }) => {
          setSettings(s);
          setShortcutError(err);
          if (err) notify(err);
        })
        .catch((err) => notify(String(err)));
    },
    [notify],
  );

  return (
    <div className="app">
      <div className="top-chrome">
        <TitleBar
          tabs={tabs}
          maximized={maximized}
          onActivate={(id) => void arena.tabs.activate(id)}
          onClose={(id) => void arena.tabs.close(id)}
          onMove={(id, toIndex) => void arena.tabs.move(id, toIndex)}
          onNew={newTab}
          onMinimize={() => void arena.window.minimize()}
          onToggleMaximize={() => void arena.window.toggleMaximize()}
          onCloseWindow={() => void arena.window.close()}
        />
        <ToolBar
          onError={notify}
          tab={activeTab}
          update={update}
          urlFocusToken={urlFocusToken}
          onBack={() => void arena.tabs.goBack()}
          onForward={() => void arena.tabs.goForward()}
          onReload={() => void arena.tabs.reload()}
          onHome={() => {
            if (activeTab && settings) void arena.tabs.navigate(activeTab.id, settings.homepage);
          }}
          onNavigate={(url) => {
            if (activeTab)
              void arena.tabs.navigate(activeTab.id, url).catch((err) => notify(String(err)));
          }}
          onZoomIn={() => void arena.tabs.zoomIn()}
          onZoomOut={() => void arena.tabs.zoomOut()}
          onZoomReset={() => void arena.tabs.zoomReset()}
          onOpenExternal={() => {
            if (activeTab)
              void arena.app.openExternal(activeTab.url).catch((err) => notify(String(err)));
          }}
          onCheckUpdate={() => void arena.app.checkUpdate()}
          onQuitAndInstall={() => void arena.app.quitAndInstall()}
          onOpenSettings={() => setSettingsOpen(true)}
        />
      </div>

      {/* 桌面版：這塊區域實際由原生 WebContentsView 蓋住顯示網頁內容。
          瀏覽器預覽：顯示佔位說明。 */}
      <div className="content">
        {!isDesktop && (
          <div className="preview-placeholder">
            <div className="preview-card">
              <div className="preview-mark">
                <ArenaMark />
              </div>
              <h2>網頁內容區（僅桌面版顯示）</h2>
              <p>
                你現在看到的是瀏覽器預覽模式：上面的分頁列、工具列、設定都是真的 UI；
                這塊深色區域在真正的桌面 App 裡會顯示 arena.ai 的網頁內容。
              </p>
              <p className="muted">
                在 Windows 上執行 <code>npm run dev</code> 即可看到完整效果。
              </p>
              <button onClick={() => void arena.app.openExternal('https://arena.ai')}>
                先用瀏覽器開啟 arena.ai →
              </button>
            </div>
          </div>
        )}
      </div>

      <SettingsPanel
        open={settingsOpen}
        settings={settings}
        version={version}
        update={update}
        shortcutError={shortcutError}
        onChange={patchSettings}
        onClose={() => setSettingsOpen(false)}
        onCheckUpdate={() => void arena.app.checkUpdate()}
        onQuitAndInstall={() => void arena.app.quitAndInstall()}
        onClearData={() => {
          if (
            window.confirm(
              '確定要清除所有瀏覽資料嗎？這會登出網站、重建所有分頁，並清除未送出的輸入。',
            )
          ) {
            void arena.app
              .clearData()
              .then(() => notify('已清除瀏覽資料'))
              .catch((err) => notify(String(err)));
          }
        }}
      />

      <Toasts update={update} notice={notice} />
    </div>
  );
}
