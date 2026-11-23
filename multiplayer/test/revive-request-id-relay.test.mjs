import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { WebSocket } from 'ws';

const port = 42000 + Math.floor(Math.random() * 10000);
const child = spawn(process.execPath, ['server.mjs'], {
  cwd: new URL('..', import.meta.url),
  env: { ...process.env, PORT: String(port), ALLOWED_ORIGINS: 'https://game.example' },
  stdio: 'ignore'
});
const sockets = [];
const receive = (ws) => new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error('Timed out')), 2000);
  ws.once('message', raw => { clearTimeout(timer); resolve(JSON.parse(raw.toString())); });
});
async function connect() {
  for (let i = 0; i < 40; i++) {
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
  throw new Error('Relay failed to start');
}
test.after(() => { sockets.forEach(ws => ws.terminate()); child.kill(); });

test('relay echoes valid revive attempt ID only on matching accepted rescue', async () => {
  const host = await connect();
  const created = receive(host);
  host.send(JSON.stringify({ type: 'create' }));
  const room = await created;
  const guest = await connect();
  const joined = receive(guest), notice = receive(host);
  guest.send(JSON.stringify({ type: 'join', room: room.room }));
  const guestInfo = await joined;
  await notice;
  const hostSnapshot = receive(guest);
  host.send(JSON.stringify({ type: 'state', data: { x: 0, z: 0, downed: false } }));
  await hostSnapshot;
  const guestSnapshot = receive(host);
  guest.send(JSON.stringify({ type: 'state', data: { x: 1, z: 0, downed: true } }));
  await guestSnapshot;

  for (const requestId of ['bad', 123, null, 'x'.repeat(24)]) {
    const rejected = receive(host);
    host.send(JSON.stringify({ type: 'revive', data: { targetId: guestInfo.playerId, requestId } }));
    assert.equal((await rejected).code, 'invalid_revive_target');
  }

  const requestId = 'f'.repeat(24);
  const delivered = receive(guest), accepted = receive(host);
  host.send(JSON.stringify({ type: 'revive', data: { targetId: guestInfo.playerId, requestId } }));
  assert.deepEqual((await delivered).data, { targetId: guestInfo.playerId, requestId });
  assert.deepEqual(await accepted, { type: 'revive_accepted', targetId: guestInfo.playerId, requestId });
});
