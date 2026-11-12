import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { WebSocket } from 'ws';

const port = 19000 + Math.floor(Math.random() * 20000);
const child = spawn(process.execPath, ['server.mjs'], { cwd: new URL('..', import.meta.url), env: { ...process.env, PORT: String(port) }, stdio: 'ignore' });
const sockets = [];
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));
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
    } catch { await sleep(50); }
  }
  throw new Error('Server did not start');
};
const receive = (ws) => new Promise((resolve, reject) => {
  const timeout = setTimeout(() => reject(new Error('Timed out waiting for message')), 1500);
  ws.once('message', raw => { clearTimeout(timeout); resolve(JSON.parse(raw.toString())); });
});
test.after(() => { sockets.forEach(ws => ws.terminate()); child.kill(); });

test('two players join and exchange genuine network messages; third player is rejected', async () => {
  const host = await connect();
  const created = receive(host);
  host.send(JSON.stringify({ type: 'create' }));
  const room = await created;
  assert.match(room.room, /^[a-f0-9]{8}$/);
  assert.equal(room.host, true);

  const guest = await connect();
  const joined = receive(guest);
  const notified = receive(host);
  guest.send(JSON.stringify({ type: 'join', room: room.room }));
  assert.equal((await joined).host, false);
  assert.equal((await notified).type, 'peer_joined');

  const relay = receive(host);
  guest.send(JSON.stringify({ type: 'state', data: { x: 4, z: 7 } }));
  assert.deepEqual((await relay).data, { x: 4, z: 7 });

  const third = await connect();
  const denied = receive(third);
  third.send(JSON.stringify({ type: 'join', room: room.room }));
  assert.equal((await denied).code, 'room_full');
});

test('invalid room and invalid JSON cannot crash server', async () => {
  const ws = await connect();
  const bad = receive(ws);
  ws.send('{');
  assert.equal((await bad).code, 'invalid_json');
  const missing = receive(ws);
  ws.send(JSON.stringify({ type: 'join', room: '00000000' }));
  assert.equal((await missing).code, 'room_not_found');
});


test('unapproved browser origins are rejected before room creation', async () => {
  const ws = new WebSocket('ws://127.0.0.1:' + port, { origin: 'https://untrusted.example' });
  await new Promise((resolve, reject) => {
    ws.once('open', resolve);
    ws.once('error', reject);
  });
  const closed = new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Origin was not rejected')), 1500);
    ws.once('close', code => { clearTimeout(timer); resolve(code); });
  });
  assert.equal(await closed, 1008);
});

test('rejects missing, nonnumeric and out-of-bounds position state', async () => {
  const host = await connect();
  const created = receive(host);
  host.send(JSON.stringify({ type: 'create' }));
  const room = await created;
  for (const data of [{ x: '4', z: 7 }, { x: 4 }, { x: 10001, z: 0 }, { x: null, z: 0 }]) {
    const rejected = receive(host);
    host.send(JSON.stringify({ type: 'state', data }));
    assert.equal((await rejected).code, 'invalid_state');
  }
  // A connected teammate must never receive invalid state, but must still
  // receive the next valid update after the server rejects malformed data.
  const guest = await connect();
  const joined = receive(guest);
  const hostNotified = receive(host);
  guest.send(JSON.stringify({ type: 'join', room: room.room }));
  assert.equal((await joined).host, false);
  await hostNotified;
  const forwarded = [];
  guest.on('message', raw => forwarded.push(JSON.parse(raw.toString())));
  const rejected = receive(host);
  host.send(JSON.stringify({ type: 'state', data: { x: 'bad', z: 0 } }));
  assert.equal((await rejected).code, 'invalid_state');
  const valid = receive(guest);
  host.send(JSON.stringify({ type: 'state', data: { x: 2, z: -3 } }));
  assert.deepEqual((await valid).data, { x: 2, z: -3 });
  assert.equal(forwarded.filter(msg => msg.type === 'state').length, 1);
});
