import { globalShortcut } from 'electron';

// 全域快捷鍵（預設 Ctrl+Shift+A）：即使 App 在背景也能叫出 / 隱藏視窗。
// 回傳 null = 成功，否則回傳顯示給使用者的錯誤訊息。
// 失敗時會嘗試保留並重新註冊舊快捷鍵，避免 App 進入沒有可用快捷鍵的狀態。

let activeAccelerator: string | null = null;
let activeEnabled = false;
let activeTrigger: (() => void) | null = null;

export function setGlobalShortcut(
  accelerator: string,
  enabled: boolean,
  onTrigger: () => void,
): string | null {
  const previousAccelerator = activeAccelerator;
  const previousEnabled = activeEnabled;
  const previousTrigger = activeTrigger;

  // 先解除所有，避免殘留
  globalShortcut.unregisterAll();
  activeAccelerator = null;
  activeEnabled = false;
  activeTrigger = null;

  if (!enabled) {
    return null;
  }

  try {
    const ok = globalShortcut.register(accelerator, onTrigger);
    if (!ok) {
      // 註冊失敗，嘗試回滾舊快捷鍵
      if (previousEnabled && previousAccelerator && previousTrigger) {
        try {
          const restored = globalShortcut.register(previousAccelerator, previousTrigger);
          if (restored) {
            activeAccelerator = previousAccelerator;
            activeEnabled = true;
            activeTrigger = previousTrigger;
          }
        } catch {
          // 舊快捷鍵回滾也失敗，保持無快捷鍵狀態
        }
      }
      return `快捷鍵 ${accelerator} 註冊失敗，可能正被其他程式佔用。`;
    }
    activeAccelerator = accelerator;
    activeEnabled = true;
    activeTrigger = onTrigger;
    return null;
  } catch {
    // 格式無效，嘗試回滾
    if (previousEnabled && previousAccelerator && previousTrigger) {
      try {
        const restored = globalShortcut.register(previousAccelerator, previousTrigger);
        if (restored) {
          activeAccelerator = previousAccelerator;
          activeEnabled = true;
          activeTrigger = previousTrigger;
        }
      } catch {
        // 回滾失敗
      }
    }
    return `快捷鍵格式無效：${accelerator}。`;
  }
}

export function clearGlobalShortcuts(): void {
  globalShortcut.unregisterAll();
  activeAccelerator = null;
  activeEnabled = false;
  activeTrigger = null;
}

// 供測試使用：取得當前有效快捷鍵
export function __getActiveForTest(): { accelerator: string | null; enabled: boolean } {
  return { accelerator: activeAccelerator, enabled: activeEnabled };
}
