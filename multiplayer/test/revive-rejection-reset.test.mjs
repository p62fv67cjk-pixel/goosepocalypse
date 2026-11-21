import test from 'node:test';
import assert from 'node:assert/strict';
import { createCoopClient } from '../client.mjs';

class Socket {
  static OPEN = 1;
  static last;
  constructor() { this.readyState = 0; this.bufferedAmount = 0; this.handlers = new Map(); this.sent = []; Socket.last = this; }
  addEventListener(name, fn) { this.handlers.set(name, fn); }
  fire(name, payload = {}) { this.handlers.get(name)?.(payload); }
  open() { this.readyState = 1; this.fire('open'); }
  send(text) { this.sent.push(JSON.parse(text)); }
  packet(value) { this.fire('message', { data: JSON.stringify(value) }); }
  close() { this.readyState = 3; this.fire('close'); }
}

test('relay revive rejection clears pending attempt and permits fresh ID immediately', () => {
  let time = 1000;
  let counter = 0;
  const events = [];
  const client = createCoopClient({
    url: 'wss://example.test', WebSocketImpl: Socket,
    now: () => time, onEvent: event => events.push(event),
    cryptoImpl: { getRandomValues(bytes) { bytes.fill(++counter); return bytes; } }
  });
  const self = 'a'.repeat(24), peer = 'b'.repeat(24), room = 'c'.repeat(24);
  client.connect();
  const ws = Socket.last;
  ws.open();
  assert.equal(client.createRoom(), true);
  ws.packet({ type: 'joined', room, playerId: self, host: true });
  ws.packet({ type: 'peer_joined', playerId: peer });
  assert.equal(client.reviveWithGeneratedId(peer), true);
  const first = ws.sent.at(-1).data.requestId;
  assert.equal(client.reviveWithGeneratedId(peer), false);
  ws.packet({ type: 'error', code: 'revive_not_allowed' });
  assert.equal(client.reviveWithGeneratedId(peer), true);
  const second = ws.sent.at(-1).data.requestId;
  assert.notEqual(second, first);
  ws.packet({ type: 'revive_accepted', targetId: peer, requestId: first });
  assert.equal(events.filter(e => e.type === 'packet' && e.packet.type === 'revive_accepted').length, 0);
  time += 100;
  ws.packet({ type: 'revive_accepted', targetId: peer, requestId: second });
  assert.equal(events.filter(e => e.type === 'packet' && e.packet.type === 'revive_accepted').length, 1);
  ws.close();
});
