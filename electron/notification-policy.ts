/** 通知僅允許 arena.ai 與子網域，且必須是 https 預設埠 */

function isAllowedHost(hostname: string): boolean {
  const host = hostname.toLowerCase();
  return host === 'arena.ai' || host.endsWith('.arena.ai');
}

function isSecureDefaultPort(url: URL): boolean {
  return url.protocol === 'https:' && url.port === '';
}

export function isAllowedNotificationOrigin(origin: string): boolean {
  try {
    const url = new URL(origin);
    if (!isSecureDefaultPort(url)) return false;
    return isAllowedHost(url.hostname);
  } catch {
    return false;
  }
}

export function isAllowedNotificationUrl(requestingUrl: string): boolean {
  try {
    const url = new URL(requestingUrl);
    if (!isSecureDefaultPort(url)) return false;
    return isAllowedHost(url.hostname);
  } catch {
    return false;
  }
}
