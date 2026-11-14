import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { connect as connectTcp } from 'node:net';
import { randomBytes } from 'node:crypto';
import { WebSocket } from 'ws';

const port = 19000 + Math.floor(Math.random() * 20000);
const child = spawn(process.execPath, ['server.mjs'], { cwd: new URL('..', import.meta.url), env: { ...process.env, PORT: String(port), ALLOWED_ORIGINS: 'https://game.example' }, stdio: 'ignore' });
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
  assert.match(room.room, /^[a-f0-9]{24}$/);
  assert.equal(room.host, true);

  const guest = await connect();
  const joined = receive(guest);
  const notified = receive(host);
  guest.send(JSON.stringify({ type: 'join', room: room.room }));
  const guestJoined = await joined;
  assert.equal(guestJoined.host, false);
  assert.equal(guestJoined.peerId, room.playerId);
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
  assert.equal((await missing).code, 'invalid_room');
});


test('unapproved browser origins are rejected during HTTP upgrade', async () => {
  const ws = new WebSocket('ws://127.0.0.1:' + port, { origin: 'https://untrusted.example' });
  const result = await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Origin upgrade was not rejected')), 1500);
    ws.once('open', () => { clearTimeout(timeout); reject(new Error('Untrusted origin opened a WebSocket')); });
    ws.once('unexpected-response', (_request, response) => {
      clearTimeout(timeout);
      response.resume();
      resolve(response.statusCode);
    });
    ws.once('error', error => { clearTimeout(timeout); reject(error); });
  });
  assert.equal(result, 403);
  ws.terminate();
});

