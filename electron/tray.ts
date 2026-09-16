import { app, Menu, nativeImage, Tray } from 'electron';
import * as path from 'node:path';

// 開發模式讀 <root>/assets/icon.png；正式版讀 extraResources 帶進去的 resources/assets/icon.png。

export function appIconPng(): string {
  return app.isPackaged
    ? path.join(process.resourcesPath, 'assets', 'icon.png')
    : path.join(__dirname, '..', 'assets', 'icon.png');
}

export interface TrayActions {
  onToggle: () => void;
  onCheckUpdate: () => void;
  onToggleAutostart: () => void;
  isAutostart: () => boolean;
  onQuit: () => void;
}

export function createTray(actions: TrayActions): Tray {
  const src = nativeImage.createFromPath(appIconPng());
  const icon = src.isEmpty() ? nativeImage.createEmpty() : src.resize({ width: 16, height: 16 });
  const tray = new Tray(icon);
  tray.setToolTip('Arena');

  const buildMenu = () =>
    Menu.buildFromTemplate([
      { label: '顯示 / 隱藏 Arena', click: actions.onToggle },
      { type: 'separator' },
      { label: '檢查更新', click: actions.onCheckUpdate },
      {
        label: '開機自動啟動',
        type: 'checkbox',
        checked: actions.isAutostart(),
        click: actions.onToggleAutostart,
      },
      { type: 'separator' },
      { label: '結束 Arena', click: actions.onQuit },
    ]);

  tray.setContextMenu(buildMenu());
  tray.on('click', actions.onToggle);
  // 每次右鍵都重建選單，開機啟動的勾選狀態才會即時
  tray.on('right-click', () => tray.setContextMenu(buildMenu()));
  return tray;
}
