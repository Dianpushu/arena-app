import { AppSettings, DEFAULT_SETTINGS } from './shared';
import { isHttpUrl, normalizeUrl } from './url-policy';

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** 舊版沒有 settingsVersion 視為 v1；逐欄驗證，不信任 JSON cast 或 IPC 型別。 */
export function validateSettings(
  value: unknown,
  base: AppSettings = DEFAULT_SETTINGS,
): AppSettings {
  const next = structuredClone(base);
  next.settingsVersion = 1;
  if (!record(value)) return next;
  if (value.theme === 'arena' || value.theme === 'dark') next.theme = value.theme;
  if (value.closeBehavior === 'tray' || value.closeBehavior === 'quit')
    next.closeBehavior = value.closeBehavior;
  for (const key of ['launchAtStartup', 'globalShortcutEnabled', 'notificationsEnabled'] as const) {
    if (typeof value[key] === 'boolean') next[key] = value[key];
  }
  if (
    typeof value.globalShortcut === 'string' &&
    value.globalShortcut.length > 0 &&
    value.globalShortcut.length <= 200
  ) {
    next.globalShortcut = value.globalShortcut;
  }
  if (typeof value.defaultZoomPercent === 'number' && Number.isFinite(value.defaultZoomPercent)) {
    next.defaultZoomPercent = Math.round(Math.max(50, Math.min(200, value.defaultZoomPercent)));
  }
  if (typeof value.homepage === 'string') {
    try {
      next.homepage = normalizeUrl(value.homepage);
    } catch {
      /* 保留已驗證的值 */
    }
  }
  if (Array.isArray(value.restoreTabs)) next.restoreTabs = value.restoreTabs.filter(isHttpUrl);
  if (value.windowBounds === null) next.windowBounds = null;
  else if (record(value.windowBounds)) {
    const b = value.windowBounds;
    if (
      Number.isInteger(b.width) &&
      Number.isInteger(b.height) &&
      (b.width as number) >= 960 &&
      (b.width as number) <= 16384 &&
      (b.height as number) >= 640 &&
      (b.height as number) <= 16384
    ) {
      next.windowBounds = { width: b.width as number, height: b.height as number };
      for (const key of ['x', 'y'] as const) {
        if (
          typeof b[key] === 'number' &&
          Number.isSafeInteger(b[key]) &&
          Math.abs(b[key]) <= 100000
        )
          next.windowBounds[key] = b[key];
      }
    }
  }
  return next;
}

/** UI 只能改使用者設定；視窗座標、還原分頁與 schema 版本由 main 管理。 */
export function editableSettingsPatch(value: unknown): Partial<AppSettings> {
  if (!record(value)) throw new TypeError('設定必須是物件');
  const patch: Record<string, unknown> = {};
  for (const key of [
    'theme',
    'closeBehavior',
    'launchAtStartup',
    'globalShortcutEnabled',
    'globalShortcut',
    'notificationsEnabled',
    'defaultZoomPercent',
    'homepage',
  ]) {
    if (Object.prototype.hasOwnProperty.call(value, key)) patch[key] = value[key];
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'homepage'))
    patch.homepage = normalizeUrl(patch.homepage);
  return patch as Partial<AppSettings>;
}
