import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import WebSocket from 'ws';

// Reserve a free port before launching the real production relay.
async function freePort() {
  const server = createServer();
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  await new Promise(resolve => server.close(resolve));
  return port;
}

test('production WebSocket upgrades require an allowed browser Origin', async () => {
  const port = await freePort();
  const child = spawn(process.execPath, ['server.mjs'], {
    cwd: new URL('..', import.meta.url),
    env: { ...process.env, NODE_ENV: 'production', ALLOWED_ORIGINS: 'https://game.example', PORT: String(port) },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  try {
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('relay startup timed out')), 5000);
      child.stdout.on('data', chunk => {
        if (String(chunk).includes('listening on port')) { clearTimeout(timeout); resolve(); }
      });
      child.on('error', error => { clearTimeout(timeout); reject(error); });
      child.on('exit', code => { clearTimeout(timeout); reject(new Error('relay exited: ' + code)); });
    });
    async function handshake(origin) {
      return await new Promise((resolve, reject) => {
        const options = origin ? { origin } : {};
        const ws = new WebSocket('ws://127.0.0.1:' + port, options);
        const timeout = setTimeout(() => { ws.terminate(); reject(new Error('upgrade timed out')); }, 3000);
        ws.once('open', () => { clearTimeout(timeout); ws.close(); resolve(true); });
        ws.once('error', () => { clearTimeout(timeout); resolve(false); });
      });
    }
    assert.equal(await handshake(undefined), false, 'missing Origin must be rejected');
    assert.equal(await handshake('https://evil.example'), false, 'unlisted Origin must be rejected');
    assert.equal(await handshake('https://game.example'), true, 'configured game Origin must connect');
  } finally {
    child.kill();
  }
});
