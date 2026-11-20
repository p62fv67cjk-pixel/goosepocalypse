import test from 'node:test';
import assert from 'node:assert/strict';
import { createCoopClient } from '../client.mjs';

class Socket {
  static OPEN = 1;
  static latest;
  constructor() { this.readyState = 0; this.bufferedAmount = 0; this.listeners = {}; this.sent = []; Socket.latest = this; }
  addEventListener(type, fn) { (this.listeners[type] ||= []).push(fn); }
  fire(type, data = {}) { for (const fn of this.listeners[type] || []) fn(data); }
  packet(data) { this.fire('message', { data: JSON.stringify(data) }); }
  send(data) { this.sent.push(JSON.parse(data)); }
  close() { this.readyState = 3; this.fire('close'); }
}
const room = 'a'.repeat(24), self = 'b'.repeat(24), peer = 'c'.repeat(24);
const first = 'd'.repeat(24), second = 'e'.repeat(24);
test('revive IDs reject stale and mismatched acknowledgements across retries', () => {
  let time = 1000;
  const events = [];
  const client = createCoopClient({ url: 'wss://example.org', WebSocketImpl: Socket,
    now: () => time, onEvent: event => events.push(event) });
  client.connect();
  const ws = Socket.latest;
  ws.readyState = Socket.OPEN; ws.fire('open');
  assert.equal(client.createRoom(), true);
  ws.packet({ type: 'joined', room, playerId: self, host: true });
  ws.packet({ type: 'peer_joined', playerId: peer });
  assert.equal(client.revive(peer, 'bad'), false);
  assert.equal(client.revive(peer, first), true);
  assert.deepEqual(ws.sent.at(-1), { type: 'revive', data: { targetId: peer, requestId: first } });
  time = 6000;
  assert.equal(client.revive(peer, second), true);
  ws.packet({ type: 'revive_accepted', targetId: peer, requestId: first });
  ws.packet({ type: 'revive_accepted', targetId: peer });
  ws.packet({ type: 'revive_accepted', targetId: peer, requestId: 'invalid' });
  assert.equal(events.filter(e => e.packet?.type === 'revive_accepted').length, 0);
  ws.packet({ type: 'revive_accepted', targetId: peer, requestId: second });
  ws.packet({ type: 'revive_accepted', targetId: peer, requestId: second });
  assert.equal(events.filter(e => e.packet?.type === 'revive_accepted').length, 1);
  client.disconnect();
});
