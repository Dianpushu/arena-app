import { useRef, useState } from 'react';
import type { TabInfo } from '../api';
import ArenaMark from './ArenaMark';

interface Props {
  tabs: TabInfo[];
  maximized: boolean;
  onActivate: (id: number) => void;
  onClose: (id: number) => void;
  onMove: (id: number, toIndex: number) => void;
  onNew: () => void;
  onMinimize: () => void;
  onToggleMaximize: () => void;
  onCloseWindow: () => void;
}

type Side = 'before' | 'after';

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

/** 滑鼠在分頁的左半還是右半，決定插入線畫在哪邊。 */
function dropSide(e: React.DragEvent, el: HTMLElement): Side {
  const r = el.getBoundingClientRect();
  return e.clientX < r.left + r.width / 2 ? 'before' : 'after';
}

export default function TitleBar(props: Props) {
  const { tabs, maximized } = props;
  const dragId = useRef<number | null>(null);
  const [draggingId, setDraggingId] = useState<number | null>(null);
  const [hint, setHint] = useState<{ id: number; side: Side } | null>(null);

  /** 插入位置：以「拿掉被拖分頁之後」的陣列計算，主進程照此 index 插入。 */
  const insertionIndex = (targetId: number, side: Side): number => {
    const rest = tabs.filter((t) => t.id !== dragId.current);
    const idx = rest.findIndex((t) => t.id === targetId);
    return side === 'before' ? idx : idx + 1;
  };

  const moveToEnd = (): void => {
    if (dragId.current == null) return;
    props.onMove(dragId.current, tabs.filter((t) => t.id !== dragId.current).length);
  };

  const tabClass = (t: TabInfo): string => {
    let c = `tab${t.active ? ' active' : ''}`;
    if (t.id === draggingId) c += ' dragging';
    if (hint && hint.id === t.id) c += hint.side === 'before' ? ' drop-before' : ' drop-after';
    return c;
  };

  return (
    <div className="titlebar" onDoubleClick={props.onToggleMaximize}>
      <div className="brand" title="Arena Desktop">
        <span className="brand-mark">
          <ArenaMark />
        </span>
        <span className="brand-name">Arena</span>
      </div>

      <div
        className="tabs"
        onDragOver={(e) => e.preventDefault()} // 允許 drop 到空白處 = 移到最後
        onDrop={(e) => {
          if (dragId.current == null || e.target !== e.currentTarget) return;
          e.preventDefault();
          moveToEnd();
        }}
      >
        {tabs.map((t) => (
          <div
            key={t.id}
            className={tabClass(t)}
            title={`${t.title}\n${t.url}`}
            draggable
            onClick={() => props.onActivate(t.id)}
            onAuxClick={(e) => {
              if (e.button === 1) props.onClose(t.id); // 中鍵關閉
            }}
            onDragStart={(e) => {
              dragId.current = t.id;
              setDraggingId(t.id);
              e.dataTransfer.effectAllowed = 'move';
              try {
                e.dataTransfer.setData('text/plain', String(t.id));
              } catch {
                /* 忽略 */
              }
            }}
            onDragOver={(e) => {
              e.preventDefault();
              e.dataTransfer.dropEffect = 'move';
              if (dragId.current == null || dragId.current === t.id) {
                if (hint) setHint(null);
                return;
              }
              const side = dropSide(e, e.currentTarget);
              if (!hint || hint.id !== t.id || hint.side !== side) {
                setHint({ id: t.id, side });
              }
            }}
            onDragLeave={() => {
              if (hint?.id === t.id) setHint(null);
            }}
            onDrop={(e) => {
              e.preventDefault();
              e.stopPropagation();
              if (dragId.current == null || dragId.current === t.id) return;
              props.onMove(dragId.current, insertionIndex(t.id, dropSide(e, e.currentTarget)));
              setHint(null);
            }}
            onDragEnd={() => {
              dragId.current = null;
              setDraggingId(null);
              setHint(null);
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
