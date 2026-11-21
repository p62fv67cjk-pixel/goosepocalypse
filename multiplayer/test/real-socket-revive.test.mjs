import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { WebSocket } from 'ws';

const portAvailable = () => new Promise((resolve, reject) => {
  const server = createServer();
  server.once('error', reject);
  server.listen(0, '127.0.0.1', () => {
    const port = server.address().port;
    server.close(error => error ? reject(error) : resolve(port));
  });
});
const receive = ws => new Promise((resolve, reject) => {
  const timer = setTimeout(() => { cleanup(); reject(new Error('Timed out waiting for packet')); }, 2500);
  const onMessage = raw => { cleanup(); try { resolve(JSON.parse(raw.toString())); } catch (error) { reject(error); } };
  const onClose = () => { cleanup(); reject(new Error('Socket closed')); };
  const cleanup = () => { clearTimeout(timer); ws.off('message', onMessage); ws.off('close', onClose); };
  ws.once('message', onMessage);
  ws.once('close', onClose);
});
const send = (ws, packet) => ws.send(JSON.stringify(packet));

test('real sockets require fresh, close, downed snapshots before forwarding a revive', async () => {
  const port = await portAvailable();
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
    await hostNotice;

    // First reject a rescue with no fresh snapshots.
    const rejected = receive(host);
    send(host, { type: 'revive', data: { targetId: guestInfo.playerId } });
    assert.deepEqual(await rejected, { type: 'error', code: 'revive_not_allowed' });

    const guestState = receive(guest);
    send(host, { type: 'state', data: { x: 0, y: 0, z: 0, downed: false } });
    await guestState;
    const hostState = receive(host);
    send(guest, { type: 'state', data: { x: 2, y: 0, z: 0, downed: true } });
    await hostState;

    const incomingRevive = receive(guest);
    const acknowledged = receive(host);
    const requestId = '1234567890abcdef12345678';
    send(host, { type: 'revive', data: { targetId: guestInfo.playerId, requestId } });
    assert.deepEqual(await incomingRevive, {
      type: 'revive', playerId: hostInfo.playerId,
      data: { targetId: guestInfo.playerId, requestId }
    });
    assert.deepEqual(await acknowledged, {
      type: 'revive_accepted', targetId: guestInfo.playerId, requestId
    });
  } finally {
    for (const socket of sockets) socket.terminate();
    relay.kill();
  }
});
