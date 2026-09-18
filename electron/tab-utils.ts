import type { AppTheme } from './shared';

const ZOOM_STEPS = [25, 33, 50, 67, 75, 80, 90, 100, 110, 125, 150, 175, 200, 250, 300, 400, 500];

/** 崩潰自動重載防迴圈：滾動時間窗（ms）與自動重載次數上限。 */
export const CRASH_LOOP_WINDOW_MS = 30_000;
export const CRASH_LOOP_LIMIT = 3;

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

/**
 * 崩潰自動重載的節流政策：把本次崩潰併入滾動時間窗內的歷史，
 * 回傳「是否繼續自動重載」與更新後的時間戳陣列。
 * 窗口內崩潰（含本次）超過上限就不再自動重載，避免「崩潰→重載→崩潰」無限迴圈。
 */
export function crashAutoReload(
  crashTimes: number[],
  now: number,
  windowMs: number = CRASH_LOOP_WINDOW_MS,
  limit: number = CRASH_LOOP_LIMIT,
): { reload: boolean; crashTimes: number[] } {
  const next = crashTimes.filter((t) => now - t < windowMs);
  next.push(now);
  return { reload: next.length <= limit, crashTimes: next };
}

/**
 * 重載離線頁時要帶的 query。主題一定要帶；若目前是崩潰頁（?reason=crash）則保留 reason，
 * 否則切換深/淺色會把崩潰文案打回一般離線頁。網址無效時只帶 theme（維持原行為）。
 */
export function offlinePageQuery(theme: AppTheme, currentUrl: string): Record<string, string> {
  const query: Record<string, string> = { theme };
  try {
    const reason = new URL(currentUrl).searchParams.get('reason');
    if (reason) query.reason = reason;
  } catch {
    // 目前網址無法解析時只帶 theme
  }
  return query;
}
