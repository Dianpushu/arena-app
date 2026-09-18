const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  normalizeUrl,
  normalizeUserInput,
  requireHttpUrl,
  isSameOrigin,
  isSameDocument,
} = require('../dist-electron/url-policy');
const { validateSettings, editableSettingsPatch } = require('../dist-electron/settings-schema');
const {
  moveTabOrder,
  nextZoom,
  browserShortcutAction,
  crashAutoReload,
  offlinePageQuery,
} = require('../dist-electron/tab-utils');
const { assertTrustedUI } = require('../dist-electron/ipc-security');

test('navigation rejects non-web protocols and malformed/credential URLs', () => {
  for (const input of [
    'file:///C:/secret',
    'data:text/html,hello',
    'javascript:alert(1)',
    'custom-protocol://test',
    'mailto:a@b.com',
    'tel:123',
    'ftp://host',
    'HTTP:host',
    'https://user:pass@arena.ai',
    'https://arena.ai\\@evil.com',
    'https://are\nna.ai',
    '',
    null,
    {},
  ]) {
    assert.throws(() => normalizeUrl(input), String(input));
  }
  assert.equal(normalizeUrl('arena.ai/path'), 'https://arena.ai/path');
  assert.equal(normalizeUrl('http://localhost:5173'), 'http://localhost:5173/');
  assert.equal(normalizeUrl('localhost:5173'), 'https://localhost:5173/');
  assert.equal(normalizeUrl('example.com:8080/a'), 'https://example.com:8080/a');
  assert.equal(normalizeUrl('https://[::1]:8080'), 'https://[::1]:8080/');
  assert.equal(normalizeUserInput('hello world'), 'https://www.google.com/search?q=hello%20world');
  assert.equal(normalizeUserInput('arena.ai'), 'https://arena.ai/');
  assert.throws(() => normalizeUserInput('javascript://alert(1)'));
  assert.throws(() => requireHttpUrl('arena.ai'));
});

test('OAuth compares exact HTTP origins, not string prefixes', () => {
  assert.equal(isSameOrigin('https://arena.ai/callback?code=abc', 'https://arena.ai'), true);
  assert.equal(isSameOrigin('https://arena.ai:443/callback', 'https://arena.ai'), true);
  for (const input of [
    'https://arena.ai.evil.com',
    'https://arena.ai@evil.com',
    'http://arena.ai',
    'https://arena.ai:444',
    'file:///test',
    'invalid',
  ]) {
    assert.equal(isSameOrigin(input, 'https://arena.ai'), false);
  }
});

test('settings migrate legacy data and validate every persisted field', () => {
  const next = validateSettings({
    theme: 'evil',
    closeBehavior: [],
    defaultZoomPercent: null,
    restoreTabs: 'invalid',
    windowBounds: 'invalid',
    homepage: 'file:///bad',
    globalShortcut: 12,
    notificationsEnabled: 'yes',
  });
  assert.equal(next.settingsVersion, 1);
  assert.equal(next.theme, 'arena');
  assert.equal(next.closeBehavior, 'tray');
  assert.equal(next.defaultZoomPercent, 100);
  assert.equal(next.homepage, 'https://arena.ai');
  assert.deepEqual(next.restoreTabs, []);
  assert.equal(next.windowBounds, null);
  const valid = validateSettings({
    theme: 'dark',
    restoreTabs: ['https://arena.ai', 'file:///bad', 3],
    windowBounds: { width: 1200, height: 800, x: -100, y: Infinity },
    defaultZoomPercent: 999,
    homepage: 'arena.ai',
  });
  assert.deepEqual(valid.restoreTabs, ['https://arena.ai']);
  assert.deepEqual(valid.windowBounds, { width: 1200, height: 800, x: -100 });
  assert.equal(valid.defaultZoomPercent, 200);
  assert.equal(validateSettings({ defaultZoomPercent: -20 }).defaultZoomPercent, 50);
  assert.equal(validateSettings({ defaultZoomPercent: NaN }).defaultZoomPercent, 100);
  assert.equal(validateSettings(null).theme, 'arena');
  valid.restoreTabs.push('https://other.test');
  assert.deepEqual(validateSettings(null).restoreTabs, []);
  assert.deepEqual(
    editableSettingsPatch({
      windowBounds: {},
      restoreTabs: [],
      settingsVersion: 99,
      theme: 'dark',
    }),
    { theme: 'dark' },
  );
  assert.throws(() => editableSettingsPatch({ homepage: 'file:///bad' }));
});

