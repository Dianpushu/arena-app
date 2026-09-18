const { test } = require('node:test');
const assert = require('node:assert/strict');

const {
  allowClipboardPermission,
  isClipboardPermission,
  resolveRequestingUrl,
  CLIPBOARD_PERMISSIONS,
} = require('../dist-electron/clipboard-policy');

// 迴歸重點：這個檔案存在的原因是「複製按鈕按了沒反應」。
// 過去 main.ts 對通知以外的所有權限一律 callback(false)，
// 導致 navigator.clipboard.writeText() 被判 NotAllowedError。

test('clipboard permission names are recognised, others fall through to the deny-all path', () => {
  for (const permission of CLIPBOARD_PERMISSIONS) {
    assert.equal(isClipboardPermission(permission), true, permission);
  }
  for (const permission of [
    'notifications',
    'media',
    'geolocation',
    'display-capture',
    'midi',
    'openExternal',
    'unknown',
    'clipboard',
    'clipboard-write',
    '',
  ]) {
    assert.equal(isClipboardPermission(permission), false, permission);
  }
});

test('sanitized clipboard writes are allowed for any http(s) document so copy buttons work', () => {
  for (const url of [
    'https://arena.ai/chat/123',
    'https://www.arena.ai',
    'https://foo.arena.ai/x',
    'https://example.com/page',
    'http://localhost:5173/',
    'http://127.0.0.1:8080/app',
  ]) {
    assert.equal(
      allowClipboardPermission('clipboard-sanitized-write', url),
      true,
      `${url} should be able to copy`,
    );
  }
});

test('clipboard reads stay restricted to arena.ai and *.arena.ai', () => {
  for (const url of ['https://arena.ai/chat', 'https://www.arena.ai', 'https://a.b.arena.ai/x']) {
    assert.equal(allowClipboardPermission('clipboard-read', url), true, `${url} should read`);
  }
  for (const url of [
    'https://example.com',
    'https://arena.ai.evil.com',
    'https://notarena.ai',
    'http://arena.ai',
    'https://arena.ai:8443',
    'https://arena.ai@evil.com',
    'http://localhost:5173',
  ]) {
    assert.equal(allowClipboardPermission('clipboard-read', url), false, `${url} must not read`);
  }
});

test('non-web documents and the deprecated sync API are always denied', () => {
  for (const url of [
    'file:///C:/secret.html',
    'data:text/html,hi',
    'javascript:alert(1)',
    'custom-protocol://app',
    'https://user:pass@arena.ai',
    'about:blank',
    'null',
    '',
    undefined,
    null,
    42,
    {},
  ]) {
    assert.equal(
      allowClipboardPermission('clipboard-sanitized-write', url),
      false,
      `${String(url)} must not write`,
    );
    assert.equal(
      allowClipboardPermission('clipboard-read', url),
      false,
      `${String(url)} must not read`,
    );
  }
  // 同步舊 API 與未知權限名稱即使來自 Arena 也拒絕。
  assert.equal(
    allowClipboardPermission('deprecated-sync-clipboard-read', 'https://arena.ai'),
    false,
  );
  assert.equal(allowClipboardPermission('media', 'https://arena.ai'), false);
  assert.equal(allowClipboardPermission('geolocation', 'https://arena.ai'), false);
});

test('requesting URL falls back across the fields each handler actually provides', () => {
  // request handler：details.requestingUrl 優先
  assert.equal(
    resolveRequestingUrl('https://arena.ai/chat', 'https://other.example'),
    'https://arena.ai/chat',
  );
  // check handler：requestingUrl 實測可能是空的，退回 embeddingOrigin，再退回 requestingOrigin
  assert.equal(
    resolveRequestingUrl(undefined, 'https://arena.ai', 'https://ignored.example'),
    'https://arena.ai',
  );
  assert.equal(resolveRequestingUrl('', '', 'https://arena.ai'), 'https://arena.ai');
  // 全部沒有時不可誤判成允許
  assert.equal(resolveRequestingUrl(undefined, null, ''), undefined);
  assert.equal(resolveRequestingUrl('null', 'null'), undefined);
  assert.equal(
    allowClipboardPermission('clipboard-sanitized-write', resolveRequestingUrl()),
    false,
  );
});
