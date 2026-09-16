import { app } from 'electron';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { AppSettings, DEFAULT_SETTINGS } from './shared';

// 極簡 JSON 設定檔，存在 %APPDATA%/Arena/settings.json（Windows）。
// 刻意不用 electron-store，避免 ESM/CJS 互操作的地雷。

let filePath = '';

function getFilePath(): string {
  if (!filePath) filePath = path.join(app.getPath('userData'), 'settings.json');
  return filePath;
}

let cache: AppSettings | null = null;

export function loadSettings(): AppSettings {
  if (cache) return cache;
  try {
    const raw = fs.readFileSync(getFilePath(), 'utf-8');
    cache = { ...DEFAULT_SETTINGS, ...(JSON.parse(raw) as Partial<AppSettings>) };
  } catch {
    cache = { ...DEFAULT_SETTINGS };
  }
  return cache;
}

export function saveSettings(patch: Partial<AppSettings>): AppSettings {
  const next = { ...loadSettings(), ...patch };
  cache = next;
  try {
    fs.mkdirSync(path.dirname(getFilePath()), { recursive: true });
    fs.writeFileSync(getFilePath(), JSON.stringify(next, null, 2), 'utf-8');
  } catch (err) {
    console.warn('[settings] save failed:', err);
  }
  return next;
}
