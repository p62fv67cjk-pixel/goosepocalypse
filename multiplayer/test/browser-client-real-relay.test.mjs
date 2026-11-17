import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { WebSocket } from 'ws';
import { createCoopClient } from '../client.mjs';

// Exercise the actual browser transport state machine against the Node relay.
// Only the URL scheme is adapted because this isolated CI relay has no TLS cert.
class LocalSocket extends WebSocket {
  constructor(url) { super(url.replace(/^wss:\/\//, 'ws://'), { origin: 'https://game.example' }); }
}
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
async function until(predicate, label) {
  for (let i = 0; i < 100; i++) {
    if (predicate()) return;
    await delay(25);
  }
  throw new Error('Timed out: ' + label);
}
async function port() {
  const server = createServer();
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const value = server.address().port;
  await new Promise(resolve => server.close(resolve));
  return value;
}

test('real relay and browser client: host handoff, replacement, and state identity', { timeout: 30000 }, async () => {
  const p = await port();
  const relay = spawn(process.execPath, ['server.mjs'], {
    cwd: new URL('..', import.meta.url),
    env: { ...process.env, PORT: String(p), ALLOWED_ORIGINS: 'https://game.example' },
    stdio: 'ignore'
  });
  const clients = [];
  // Always reap the relay child. A dangling process or open socket can keep
  // Node's test runner alive even after an assertion has failed.
  const relayExited = new Promise(resolve => {
    relay.once('exit', (code, signal) => resolve({ code, signal }));
    relay.once('error', error => resolve({ error: error.message }));
  });
  const make = () => {
    const events = [];
    const client = createCoopClient({
      url: 'wss://127.0.0.1:' + p,
      WebSocketImpl: LocalSocket,
      onEvent: event => events.push(event)
    });
    clients.push(client);
    return { client, events };
  };
  try {
    const a = make();
    // Startup can take a moment; retry only before a connection is established.
    for (let i = 0; i < 8; i++) {
      a.client.connect();
      try { await until(() => a.client.status.connected, 'relay startup'); break; }
      catch { a.client.disconnect(); await delay(50); }
    }
    assert.equal(a.client.status.connected, true);
    assert.equal(a.client.createRoom(), true);
    await until(() => !!a.client.status.room, 'host room');
    const code = a.client.status.room;
    const oldHost = a.client.status.playerId;
    const b = make();
    b.client.connect();
    await until(() => b.client.status.connected, 'guest connection');
    assert.equal(b.client.joinRoom(code), true);
    await until(() => b.client.status.peerId === oldHost && a.client.status.peerId === b.client.status.playerId, 'peer identities');
    const promotedId = b.client.status.playerId;
    a.client.disconnect();
    await until(() => b.client.status.isHost && b.client.status.peerId === null, 'host handoff');
    const c = make();
    c.client.connect();
    await until(() => c.client.status.connected, 'replacement connection');
    assert.equal(c.client.joinRoom(code), true);
    await until(() => b.client.status.peerId === c.client.status.playerId, 'replacement membership');
    assert.equal(c.client.status.peerId, promotedId);
    assert.equal(c.client.status.isHost, false);
    assert.equal(b.client.sendState({ x: 7, z: -2, downed: false }), true);
    await until(() => c.events.some(e => e.type === 'packet' && e.packet.type === 'state'), 'relayed movement');
    const state = c.events.find(e => e.type === 'packet' && e.packet.type === 'state').packet;
    assert.equal(state.playerId, promotedId);
    assert.deepEqual(state.data, { x: 7, z: -2, downed: false });
    // Verify the replacement guest can send movement and actions back through
    // the real relay, not merely receive the promoted host's snapshots.
    assert.equal(c.client.sendState({ x: -4, y: 1, z: 9, yaw: 0.5, downed: false }), true);
    await until(() => b.events.some(e => e.type === 'packet' && e.packet.type === 'state' &&
      e.packet.playerId === c.client.status.playerId), 'guest movement to promoted host');
    const guestState = b.events.find(e => e.type === 'packet' && e.packet.type === 'state' &&
      e.packet.playerId === c.client.status.playerId).packet;
    assert.deepEqual(guestState.data, { x: -4, y: 1, z: 9, yaw: 0.5, downed: false });
    assert.equal(c.client.sendAction({ kind: 'fire', aiming: true }), true);
    await until(() => b.events.some(e => e.type === 'packet' && e.packet.type === 'action' &&
      e.packet.playerId === c.client.status.playerId), 'guest action to promoted host');
    const guestAction = b.events.find(e => e.type === 'packet' && e.packet.type === 'action' &&
      e.packet.playerId === c.client.status.playerId).packet;
    assert.deepEqual(guestAction.data, { kind: 'fire', aiming: true });
  } finally {
    for (const client of clients) client.disconnect();
    if (relay.exitCode === null && relay.signalCode === null) relay.kill('SIGTERM');
    const outcome = await Promise.race([
      relayExited,
      delay(2000).then(() => null)
    ]);
    if (!outcome && relay.exitCode === null && relay.signalCode === null) {
      relay.kill('SIGKILL');
      await Promise.race([relayExited, delay(1000)]);
    }
  }
});
