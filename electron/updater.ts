import { app } from 'electron';
import { autoUpdater } from 'electron-updater';
import { UpdateStatus } from './shared';

// 自動更新：更新資訊來自 electron-builder.yml 的 publish 設定（GitHub Releases）。
// 只有打包版會真的檢查更新（含 Beta）；開發模式一律跳過。

const SIX_HOURS = 6 * 60 * 60 * 1000;

export class AppUpdater {
  status: UpdateStatus = { state: 'idle' };
  private timer?: NodeJS.Timeout;
  private initialTimer?: NodeJS.Timeout;

  constructor(private emit: (s: UpdateStatus) => void) {
    autoUpdater.autoDownload = true;
    autoUpdater.on('checking-for-update', () => this.set({ state: 'checking' }));
    autoUpdater.on('update-available', (info) =>
      this.set({ state: 'available', version: info.version }),
    );
    autoUpdater.on('download-progress', (p) =>
      this.set({ state: 'downloading', percent: Math.round(p.percent) }),
    );
    autoUpdater.on('update-downloaded', (info) =>
      this.set({ state: 'downloaded', version: info.version, percent: 100 }),
    );
    autoUpdater.on('update-not-available', () =>
      this.set({ state: 'uptodate', message: `已是最新版本（v${app.getVersion()}）` }),
    );
    autoUpdater.on('error', (err: unknown) =>
      this.set({
        state: 'error',
        message: err instanceof Error ? err.message : String(err),
      }),
    );
  }

  private set(s: UpdateStatus): void {
    this.status = s;
    this.emit(s);
  }

  /** 啟動後 10 秒檢查一次，之後每 6 小時檢查一次。 */
  start(): void {
    this.stop();
    if (!app.isPackaged) {
      console.log('[updater] dev mode, skip auto update');
      return;
    }
    this.initialTimer = setTimeout(() => void this.check(), 10_000);
    this.timer = setInterval(() => void this.check(), SIX_HOURS);
  }

  async check(): Promise<UpdateStatus> {
    if (!app.isPackaged) {
      const s: UpdateStatus = { state: 'idle', message: '開發模式不檢查更新' };
      this.set(s);
      return s;
    }
    this.set({ state: 'checking' });
    try {
      await autoUpdater.checkForUpdates();
    } catch (err: unknown) {
      this.set({
        state: 'error',
        message: err instanceof Error ? err.message : String(err),
      });
    }
    return this.status;
  }

  quitAndInstall(): void {
    autoUpdater.quitAndInstall(false, true);
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    if (this.initialTimer) clearTimeout(this.initialTimer);
    this.timer = this.initialTimer = undefined;
  }
}
