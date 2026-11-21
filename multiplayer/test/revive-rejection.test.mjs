import test from 'node:test';
import assert from 'node:assert/strict';
import { createCoopClient } from '../client.mjs';

class Socket {
  static OPEN = 1;
  static latest;
  constructor() { this.readyState = 0; this.bufferedAmount = 0; this.listeners = {}; this.sent = []; Socket.latest = this; }
  addEventListener(type, cb) { (this.listeners[type] ||= []).push(cb); }
  fire(type, payload = {}) { for (const cb of this.listeners[type] || []) cb(payload); }
  send(raw) { this.sent.push(JSON.parse(raw)); }
  packet(value) { this.fire('message', { data: JSON.stringify(value) }); }
  close() { this.readyState = 3; this.fire('close'); }
}
const room = 'a'.repeat(24), self = 'b'.repeat(24), peer = 'c'.repeat(24);
function setup() {
  const events = [];
  const client = createCoopClient({ url: 'wss://example.org', WebSocketImpl: Socket, onEvent: event => events.push(event) });
  client.connect();
  const ws = Socket.latest;
  ws.readyState = 1; ws.fire('open');
  assert.equal(client.createRoom(), true);
  ws.packet({ type: 'joined', room, playerId: self, host: true });
  ws.packet({ type: 'peer_joined', playerId: peer });
  return { client, ws, events };
}

test('only one outstanding revive request is allowed; acknowledgement permits a new request', () => {
  const { client, ws, events } = setup();
  assert.equal(client.revive(peer), true);
  assert.equal(client.revive(peer), false);
  assert.equal(ws.sent.filter(p => p.type === 'revive').length, 1);
  ws.packet({ type: 'revive_accepted', targetId: peer });
  assert.equal(events.filter(e => e.type === 'packet' && e.packet.type === 'revive_accepted').length, 1);
  assert.equal(client.revive(peer), true);
  client.disconnect();
});

test('revive-specific rejection clears pending request and ignores stale confirmation', () => {
  for (const code of ['invalid_revive_target', 'revive_cooldown', 'revive_not_allowed', 'revive_delivery_failed']) {
    const { client, ws, events } = setup();
    assert.equal(client.revive(peer), true);
    ws.packet({ type: 'error', code });
    const before = events.filter(e => e.type === 'packet' && e.packet.type === 'revive_accepted').length;
    ws.packet({ type: 'revive_accepted', targetId: peer });
    assert.equal(events.filter(e => e.type === 'packet' && e.packet.type === 'revive_accepted').length, before, code);
    assert.equal(client.revive(peer), true, code + ' should permit retry');
    client.disconnect();
  }
});

test('unrelated errors cannot cancel pending rescue', () => {
  const { client, ws, events } = setup();
  assert.equal(client.revive(peer), true);
  ws.packet({ type: 'error', code: 'invalid_action' });
  assert.equal(client.revive(peer), false);
  ws.packet({ type: 'revive_accepted', targetId: peer });
  assert.equal(events.filter(e => e.type === 'packet' && e.packet.type === 'revive_accepted').length, 1);
  client.disconnect();
});
