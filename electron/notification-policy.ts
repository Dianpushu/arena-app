/** arena.ai 與子網域的信任判斷；必須是 https 預設埠（不含帳密的一般網址）。 */

function isAllowedHost(hostname: string): boolean {
  const host = hostname.toLowerCase();
  return host === 'arena.ai' || host.endsWith('.arena.ai');
}

function isSecureDefaultPort(url: URL): boolean {
  return url.protocol === 'https:' && url.port === '';
}

/** 共用的「這是 Arena 自己的網頁」判斷，通知與剪貼簿讀取都以此為界。 */
export function isTrustedArenaUrl(input: string): boolean {
  try {
    const url = new URL(input);
    if (!isSecureDefaultPort(url)) return false;
    if (url.username || url.password) return false;
    return isAllowedHost(url.hostname);
  } catch {
    return false;
  }
}

export function isAllowedNotificationOrigin(origin: string): boolean {
  return isTrustedArenaUrl(origin);
}

export function isAllowedNotificationUrl(requestingUrl: string): boolean {
  return isTrustedArenaUrl(requestingUrl);
}
