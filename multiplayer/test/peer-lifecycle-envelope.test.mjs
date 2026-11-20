import test from 'node:test';
import assert from 'node:assert/strict';
import { createCoopClient } from '../client.mjs';

class Socket {
  static OPEN = 1;
  static latest;
  constructor() { this.readyState = 0; this.bufferedAmount = 0; this.handlers = new Map(); Socket.latest = this; }
  addEventListener(type, handler) { this.handlers.set(type, [...(this.handlers.get(type) || []), handler]); }
  fire(type, payload = {}) { for (const handler of this.handlers.get(type) || []) handler(payload); }
  send() {}
  close() { this.readyState = 3; this.fire('close'); }
  packet(value) { this.fire('message', { data: JSON.stringify(value) }); }
}

test('peer lifecycle envelopes require an explicit playerId and cannot invent teammates', () => {
  const events = [];
  const client = createCoopClient({
    url: 'wss://example.org', WebSocketImpl: Socket,
    onEvent: event => events.push(event)
  });
  const room = 'c'.repeat(24);
  const self = 'a'.repeat(24);
  const peer = 'b'.repeat(24);
  client.connect();
  const socket = Socket.latest;
  socket.readyState = Socket.OPEN;
  assert.equal(client.createRoom(), true);
  socket.packet({ type: 'joined', room, playerId: self, host: true });
  const before = events.length;
  socket.packet({ type: 'peer_joined', arbitrary: peer });
  assert.equal(client.status.peerId, null);
  assert.equal(events.length, before);
  socket.packet({ type: 'peer_joined', playerId: peer });
  assert.equal(client.status.peerId, peer);
  const joinedEvents = events.length;
  socket.packet({ type: 'peer_left', arbitrary: peer });
  assert.equal(client.status.peerId, peer);
  assert.equal(events.length, joinedEvents);
  socket.packet({ type: 'peer_left', playerId: peer });
  assert.equal(client.status.peerId, null);
  client.disconnect();
});
