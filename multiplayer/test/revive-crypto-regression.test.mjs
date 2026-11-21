import test from 'node:test';
import assert from 'node:assert/strict';
import { createCoopClient } from '../client.mjs';

class FakeSocket {
  static OPEN = 1;
  constructor(url) {
    this.url = url;
    this.readyState = 1;
    this.bufferedAmount = 0;
    this.listeners = new Map();
    this.sent = [];
  }
  addEventListener(type, fn) { this.listeners.set(type, fn); }
  send(payload) { this.sent.push(JSON.parse(payload)); }
  close() { this.readyState = 3; }
  receive(packet) { this.listeners.get('message')?.({ data: JSON.stringify(packet) }); }
}
const hostId = 'a'.repeat(24);
const peerId = 'b'.repeat(24);
const roomId = 'c'.repeat(24);
// Capture constructor-created sockets without opening any real connection.
const sockets = [];
class CapturingSocket extends FakeSocket {
  constructor(url) { super(url); sockets.push(this); }
}
function ready(cryptoImpl) {
  const client = createCoopClient({
    url: 'wss://relay.example/game',
    WebSocketImpl: CapturingSocket,
    cryptoImpl,
    now: () => 1000
  });
  client.connect();
  const socket = sockets.at(-1);
  assert.equal(client.createRoom(), true);
  socket.receive({ type: 'joined', room: roomId, playerId: hostId, host: true });
  socket.receive({ type: 'peer_joined', playerId: peerId });
  assert.equal(client.status.peerId, peerId);
  return { client, socket };
}

test('revive generates a 96-bit cryptographic request ID and sends it to the actual peer', () => {
  const { client, socket } = ready({
    getRandomValues(bytes) { bytes.set(Array.from({ length: 12 }, (_, i) => i)); return bytes; }
  });
  assert.equal(client.reviveWithGeneratedId(peerId), true);
  assert.deepEqual(socket.sent.at(-1), {
    type: 'revive',
    data: { targetId: peerId, requestId: '000102030405060708090a0b' }
  });
  assert.equal(client.reviveWithGeneratedId(peerId), false, 'in-flight rescue must not duplicate');
  client.disconnect();
});

test('revive fails closed without secure randomness, without sending any request', () => {
  for (const cryptoImpl of [undefined, {}, { getRandomValues() { throw Error('unavailable'); } }]) {
    // null explicitly disables crypto rather than falling back to the environment.
    const { client, socket } = ready(cryptoImpl ?? null);
    const before = socket.sent.length;
    assert.equal(client.reviveWithGeneratedId(peerId), false);
    assert.equal(socket.sent.length, before);
    client.disconnect();
  }
});