test('tab ordering clamps indices and rejects non-integers; zoom has safe endpoints', () => {
  const order = [1, 2, 3];
  assert.deepEqual(moveTabOrder(order, 1, 99), [2, 3, 1]);
  assert.deepEqual(moveTabOrder(order, 3, -1), [3, 1, 2]);
  assert.deepEqual(moveTabOrder(order, 2, 1), order);
  assert.deepEqual(moveTabOrder(order, 9, 1), order);
  assert.deepEqual(order, [1, 2, 3]);
  for (const index of [NaN, Infinity, 1.5, '1']) assert.throws(() => moveTabOrder(order, 1, index));
  assert.equal(nextZoom(100, 1), 110);
  assert.equal(nextZoom(100, -1), 90);
  assert.equal(nextZoom(500, 1), 500);
  assert.equal(nextZoom(25, -1), 25);
});

// ---------- browser shortcuts (content focus) ----------
test('browserShortcutAction maps only browser combos and ignores repeats/keyup/char', () => {
  const base = {
    type: 'rawKeyDown',
    key: 't',
    control: true,
    meta: false,
    alt: false,
    shift: false,
    isAutoRepeat: false,
  };
  const merge = (over) => ({ ...base, ...over });

  // 瀏覽器組合鍵命中
  assert.equal(browserShortcutAction(merge({ key: 't' })), 'new-tab');
  assert.equal(browserShortcutAction(merge({ key: 'T' })), 'new-tab');
  assert.equal(browserShortcutAction(merge({ key: 'w' })), 'close-tab');
  assert.equal(browserShortcutAction(merge({ key: 'r' })), 'reload');
  assert.equal(browserShortcutAction(merge({ key: 'l' })), 'focus-url');
  assert.equal(browserShortcutAction(merge({ key: '+' })), 'zoom-in');
  assert.equal(browserShortcutAction(merge({ key: '=' })), 'zoom-in');
  assert.equal(browserShortcutAction(merge({ key: '-' })), 'zoom-out');
  assert.equal(browserShortcutAction(merge({ key: '0' })), 'zoom-reset');
  assert.equal(browserShortcutAction(merge({ key: '0', control: false })), null); // 純 0 不攔
  assert.equal(browserShortcutAction(merge({ key: 'F5', control: false })), 'reload');
  assert.equal(
    browserShortcutAction(merge({ key: 'ArrowLeft', control: false, alt: true })),
    'back',
  );
  assert.equal(
    browserShortcutAction(merge({ key: 'ArrowRight', control: false, alt: true })),
    'forward',
  );
  assert.equal(
    browserShortcutAction(merge({ key: 'ArrowLeft', control: false, alt: true, meta: true })),
    null,
  ); // Alt+Win+← 不攔（Win+← 是系統分割視窗）

  // 不屬於瀏覽器的按鍵一律放行
  for (const key of ['a', 'Enter', ' ', 'ArrowLeft', 'Tab', 'Escape', 'F12', 'Process']) {
    assert.equal(browserShortcutAction(merge({ key, control: false })), null, `plain ${key}`);
    assert.equal(browserShortcutAction(merge({ key })), null, `ctrl+${key}`);
  }

  // 事件種類與 auto-repeat 過濾
  assert.equal(browserShortcutAction(merge({ type: 'keyDown' })), 'new-tab');
  assert.equal(browserShortcutAction(merge({ type: 'keyUp' })), null);
  assert.equal(browserShortcutAction(merge({ type: 'char' })), null);
  assert.equal(browserShortcutAction(merge({ isAutoRepeat: true })), null);

  // Alt 與 Ctrl 同時按時不當瀏覽器快捷鍵（例如選單存取鍵 Alt+字母）
  assert.equal(browserShortcutAction(merge({ key: 't', alt: true })), null);
});

