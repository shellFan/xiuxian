'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const { CdpSession, dispatchWheelAt } = require('../../ai/gameplay-agent/lib/cdp.cjs');
const { withLaunchResourceCleanup } = require('../../ai/gameplay-agent/lib/launch-lifecycle.cjs');

function serverFrame(opcode, payload, fin = true) {
  const body = Buffer.from(payload);
  let header;
  if (body.length < 126) {
    header = Buffer.from([(fin ? 0x80 : 0) | opcode, body.length]);
  } else if (body.length < 65536) {
    header = Buffer.alloc(4);
    header[0] = (fin ? 0x80 : 0) | opcode;
    header[1] = 126;
    header.writeUInt16BE(body.length, 2);
  } else {
    header = Buffer.alloc(10);
    header[0] = (fin ? 0x80 : 0) | opcode;
    header[1] = 127;
    header.writeBigUInt64BE(BigInt(body.length), 2);
  }
  return Buffer.concat([header, body]);
}

function consumeClientFrames(socket, onMessage) {
  let buffered = Buffer.alloc(0);
  socket.on('data', (chunk) => {
    buffered = Buffer.concat([buffered, chunk]);
    while (buffered.length >= 2) {
      let length = buffered[1] & 0x7f;
      let offset = 2;
      if (length === 126) {
        if (buffered.length < 4) return;
        length = buffered.readUInt16BE(2);
        offset = 4;
      } else if (length === 127) {
        if (buffered.length < 10) return;
        length = Number(buffered.readBigUInt64BE(2));
        offset = 10;
      }
      const masked = (buffered[1] & 0x80) !== 0;
      const maskLength = masked ? 4 : 0;
      if (buffered.length < offset + maskLength + length) return;
      const mask = masked ? buffered.subarray(offset, offset + 4) : null;
      let payload = buffered.subarray(offset + maskLength, offset + maskLength + length);
      if (masked) payload = Buffer.from(payload.map((value, index) => value ^ mask[index % 4]));
      buffered = buffered.subarray(offset + maskLength + length);
      if ((buffered[0] & 0x0f) === 8) return;
      onMessage(payload.toString('utf8'));
    }
  });
}

