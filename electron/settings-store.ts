import * as fs from 'node:fs';
import * as path from 'node:path';
import { AppSettings } from './shared';
import { validateSettings } from './settings-schema';

/** 啟動時只讀一次；更新即時改記憶體，350ms 合併後序列化、原子寫入。 */
export class SettingsStore {
  private cache: AppSettings;
  private dirty = false;
  private timer?: NodeJS.Timeout;
  private writing: Promise<void> | null = null;

  constructor(
    private filePath: string,
    private delay = 350,
  ) {
    try {
      this.cache = validateSettings(JSON.parse(fs.readFileSync(filePath, 'utf8')));
    } catch {
      this.cache = validateSettings(null);
    }
  }

  get(): AppSettings {
    return structuredClone(this.cache);
  }

  save(patch: unknown): AppSettings {
    this.cache = validateSettings(patch, this.cache);
    this.dirty = true;
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      void this.flush().catch((err) => console.error('[settings] save failed:', err));
    }, this.delay);
    return this.get();
  }

  async flush(): Promise<void> {
    if (this.timer) clearTimeout(this.timer);
    this.timer = undefined;
    if (this.writing) {
      await this.writing;
      if (this.dirty) await this.flush();
      return;
    }
    this.writing = this.writePending();
    try {
      await this.writing;
    } finally {
      this.writing = null;
    }
  }

  private async writePending(): Promise<void> {
    while (this.dirty) {
      this.dirty = false;
      const data = JSON.stringify(this.cache, null, 2);
      const temporary = `${this.filePath}.tmp`;
      try {
        await fs.promises.mkdir(path.dirname(this.filePath), { recursive: true });
        const file = await fs.promises.open(temporary, 'w', 0o600);
        try {
          await file.writeFile(data, 'utf8');
          await file.sync();
        } finally {
          await file.close();
        }
        await fs.promises.rename(temporary, this.filePath);
      } catch (err) {
        this.dirty = true; // 下次 flush 可以重試；不覆寫既有的有效 JSON。
        throw err;
      }
    }
  }
}
