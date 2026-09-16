import { useEffect, useState } from 'react';
import type { AppSettings, UpdateStatus } from '../api';

interface Props {
  open: boolean;
  settings: AppSettings | null;
  version: string;
  update: UpdateStatus;
  shortcutError: string | null;
  onChange: (patch: Partial<AppSettings>) => void;
  onClose: () => void;
  onCheckUpdate: () => void;
  onQuitAndInstall: () => void;
  onClearData: () => void;
}

function Toggle({
  checked,
  onChange,
  label,
  desc,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  desc?: string;
}) {
  return (
    <label className="row">
      <span className="row-text">
        <span className="row-label">{label}</span>
        {desc && <span className="row-desc">{desc}</span>}
      </span>
      <button
        role="switch"
        aria-checked={checked}
        className={`switch${checked ? ' on' : ''}`}
        onClick={(e) => {
          e.preventDefault();
          onChange(!checked);
        }}
      >
        <span className="knob" />
      </button>
    </label>
  );
}

/** 把鍵盤事件組合成 Electron accelerator，例如 CommandOrControl+Shift+A */
function eventToAccelerator(e: React.KeyboardEvent): string | null {
  if (e.key === 'Escape' || e.key === 'Tab') return null;
  const parts: string[] = [];
  if (e.ctrlKey || e.metaKey) parts.push('CommandOrControl');
  if (e.altKey) parts.push('Alt');
  if (e.shiftKey) parts.push('Shift');
  const key = e.key;
  if (['Control', 'Alt', 'Shift', 'Meta'].includes(key)) return null; // 只按修飾鍵不算
  let main = key.length === 1 ? key.toUpperCase() : key;
  if (main === ' ') main = 'Space';
  if (main === 'ArrowUp') main = 'Up';
  if (main === 'ArrowDown') main = 'Down';
  if (main === 'ArrowLeft') main = 'Left';
  if (main === 'ArrowRight') main = 'Right';
  parts.push(main);
  if (parts.length < 2) return null; // 至少要有一個修飾鍵，避免跟網頁打架
  return parts.join('+');
}

