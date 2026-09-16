const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { SettingsStore } = require('../dist-electron/settings-store');

async function fixture(t) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'arena-settings-test-'));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  return path.join(dir, 'settings.json');
}

test('corrupt JSON safely falls back; save is debounced and flush writes only latest snapshot', async (t) => {
  const file = await fixture(t);
  await fs.writeFile(file, '{corrupt');
  const store = new SettingsStore(file, 10000);
  assert.equal(store.get().theme, 'arena');
  for (let i = 50; i <= 200; i++) store.save({ defaultZoomPercent: i });
  store.save({ restoreTabs: ['https://arena.ai/final'] });
  assert.equal(await fs.readFile(file, 'utf8'), '{corrupt', 'save must not write synchronously');
  await store.flush();
  const disk = JSON.parse(await fs.readFile(file, 'utf8'));
  assert.equal(disk.defaultZoomPercent, 200);
  assert.deepEqual(disk.restoreTabs, ['https://arena.ai/final']);
  await assert.rejects(() => fs.stat(`${file}.tmp`), { code: 'ENOENT' });
  const copy = store.get();
  copy.restoreTabs.length = 0;
  assert.equal(store.get().restoreTabs.length, 1);
});

test('concurrent saves/flushes cannot overwrite newer settings with older snapshots', async (t) => {
  const file = await fixture(t);
  const store = new SettingsStore(file, 10000);
  store.save({ theme: 'dark' });
  const first = store.flush();
  store.save({ restoreTabs: ['https://arena.ai/last'], theme: 'arena' });
  await Promise.all([first, store.flush(), store.flush()]);
  assert.deepEqual(JSON.parse(await fs.readFile(file, 'utf8')), store.get());
});

test('failed atomic write keeps original JSON intact and can be retried', async (t) => {
  const file = await fixture(t);
  const store = new SettingsStore(file, 10000);
  store.save({ theme: 'arena' });
  await store.flush();
  const original = await fs.readFile(file, 'utf8');
  await fs.mkdir(`${file}.tmp`);
  store.save({ theme: 'dark' });
  await assert.rejects(() => store.flush());
  assert.equal(await fs.readFile(file, 'utf8'), original);
  await fs.rmdir(`${file}.tmp`);
  await store.flush();
  assert.equal(JSON.parse(await fs.readFile(file, 'utf8')).theme, 'dark');
});
