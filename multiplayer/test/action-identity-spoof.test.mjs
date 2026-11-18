import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { WebSocket } from 'ws';

test('relay rejects action identity spoofing but forwards authenticated actions', { timeout: 12000 }, async () => {
  const port = 21000 + Math.floor(Math.random() * 20000);
  const child = spawn(process.execPath, ['server.mjs'], {
    cwd: new URL('..', import.meta.url),
    env: { ...process.env, PORT: String(port), ALLOWED_ORIGINS: 'https://game.example' },
    stdio: 'ignore'
  });
  const sockets = [];
  const connect = async () => {
    for (let attempt = 0; attempt < 40; attempt++) {
      try {
        const ws = await new Promise((resolve, reject) => {
          const socket = new WebSocket('ws://127.0.0.1:' + port);
          socket.once('open', () => resolve(socket));
          socket.once('error', reject);
        });
        sockets.push(ws);
        return ws;
      } catch { await new Promise(resolve => setTimeout(resolve, 50)); }
    }
    throw new Error('Relay did not start');
  };
  const next = ws => new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Timed out waiting for relay')), 2000);
    ws.once('message', raw => {
      clearTimeout(timeout);
      resolve(JSON.parse(raw.toString()));
    });
  });
  try {
    const host = await connect();
    const created = next(host);
    host.send(JSON.stringify({ type: 'create' }));
    const room = await created;
    const guest = await connect();
    const joined = next(guest);
    const notice = next(host);
    guest.send(JSON.stringify({ type: 'join', room: room.room }));
    const guestInfo = await joined;
    await notice;
    for (const key of ['playerId', 'peerId', 'room', 'host']) {
      const denied = next(host);
      host.send(JSON.stringify({ type: 'action', data: { kind: 'fire', [key]: guestInfo.playerId } }));
      assert.equal((await denied).code, 'invalid_action', key);
    }
    const forwarded = next(guest);
    host.send(JSON.stringify({ type: 'action', data: { kind: 'fire', yaw: 1.2 } }));
    const packet = await forwarded;
    assert.equal(packet.playerId, room.playerId);
    assert.deepEqual(packet.data, { kind: 'fire', yaw: 1.2 });
  } finally {
    sockets.forEach(ws => ws.terminate());
    child.kill();
    await new Promise(resolve => {
      if (child.exitCode !== null || child.signalCode !== null) return resolve();
      const timeout = setTimeout(() => { child.kill('SIGKILL'); resolve(); }, 1000);
      child.once('exit', () => { clearTimeout(timeout); resolve(); });
    });
  }
});
