import { useState } from 'react';
import type { TabInfo } from '../api';

interface Props {
  tabs: TabInfo[];
  maximized: boolean;
  onActivate: (id: number) => void;
  onClose: (id: number) => void;
  onNew: () => void;
  onMinimize: () => void;
  onToggleMaximize: () => void;
  onCloseWindow: () => void;
}

function Favicon({ tab }: { tab: TabInfo }) {
  const [failed, setFailed] = useState(false);
  if (tab.loading) return <span className="tab-spinner" />;
  if (tab.favicon && !failed) {
    return (
      <img
        className="tab-favicon"
        src={tab.favicon}
        alt=""
        draggable={false}
        onError={() => setFailed(true)}
      />
    );
  }
  const letter = (tab.title || 'A').trim().charAt(0).toUpperCase() || 'A';
  return <span className="tab-letter">{letter}</span>;
}

export default function TitleBar(props: Props) {
  const { tabs, maximized } = props;
  return (
    <div className="titlebar" onDoubleClick={props.onToggleMaximize}>
      <div className="brand" title="Arena Desktop">
        <span className="brand-mark">A</span>
      </div>

      <div className="tabs">
        {tabs.map((t) => (
          <div
            key={t.id}
            className={`tab${t.active ? ' active' : ''}`}
            title={`${t.title}\n${t.url}`}
            onClick={() => props.onActivate(t.id)}
            onAuxClick={(e) => {
              if (e.button === 1) props.onClose(t.id); // 中鍵關閉
            }}
          >
            <Favicon tab={t} />
            <span className="tab-title">{t.title}</span>
            <button
              className="tab-close"
              title="關閉分頁 (Ctrl+W)"
              onClick={(e) => {
                e.stopPropagation();
                props.onClose(t.id);
              }}
            >
              ×
            </button>
          </div>
        ))}
        <button className="tab-new" title="開新分頁 (Ctrl+T)" onClick={props.onNew}>
          ＋
        </button>
      </div>

      <div className="window-controls">
        <button title="最小化" onClick={props.onMinimize}>
          ─
        </button>
        <button title={maximized ? '還原' : '最大化'} onClick={props.onToggleMaximize}>
          {maximized ? '❐' : '☐'}
        </button>
        <button title="關閉" className="close" onClick={props.onCloseWindow}>
          ✕
        </button>
      </div>
    </div>
  );
}