test('allowlisted browser origin can connect and create a room', async () => {
  const ws = await new Promise((resolve, reject) => {
    const socket = new WebSocket('ws://127.0.0.1:' + port, { origin: 'https://game.example' });
    socket.once('open', () => resolve(socket));
    socket.once('error', reject);
  });
  sockets.push(ws);
  const created = receive(ws);
  ws.send(JSON.stringify({ type: 'create' }));
  const room = await created;
  assert.equal(room.type, 'joined');
  assert.equal(room.host, true);
  assert.match(room.room, /^[a-f0-9]{24}$/);
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


test('optional renderer and downed state rejects malformed values but accepts valid updates', async () => {
  const host = await connect();
  const created = receive(host);
  host.send(JSON.stringify({ type: 'create' }));
  const room = await created;
  const guest = await connect();
  const joined = receive(guest);
  const hostNotice = receive(host);
  guest.send(JSON.stringify({ type: 'join', room: room.room }));
  await joined;
  await hostNotice;

  for (const extra of [
    { y: '2' }, { y: null }, { y: 10001 },
    { yaw: 'left' }, { yaw: null }, { yaw: 10001 },
    { health: -1 }, { health: 101 }, { health: null },
    { downed: 'false' }, { downed: 0 }
  ]) {
    const denied = receive(host);
    host.send(JSON.stringify({ type: 'state', data: { x: 1, z: 2, ...extra } }));
    assert.equal((await denied).code, 'invalid_state');
  }
  const valid = receive(guest);
  const data = { x: 1, y: 2, z: 3, yaw: 1.5, health: 0, downed: true };
  host.send(JSON.stringify({ type: 'state', data }));
  assert.deepEqual((await valid).data, data);
});


test('rejects unexpected state properties before they reach the other player', async () => {
  const host = await connect();
  const created = receive(host);
  host.send(JSON.stringify({ type: 'create' }));
  const room = await created;
  const guest = await connect();
  const joined = receive(guest);
  const notice = receive(host);
  guest.send(JSON.stringify({ type: 'join', room: room.room }));
  await joined;
  await notice;

  for (const extra of [
    { inventory: { weapon: 'injected' } },
    { __unexpected: true },
    { position: [1, 2, 3] }
  ]) {
    const rejected = receive(host);
    host.send(JSON.stringify({ type: 'state', data: { x: 1, z: 2, ...extra } }));
    assert.equal((await rejected).code, 'invalid_state');
  }
  const valid = receive(guest);
  const snapshot = { x: 1, y: 0, z: 2, yaw: 0, health: 100, downed: false };
  host.send(JSON.stringify({ type: 'state', data: snapshot }));
  assert.deepEqual((await valid).data, snapshot);
});

test('rejects nested or unbounded actions without poisoning subsequent valid relay', async () => {
  const host = await connect();
  const created = receive(host);
  host.send(JSON.stringify({ type: 'create' }));
  const room = await created;
  const guest = await connect();
  const joined = receive(guest);
  const notice = receive(host);
  guest.send(JSON.stringify({ type: 'join', room: room.room }));
  await joined;
  await notice;
  for (const data of [
    { kind: 'fire', inventory: { ammo: 999 } },
    { kind: 'fire', target: [1, 2] },
    { kind: 'x'.repeat(65) },
    { kind: 'fire', distance: 10001 },
    { kind: 'fire', extra: null },
    Object.fromEntries(Array.from({ length: 9 }, (_, i) => ['key' + i, true]))
  ]) {
    const denied = receive(host);
    host.send(JSON.stringify({ type: 'action', data }));
    assert.equal((await denied).code, 'invalid_action');
  }
  const forwarded = receive(guest);
  host.send(JSON.stringify({ type: 'action', data: { kind: 'fire', aiming: true, yaw: 1.2 } }));
  assert.deepEqual((await forwarded).data, { kind: 'fire', aiming: true, yaw: 1.2 });
});

test('revive and action packets relay to teammate; disconnected slot can be reused', async () => {
  const host = await connect();
  const created = receive(host);
  host.send(JSON.stringify({ type: 'create' }));
  const room = await created;

  const guest = await connect();
  const joined = receive(guest);
  const hostNotice = receive(host);
  guest.send(JSON.stringify({ type: 'join', room: room.room }));
  const guestInfo = await joined;
  await hostNotice;

  // Reject revives aimed at the sender, unknown players, or missing targets.
  for (const data of [{ targetId: room.playerId }, { targetId: 'not-connected' }, {}, { targetId: guestInfo.playerId, extra: { nested: 'untrusted' } }, { targetId: guestInfo.playerId, injected: true }]) {
    const denied = receive(host);
    host.send(JSON.stringify({ type: 'revive', data }));
    assert.equal((await denied).code, 'invalid_revive_target');
  }

  // A revive is allowed only after both players report nearby positions and the target is downed.
  const beforeState = receive(host);
  host.send(JSON.stringify({ type: 'revive', data: { targetId: guestInfo.playerId } }));
  assert.equal((await beforeState).code, 'revive_not_allowed');
  const hostState = { x: 1, z: 1, downed: false };
  const guestState = { x: 2, z: 1, downed: true };
  const hostStateRelay = receive(guest);
  host.send(JSON.stringify({ type: 'state', data: hostState }));
  await hostStateRelay;
  const guestStateRelay = receive(host);
  guest.send(JSON.stringify({ type: 'state', data: guestState }));
  await guestStateRelay;

  const tooFarRelay = receive(host);
  guest.send(JSON.stringify({ type: 'state', data: { x: 30, z: 1, downed: true } }));
  await tooFarRelay;
  const tooFar = receive(host);
  host.send(JSON.stringify({ type: 'revive', data: { targetId: guestInfo.playerId } }));
  assert.equal((await tooFar).code, 'revive_not_allowed');
  const nearAgainRelay = receive(host);
  guest.send(JSON.stringify({ type: 'state', data: guestState }));
  await nearAgainRelay;

  for (const type of ['action', 'revive']) {
    const incoming = receive(guest);
    const ack = type === 'revive' ? receive(host) : null;
    const data = type === 'revive' ? { targetId: guestInfo.playerId } : { kind: 'fire' };
    host.send(JSON.stringify({ type, data }));
    const packet = await incoming;
    assert.equal(packet.type, type);
    assert.equal(packet.playerId, room.playerId);
    assert.deepEqual(packet.data, data);
    if (ack) assert.deepEqual(await ack, { type: 'revive_accepted', targetId: guestInfo.playerId });
  }

  const left = receive(host);
  guest.close();
  assert.deepEqual(await left, { type: 'peer_left', playerId: guestInfo.playerId });

  // A disconnected teammate must no longer be a valid revival target.
  const staleRevive = receive(host);
  host.send(JSON.stringify({ type: 'revive', data: { targetId: guestInfo.playerId } }));
  assert.equal((await staleRevive).code, 'invalid_revive_target');

  const replacement = await connect();
  const replacementJoined = receive(replacement);
  const hostRejoined = receive(host);
  replacement.send(JSON.stringify({ type: 'join', room: room.room }));
  assert.equal((await replacementJoined).peerId, room.playerId);
  assert.equal((await hostRejoined).type, 'peer_joined');
});


test('remaining guest becomes host when original host disconnects', async () => {
  const host = await connect();
  const created = receive(host);
  host.send(JSON.stringify({ type: 'create' }));
  const room = await created;

  const guest = await connect();
  const joined = receive(guest);
  guest.send(JSON.stringify({ type: 'join', room: room.room }));
  const guestInfo = await joined;
  assert.equal(guestInfo.host, false);

  // Register both listeners before closing: both notifications can arrive in one tick.
  const notices = [];
  const bothNotices = new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Host transition notices missing')), 1500);
    const onMessage = raw => {
      notices.push(JSON.parse(raw.toString()));
      if (notices.length === 2) {
        clearTimeout(timeout);
        guest.off('message', onMessage);
        resolve(notices);
      }
    };
    guest.on('message', onMessage);
  });
  host.close();
  assert.deepEqual(await bothNotices, [
    { type: 'host_changed', playerId: guestInfo.playerId },
    { type: 'peer_left', playerId: room.playerId }
  ]);

  const replacement = await connect();
  const replacementJoined = receive(replacement);
  const notice = receive(guest);
  replacement.send(JSON.stringify({ type: 'join', room: room.room }));
  const info = await replacementJoined;
  assert.equal(info.host, false);
  assert.equal(info.peerId, guestInfo.playerId);
  assert.equal((await notice).type, 'peer_joined');
});

