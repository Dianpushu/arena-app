import { shell } from 'electron';
import type { WebContents } from 'electron';
import { isHttpUrl, requireHttpUrl } from './url-policy';

export async function openExternalHttp(url: unknown): Promise<void> {
  await shell.openExternal(requireHttpUrl(url));
}

export function guardWebNavigation(contents: WebContents): void {
  contents.on('will-navigate', (event, url) => {
    if (!isHttpUrl(url)) event.preventDefault();
  });
  contents.on('will-frame-navigate', (event) => {
    if (!isHttpUrl(event.url)) event.preventDefault();
  });
  contents.on('will-redirect', (event, url) => {
    if (!isHttpUrl(url)) event.preventDefault();
  });
  contents.on('will-attach-webview', (event) => event.preventDefault());
}
