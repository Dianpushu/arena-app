const ZOOM_STEPS = [25, 33, 50, 67, 75, 80, 90, 100, 110, 125, 150, 175, 200, 250, 300, 400, 500];

export function nextZoom(current: number, direction: 1 | -1): number {
  return direction === 1
    ? (ZOOM_STEPS.find((step) => step > current) ?? ZOOM_STEPS[ZOOM_STEPS.length - 1])
    : ([...ZOOM_STEPS].reverse().find((step) => step < current) ?? ZOOM_STEPS[0]);
}

export function moveTabOrder(order: number[], id: number, index: number): number[] {
  if (!Number.isSafeInteger(index)) throw new TypeError('分頁位置必須是整數');
  if (!order.includes(id)) return [...order];
  const next = order.filter((item) => item !== id);
  next.splice(Math.max(0, Math.min(next.length, index)), 0, id);
  return next;
}

/** 內容分頁持有鍵盤焦點時，可用的瀏覽器級快捷鍵動作。 */
export type BrowserShortcut =
  | 'new-tab'
  | 'close-tab'
  | 'reload'
  | 'back'
  | 'forward'
  | 'focus-url'
  | 'zoom-in'
  | 'zoom-out'
  | 'zoom-reset';

/**
 * 把鍵盤輸入映射成瀏覽器級快捷鍵；回傳 null 表示不是瀏覽器組合鍵，原樣放行給網頁。
 * 與 src/App.tsx 的 UI 端 keydown 處理保持同一套組合：Ctrl+T/W/R/L、Ctrl+＋/－/0、
 * Alt+←/→、F5。只有真實按下（非 auto-repeat、非 keyUp/char）才會命中。
 */
export function browserShortcutAction(input: {
  type: string;
  key: string;
  control: boolean;
  meta: boolean;
  alt: boolean;
  shift: boolean;
  isAutoRepeat: boolean;
}): BrowserShortcut | null {
  // 同一次實體按鍵只會以 rawKeyDown 或 keyDown 其中一種送達；char / keyUp 不攔。
  if (input.type !== 'keyDown' && input.type !== 'rawKeyDown') return null;
  if (input.isAutoRepeat) return null;

  const mod = input.control || input.meta;
  const key = input.key.toLowerCase();

  if (input.alt && !mod) {
    if (input.key === 'ArrowLeft') return 'back';
    if (input.key === 'ArrowRight') return 'forward';
    return null;
  }
  if (mod && !input.alt) {
    if (key === 't') return 'new-tab';
    if (key === 'w') return 'close-tab';
    if (key === 'r') return 'reload';
    if (key === 'l') return 'focus-url';
    if (input.key === '+' || key === '=') return 'zoom-in';
    if (input.key === '-') return 'zoom-out';
    if (input.key === '0') return 'zoom-reset';
    return null;
  }
  if (!mod && !input.alt && input.key === 'F5') return 'reload';
  return null;
}
