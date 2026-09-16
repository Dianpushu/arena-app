import { useEffect, useRef, useState } from 'react';
import { normalizeUserInput } from '../api';
import type { TabInfo, UpdateStatus } from '../api';

interface Props {
  tab: TabInfo | undefined;
  update: UpdateStatus;
  urlFocusToken: number;
  onBack: () => void;
  onForward: () => void;
  onReload: () => void;
  onHome: () => void;
  onNavigate: (url: string) => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onZoomReset: () => void;
  onOpenExternal: () => void;
  onCheckUpdate: () => void;
  onQuitAndInstall: () => void;
  onOpenSettings: () => void;
}

export default function ToolBar(props: Props) {
  const { tab, update } = props;
  const [draft, setDraft] = useState(tab?.url ?? '');
  const [editing, setEditing] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // 沒在編輯時，網址列跟著當前分頁同步
  useEffect(() => {
    if (!editing) setDraft(tab?.url ?? '');
  }, [tab?.id, tab?.url, editing]);

  // 開新分頁 / Ctrl+L 時聚焦並全選
  useEffect(() => {
    if (props.urlFocusToken > 0) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.urlFocusToken]);

  const commit = () => {
    setEditing(false);
    const url = normalizeUserInput(draft);
    setDraft(url);
    if (url !== tab?.url) props.onNavigate(url);
    inputRef.current?.blur();
  };

  const secure = (tab?.url ?? '').startsWith('https://');

  return (
    <div className="toolbar">
      <div className="nav-group">
        <button title="上一頁 (Alt+←)" disabled={!tab?.canGoBack} onClick={props.onBack}>
          ←
        </button>
        <button title="下一頁 (Alt+→)" disabled={!tab?.canGoForward} onClick={props.onForward}>
          →
        </button>
        <button title="重新整理 (Ctrl+R)" onClick={props.onReload}>
          {tab?.loading ? <span className="mini-spinner" /> : '⟳'}
        </button>
        <button title="回首頁" onClick={props.onHome}>
          ⌂
        </button>
      </div>

      <div className={`urlbar${editing ? ' editing' : ''}`}>
        <span className={`lock${secure ? ' secure' : ''}`} title={secure ? '安全連線' : '非加密連線'}>
          {secure ? '🔒' : '⚠️'}
        </span>
        <input
          ref={inputRef}
          value={draft}
          spellCheck={false}
          placeholder="輸入網址或搜尋…"
          onChange={(e) => setDraft(e.target.value)}
          onFocus={() => setEditing(true)}
          onBlur={() => {
            setEditing(false);
            setDraft(tab?.url ?? '');
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commit();
            else if (e.key === 'Escape') {
              setDraft(tab?.url ?? '');
              setEditing(false);
              inputRef.current?.blur();
            }
          }}
        />
        {tab && tab.zoomPercent !== 100 && (
          <button
            className="zoom-pill"
            title="重設縮放 (Ctrl+0)"
            onClick={props.onZoomReset}
          >
            {tab.zoomPercent}%
          </button>
        )}
      </div>

      <div className="nav-group">
        <button title="縮小 (Ctrl+-)" onClick={props.onZoomOut}>
          −
        </button>
        <button title="放大 (Ctrl++)" onClick={props.onZoomIn}>
          ＋
        </button>
        <button title="用系統瀏覽器開啟這一頁" onClick={props.onOpenExternal}>
          ↗
        </button>
        <UpdateButton update={update} onCheck={props.onCheckUpdate} onInstall={props.onQuitAndInstall} />
        <button title="設定" className="gear" onClick={props.onOpenSettings}>
          ⚙
        </button>
      </div>
    </div>
  );
}

function UpdateButton({
  update,
  onCheck,
  onInstall,
}: {
  update: UpdateStatus;
  onCheck: () => void;
  onInstall: () => void;
}) {
  switch (update.state) {
    case 'downloaded':
      return (
        <button className="update ready" title="更新已下載完成，重新啟動以套用" onClick={onInstall}>
          ● 更新就緒
        </button>
      );
    case 'downloading':
      return (
        <button className="update busy" title="正在下載更新…" onClick={() => {}}>
          ↓ {update.percent ?? 0}%
        </button>
      );
    case 'checking':
    case 'available':
      return (
        <button className="update busy" title="正在檢查更新…" onClick={() => {}}>
          <span className="mini-spinner" />
        </button>
      );
    default:
      return (
        <button className="update" title="檢查更新" onClick={onCheck}>
          ⇪
        </button>
      );
  }
}