test('CDP screenshot capture resolves when Chromium fragments its websocket response', async () => {
  let websocketSocket;
  const server = http.createServer((request, response) => {
    if (request.url === '/json') {
      response.setHeader('content-type', 'application/json');
      response.end(JSON.stringify([{ type: 'page', url: 'http://127.0.0.1/index.html', webSocketDebuggerUrl: `ws://127.0.0.1:${server.address().port}/devtools/page/1` }]));
      return;
    }
    response.statusCode = 404;
    response.end();
  });
  server.on('upgrade', (request, socket) => {
    websocketSocket = socket;
    const key = request.headers['sec-websocket-key'];
    const accept = crypto.createHash('sha1').update(key + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64');
    socket.write(`HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${accept}\r\n\r\n`);
    consumeClientFrames(socket, (text) => {
      const command = JSON.parse(text);
      if (command.method === 'Page.captureScreenshot') {
        assert.equal(command.params.format, 'png');
        assert.equal(command.params.captureBeyondViewport, false);
        assert.equal(command.params.optimizeForSpeed, true, 'large high-DPI Electron screenshots should use Chromium’s faster PNG encoder');
        assert.deepEqual(command.params.clip, { x: 0, y: 0, width: 1280, height: 720, scale: 0.5 }, 'capture should retain the visible viewport at one logical pixel per CSS pixel');
        const payload = JSON.stringify({ id: command.id, result: { data: Buffer.from('screenshot').toString('base64') } });
        const middle = Math.floor(payload.length / 2);
        socket.write(serverFrame(1, payload.slice(0, middle), false));
        socket.write(serverFrame(0, payload.slice(middle), true));
      } else if (command.method === 'Runtime.evaluate') {
        socket.write(serverFrame(1, JSON.stringify({ id: command.id, result: { result: { type: 'object', value: { width: 1280, height: 720 } } } })));
      } else {
        socket.write(serverFrame(1, JSON.stringify({ id: command.id, result: {} })));
      }
    });
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));

  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'xiuxian-cdp-fragment-'));
  const screenshot = path.join(directory, 'capture.png');
  let session;
  try {
    session = await CdpSession.connect(server.address().port, Date.now() + 2000);
    const capture = session.screenshot(screenshot);
    await Promise.race([
      capture,
      new Promise((_, reject) => setTimeout(() => reject(new Error('fragmented screenshot response was not dispatched')), 500)),
    ]);
    assert.equal(fs.readFileSync(screenshot, 'utf8'), 'screenshot');
  } finally {
    if (session) {
      for (const entry of session.pending.values()) clearTimeout(entry.timer);
      session.close();
    }
    websocketSocket?.destroy();
    await new Promise((resolve) => server.close(resolve));
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('CDP session serializes screenshot capture for one target', async () => {
  const { CdpSession } = require('../../ai/gameplay-agent/lib/cdp.cjs');
  const session = new CdpSession({ send() {}, close() {} });
  const requests = [];
  let active = 0;
  let maxActive = 0;
  session.send = (method) => {
    if (method === 'Runtime.evaluate') return Promise.resolve({ result: { value: { width: 1280, height: 720 } } });
    active++;
    maxActive = Math.max(maxActive, active);
    return new Promise((_, reject) => requests.push(() => { active--; reject(new Error('capture queue test complete')); }));
  };

  const first = session.screenshot('unused-first.png').catch((error) => error.message);
  const second = session.screenshot('unused-second.png').catch((error) => error.message);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(requests.length, 1, 'the second capture must wait behind the first capture');
  requests[0]();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(requests.length, 2);
  requests[1]();
  assert.deepEqual(await Promise.all([first, second]), ['capture queue test complete', 'capture queue test complete']);
  assert.equal(maxActive, 1);
});

test('CDP startup waits for the authoritative facade before taking its first screenshot', () => {
  const source = fs.readFileSync(path.resolve('ai/gameplay-agent/index.cjs'), 'utf8');
  const wait = source.indexOf("launchStage = 'WAITING_FOR_GAME_FACADE_READY'");
  const screenshot = source.indexOf('await session.screenshot(firstScreenshot)');
  const ready = source.indexOf('if (ready) {', wait);
  assert.ok(wait >= 0 && ready > wait && screenshot > ready,
    'the expensive renderer capture must not block Cocos first-frame and launch-scene startup');
});

test('CDP session rejects and clears pending commands when its target closes', async () => {
  const { CdpSession } = require('../../ai/gameplay-agent/lib/cdp.cjs');
  const webSocket = { send() {}, close() {} };
  const session = new CdpSession(webSocket, { commandTimeoutMs: 10000 });
  const request = session.send('Page.captureScreenshot').then(() => 'resolved', (error) => error);
  try {
    session.close();
    assert.equal(session.pending.size, 0);
    const outcome = await Promise.race([request, new Promise((resolve) => setTimeout(() => resolve(new Error('request was not released')), 100))]);
    assert.ok(outcome instanceof Error && /closed/i.test(outcome.message));
  } finally {
    for (const entry of session.pending.values()) clearTimeout(entry.timer);
    session.pending.clear();
  }
});

test('timed out screenshot attempts are bounded, retried once, and removed from pending state', async () => {
  const { CdpSession } = require('../../ai/gameplay-agent/lib/cdp.cjs');
  const session = new CdpSession({ send() {}, close() {} }, { screenshotTimeoutMs: 10, screenshotRetries: 1 });
  session.evaluate = async (expression) => expression.includes('innerWidth') ? { width: 1280, height: 720 } : null;

  await assert.rejects(session.screenshot('unused.png'), /CDP command timed out: Page\.captureScreenshot/);

  assert.equal(session.pending.size, 0);
  assert.equal(session.snapshotMetrics().screenshotRetries, 1);
  assert.equal(session.snapshotMetrics().screenshotTimeouts, 2);
  assert.equal(session.snapshotMetrics().screenshotFailures, 1);
});

test('CDP command timeouts retain bounded non-sensitive command timing diagnostics', async () => {
  const session = new CdpSession({ send() {}, close() {} }, { commandTimeoutMs: 8 });

  await assert.rejects(session.send('Input.dispatchMouseEvent', { type: 'mouseWheel', x: 12, y: 34, deltaX: 0, deltaY: 150, text: 'must not be retained' }),
    /CDP command timed out: Input\.dispatchMouseEvent/);

  const metrics = session.snapshotMetrics();
  assert.equal(metrics.commandTimeouts, 1);
  assert.equal(metrics.commandSamples.length, 1);
  assert.equal(metrics.commandSamples[0].method, 'Input.dispatchMouseEvent');
  assert.equal(metrics.commandSamples[0].status, 'timeout');
  assert.equal(metrics.commandSamples[0].timeoutMs, 8);
  assert.ok(metrics.commandSamples[0].elapsedMs >= 8);
  assert.deepEqual(metrics.commandSamples[0].input, { type: 'mouseWheel', x: 12, y: 34, deltaX: 0, deltaY: 150 });
  assert.equal('params' in metrics.commandSamples[0], false, 'diagnostics must not retain typed text or arbitrary CDP payloads');
  assert.equal(session.pending.size, 0);
  session.close();
});

test('wheel input first positions the synthetic pointer over the intended scroll surface', async () => {
  const calls = [];
  const session = { send: async (method, params) => calls.push({ method, params }) };

  await dispatchWheelAt(session, { x: 789.14, y: 327.5, deltaX: 0, deltaY: 150 });

  assert.deepEqual(calls, [
    { method: 'Input.dispatchMouseEvent', params: { type: 'mouseMoved', x: 789.14, y: 327.5 } },
    { method: 'Input.dispatchMouseEvent', params: { type: 'mouseWheel', x: 789.14, y: 327.5, deltaX: 0, deltaY: 150 } },
  ]);
});

test('CDP screenshot timeout retries using the view capture path before failing', async () => {
  const session = new CdpSession({ send() {}, close() {} }, { screenshotTimeoutMs: 50, screenshotRetries: 1 });
  const captures = [];
  session.send = async (method, params) => {
    if (method === 'Runtime.evaluate') return { result: { value: { width: 1280, height: 720 } } };
    captures.push(params);
    if (captures.length === 1) throw new Error('CDP command timed out: Page.captureScreenshot');
    return { data: Buffer.from('fallback screenshot').toString('base64') };
  };
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'xiuxian-cdp-fallback-'));
  const screenshot = path.join(directory, 'capture.png');

  try {
    await session.screenshot(screenshot);
    assert.equal(captures.length, 2);
    assert.equal(captures[0].fromSurface, true, 'the first capture keeps the normal compositor surface path');
    assert.equal(captures[1].fromSurface, false, 'a timeout retries through the view capture path');
    assert.deepEqual(captures[1].clip, captures[0].clip, 'fallback retains the visible viewport and evidence resolution');
    assert.equal(fs.readFileSync(screenshot, 'utf8'), 'fallback screenshot');
    assert.equal(session.snapshotMetrics().screenshotRetries, 1);
    assert.equal(session.snapshotMetrics().screenshotSuccesses, 1);
  } finally {
    session.close();
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('CDP screenshot uses the isolated Electron capture bridge after both CDP paths time out', async () => {
  const session = new CdpSession({ send() {}, close() {} }, { screenshotTimeoutMs: 10, screenshotRetries: 1 });
  const captures = [];
  const image = Buffer.from('electron main-process screenshot');
  let bridgeChecks = 0;
  session.send = async (method, params) => {
    if (method === 'Runtime.evaluate' && params.expression.includes('innerWidth')) {
      return { result: { value: { width: 1280, height: 720 } } };
    }
    if (method === 'Runtime.evaluate' && params.expression.includes('__XIUXIAN_GAMEPLAY_CAPTURE__')) {
      bridgeChecks++;
      return { result: { value: bridgeChecks > 1 ? image.toString('base64') : null } };
    }
    if (method === 'Page.captureScreenshot') {
      captures.push(params.fromSurface);
      throw new Error('CDP command timed out: Page.captureScreenshot');
    }
    throw new Error(`Unexpected CDP method: ${method}`);
  };
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'xiuxian-cdp-electron-capture-'));
  const screenshot = path.join(directory, 'capture.png');

  try {
    await session.screenshot(screenshot);
    assert.deepEqual(captures, [true, false]);
    assert.equal(fs.readFileSync(screenshot, 'utf8'), image.toString());
    assert.equal(session.snapshotMetrics().screenshotFallbacks, 1);
    assert.equal(session.snapshotMetrics().screenshotBridgeCaptures, 0);
    assert.equal(session.snapshotMetrics().screenshotSuccesses, 1);
  } finally {
    session.close();
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('CDP screenshot prefers the isolated Electron capture bridge when it is available', async () => {
  const session = new CdpSession({ send() {}, close() {} });
  const image = Buffer.from('fast isolated Electron capture');
  session.evaluate = async (expression) => expression.includes('innerWidth')
    ? { width: 1280, height: 720 }
    : image.toString('base64');
  session.send = async (method) => {
    assert.notEqual(method, 'Page.captureScreenshot', 'available isolated bridge should avoid the timing-out compositor paths');
    throw new Error(`Unexpected CDP method: ${method}`);
  };
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'xiuxian-cdp-bridge-first-'));
  const screenshot = path.join(directory, 'capture.png');

  try {
    await session.screenshot(screenshot);
    assert.deepEqual(fs.readFileSync(screenshot), image);
    assert.equal(session.snapshotMetrics().screenshotBridgeCaptures, 1);
    assert.equal(session.snapshotMetrics().screenshotTimeouts, 0);
  } finally {
    session.close();
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('failed initial launch capture closes its owned session and process and preserves diagnostics', async () => {
  const child = { pid: 1234 };
  const session = {
    pending: new Map([[7, {}]]),
    snapshotMetrics: () => ({ screenshotTimeouts: 2, pendingRequests: 1, connectionClosed: false }),
  };
  const closed = [];
  const failure = new Error('CDP command timed out: Page.captureScreenshot');

  await assert.rejects(withLaunchResourceCleanup({
    stage: () => 'INITIAL_SCREENSHOT_CAPTURE',
    session,
    child,
    execute: async () => { throw failure; },
    closeResources: async (actualSession, actualChild) => { closed.push([actualSession, actualChild]); },
  }), (error) => {
    assert.equal(error, failure);
    assert.equal(error.diagnostics.launchStage, 'INITIAL_SCREENSHOT_CAPTURE');
    assert.deepEqual(error.diagnostics.cdpMetrics, { screenshotTimeouts: 2, pendingRequests: 1, connectionClosed: false });
    assert.deepEqual(error.diagnostics.pendingRequestIds, [7]);
    assert.equal(error.diagnostics.ownedProcessId, 1234);
    return true;
  });

  assert.deepEqual(closed, [[session, child]], 'the process/session acquired before the first screenshot must not leak');
});

test('successful launch transfers its owned session and process to the scenario runner', async () => {
  const child = { pid: 5678 };
  const session = { snapshotMetrics: () => ({ pendingRequests: 0 }) };
  let cleanupCalls = 0;
  const launched = await withLaunchResourceCleanup({
    stage: () => 'GAME_FACADE_READY',
    session,
    child,
    execute: async () => ({ child, session, readyWaitMs: 12 }),
    closeResources: async () => { cleanupCalls += 1; },
  });

  assert.equal(launched.child, child);
  assert.equal(launched.session, session);
  assert.equal(cleanupCalls, 0, 'ownership transfers on successful initialization');
});
