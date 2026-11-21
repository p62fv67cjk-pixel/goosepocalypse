import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { WebSocket } from 'ws';

test('pre-lobby socket cap rejects excess upgrades and frees slots on close', async () => {
  const port = 20000 + Math.floor(Math.random() * 20000);
  const server = spawn(process.execPath, ['server.mjs'], {
    cwd: new URL('..', import.meta.url),
    env: { ...process.env, PORT: String(port), MAX_CONNECTIONS: '2', ALLOWED_ORIGINS: 'https://game.example' },
    stdio: 'ignore'
  });
  const sockets = [];
  const open = () => new Promise((resolve, reject) => {
    const ws = new WebSocket('ws://127.0.0.1:' + port, { origin: 'https://game.example' });
    ws.once('open', () => { sockets.push(ws); resolve(ws); });
    ws.once('unexpected-response', (_req, res) => { res.resume(); resolve(res.statusCode); });
    ws.once('error', reject);
  });
  try {
    let first;
    for (let i = 0; i < 40; i++) {
      try { first = await open(); break; }
      catch { await new Promise(resolve => setTimeout(resolve, 50)); }
    }
    assert.ok(first instanceof WebSocket, 'relay started');
    const second = await open();
    assert.ok(second instanceof WebSocket);
    assert.equal(await open(), 503, 'third socket rejected before lobby creation');
    const closed = new Promise(resolve => first.once('close', resolve));
    first.close();
    await closed;
    // Wait for server-side close cleanup before retrying upgrade.
    let replacement;
    for (let i = 0; i < 20; i++) {
      replacement = await open();
      if (replacement instanceof WebSocket) break;
      await new Promise(resolve => setTimeout(resolve, 25));
    }
    assert.ok(replacement instanceof WebSocket, 'slot can be reused');
  } finally {
    sockets.forEach(ws => ws.terminate());
    server.kill();
  }
});
