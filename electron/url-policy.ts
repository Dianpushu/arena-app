/** 共用於 Renderer 與 main；不依賴 Electron。外部導覽僅接受 HTTP(S)。 */
export function requireHttpUrl(input: unknown): string {
  // 故意拒絕控制字元，避免 URL parser 去除換行後改變協定。
  // eslint-disable-next-line no-control-regex
  if (typeof input !== 'string' || input.length > 8192 || /[\u0000-\u0020\u007f\\]/.test(input)) {
    throw new TypeError('網址格式無效');
  }
  const url = new URL(input);
  if (
    !['http:', 'https:'].includes(url.protocol) ||
    !/^https?:\/\//i.test(input) ||
    url.username ||
    url.password
  ) {
    throw new TypeError('只允許不含帳密的 HTTP / HTTPS 網址');
  }
  return url.href;
}

export function isHttpUrl(input: unknown): input is string {
  try {
    requireHttpUrl(input);
    return true;
  } catch {
    return false;
  }
}

export function normalizeUrl(input: unknown): string {
  if (typeof input !== 'string') throw new TypeError('網址必須是文字');
  const value = input.trim();
  if (!value) throw new TypeError('請輸入網址');
  // localhost:5173、example.com:8080 與 IPv6 不是自訂協定。
  const hostWithPort = /^(?:localhost|[\w.-]+\.[\w.-]+|\[[\da-f:]+\]):\d+(?:[/?#]|$)/i.test(value);
  if (/^[a-z][a-z\d+.-]*:/i.test(value) && !hostWithPort) return requireHttpUrl(value);
  return requireHttpUrl(`https://${value}`);
}

export function isSameOrigin(a: string, b: string): boolean {
  try {
    return new URL(requireHttpUrl(a)).origin === new URL(requireHttpUrl(b)).origin;
  } catch {
    return false;
  }
}

/** 僅忽略 theme query 與 fragment；不可接受其他本機路徑或其他開發伺服器。 */
export function isSameDocument(a: string, b: string): boolean {
  try {
    const left = new URL(a);
    const right = new URL(b);
    left.search = right.search = '';
    left.hash = right.hash = '';
    return left.href === right.href;
  } catch {
    return false;
  }
}

/** 網址列允許搜尋文字，但帶有明確 scheme 的輸入必須通過協定驗證。 */
export function normalizeUserInput(input: string): string {
  const value = input.trim();
  if (!value) return 'https://arena.ai';
  if (
    /^[a-z][a-z\d+.-]*:/i.test(value) ||
    value.startsWith('[') ||
    /^localhost(?:[:/?#]|$)/i.test(value)
  )
    return normalizeUrl(value);
  if (/\s/.test(value) || !value.includes('.'))
    return `https://www.google.com/search?q=${encodeURIComponent(value)}`;
  return normalizeUrl(value);
}
