import test from 'node:test';
import assert from 'node:assert/strict';
import { createCoopClient } from '../client.mjs';

class FakeSocket {
  static OPEN = 1;
  static sockets = [];
  constructor() {
    this.readyState = 0;
    this.listeners = new Map();
    this.sent = [];
    FakeSocket.sockets.push(this);
  }
  addEventListener(type, callback) {
    const handlers = this.listeners.get(type) || [];
    handlers.push(callback);
    this.listeners.set(type, handlers);
  }
  fire(type, event = {}) {
    for (const handler of this.listeners.get(type) || []) handler(event);
  }
  open() { this.readyState = FakeSocket.OPEN; this.fire('open'); }
  send(data) { this.sent.push(JSON.parse(data)); }
  close() { this.readyState = 3; this.fire('close'); }
}

test('explicit disconnect clears pending room creation before reconnect', () => {
  const client = createCoopClient({ url: 'wss://example.org', WebSocketImpl: FakeSocket });
  client.connect();
  const first = FakeSocket.sockets.at(-1);
  first.open();
  assert.equal(client.createRoom(), true);
  assert.equal(client.createRoom(), false, 'pending create must be exclusive');

  client.disconnect();
  client.connect();
  const second = FakeSocket.sockets.at(-1);
  second.open();
  assert.equal(client.createRoom(), true, 'new connection must not inherit stale pending create');
  assert.deepEqual(second.sent, [{ type: 'create' }]);
  first.fire('close');
  assert.equal(client.createRoom(), false, 'stale socket must not clear current pending request');
  client.disconnect();
});

test('explicit disconnect clears pending join before reconnect', () => {
  const client = createCoopClient({ url: 'wss://example.org', WebSocketImpl: FakeSocket });
  client.connect();
  const first = FakeSocket.sockets.at(-1);
  first.open();
  const room = 'a'.repeat(24);
  assert.equal(client.joinRoom(room), true);
  client.disconnect();
  client.connect();
  const second = FakeSocket.sockets.at(-1);
  second.open();
  assert.equal(client.joinRoom(room), true);
  assert.deepEqual(second.sent, [{ type: 'join', room }]);
  client.disconnect();
});
