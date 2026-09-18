import { Menu, clipboard } from 'electron';
import type { WebContents } from 'electron';
import { openExternalHttp } from './navigation';
import { isHttpUrl } from './url-policy';

// 聊天 App 必備：輸入框右鍵（剪下/複製/貼上/全選）＋ 連結右鍵複製或用系統瀏覽器開啟。
//
// 這裡刻意不用 role（'copy' / 'paste'…）：role 作用在「當前聚焦的 WebContents」上，
// 而本 App 同時存在主 UI BrowserWindow 與多個內容 WebContentsView，
// 右鍵的分頁未必是聚焦的那一個，會出現複製到別的頁面或整個沒作用。
// 明確綁定發出 context-menu 事件的 WebContents 才不會選錯對象。

export function attachContextMenu(contents: WebContents): void {
  contents.on('context-menu', (_e, params) => {
    const items: Electron.MenuItemConstructorOptions[] = [];
    const { editFlags, selectionText, linkURL } = params;
    const selection = selectionText?.trim() ?? '';
    const act = (fn: () => void) => () => {
      if (!contents.isDestroyed()) fn();
    };

    if (params.isEditable) {
      items.push(
        {
          label: '剪下',
          accelerator: 'CmdOrCtrl+X',
          enabled: editFlags.canCut,
          click: act(() => contents.cut()),
        },
        {
          label: '複製',
          accelerator: 'CmdOrCtrl+C',
          enabled: editFlags.canCopy,
          click: act(() => contents.copy()),
        },
        {
          label: '貼上',
          accelerator: 'CmdOrCtrl+V',
          enabled: editFlags.canPaste,
          click: act(() => contents.paste()),
        },
        { type: 'separator' },
        { label: '全選', accelerator: 'CmdOrCtrl+A', click: act(() => contents.selectAll()) },
      );
    } else if (selection) {
      items.push(
        { label: '複製', accelerator: 'CmdOrCtrl+C', click: act(() => contents.copy()) },
        { type: 'separator' },
        { label: '全選', accelerator: 'CmdOrCtrl+A', click: act(() => contents.selectAll()) },
      );
    }

    if (isHttpUrl(linkURL)) {
      if (items.length > 0) items.push({ type: 'separator' });
      items.push(
        {
          label: '複製連結網址',
          click: () => clipboard.writeText(linkURL),
        },
        {
          label: '在瀏覽器中開啟連結',
          click: () => void openExternalHttp(linkURL).catch(console.error),
        },
      );
    }

    if (items.length > 0) Menu.buildFromTemplate(items).popup();
  });
}
