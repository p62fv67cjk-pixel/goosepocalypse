import test from 'node:test';
import assert from 'node:assert/strict';
import { createCoopClient } from '../client.mjs';

class FakeSocket {
  static OPEN = 1;
  constructor() { this.readyState = 0; this.handlers = new Map(); this.sent = []; }
  addEventListener(type, handler) { this.handlers.set(type, handler); }
  fire(type, event = {}) { this.handlers.get(type)?.(event); }
  open() { this.readyState = FakeSocket.OPEN; this.fire('open'); }
  send(data) { this.sent.push(JSON.parse(data)); }
  close() { this.readyState = 3; this.fire('close'); }
}

test('accept joined only in response to a pending create or join', () => {
  let ws;
  class Socket extends FakeSocket { constructor(url) { super(url); ws = this; } }
  const events = [];
  const client = createCoopClient({ url: 'wss://example.org', WebSocketImpl: Socket, onEvent: e => events.push(e) });
  const room = 'a'.repeat(24), playerId = 'b'.repeat(24);
  client.connect(); ws.open();
  ws.fire('message', { data: JSON.stringify({ type: 'joined', room, playerId }) });
  assert.equal(client.status.room, null);
  assert.equal(events.filter(e => e.type === 'packet').length, 0);
  assert.equal(client.createRoom(), true);
  ws.fire('message', { data: JSON.stringify({ type: 'joined', room, playerId }) });
  assert.equal(client.status.room, room);
  assert.equal(client.createRoom(), false);
  assert.equal(events.filter(e => e.type === 'packet').length, 1);
  client.disconnect();
});

test('rejected lobby request allows another request but not unsolicited joined', () => {
  let ws;
  class Socket extends FakeSocket { constructor(url) { super(url); ws = this; } }
  const client = createCoopClient({ url: 'wss://example.org', WebSocketImpl: Socket });
  client.connect(); ws.open();
  assert.equal(client.joinRoom('a'.repeat(24)), true);
  ws.fire('message', { data: JSON.stringify({ type: 'error', code: 'room_not_found' }) });
  ws.fire('message', { data: JSON.stringify({ type: 'joined', room: 'a'.repeat(24), playerId: 'b'.repeat(24) }) });
  assert.equal(client.status.room, null);
  assert.equal(client.createRoom(), true);
  client.disconnect();
});
