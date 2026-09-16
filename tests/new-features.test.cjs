const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const fsPromises = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const {
  isAllowedNotificationOrigin,
  isAllowedNotificationUrl,
} = require('../dist-electron/notification-policy');
const { getVisibleWindowBounds } = require('../dist-electron/window-bounds');
const { validateSettings } = require('../dist-electron/settings-schema');
const { MAX_TABS } = require('../dist-electron/shared');
const { SettingsStore } = require('../dist-electron/settings-store');

// ---------- notification allowlist ----------
test('notification origin allowlist restricts to arena.ai and *.arena.ai', () => {
  const allow = [
    'https://arena.ai',
    'https://arena.ai/',
    'https://www.arena.ai',
    'https://foo.arena.ai',
    'https://a.b.arena.ai',
    'https://arena.ai:443/path',
  ];
  const deny = [
    'https://arena.ai.evil.com',
    'https://evil.com',
    'https://arena.ai.evil',
    'http://arena.ai',
    'http://foo.arena.ai',
    'https://notarena.ai',
    'file://arena.ai',
    '',
    'invalid',
    'https://arena.ai@evil.com',
    'https://arena.ai:8443',
    'https://foo.arena.ai:8443',
    'https://arena.ai:8080/path',
  ];
  for (const origin of allow) {
    assert.equal(isAllowedNotificationOrigin(origin), true, `${origin} should allow`);
    assert.equal(isAllowedNotificationUrl(origin), true, `${origin} URL should allow`);
  }
  for (const origin of deny) {
    assert.equal(isAllowedNotificationOrigin(origin), false, `${origin} should deny`);
    assert.equal(isAllowedNotificationUrl(origin), false, `${origin} URL should deny`);
  }
  // Explicit checks from review
  assert.equal(isAllowedNotificationOrigin('https://arena.ai'), true);
  assert.equal(isAllowedNotificationOrigin('https://foo.arena.ai'), true);
  assert.equal(isAllowedNotificationOrigin('https://arena.ai.evil.com'), false);
  assert.equal(isAllowedNotificationOrigin('http://arena.ai'), false);
  assert.equal(isAllowedNotificationOrigin('https://arena.ai:8443'), false);
  assert.equal(isAllowedNotificationOrigin('https://arena.ai:443'), true);
});

// ---------- window bounds visibility ----------
test('getVisibleWindowBounds detects off-screen windows', () => {
  const displays = [
    { workArea: { x: 0, y: 0, width: 1920, height: 1080 } },
    { workArea: { x: 1920, y: 0, width: 1920, height: 1080 } },
  ];
  // Visible on primary
  assert.deepEqual(getVisibleWindowBounds({ width: 1280, height: 800, x: 100, y: 100 }, displays), {
    width: 1280,
    height: 800,
    x: 100,
    y: 100,
  });
  // Visible on secondary
  assert.deepEqual(
    getVisibleWindowBounds({ width: 1280, height: 800, x: 2000, y: 100 }, displays),
    { width: 1280, height: 800, x: 2000, y: 100 },
  );
  // Completely off-screen
  assert.deepEqual(
    getVisibleWindowBounds({ width: 1280, height: 800, x: 5000, y: 5000 }, displays),
    { width: 1280, height: 800 },
  );
  // Negative off-screen
  assert.deepEqual(
    getVisibleWindowBounds({ width: 1280, height: 800, x: -5000, y: -5000 }, displays),
    { width: 1280, height: 800 },
  );
  // No x/y -> always visible (Electron centers)
  assert.deepEqual(getVisibleWindowBounds({ width: 1280, height: 800 }, displays), {
    width: 1280,
    height: 800,
  });
  // null -> null
  assert.equal(getVisibleWindowBounds(null, displays), null);
  // No displays -> return as-is
  assert.deepEqual(getVisibleWindowBounds({ width: 1280, height: 800, x: 5000, y: 5000 }, []), {
    width: 1280,
    height: 800,
    x: 5000,
    y: 5000,
  });
});

// ---------- MAX_TABS ----------
test('MAX_TABS is 32 and restoreTabs is truncated', () => {
  assert.equal(MAX_TABS, 32);
  const many = Array.from({ length: 50 }, (_, i) => `https://arena.ai/${i}`);
  const result = validateSettings({ restoreTabs: many });
  assert.equal(result.restoreTabs.length, 32);
  assert.deepEqual(result.restoreTabs, many.slice(0, 32));

  // Exactly 32 should pass
  const exactly = Array.from({ length: 32 }, (_, i) => `https://arena.ai/${i}`);
  assert.equal(validateSettings({ restoreTabs: exactly }).restoreTabs.length, 32);

  // Filtering invalid URLs + truncation
  const mixed = [...many, 'file:///bad', 'invalid', 123];
  const filtered = validateSettings({ restoreTabs: mixed });
  assert.equal(filtered.restoreTabs.length, 32);
});