test('revive requires fresh state from both connected players', async () => {
  const host = await connect();
  const created = receive(host);
  host.send(JSON.stringify({ type: 'create' }));
  const room = await created;
  const guest = await connect();
  const joined = receive(guest);
  const hostNotice = receive(host);
  guest.send(JSON.stringify({ type: 'join', room: room.room }));
  const guestInfo = await joined;
  await hostNotice;

  const hostState = { x: 1, z: 1, downed: false };
  const guestState = { x: 2, z: 1, downed: true };
  const toGuest = receive(guest);
  host.send(JSON.stringify({ type: 'state', data: hostState }));
  await toGuest;
  const toHost = receive(host);
  guest.send(JSON.stringify({ type: 'state', data: guestState }));
  await toHost;

  // Wait past the server's 1.5-second freshness window.
  await sleep(1650);
  const stale = receive(host);
  host.send(JSON.stringify({ type: 'revive', data: { targetId: guestInfo.playerId } }));
  assert.equal((await stale).code, 'revive_not_allowed');

  // Refreshing only the rescuer must not resurrect stale target state.
  const refreshGuest = receive(guest);
  host.send(JSON.stringify({ type: 'state', data: hostState }));
  await refreshGuest;
  const stillStale = receive(host);
  host.send(JSON.stringify({ type: 'revive', data: { targetId: guestInfo.playerId } }));
  assert.equal((await stillStale).code, 'revive_not_allowed');

  const refreshHost = receive(host);
  guest.send(JSON.stringify({ type: 'state', data: guestState }));
  await refreshHost;
  const accepted = receive(guest);
  const acceptedAck = receive(host);
  host.send(JSON.stringify({ type: 'revive', data: { targetId: guestInfo.playerId } }));
  assert.equal((await accepted).type, 'revive');
  assert.equal((await acceptedAck).type, 'revive_accepted');
});

