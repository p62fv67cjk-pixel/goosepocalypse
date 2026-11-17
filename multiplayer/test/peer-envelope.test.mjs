import test from 'node:test';
import assert from 'node:assert/strict';
import { createCoopClient } from '../client.mjs';

class Socket {
  static OPEN = 1;
  static latest;
  constructor() { this.readyState = 0; this.listeners = {}; Socket.latest = this; }
  addEventListener(type, callback) { (this.listeners[type] ||= []).push(callback); }
  fire(type, payload = {}) { for (const callback of this.listeners[type] || []) callback(payload); }
  packet(packet) { this.fire('message', { data: JSON.stringify(packet) }); }
  send() {}
  close() { this.readyState = 3; this.fire('close'); }
}

test('unexpected peer membership fields cannot change teammate identity', () => {
  const events = [];
  const client = createCoopClient({
    url: 'wss://example.org',
    WebSocketImpl: Socket,
    onEvent: event => events.push(event)
  });
  const room = 'a'.repeat(24), self = 'b'.repeat(24);
  const first = 'c'.repeat(24), second = 'd'.repeat(24);
  client.connect();
  const ws = Socket.latest;
  ws.readyState = Socket.OPEN;
  ws.fire('open');
  assert.equal(client.createRoom(), true);
  ws.packet({ type: 'joined', room, playerId: self, host: true });
  ws.packet({ type: 'peer_joined', playerId: first, health: 0 });
  assert.equal(client.status.peerId, null);
  ws.packet({ type: 'peer_joined', playerId: first });
  assert.equal(client.status.peerId, first);
  ws.packet({ type: 'peer_left', playerId: first, replacement: second });
  assert.equal(client.status.peerId, first);
  ws.packet({ type: 'peer_left', playerId: first });
  assert.equal(client.status.peerId, null);
  ws.packet({ type: 'peer_joined', playerId: second });
  assert.equal(client.status.peerId, second);
  assert.equal(events.filter(event => event.packet?.type === 'peer_joined').length, 2);
  assert.equal(events.filter(event => event.packet?.type === 'peer_left').length, 1);
  client.disconnect();
});
