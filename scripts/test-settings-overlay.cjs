// 在真正的 Electron 中驗證 React → preload → IPC → 原生 WebContentsView，
// 而非只能測 CSS 的瀏覽器預覽。所有設定、Cookie 與測試網頁均隔離。
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const { app, BrowserWindow } = require('electron');

const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'arena-overlay-test-'));
app.setPath('userData', userData);
app.disableHardwareAcceleration();
process.env.ARENA_DEV = '0';
const server = http.createServer((_req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/html' });
  res.end(
    '<html><body style="background:#f00">Native content<input id="draft" value="keep me"></body></html>',
  );
});
let expectedAtQuit;
const watchdog = setTimeout(() => {
  console.error('Settings overlay test timed out');
  app.exit(1);
}, 60000);

async function waitFor(check, description) {
  const deadline = Date.now() + 10000;
  while (Date.now() < deadline) {
    if (await check()) return;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error(`Timed out: ${description}`);
}

async function run() {
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const homepage = `http://127.0.0.1:${server.address().port}`;
  fs.writeFileSync(
    path.join(userData, 'settings.json'),
    JSON.stringify({
      homepage,
      restoreTabs: [],
      globalShortcutEnabled: false,
      launchAtStartup: false,
    }),
  );
  require('../dist-electron/main.js');
  await app.whenReady();
  await waitFor(() => BrowserWindow.getAllWindows().length > 0, 'main window');
  const win = BrowserWindow.getAllWindows()[0];
  const ui = (code) => win.webContents.executeJavaScript(code);
  const views = () =>
    win.contentView.children.filter((v) => v.webContents && v.webContents !== win.webContents);
  const visible = () => views().filter((v) => v.getVisible());
  const dialogOpen = () => ui('!!document.querySelector(".modal")');
  await waitFor(() => ui('!!document.querySelector("button.gear")'), 'renderer ready');
  await waitFor(() => visible().length === 1, 'initial native tab');
  const original = visible()[0];
  await waitFor(() => !original.webContents.isLoading(), 'test page loaded');
  await original.webContents.executeJavaScript('window.testMarker = "preserved"');
  const originalId = await ui('(async () => (await window.arena.tabs.list())[0].id)()');

  const open = async () => {
    await ui('document.querySelector("button.gear").click()');
    await waitFor(
      async () => (await dialogOpen()) && visible().length === 0,
      'dialog above hidden native views',
    );
  };
  const closed = async () => {
    await waitFor(
      async () => !(await dialogOpen()) && visible().length === 1,
      'dialog closed and active tab restored',
    );
  };

  // 真正從工具列開啟，設定可操作，並保留原網頁與輸入狀態。
  await open();
  await ui('document.querySelectorAll(".modal .segment button")[1].click()');
  await waitFor(() => ui('document.documentElement.dataset.theme === "dark"'), 'theme changed');
  assert.equal(visible().length, 0);
  win.setSize(1100, 720);
  win.emit('resize');
  win.emit('maximize');
  win.emit('unmaximize');
  assert.equal(visible().length, 0, 'layout events must not reveal native content');
  await ui('document.querySelector(".modal-x").click()');
  await closed();
  assert.equal(visible()[0], original);
  assert.equal(await original.webContents.executeJavaScript('window.testMarker'), 'preserved');
  assert.equal(
    await original.webContents.executeJavaScript('document.querySelector("#draft").value'),
    'keep me',
  );

  // 設定期間建立／切換／導覽／關閉分頁都必須維持遮蔽狀態。
  await open();
  const secondId = await ui('window.arena.tabs.create()');
  assert.equal(views().length, 2);
  assert.equal(visible().length, 0);
  await ui(`window.arena.tabs.activate(${originalId})`);
  await ui(`window.arena.tabs.navigate(${secondId}, ${JSON.stringify(homepage + '/second')})`);
  assert.equal(visible().length, 0);
  await ui(`window.arena.tabs.close(${secondId})`);
  assert.equal(visible().length, 0);
  await ui('document.querySelector(".modal-backdrop").click()');
  await closed();
  assert.equal(visible()[0], original);

  // Escape 關閉、快捷鍵不穿透設定（避免輸入快捷鍵時誤開分頁）。
  await open();
  await ui(
    'window.dispatchEvent(new KeyboardEvent("keydown", {key:"t", ctrlKey:true, bubbles:true}))',
  );
  assert.equal(views().length, 1);
  await ui('window.dispatchEvent(new KeyboardEvent("keydown", {key:"Escape", bubbles:true}))');
  await closed();

  // 只允許主 UI 呼叫新 IPC，並驗證參數型別。
  assert.equal(
    await original.webContents.executeJavaScript(
      'window.arena.settings === undefined && window.arena.app === undefined',
    ),
    true,
  );
  assert.equal(
    await original.webContents.executeJavaScript(
      'window.arena.tabs.reloadActive().then(() => false, () => true)',
    ),
    true,
    'online content may not use offline retry',
  );
  // 故意給另一個不受信任視窗完整 UI preload：main IPC 仍必須全部拒絕。
  const attacker = new BrowserWindow({
    show: false,
    webPreferences: {
      preload: path.resolve('dist-electron/ui-preload.js'),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  await attacker.loadURL(homepage);
  assert.equal(
    await attacker.webContents.executeJavaScript(`(async () => {
    const a = window.arena;
    const calls = [() => a.tabs.list(), () => a.tabs.create(), () => a.tabs.close(1), () => a.tabs.activate(1),
      () => a.tabs.move(1,0), () => a.tabs.reload(), () => a.tabs.reloadActive(), () => a.tabs.goBack(), () => a.tabs.goForward(),
      () => a.tabs.navigate(1,'https://arena.ai'), () => a.tabs.zoomIn(), () => a.tabs.zoomOut(), () => a.tabs.zoomReset(),
      () => a.settings.get(), () => a.settings.set({theme:'dark'}), () => a.settings.setOpen(true),
      () => a.window.close(), () => a.window.hide(), () => a.window.minimize(), () => a.window.toggleMaximize(), () => a.window.isMaximized(),
      () => a.app.version(), () => a.app.checkUpdate(), () => a.app.quitAndInstall(), () => a.app.clearData(),
      () => a.app.openExternal('https://arena.ai'), () => a.app.quit()];
    return (await Promise.all(calls.map(fn => fn().then(() => false, () => true)))).every(Boolean);
  })()`),
    true,
    'all privileged IPC must reject untrusted WebContents',
  );
  attacker.destroy();
  for (const unsafe of [
    'file:///C:/secret',
    'data:text/html,bad',
    'javascript:alert(1)',
    'custom-protocol://bad',
  ]) {
    assert.equal(
      await ui(`window.arena.tabs.create(${JSON.stringify(unsafe)}).then(() => false, () => true)`),
      true,
    );
    assert.equal(
      await ui(
        `window.arena.tabs.navigate(${originalId}, ${JSON.stringify(unsafe)}).then(() => false, () => true)`,
      ),
      true,
    );
    assert.equal(
      await ui(
        `window.arena.app.openExternal(${JSON.stringify(unsafe)}).then(() => false, () => true)`,
      ),
      true,
    );
  }
  // 模擬來源分頁在背景：OAuth 回跳只重載來源，不動目前分頁。
  const otherId = await ui('window.arena.tabs.create()');
  const other = visible()[0];
  await waitFor(() => !other.webContents.isLoading(), 'background source test ready');
  await other.webContents.executeJavaScript('window.testMarker = "active-preserved"');
  await original.webContents.executeJavaScript(
    `window.open(${JSON.stringify(homepage.replace('127.0.0.1', 'localhost') + '/oauth')}); void 0`,
  );
  await waitFor(() => BrowserWindow.getAllWindows().length === 2, 'OAuth popup retained');
  const popup = BrowserWindow.getAllWindows().find((w) => w !== win);
  await waitFor(() => !popup.webContents.isLoading(), 'OAuth popup loaded');
  assert.equal(await popup.webContents.executeJavaScript('typeof window.arena'), 'undefined');
  await popup.loadURL(homepage + '/callback').catch(() => {});
  await waitFor(() => popup.isDestroyed(), 'OAuth callback closed popup');
  await waitFor(() => !original.webContents.isLoading(), 'source tab reloaded');
  assert.equal(await original.webContents.executeJavaScript('window.testMarker'), undefined);
  assert.equal(await other.webContents.executeJavaScript('window.testMarker'), 'active-preserved');
  assert.equal(visible()[0], other);
  await ui(`window.arena.tabs.close(${otherId})`);
  assert.equal(
    await ui('window.arena.settings.setOpen("true").then(() => false, () => true)'),
    true,
  );
  assert.equal(visible().length, 1);

  // 重載 UI、UI 崩潰時復原；最後一個分頁在設定期間關閉也不能穿透。
  await open();
  win.webContents.reload();
  await waitFor(() => visible().length === 1, 'reload restores content');
  await waitFor(() => ui('!!document.querySelector("button.gear")'), 'UI reloaded');
  await closed();
  await open();
  win.webContents.forcefullyCrashRenderer();
  await waitFor(() => visible().length === 1, 'renderer crash restores content');
  win.webContents.reload();
  await waitFor(() => ui('!!document.querySelector("button.gear")'), 'UI recovered');
  await open();
  await ui(`window.arena.tabs.close(${originalId})`);
  assert.equal(views().length, 1);
  assert.equal(visible().length, 0);
  await ui('document.querySelector(".modal-x").click()');
  await closed();
  assert.notEqual(visible()[0], original);
  // 清除時重建所有分頁，包括背景 document；設定仍然在最上方。
  await ui('window.arena.tabs.create()');
  const previousViews = views();
  const previousContents = previousViews.map((view) => view.webContents);
  for (const view of previousViews) {
    await waitFor(() => !view.webContents.isLoading(), 'clear-data page loaded');
    await view.webContents.executeJavaScript(
      'localStorage.setItem("secret", "value"); window.secret = "value"',
    );
  }
  await previousViews[0].webContents.session.cookies.set({
    url: homepage,
    name: 'test-login',
    value: 'secret',
  });
  await open();
  await ui('window.arena.app.clearData()');
  assert.equal(views().length, previousViews.length);
  assert.ok(previousContents.every((contents) => contents.isDestroyed()));
  assert.equal(visible().length, 0);
  for (const view of views()) {
    await waitFor(() => !view.webContents.isLoading(), 'rebuilt page loaded');
    assert.equal(await view.webContents.executeJavaScript('localStorage.getItem("secret")'), null);
    assert.equal(await view.webContents.executeJavaScript('window.secret'), undefined);
    assert.deepEqual(await view.webContents.session.cookies.get({ name: 'test-login' }), []);
  }
  await ui('document.querySelector(".modal-x").click()');
  await closed();
  // 離線 retry 必須重新載入來源 URL，而非重載 offline.html。
  const current = visible()[0];
  await current.webContents.loadFile(path.resolve('public/offline.html'));
  assert.equal(
    await current.webContents.executeJavaScript('window.arena.settings === undefined'),
    true,
  );
  await current.webContents.executeJavaScript('window.arena.tabs.reloadActive()');
  await waitFor(
    () => current.webContents.getURL().startsWith(homepage) && !current.webContents.isLoading(),
    'offline retry restored original URL',
  );
  const lastId = await ui('window.arena.tabs.create()');
  await ui(
    `window.arena.tabs.navigate(${lastId}, ${JSON.stringify(homepage + '/last-before-quit')})`,
  );
  expectedAtQuit = await ui('window.arena.tabs.list().then(tabs => tabs.map(t => t.url))');
  console.log(
    'PASS: settings overlay, preload/IPC isolation, URL policy, OAuth source tab, clear-data rebuild, offline retry, reload/crash recovery',
  );
}

run().then(
  () => finish(0),
  (err) => {
    console.error(err);
    console.error(
      `::error::${String(err.stack || err)
        .replace(/%/g, '%25')
        .replace(/\r/g, '%0D')
        .replace(/\n/g, '%0A')}`,
    );
    finish(1);
  },
);

function finish(code) {
  server.close();
  if (code !== 0) {
    app.exit(code);
    return;
  }
  app.once('will-quit', () => {
    clearTimeout(watchdog);
    try {
      const saved = JSON.parse(fs.readFileSync(path.join(userData, 'settings.json'), 'utf8'));
      assert.deepEqual(saved.restoreTabs, expectedAtQuit);
      console.log('PASS: immediate quit flushes latest tab state');
    } catch (err) {
      console.error(`::error::${err}`);
      app.exit(1);
    }
  });
  app.quit();
}
