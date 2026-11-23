import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { WebSocket } from 'ws';

test('binary JSON cannot create a room and repeated binary frames count toward rate limit', async () => {
  const port = 21000 + Math.floor(Math.random() * 18000);
  const child = spawn(process.execPath, ['server.mjs'], {
    cwd: new URL('..', import.meta.url),
    env: { ...process.env, PORT: String(port) },
    stdio: 'ignore'
  });
  let ws;
  try {
    for (let attempt = 0; attempt < 40; attempt++) {
      try {
        ws = await new Promise((resolve, reject) => {
          const socket = new WebSocket('ws://127.0.0.1:' + port);
          socket.once('open', () => resolve(socket));
          socket.once('error', reject);
        });
        break;
      } catch {
        await new Promise(resolve => setTimeout(resolve, 50));
      }
    }
    assert.ok(ws, 'relay started');
    const first = new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('no binary rejection')), 2000);
      ws.once('message', raw => { clearTimeout(timeout); resolve(JSON.parse(raw.toString())); });
    });
    ws.send(Buffer.from(JSON.stringify({ type: 'create' })), { binary: true });
    assert.deepEqual(await first, { type: 'error', code: 'binary_not_allowed' });
    const closed = new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('binary flood bypassed rate limit')), 2000);
      ws.once('close', code => { clearTimeout(timeout); resolve(code); });
    });
    for (let i = 0; i < 35; i++) {
      if (ws.readyState !== WebSocket.OPEN) break;
      ws.send(Buffer.from('{}'), { binary: true });
    }
    assert.equal(await closed, 1008);
  } finally {
    ws?.terminate();
    child.kill();
  }
});
