import test from 'node:test';
import assert from 'node:assert/strict';
import { createCoopClient } from '../client.mjs';

class Socket {
  static OPEN = 1;
  static latest;
  constructor() { this.readyState = 0; this.listeners = {}; Socket.latest = this; }
  addEventListener(type, fn) { (this.listeners[type] ||= []).push(fn); }
  fire(type, data = {}) { for (const fn of this.listeners[type] || []) fn(data); }
  packet(data) { this.fire('message', { data: JSON.stringify(data) }); }
  send() {}
  close() { this.readyState = 3; this.fire('close'); }
}
test('revive packets reject unexpected envelope fields without dropping valid requests', () => {
  const events = [];
  const client = createCoopClient({ url: 'wss://example.org', WebSocketImpl: Socket, onEvent: e => events.push(e) });
  const room = 'a'.repeat(24), self = 'b'.repeat(24), peer = 'c'.repeat(24);
  client.connect();
  const ws = Socket.latest;
  ws.readyState = 1; ws.fire('open');
  assert.equal(client.createRoom(), true);
  ws.packet({ type: 'joined', room, playerId: self });
  ws.packet({ type: 'peer_joined', playerId: peer });
  const valid = { type: 'revive', playerId: peer, data: { targetId: self } };
  ws.packet({ ...valid, health: 100 });
  ws.packet({ ...valid, metadata: { bypass: true } });
  ws.packet({ ...valid, data: { targetId: self, health: 100 } });
  assert.equal(events.filter(e => e.packet?.type === 'revive').length, 0);
  ws.packet(valid);
  assert.equal(events.filter(e => e.packet?.type === 'revive').length, 1);
  // The relay can now forward a per-attempt ID; it must reach the client,
  // while malformed IDs and unexpected fields must still be rejected.
  const withId = { ...valid, data: { targetId: self, requestId: 'd'.repeat(24) } };
  for (const requestId of ['invalid', 'D'.repeat(24), 123, null]) {
    ws.packet({ ...withId, data: { targetId: self, requestId } });
  }
  ws.packet({ ...withId, data: { ...withId.data, health: 100 } });
  assert.equal(events.filter(e => e.packet?.type === 'revive').length, 1);
  ws.packet(withId);
  assert.equal(events.filter(e => e.packet?.type === 'revive').length, 2);
  assert.deepEqual(events.at(-1).packet.data, withId.data);
  client.disconnect();
});
