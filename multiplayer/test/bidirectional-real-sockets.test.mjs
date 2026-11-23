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
const nextMessage = (socket) => new Promise((resolve, reject) => {
  const timeout = setTimeout(() => { cleanup(); reject(new Error('Timed out waiting for relay')); }, 2000);
  const onMessage = raw => { cleanup(); try { resolve(JSON.parse(raw.toString())); } catch (error) { reject(error); } };
  const onClose = () => { cleanup(); reject(new Error('Socket closed before relay')); };
  const cleanup = () => { clearTimeout(timeout); socket.off('message', onMessage); socket.off('close', onClose); };
  socket.once('message', onMessage);
  socket.once('close', onClose);
});
test('real two-socket bidirectional state/action relay preserves sender identity', async () => {
  const port = await freePort();
  const server = spawn(process.execPath, ['server.mjs'], {
    cwd: new URL('..', import.meta.url),
    env: { ...process.env, PORT: String(port), ALLOWED_ORIGINS: 'https://game.example' },
    stdio: 'ignore'
  });
  const sockets = [];
  const connect = async () => {
    for (let attempt = 0; attempt < 40; attempt++) {
      try {
        const socket = await new Promise((resolve, reject) => {
          const ws = new WebSocket('ws://127.0.0.1:' + port, { origin: 'https://game.example' });
          ws.once('open', () => resolve(ws));
          ws.once('error', reject);
        });
        sockets.push(socket);
        return socket;
      } catch {
        await new Promise(resolve => setTimeout(resolve, 50));
      }
    }
    throw new Error('Relay failed to start');
  };
  try {
    const host = await connect();
    const created = nextMessage(host);
    host.send(JSON.stringify({ type: 'create' }));
    const hostInfo = await created;
    assert.equal(hostInfo.host, true);
    const guest = await connect();
    const joined = nextMessage(guest);
    const hostNotice = nextMessage(host);
    guest.send(JSON.stringify({ type: 'join', room: hostInfo.room }));
    const guestInfo = await joined;
    assert.equal(guestInfo.host, false);
    assert.equal(guestInfo.peerId, hostInfo.playerId);
    assert.equal((await hostNotice).playerId, guestInfo.playerId);

    const guestState = nextMessage(guest);
    host.send(JSON.stringify({ type: 'state', data: { x: -2, z: 8, yaw: 1.5, downed: false } }));
    const fromHost = await guestState;
    assert.equal(fromHost.type, 'state');
    assert.equal(fromHost.playerId, hostInfo.playerId);
    assert.deepEqual(fromHost.data, { x: -2, z: 8, yaw: 1.5, downed: false });

    const hostAction = nextMessage(host);
    guest.send(JSON.stringify({ type: 'action', data: { kind: 'fire', aiming: true } }));
    const fromGuest = await hostAction;
    assert.equal(fromGuest.type, 'action');
    assert.equal(fromGuest.playerId, guestInfo.playerId);
    assert.deepEqual(fromGuest.data, { kind: 'fire', aiming: true });
  } finally {
    sockets.forEach(socket => socket.terminate());
    server.kill();
  }
});
