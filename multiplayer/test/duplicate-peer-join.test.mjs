import test from 'node:test';
import assert from 'node:assert/strict';
import { createCoopClient } from '../client.mjs';

class Socket {
  static OPEN = 1;
  static latest;
  constructor() { this.readyState = 0; this.listeners = {}; Socket.latest = this; }
  addEventListener(type, callback) { (this.listeners[type] ||= []).push(callback); }
  fire(type, data = {}) { for (const callback of this.listeners[type] || []) callback(data); }
  send() {}
  packet(packet) { this.fire('message', { data: JSON.stringify(packet) }); }
  close() { this.readyState = 3; this.fire('close'); }
}
const room = 'a'.repeat(24), self = 'b'.repeat(24), teammate = 'c'.repeat(24);
const replacement = 'd'.repeat(24);
test('duplicate peer_joined does not trigger repeated teammate initialization', () => {
  const events = [];
  const client = createCoopClient({ url: 'wss://example.org', WebSocketImpl: Socket, onEvent: event => events.push(event) });
  client.connect();
  const socket = Socket.latest;
  socket.readyState = 1;
  socket.fire('open');
  assert.equal(client.createRoom(), true);
  socket.packet({ type: 'joined', room, playerId: self, host: true });
  socket.packet({ type: 'peer_joined', playerId: teammate });
  socket.packet({ type: 'peer_joined', playerId: teammate });
  socket.packet({ type: 'peer_joined', playerId: replacement });
  assert.equal(client.status.peerId, teammate);
  assert.equal(events.filter(event => event.type === 'packet' && event.packet.type === 'peer_joined').length, 1);
  socket.packet({ type: 'peer_left', playerId: teammate });
  socket.packet({ type: 'peer_joined', playerId: replacement });
  assert.equal(client.status.peerId, replacement);
  assert.equal(events.filter(event => event.type === 'packet' && event.packet.type === 'peer_joined').length, 2);
  client.disconnect();
});