test('revive requires explicit active rescuer and throttles repeated valid requests', async () => {
  const host = await connect();
  const created = receive(host);
  host.send(JSON.stringify({ type: 'create' }));
  const room = await created;
  const guest = await connect();
  const joined = receive(guest);
  const notice = receive(host);
  guest.send(JSON.stringify({ type: 'join', room: room.room }));
  const guestInfo = await joined;
  await notice;

  const guestState = { x: 2, z: 1, downed: true };
  const hostState = { x: 1, z: 1, downed: false };
  const toGuest = receive(guest);
  host.send(JSON.stringify({ type: 'state', data: { x: 1, z: 1 } }));
  await toGuest;
  const toHost = receive(host);
  guest.send(JSON.stringify({ type: 'state', data: guestState }));
  await toHost;
  const missingStatus = receive(host);
  host.send(JSON.stringify({ type: 'revive', data: { targetId: guestInfo.playerId } }));
  assert.equal((await missingStatus).code, 'revive_not_allowed');

  const updated = receive(guest);
  host.send(JSON.stringify({ type: 'state', data: hostState }));
  await updated;
  const first = receive(guest);
  const firstAck = receive(host);
  host.send(JSON.stringify({ type: 'revive', data: { targetId: guestInfo.playerId } }));
  assert.equal((await first).type, 'revive');
  assert.equal((await firstAck).type, 'revive_accepted');

  const cooldown = receive(host);
  host.send(JSON.stringify({ type: 'revive', data: { targetId: guestInfo.playerId } }));
  assert.equal((await cooldown).code, 'revive_cooldown');

  // A successful revive consumes the server's downed snapshot. Once the
  // cooldown expires, replaying the same request must still be rejected.
  await sleep(1050);
  const replay = receive(host);
  host.send(JSON.stringify({ type: 'revive', data: { targetId: guestInfo.playerId } }));
  assert.equal((await replay).code, 'revive_not_allowed');

  // A new explicit downed state permits a later rescue attempt.
  const refreshedGuest = receive(guest);
  host.send(JSON.stringify({ type: 'state', data: hostState }));
  await refreshedGuest;
  const refreshedHost = receive(host);
  guest.send(JSON.stringify({ type: 'state', data: guestState }));
  await refreshedHost;
  const nextRevive = receive(guest);
  const nextAck = receive(host);
  host.send(JSON.stringify({ type: 'revive', data: { targetId: guestInfo.playerId } }));
  assert.equal((await nextRevive).type, 'revive');
  assert.equal((await nextAck).type, 'revive_accepted');
});

test('revive rejects cross-floor teammates when height is reported', async () => {
  const host = await connect();
  const created = receive(host);
  host.send(JSON.stringify({ type: 'create' }));
  const room = await created;
  const guest = await connect();
  const joined = receive(guest);
  const notice = receive(host);
  guest.send(JSON.stringify({ type: 'join', room: room.room }));
  const info = await joined;
  await notice;

  const toGuest = receive(guest);
  host.send(JSON.stringify({ type: 'state', data: { x: 1, y: 0, z: 1, downed: false } }));
  await toGuest;
  const toHost = receive(host);
  guest.send(JSON.stringify({ type: 'state', data: { x: 2, y: 5, z: 1, downed: true } }));
  await toHost;

  const rejected = receive(host);
  host.send(JSON.stringify({ type: 'revive', data: { targetId: info.playerId } }));
  assert.equal((await rejected).code, 'revive_not_allowed');

  // Missing height on one peer must not bypass cross-floor protection.
  const missingHeightUpdate = receive(host);
  guest.send(JSON.stringify({ type: 'state', data: { x: 2, z: 1, downed: true } }));
  await missingHeightUpdate;
  const missingHeightRevive = receive(host);
  host.send(JSON.stringify({ type: 'revive', data: { targetId: info.playerId } }));
  assert.equal((await missingHeightRevive).code, 'revive_not_allowed');

  const update = receive(host);
  guest.send(JSON.stringify({ type: 'state', data: { x: 2, y: 1, z: 1, downed: true } }));
  await update;
  const accepted = receive(guest);
  const acceptedAck = receive(host);
  host.send(JSON.stringify({ type: 'revive', data: { targetId: info.playerId } }));
  assert.equal((await accepted).type, 'revive');
  assert.equal((await acceptedAck).type, 'revive_accepted');
});

test('rejects unexpected envelope fields on create, join and relayed packets', async () => {
  const host = await connect();
  for (const packet of [
    { type: 'create', injected: { admin: true } },
    { type: 'create', room: 'fake' }
  ]) {
    const denied = receive(host);
    host.send(JSON.stringify(packet));
    assert.equal((await denied).code, 'invalid_envelope');
  }
  const created = receive(host);
  host.send(JSON.stringify({ type: 'create' }));
  const room = await created;
  const guest = await connect();
  const deniedJoin = receive(guest);
  guest.send(JSON.stringify({ type: 'join', room: room.room, admin: true }));
  assert.equal((await deniedJoin).code, 'invalid_envelope');
  const joined = receive(guest);
  const hostNotice = receive(host);
  guest.send(JSON.stringify({ type: 'join', room: room.room }));
  await joined;
  await hostNotice;
  for (const packet of [
    { type: 'state', data: { x: 1, z: 2 }, injected: true },
    { type: 'action', data: { kind: 'fire' }, debug: [1, 2] },
    { type: 'revive', data: { targetId: room.playerId }, extra: 'x' }
  ]) {
    const denied = receive(guest);
    guest.send(JSON.stringify(packet));
    assert.equal((await denied).code, 'invalid_envelope');
  }
  const forwarded = receive(host);
  guest.send(JSON.stringify({ type: 'state', data: { x: 1, z: 2 } }));
  assert.deepEqual((await forwarded).data, { x: 1, z: 2 });
});

