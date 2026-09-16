const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { EventEmitter } = require('node:events');

function preload(name, isMainFrame, location) {
  let exposed;
  const calls = [];
  vm.runInNewContext(fs.readFileSync(`dist-electron/${name}.js`, 'utf8'), {
    exports: {},
    process: { isMainFrame },
    window: { location },
    require: () => ({
      contextBridge: {
        exposeInMainWorld: (_name, api) => {
          exposed = api;
        },
      },
      ipcRenderer: {
        invoke: (channel) => {
          calls.push(channel);
          return Promise.resolve();
        },
      },
    }),
  });
  return { exposed, calls };
}

test('content preload never grants UI privileges for file, localhost, loopback or remote pages', async () => {
  for (const location of [
    { protocol: 'file:', hostname: '' },
    { protocol: 'http:', hostname: 'localhost' },
    { protocol: 'http:', hostname: '127.0.0.1' },
    { protocol: 'https:', hostname: 'arena.ai' },
  ]) {
    const { exposed, calls } = preload('content-preload', true, location);
    assert.deepEqual(Object.keys(exposed), ['tabs']);
    assert.deepEqual(Object.keys(exposed.tabs), ['reloadActive']);
    await exposed.tabs.reloadActive();
    assert.deepEqual(calls, ['arena:content:retry']);
  }
  assert.equal(preload('content-preload', false, {}).exposed, undefined);
  assert.equal(preload('ui-preload', false, {}).exposed, undefined);
  assert.ok(preload('ui-preload', true, {}).exposed.settings);
});

test('updater start/stop owns both initial timeout and recurring timer', () => {
  const timers = new Set();
  const updater = new EventEmitter();
  const exports = {};
  const add = () => {
    const id = {};
    timers.add(id);
    return id;
  };
  vm.runInNewContext(fs.readFileSync('dist-electron/updater.js', 'utf8'), {
    exports,
    console,
    require: (name) =>
      name === 'electron' ? { app: { isPackaged: true } } : { autoUpdater: updater },
    setTimeout: add,
    setInterval: add,
    clearTimeout: (id) => timers.delete(id),
    clearInterval: (id) => timers.delete(id),
  });
  const instance = new exports.AppUpdater(() => {});
  instance.start();
  assert.equal(timers.size, 2);
  instance.start();
  assert.equal(timers.size, 2);
  instance.stop();
  assert.equal(timers.size, 0);
  instance.stop();
  assert.equal(timers.size, 0);
});
