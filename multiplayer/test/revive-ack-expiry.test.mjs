import test from 'node:test';
import assert from 'node:assert/strict';
import { createCoopClient } from '../client.mjs';

class Socket {
  static OPEN = 1;
  static latest;
  constructor() { this.readyState = 0; this.listeners = {}; Socket.latest = this; }
  addEventListener(type, cb) { (this.listeners[type] ||= []).push(cb); }
  fire(type, payload = {}) { for (const cb of this.listeners[type] || []) cb(payload); }
  packet(value) { this.fire('message', { data: JSON.stringify(value) }); }
  send() {}
  close() { this.readyState = 3; this.fire('close'); }
}
const room = 'a'.repeat(24), self = 'b'.repeat(24), peer = 'c'.repeat(24);
function setup(now) {
  const events = [];
  const client = createCoopClient({ url: 'wss://example.org', WebSocketImpl: Socket, now, onEvent: e => events.push(e) });
  client.connect();
  const ws = Socket.latest;
  ws.readyState = 1; ws.fire('open');
  assert.equal(client.createRoom(), true);
  ws.packet({ type: 'joined', room, playerId: self });
  ws.packet({ type: 'peer_joined', playerId: peer });
  return { client, ws, events };
}
test('expired revive acknowledgement is not surfaced as a rescue', () => {
  let time = 1000;
  const { client, ws, events } = setup(() => time);
  assert.equal(client.revive(peer), true);
  time = 6000;
  ws.packet({ type: 'revive_accepted', targetId: peer });
  assert.equal(events.filter(e => e.packet?.type === 'revive_accepted').length, 0);
  assert.equal(client.revive(peer), true);
  client.disconnect();
});
test('clock rollback cannot make an old revive acknowledgement valid', () => {
  let time = 9000;
  const { client, ws, events } = setup(() => time);
  assert.equal(client.revive(peer), true);
  time = 100;
  ws.packet({ type: 'revive_accepted', targetId: peer });
  assert.equal(events.filter(e => e.packet?.type === 'revive_accepted').length, 0);
  assert.equal(client.revive(peer), true);
  client.disconnect();
});
test('timely revive acknowledgement is still accepted exactly once', () => {
  let time = 1000;
  const { client, ws, events } = setup(() => time);
  assert.equal(client.revive(peer), true);
  time = 1200;
  ws.packet({ type: 'revive_accepted', targetId: peer });
  ws.packet({ type: 'revive_accepted', targetId: peer });
  assert.equal(events.filter(e => e.packet?.type === 'revive_accepted').length, 1);
  client.disconnect();
});
