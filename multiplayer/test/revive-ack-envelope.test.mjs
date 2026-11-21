import test from 'node:test';
import assert from 'node:assert/strict';
import { createCoopClient } from '../client.mjs';

class Socket {
  static OPEN = 1;
  static latest;
  constructor() { this.readyState = 0; this.bufferedAmount = 0; this.handlers = {}; this.sent = []; Socket.latest = this; }
  addEventListener(type, handler) { (this.handlers[type] ||= []).push(handler); }
  fire(type, payload = {}) { for (const handler of this.handlers[type] || []) handler(payload); }
  packet(packet) { this.fire('message', { data: JSON.stringify(packet) }); }
  send(data) { this.sent.push(JSON.parse(data)); }
  close() { this.readyState = 3; this.fire('close'); }
}
const room = 'a'.repeat(24), self = 'b'.repeat(24), peer = 'c'.repeat(24);

test('malformed revive acknowledgement cannot consume an outstanding rescue', () => {
  const events = [];
  const client = createCoopClient({
    url: 'wss://example.org', WebSocketImpl: Socket, now: () => 1000,
    onEvent: event => events.push(event)
  });
  client.connect();
  const socket = Socket.latest;
  socket.readyState = 1;
  socket.fire('open');
  assert.equal(client.createRoom(), true);
  socket.packet({ type: 'joined', room, playerId: self, host: true });
  socket.packet({ type: 'peer_joined', playerId: peer });
  const requestId = 'd'.repeat(24);
  assert.equal(client.revive(peer, requestId), true);
  assert.equal(socket.sent.at(-1).data.requestId, requestId);
  assert.match(requestId, /^[a-f0-9]{24}$/);
  for (const malformed of [
    { type: 'revive_accepted', targetId: peer, health: 100 },
    { type: 'revive_accepted', targetId: peer, data: { downed: false } },
    { type: 'revive_accepted', targetId: peer, requestId: 42 }
  ]) socket.packet(malformed);
  assert.equal(events.filter(e => e.packet?.type === 'revive_accepted').length, 0);
  assert.equal(client.revive(peer), false, 'invalid acknowledgements do not release pending request');
  socket.packet({ type: 'revive_accepted', targetId: peer, requestId });
  assert.equal(events.filter(e => e.packet?.type === 'revive_accepted').length, 1);
  client.disconnect();
});
