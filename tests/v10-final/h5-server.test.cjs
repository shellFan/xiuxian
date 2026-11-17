'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const { parseOptions, createH5Server } = require('../../scripts/h5-server.cjs');

test('H5 CLI uses explicit port, rejects malformed ports and supports ephemeral test ports', () => {
  assert.equal(parseOptions(['--port', '8769'], {}).port, 8769);
  assert.equal(parseOptions(['--port=8770'], {}).port, 8770);
  assert.equal(parseOptions([], { H5_PORT: '8771' }).port, 8771);
  assert.equal(parseOptions(['--port', '0'], {}).port, 0);
  for (const value of ['-1', '65536', 'abc', '3.5', '']) {
    assert.throws(() => parseOptions(['--port', value], {}), /port/i);
  }
  assert.throws(() => parseOptions(['--root'], {}), /root/i);
});

test('H5 serves standalone files, blocks sibling traversal, survives malformed URLs and uses fresh code', async () => {
  const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'xiuxian-h5-server-test-'));
  const root = path.join(sandbox, 'site');
  fs.mkdirSync(root); fs.mkdirSync(root + '-private');
  fs.writeFileSync(path.join(root, 'index.html'), '<title>牛马修仙传</title>');
  fs.writeFileSync(path.join(root, 'game.js'), 'window.gameVersion=10;');
  fs.writeFileSync(path.join(root + '-private', 'secret.txt'), 'not-public');
  const server = createH5Server(root);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const request = (url) => new Promise((resolve, reject) => {
    http.get({host:'127.0.0.1', port:server.address().port, path:url}, (res) => {
      let body=''; res.on('data',chunk=>body+=chunk); res.on('end',()=>resolve({status:res.statusCode,headers:res.headers,body}));
    }).on('error',reject);
  });
  try {
    assert.equal((await request('/')).status, 200);
    assert.equal((await request('/%2e%2e/site-private/secret.txt')).status, 403);
    assert.equal((await request('/%E0%A4%A')).status, 400);
    const js = await request('/game.js');
    assert.equal(js.status, 200); assert.match(js.headers['cache-control'], /no-cache/);
    assert.equal((await request('/missing.js')).status, 404);
    assert.equal((await request('/')).status, 200);
  } finally { await new Promise(resolve=>server.close(resolve)); }
});
