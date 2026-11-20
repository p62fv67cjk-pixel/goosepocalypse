import test from 'node:test';
import assert from 'node:assert/strict';
import { createCoopClient } from '../client.mjs';

class Socket {
  static OPEN = 1;
  constructor() { this.readyState = 0; this.bufferedAmount = 0; this.handlers = new Map(); this.sent = []; }
  addEventListener(name, fn) { this.handlers.set(name, fn); }
  fire(name, data = {}) { this.handlers.get(name)?.(data); }
  send(data) { this.sent.push(JSON.parse(data)); }
  close() { this.readyState = 3; this.fire('close'); }
}

test('a throwing game UI callback cannot strand room state or disconnect cleanup', () => {
  let socket;
  class TestSocket extends Socket { constructor() { super(); socket = this; } }
  const client = createCoopClient({
    url: 'wss://example.org',
    WebSocketImpl: TestSocket,
    onEvent: () => { throw new Error('renderer temporarily unavailable'); }
  });
  assert.doesNotThrow(() => client.connect());
  socket.readyState = 1;
  assert.doesNotThrow(() => socket.fire('open'));
  assert.equal(client.createRoom(), true);
  assert.doesNotThrow(() => socket.fire('message', {
    data: JSON.stringify({ type: 'joined', room: 'c'.repeat(24), playerId: 'a'.repeat(24), host: true })
  }));
  assert.equal(client.status.room, 'c'.repeat(24));
  assert.doesNotThrow(() => socket.fire('message', {
    data: JSON.stringify({ type: 'peer_joined', playerId: 'b'.repeat(24) })
  }));
  assert.equal(client.status.peerId, 'b'.repeat(24));
  assert.equal(client.sendState({ x: 1, z: 2 }), true);
  assert.doesNotThrow(() => client.disconnect());
  assert.equal(client.status.connected, false);
  assert.equal(client.status.room, null);
  assert.equal(client.status.peerId, null);
});