// ---------- shortcut rollback ----------
test('shortcut rollback keeps old shortcut when new registration fails', () => {
  // Mock electron module with per-accelerator failure control
  const mockElectron = {
    globalShortcut: {
      _registered: new Set(),
      _failList: new Set(),
      _throwList: new Set(),
      register(acc, _cb) {
        if (this._throwList.has(acc)) throw new Error('invalid');
        if (this._failList.has(acc)) return false;
        this._registered.add(acc);
        return true;
      },
      unregisterAll() {
        this._registered.clear();
      },
    },
  };

  const shortcutPath = path.resolve(__dirname, '../dist-electron/shortcuts.js');
  delete require.cache[shortcutPath];

  const Module = require('node:module');
  const originalLoad = Module._load;
  Module._load = function (request, _parent, _isMain) {
    if (request === 'electron') return mockElectron;
    return originalLoad.apply(this, arguments);
  };

  try {
    const {
      setGlobalShortcut,
      __getActiveForTest,
      clearGlobalShortcuts,
    } = require('../dist-electron/shortcuts');

    const trigger = () => {};
    // First registration succeeds
    mockElectron.globalShortcut._failList.clear();
    mockElectron.globalShortcut._throwList.clear();
    let err = setGlobalShortcut('Ctrl+Shift+A', true, trigger);
    assert.equal(err, null);
    assert.deepEqual(__getActiveForTest(), { accelerator: 'Ctrl+Shift+A', enabled: true });

    // Second registration fails (occupied) -> should keep old
    mockElectron.globalShortcut._failList.add('Ctrl+Shift+B');
    err = setGlobalShortcut('Ctrl+Shift+B', true, trigger);
    assert.ok(err && err.includes('註冊失敗'));
    assert.deepEqual(__getActiveForTest(), { accelerator: 'Ctrl+Shift+A', enabled: true });
    mockElectron.globalShortcut._failList.delete('Ctrl+Shift+B');

    // Third registration throws (invalid format) -> should keep old
    mockElectron.globalShortcut._throwList.add('Invalid!!');
    err = setGlobalShortcut('Invalid!!', true, trigger);
    assert.ok(err && err.includes('格式無效'));
    assert.deepEqual(__getActiveForTest(), { accelerator: 'Ctrl+Shift+A', enabled: true });
    mockElectron.globalShortcut._throwList.delete('Invalid!!');

    // Disable -> clears
    err = setGlobalShortcut('Ctrl+Shift+A', false, trigger);
    assert.equal(err, null);
    assert.deepEqual(__getActiveForTest(), { accelerator: null, enabled: false });

    // New registration after disable succeeds
    err = setGlobalShortcut('Ctrl+Shift+C', true, trigger);
    assert.equal(err, null);
    assert.deepEqual(__getActiveForTest(), { accelerator: 'Ctrl+Shift+C', enabled: true });

    clearGlobalShortcuts();
    assert.deepEqual(__getActiveForTest(), { accelerator: null, enabled: false });
  } finally {
    Module._load = originalLoad;
    delete require.cache[shortcutPath];
  }
});

// ---------- SettingsStore retry ----------
test('SettingsStore retries after I/O failure with backoff', async (t) => {
  const dir = await fsPromises.mkdtemp(path.join(os.tmpdir(), 'arena-settings-retry-'));
  t.after(() => fsPromises.rm(dir, { recursive: true, force: true }));
  const file = path.join(dir, 'settings.json');

  const store = new SettingsStore(file, 10);
  store.save({ theme: 'arena' });
  await store.flush();
  const original = await fsPromises.readFile(file, 'utf8');

  // Make .tmp a directory to force failure
  await fsPromises.mkdir(`${file}.tmp`);
  store.save({ theme: 'dark' });
  await assert.rejects(() => store.flush());
  assert.equal(await fsPromises.readFile(file, 'utf8'), original);

  // Remove blocking dir, wait for automatic retry (100ms first delay)
  await fsPromises.rmdir(`${file}.tmp`);
  // Wait up to 1s for retry to succeed
  for (let i = 0; i < 10; i++) {
    await new Promise((r) => setTimeout(r, 100));
    try {
      const content = await fsPromises.readFile(file, 'utf8');
      if (JSON.parse(content).theme === 'dark') break;
    } catch {}
  }
  const afterRetry = JSON.parse(await fsPromises.readFile(file, 'utf8'));
  assert.equal(afterRetry.theme, 'dark');
});

// ---------- release notes strict policy ----------
test('release notes strict policy: version-specific file must exist', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8'));
  const version = pkg.version;
  const specific = path.join(__dirname, '..', `release-notes/v${version}.md`);
  assert.equal(
    fs.existsSync(specific),
    true,
    `release-notes/v${version}.md must exist for version ${version}`,
  );
  // Ensure fallback is not considered sufficient for new versions (policy)
  // The workflow now requires specific file, so we check that our workflow file enforces it
  const workflow = fs.readFileSync(
    path.join(__dirname, '..', '.github/workflows/release.yml'),
    'utf8',
  );
  assert.ok(
    workflow.includes('release-notes/v${version}.md') && !workflow.includes('prerelease-notes.md'),
    'release workflow should not fallback to prerelease-notes.md',
  );
});
