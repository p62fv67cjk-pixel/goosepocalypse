import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { once } from 'node:events';
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
  const closed = () => { cleanup(); reject(new Error('Socket closed before packet')); };
  const cleanup = () => { clearTimeout(timer); ws.off('message', message); ws.off('close', closed); };
  ws.once('message', message);
  ws.once('close', closed);
});
const send = (ws, packet) => ws.send(JSON.stringify(packet));

test('real sockets: guest inherits host role after disconnect and replacement can join', async () => {
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
    assert.equal(hostInfo.host, true);
    const guest = await connect();
    const joined = receive(guest);
    const hostNotice = receive(host);
    send(guest, { type: 'join', room: hostInfo.room });
    const guestInfo = await joined;
    assert.equal(guestInfo.host, false);
    assert.equal((await hostNotice).playerId, guestInfo.playerId);

    // Register both listeners before closing: host_changed and peer_left are separate packets.
    const promoted = receive(guest);
    host.close();
    await once(host, 'close');
    assert.deepEqual(await promoted, { type: 'host_changed', playerId: guestInfo.playerId });
    // The peer_left notification may already have arrived; attach before close in future
    // if asserting its exact ordering. A new guest proves the room remains usable.
    const replacement = await connect();
    const replacementJoined = receive(replacement);
    const guestNotice = receive(guest);
    send(replacement, { type: 'join', room: hostInfo.room });
    const replacementInfo = await replacementJoined;
    assert.equal(replacementInfo.host, false);
    assert.equal(replacementInfo.peerId, guestInfo.playerId);
    assert.equal((await guestNotice).playerId, replacementInfo.playerId);

    const delivered = receive(replacement);
    send(guest, { type: 'state', data: { x: 4, z: -3, downed: false } });
    assert.deepEqual(await delivered, {
      type: 'state', playerId: guestInfo.playerId,
      data: { x: 4, z: -3, downed: false }
    });
  } finally {
    for (const ws of sockets) ws.terminate();
    relay.kill();
  }
});