export default function SettingsPanel(props: Props) {
  const { open, settings } = props;
  const [homepageDraft, setHomepageDraft] = useState('');

  useEffect(() => {
    if (open && settings) setHomepageDraft(settings.homepage);
  }, [open, settings]);

  if (!open || !settings) return null;

  const commitHomepage = () => {
    const v = homepageDraft.trim() || 'https://arena.ai';
    const url = /^\w+:\/\//.test(v) ? v : `https://${v}`;
    setHomepageDraft(url);
    if (url !== settings.homepage) props.onChange({ homepage: url });
  };

  const updateText = (() => {
    switch (props.update.state) {
      case 'checking':
        return '正在檢查更新…';
      case 'available':
        return `發現新版本${props.update.version ? ` v${props.update.version}` : ''}，下載中…`;
      case 'downloading':
        return `正在下載更新… ${props.update.percent ?? 0}%`;
      case 'downloaded':
        return `新版本${props.update.version ? ` v${props.update.version}` : ''}已就緒`;
      case 'uptodate':
        return props.update.message ?? '已是最新版本';
      case 'error':
        return `更新失敗：${props.update.message ?? '未知錯誤'}`;
      default:
        return '尚未檢查更新';
    }
  })();

  return (
    <div className="modal-backdrop" onClick={props.onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2>設定</h2>
          <button className="modal-x" onClick={props.onClose}>
            ✕
          </button>
        </div>

        <div className="modal-body">
          <h3>一般</h3>
          <div className="row">
            <span className="row-text">
              <span className="row-label">關閉按鈕的行為</span>
              <span className="row-desc">縮到系統匣可在背景常駐，用快捷鍵隨時叫回</span>
            </span>
            <div className="segment">
              <button
                className={settings.closeBehavior === 'tray' ? 'on' : ''}
                onClick={() => props.onChange({ closeBehavior: 'tray' })}
              >
                縮到系統匣
              </button>
              <button
                className={settings.closeBehavior === 'quit' ? 'on' : ''}
                onClick={() => props.onChange({ closeBehavior: 'quit' })}
              >
                直接結束
              </button>
            </div>
          </div>
          <Toggle
            checked={settings.launchAtStartup}
            onChange={(v) => props.onChange({ launchAtStartup: v })}
            label="開機自動啟動"
            desc="登入 Windows 時自動開啟 Arena"
          />
          <Toggle
            checked={settings.notificationsEnabled}
            onChange={(v) => props.onChange({ notificationsEnabled: v })}
            label="允許網站通知"
            desc="arena.ai 的回覆完成等推播會顯示為系統通知"
          />

          <h3>全域快捷鍵</h3>
          <Toggle
            checked={settings.globalShortcutEnabled}
            onChange={(v) => props.onChange({ globalShortcutEnabled: v })}
            label="啟用全域快捷鍵"
            desc="即使 App 在背景，也能一鍵顯示 / 隱藏視窗"
          />
          <div className="row">
            <span className="row-text">
              <span className="row-label">快捷鍵組合</span>
              <span className="row-desc">點一下輸入框，直接按下你想要的按鍵</span>
            </span>
            <input
              className="shortcut-input"
              value={settings.globalShortcut}
              readOnly
              spellCheck={false}
              onKeyDown={(e) => {
                e.preventDefault();
                const acc = eventToAccelerator(e);
                if (acc) props.onChange({ globalShortcut: acc });
                (e.target as HTMLInputElement).blur();
              }}
              onFocus={(e) => e.target.select()}
            />
          </div>
          {props.shortcutError && <div className="error">{props.shortcutError}</div>}

          <h3>瀏覽</h3>
          <div className="row">
            <span className="row-text">
              <span className="row-label">新分頁預設縮放：{settings.defaultZoomPercent}%</span>
            </span>
            <input
              type="range"
              min={50}
              max={200}
              step={5}
              value={settings.defaultZoomPercent}
              onChange={(e) => props.onChange({ defaultZoomPercent: Number(e.target.value) })}
            />
          </div>
          <div className="row">
            <span className="row-text">
              <span className="row-label">首頁</span>
              <span className="row-desc">開新分頁與 ⌂ 按鈕的目的地</span>
            </span>
            <input
              className="text-input"
              value={homepageDraft}
              spellCheck={false}
              onChange={(e) => setHomepageDraft(e.target.value)}
              onBlur={commitHomepage}
              onKeyDown={(e) => {
                if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
              }}
            />
          </div>
          <div className="row">
            <span className="row-text">
              <span className="row-label">清除瀏覽資料</span>
              <span className="row-desc">刪除 Cookie 與快取（等同登出）</span>
            </span>
            <button className="danger" onClick={props.onClearData}>
              清除…
            </button>
          </div>

          <h3>更新</h3>
          <div className="row">
            <span className="row-text">
              <span className="row-label">目前版本 v{props.version || '…'}</span>
              <span className="row-desc">{updateText}</span>
            </span>
            {props.update.state === 'downloaded' ? (
              <button className="primary" onClick={props.onQuitAndInstall}>
                重新啟動並更新
              </button>
            ) : (
              <button onClick={props.onCheckUpdate}>檢查更新</button>
            )}
          </div>

          <h3>關於</h3>
          <p className="muted">
            Arena Desktop 是 arena.ai 的非官方 Windows 桌面版，用 Electron
            打造：多分頁、系統匣常駐、全域快捷鍵與自動更新。
          </p>
          <p className="muted shortcuts-hint">
            快捷鍵：Ctrl+T 開新分頁 · Ctrl+W 關閉分頁 · Ctrl+R 重新整理 · Ctrl+L
            聚焦網址列 · Ctrl+＋/－/0 縮放 · Alt+←/→ 上一頁/下一頁
          </p>
        </div>
      </div>
    </div>
  );
}
