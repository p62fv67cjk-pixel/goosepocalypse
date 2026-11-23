import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { WebSocket } from 'ws';

const freePort = () => new Promise((resolve, reject) => {
  const server = createServer();
  server.once('error', reject);
  server.listen(0, '127.0.0.1', () => {
    const port = server.address().port;
    server.close(error => error ? reject(error) : resolve(port));
  });
});
const receive = ws => new Promise((resolve, reject) => {
  const timer = setTimeout(() => { cleanup(); reject(new Error('Timed out waiting for relay packet')); }, 2500);
  const message = raw => { cleanup(); try { resolve(JSON.parse(raw.toString())); } catch (error) { reject(error); } };
  const closed = () => { cleanup(); reject(new Error('Socket closed')); };
  const cleanup = () => { clearTimeout(timer); ws.off('message', message); ws.off('close', closed); };
  ws.once('message', message);
  ws.once('close', closed);
});
const send = (ws, packet) => ws.send(JSON.stringify(packet));

test('guest can rescue downed host, but cannot rescue a standing host', async () => {
  const port = await freePort();
  const relay = spawn(process.execPath, ['server.mjs'], {
    cwd: new URL('..', import.meta.url),
    env: { ...process.env, PORT: String(port), ALLOWED_ORIGINS: 'https://game.example' },
    stdio: 'ignore'
  });
  const sockets = [];
  const connect = async () => {
    for (let attempt = 0; attempt < 40; attempt++) {
      try {
        const ws = await new Promise((resolve, reject) => {
          const socket = new WebSocket('ws://127.0.0.1:' + port, { origin: 'https://game.example' });
          socket.once('open', () => resolve(socket));
          socket.once('error', reject);
        });
        sockets.push(ws);
        return ws;
      } catch {
        await new Promise(resolve => setTimeout(resolve, 50));
      }
    }
    throw new Error('Relay did not start');
  };
  try {
    const host = await connect();
    const created = receive(host);
    send(host, { type: 'create' });
    const hostInfo = await created;
    const guest = await connect();
    const joined = receive(guest);
    const hostNotice = receive(host);
    send(guest, { type: 'join', room: hostInfo.room });
    const guestInfo = await joined;
    assert.equal((await hostNotice).playerId, guestInfo.playerId);

    const hostReceives = receive(host);
    send(guest, { type: 'state', data: { x: 1, y: 0, z: 0, downed: false } });
    await hostReceives;
    const guestReceives = receive(guest);
    send(host, { type: 'state', data: { x: 2, y: 0, z: 0, downed: false } });
    await guestReceives;

    const rejected = receive(guest);
    send(guest, { type: 'revive', data: { targetId: hostInfo.playerId } });
    assert.deepEqual(await rejected, { type: 'error', code: 'revive_not_allowed' });

    const hostDowned = receive(guest);
    send(host, { type: 'state', data: { x: 2, y: 0, z: 0, downed: true } });
    await hostDowned;
    const requestId = 'abcdef1234567890abcdef12';
    const incoming = receive(host);
    const accepted = receive(guest);
    send(guest, { type: 'revive', data: { targetId: hostInfo.playerId, requestId } });
    assert.deepEqual(await incoming, {
      type: 'revive', playerId: guestInfo.playerId,
      data: { targetId: hostInfo.playerId, requestId }
    });
    assert.deepEqual(await accepted, {
      type: 'revive_accepted', targetId: hostInfo.playerId, requestId
    });
  } finally {
    for (const ws of sockets) ws.terminate();
    relay.kill();
  }
});
