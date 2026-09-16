import { globalShortcut } from 'electron';

// 全域快捷鍵（預設 Ctrl+Shift+A）：即使 App 在背景也能叫出 / 隱藏視窗。
// 回傳 null = 成功，否則回傳顯示給使用者的錯誤訊息。

export function setGlobalShortcut(
  accelerator: string,
  enabled: boolean,
  onTrigger: () => void,
): string | null {
  globalShortcut.unregisterAll();
  if (!enabled) return null;
  try {
    const ok = globalShortcut.register(accelerator, onTrigger);
    if (!ok) return `快捷鍵 ${accelerator} 註冊失敗，可能正被其他程式佔用。`;
    return null;
  } catch {
    return `快捷鍵格式無效：${accelerator}。`;
  }
}

export function clearGlobalShortcuts(): void {
  globalShortcut.unregisterAll();
}
