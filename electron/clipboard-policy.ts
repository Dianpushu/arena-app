/**
 * 剪貼簿權限策略。
 *
 * 背景：Chromium 把非同步 Clipboard API（`navigator.clipboard.*`，也就是網站「複製」
 * 按鈕最常用的實作）放在權限系統後面。Electron 只要安裝了 permission handler，
 * 沒有明確放行的權限就是拒絕，網站會收到
 * `NotAllowedError: Write permission denied`，按鈕看起來有按到但剪貼簿是空的。
 *
 * Chromium 會依「內容是否被消毒」與「是否有使用者手勢」把寫入分成兩種權限：
 * - `clipboard-sanitized-write`（CLIPBOARD_SANITIZED_WRITE）：純文字／標準格式，
 *   且由使用者手勢觸發。一般瀏覽器預設就允許。
 * - `clipboard-read`（CLIPBOARD_READ_WRITE）：讀取剪貼簿，以及沒有手勢或含自訂格式的
 *   寫入。一般瀏覽器會跳出詢問。
 *
 * 因此：
 * - 消毒過的寫入對任何 http(s) 頁面放行 —— 這就是「複製」按鈕，且必須有使用者手勢，
 *   網站只能放東西進剪貼簿，不能讀走既有內容。
 * - 讀取（含未消毒寫入）只放行 arena.ai 與子網域，其餘網站一律拒絕，避免任意網頁
 *   靜默讀取使用者剪貼簿。
 * - `deprecated-sync-clipboard-read`（同步舊 API）永遠拒絕。
 * - file://、data: 等非 http(s) 文件一律拒絕。
 */

import { isTrustedArenaUrl } from './notification-policy';

export const CLIPBOARD_PERMISSIONS = [
  'clipboard-read',
  'clipboard-sanitized-write',
  'deprecated-sync-clipboard-read',
] as const;

export type ClipboardPermission = (typeof CLIPBOARD_PERMISSIONS)[number];

export function isClipboardPermission(permission: string): permission is ClipboardPermission {
  return (CLIPBOARD_PERMISSIONS as readonly string[]).includes(permission);
}

/** 只有一般的 http(s) 頁面能碰剪貼簿；本機檔案／自訂協定不行。 */
function isWebDocument(url: string): boolean {
  try {
    const parsed = new URL(url);
    if (!['http:', 'https:'].includes(parsed.protocol)) return false;
    return !parsed.username && !parsed.password;
  } catch {
    return false;
  }
}

/**
 * @param permission Electron 回報的權限名稱
 * @param requestingUrl 送出請求的文件網址（request handler 用 details.requestingUrl，
 *   check handler 依序退回 requestingUrl / embeddingOrigin / requestingOrigin）
 */
export function allowClipboardPermission(permission: string, requestingUrl: unknown): boolean {
  if (typeof requestingUrl !== 'string' || !requestingUrl) return false;
  switch (permission) {
    case 'clipboard-sanitized-write':
      return isWebDocument(requestingUrl);
    case 'clipboard-read':
      return isTrustedArenaUrl(requestingUrl);
    default:
      // deprecated-sync-clipboard-read 與任何未知名稱都拒絕。
      return false;
  }
}

/** check handler 拿到的欄位比 request handler 少，依可靠度排序取第一個可用的網址。 */
export function resolveRequestingUrl(
  ...candidates: Array<string | undefined | null>
): string | undefined {
  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate && candidate !== 'null') return candidate;
  }
  return undefined;
}
