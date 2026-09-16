import { Menu, WebContents } from 'electron';
import { openExternalHttp } from './navigation';
import { isHttpUrl } from './url-policy';

// 聊天 App 必備：輸入框右鍵（剪下/複製/貼上/全選）＋ 連結右鍵用系統瀏覽器開啟。
// role 類選單的顯示文字會跟著系統語系自動中文化。

export function attachContextMenu(contents: WebContents): void {
  contents.on('context-menu', (_e, params) => {
    const items: Electron.MenuItemConstructorOptions[] = [];
    const { editFlags, selectionText, linkURL } = params;

    if (params.isEditable) {
      items.push(
        { role: 'cut', enabled: editFlags.canCut },
        { role: 'copy', enabled: editFlags.canCopy },
        { role: 'paste', enabled: editFlags.canPaste },
        { type: 'separator' },
        { role: 'selectAll' },
      );
    } else if (selectionText && selectionText.trim()) {
      items.push({ role: 'copy' }, { type: 'separator' }, { role: 'selectAll' });
    }

    if (isHttpUrl(linkURL)) {
      if (items.length > 0) items.push({ type: 'separator' });
      items.push({
        label: '在瀏覽器中開啟連結',
        click: () => void openExternalHttp(linkURL).catch(console.error),
      });
    }

    if (items.length > 0) Menu.buildFromTemplate(items).popup();
  });
}