// ---------- crash auto-reload throttle ----------
test('crashAutoReload stops reloading after repeated crashes, then recovers after the window', () => {
  const t0 = 1_000_000;
  let times = [];
  // 窗口內前 3 次崩潰 → 仍自動重載
  for (let i = 0; i < 3; i++) {
    const r = crashAutoReload(times, t0 + i * 1000);
    assert.equal(r.reload, true, `crash #${i + 1} should auto-reload`);
    times = r.crashTimes;
  }
  // 第 4 次（仍在窗口內）→ 停止自動重載
  const fourth = crashAutoReload(times, t0 + 5_000);
  assert.equal(fourth.reload, false);
  times = fourth.crashTimes;
  assert.equal(times.length, 4);
  // 窗口滾過之後：舊時間被修剪，恢復自動重載
  const later = crashAutoReload(times, t0 + 5_000 + 31_000);
  assert.equal(later.reload, true);
  assert.equal(later.crashTimes.length, 1);
  // 窗口滾過後恢復計數：接下來 2、3 次仍可自動重載，第 4 次再次擋下
  const immediate = crashAutoReload(later.crashTimes, t0 + 5_000 + 31_500);
  assert.equal(immediate.reload, true); // 窗口內第 2 次，還可以
  const again = crashAutoReload(immediate.crashTimes, t0 + 5_000 + 32_000);
  assert.equal(again.reload, true); // 第 3 次，仍可
  const overflow = crashAutoReload(again.crashTimes, t0 + 5_000 + 32_500);
  assert.equal(overflow.reload, false); // 第 4 次，擋下
});

// ---------- offline page reload query ----------
test('offlinePageQuery keeps the crash reason when the theme changes', () => {
  const offline = 'file:///app/public/offline.html';
  // 崩潰頁（?reason=crash）：切換主題時必須保留 reason，否則文案會退回一般離線頁
  assert.deepEqual(offlinePageQuery('light', `${offline}?theme=dark&reason=crash`), {
    theme: 'light',
    reason: 'crash',
  });
  // 一般離線頁：只帶主題
  assert.deepEqual(offlinePageQuery('dark', `${offline}?theme=light`), { theme: 'dark' });
  assert.deepEqual(offlinePageQuery('dark', offline), { theme: 'dark' });
  // 目前網址解析不了時仍要能安全重載
  assert.deepEqual(offlinePageQuery('dark', ''), { theme: 'dark' });
});

test('IPC requires the exact UI WebContents, main frame and UI document', () => {
  const frame = { url: 'file:///app/dist/index.html?theme=dark' };
  const ui = { mainFrame: frame, isDestroyed: () => false };
  const expected = 'file:///app/dist/index.html';
  assert.doesNotThrow(() => assertTrustedUI({ sender: ui, senderFrame: frame }, ui, expected));
  assert.throws(() => assertTrustedUI({ sender: {}, senderFrame: frame }, ui, expected));
  assert.throws(() => assertTrustedUI({ sender: ui, senderFrame: { ...frame } }, ui, expected));
  assert.throws(() => assertTrustedUI({ sender: ui, senderFrame: null }, ui, expected));
  for (const url of [
    'file:///app/dist/other.html',
    'http://localhost:5173/',
    'file:///tmp/evil.html',
    'https://arena.ai',
  ]) {
    frame.url = url;
    assert.throws(() => assertTrustedUI({ sender: ui, senderFrame: frame }, ui, expected));
  }
  assert.equal(
    isSameDocument('http://localhost:5173/?theme=arena', 'http://localhost:5173/'),
    true,
  );
  assert.equal(isSameDocument('http://localhost:5174/', 'http://localhost:5173/'), false);
});
