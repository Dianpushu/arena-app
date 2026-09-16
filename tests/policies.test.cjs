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
const { moveTabOrder, nextZoom } = require('../dist-electron/tab-utils');
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