test('revive reach measures true three-dimensional distance near stairs', async () => {
  const host = await connect();
  const created = receive(host);
  host.send(JSON.stringify({ type: 'create' }));
  const room = await created;
  const guest = await connect();
  const joined = receive(guest);
  const notice = receive(host);
  guest.send(JSON.stringify({ type: 'join', room: room.room }));
  const info = await joined;
  await notice;

  const toGuest = receive(guest);
  host.send(JSON.stringify({ type: 'state', data: { x: 0, y: 0, z: 0, downed: false } }));
  await toGuest;
  const toHost = receive(host);
  // Horizontal reach 3 and height 2 individually pass the old checks,
  // but the actual distance sqrt(13) exceeds the 3.5-unit revive radius.
  guest.send(JSON.stringify({ type: 'state', data: { x: 3, y: 2, z: 0, downed: true } }));
  await toHost;
  const denied = receive(host);
  host.send(JSON.stringify({ type: 'revive', data: { targetId: info.playerId } }));
  assert.equal((await denied).code, 'revive_not_allowed');

  const nearer = receive(host);
  guest.send(JSON.stringify({ type: 'state', data: { x: 2, y: 2, z: 0, downed: true } }));
  await nearer;
  const accepted = receive(guest);
  const acknowledgement = receive(host);
  host.send(JSON.stringify({ type: 'revive', data: { targetId: info.playerId } }));
  assert.equal((await accepted).type, 'revive');
  assert.equal((await acknowledgement).type, 'revive_accepted');
});


test('malformed WebSocket frame cannot terminate the shared relay', async () => {
  const tcp = await new Promise((resolve, reject) => {
    const socket = connectTcp(port, '127.0.0.1');
    socket.once('connect', () => resolve(socket));
    socket.once('error', reject);
  });
  try {
    const key = randomBytes(16).toString('base64');
    const upgraded = new Promise((resolve, reject) => {
      let response = '';
      const timeout = setTimeout(() => reject(new Error('Upgrade timed out')), 1500);
      tcp.on('data', chunk => {
        response += chunk.toString('latin1');
        if (response.includes('\r\n\r\n')) {
          clearTimeout(timeout);
          resolve(response);
        }
      });
      tcp.once('error', reject);
    });
    tcp.write('GET / HTTP/1.1\r\nHost: 127.0.0.1:' + port +
      '\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n' +
      'Sec-WebSocket-Key: ' + key + '\r\nSec-WebSocket-Version: 13\r\n\r\n');
    assert.match(await upgraded, /^HTTP\/1\.1 101 /);
    // RFC 6455 requires client frames to be masked. This deliberately isn't.
    tcp.write(Buffer.from([0x81, 0x02, 0x7b, 0x7d]));
    await sleep(100);
    const survivor = await connect();
    const response = receive(survivor);
    survivor.send(JSON.stringify({ type: 'create' }));
    assert.equal((await response).type, 'joined');
    assert.equal(child.exitCode, null);
  } finally {
    tcp.destroy();
  }
});


test('rate-limited socket closes without interrupting another room', async () => {
  const noisy = await connect();
  const closed = new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Rate limit close timed out')), 2000);
    noisy.once('close', (code) => { clearTimeout(timeout); resolve(code); });
  });
  // Burst above the per-second threshold, using valid but unjoined messages.
  for (let i = 0; i < 35; i++) noisy.send(JSON.stringify({ type: 'action', data: { n: i } }));
  assert.equal(await closed, 1008);
  const survivor = await connect();
  const joined = receive(survivor);
  survivor.send(JSON.stringify({ type: 'create' }));
  assert.equal((await joined).type, 'joined');
  assert.equal(child.exitCode, null);
});
