import { contextBridge, ipcRenderer } from 'electron';

// 任何內容分頁（包含 file / localhost）都不會拿到主 UI API。
// retry 是否可用再由 main 驗證：必須是受管理分頁的主 frame，且正顯示指定離線頁。
if (process.isMainFrame) {
  contextBridge.exposeInMainWorld('arena', {
    tabs: { reloadActive: () => ipcRenderer.invoke('arena:content:retry') },
  });
}
