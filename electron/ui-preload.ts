import { contextBridge, ipcRenderer } from 'electron';
import type { AppSettings, ArenaAPI, TabInfo, UpdateStatus } from './shared';

// 只掛載於主 UI；權限由 main 驗證 WebContents、主 frame 與精確 UI URL。

function sub<T>(channel: string, cb: (data: T) => void): () => void {
  const fn = (_e: unknown, data: T) => cb(data);
  ipcRenderer.on(channel, fn);
  return () => ipcRenderer.removeListener(channel, fn);
}

const api: ArenaAPI = {
  tabs: {
    list: () => ipcRenderer.invoke('arena:tabs:list'),
    create: (url?: string) => ipcRenderer.invoke('arena:tabs:create', url),
    close: (id: number) => ipcRenderer.invoke('arena:tabs:close', id),
    activate: (id: number) => ipcRenderer.invoke('arena:tabs:activate', id),
    move: (id: number, toIndex: number) => ipcRenderer.invoke('arena:tabs:move', id, toIndex),
    reload: (id?: number) => ipcRenderer.invoke('arena:tabs:reload', id),
    reloadActive: () => ipcRenderer.invoke('arena:tabs:reload-active'),
    goBack: (id?: number) => ipcRenderer.invoke('arena:tabs:go-back', id),
    goForward: (id?: number) => ipcRenderer.invoke('arena:tabs:go-forward', id),
    navigate: (id: number | undefined, url: string) =>
      ipcRenderer.invoke('arena:tabs:navigate', id, url),
    zoomIn: (id?: number) => ipcRenderer.invoke('arena:tabs:zoom-in', id),
    zoomOut: (id?: number) => ipcRenderer.invoke('arena:tabs:zoom-out', id),
    zoomReset: (id?: number) => ipcRenderer.invoke('arena:tabs:zoom-reset', id),
    onChanged: (cb: (tabs: TabInfo[]) => void) => sub('arena:tabs:changed', cb),
  },
  window: {
    minimize: () => ipcRenderer.invoke('arena:window:minimize'),
    toggleMaximize: () => ipcRenderer.invoke('arena:window:toggle-maximize'),
    close: () => ipcRenderer.invoke('arena:window:close'),
    hide: () => ipcRenderer.invoke('arena:window:hide'),
    isMaximized: () => ipcRenderer.invoke('arena:window:is-maximized'),
    onMaximized: (cb: (max: boolean) => void) => sub('arena:window:maximized', cb),
  },
  settings: {
    setOpen: (open: boolean) => ipcRenderer.invoke('arena:settings:set-open', open),
    get: () => ipcRenderer.invoke('arena:settings:get'),
    set: (patch: Partial<AppSettings>) => ipcRenderer.invoke('arena:settings:set', patch),
    onChanged: (cb: (s: AppSettings) => void) => sub('arena:settings:changed', cb),
  },
  app: {
    version: () => ipcRenderer.invoke('arena:app:version'),
    checkUpdate: () => ipcRenderer.invoke('arena:app:check-update'),
    quitAndInstall: () => ipcRenderer.invoke('arena:app:quit-and-install'),
    openExternal: (url: string) => ipcRenderer.invoke('arena:app:open-external', url),
    clearData: () => ipcRenderer.invoke('arena:app:clear-data'),
    quit: () => ipcRenderer.invoke('arena:app:quit'),
    onUpdateStatus: (cb: (s: UpdateStatus) => void) => sub('arena:update:status', cb),
  },
};

if (process.isMainFrame) contextBridge.exposeInMainWorld('arena', api);
