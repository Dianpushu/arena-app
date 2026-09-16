import type { IpcMainInvokeEvent, WebContents } from 'electron';
import { isSameDocument } from './url-policy';

export function assertTrustedUI(
  event: IpcMainInvokeEvent,
  ui: WebContents | undefined,
  expectedURL: string,
): void {
  if (
    !ui ||
    ui.isDestroyed() ||
    event.sender !== ui ||
    event.senderFrame !== ui.mainFrame ||
    !event.senderFrame ||
    !isSameDocument(event.senderFrame.url, expectedURL)
  ) {
    throw new Error('IPC is restricted to the main UI document');
  }
}
