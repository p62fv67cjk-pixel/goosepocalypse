import test from 'node:test';
import assert from 'node:assert/strict';
import { createCoopClient } from '../client.mjs';

class Socket {
  static OPEN = 1;
  static latest;
  constructor() { this.readyState = 0; this.handlers = {}; this.sent = []; Socket.latest = this; }
  addEventListener(name, fn) { (this.handlers[name] ||= []).push(fn); }
  fire(name, data = {}) { for (const fn of this.handlers[name] || []) fn(data); }
  send(raw) { this.sent.push(JSON.parse(raw)); }
  packet(value) { this.fire('message', { data: JSON.stringify(value) }); }
  close() { this.readyState = 3; this.fire('close'); }
}
const room = 'a'.repeat(24), self = 'b'.repeat(24), peer = 'c'.repeat(24);
function setup(cryptoImpl, now = () => 1000) {
  const events = [];
  const client = createCoopClient({ url: 'wss://example.org', WebSocketImpl: Socket, cryptoImpl, now, onEvent: e => events.push(e) });
  client.connect();
  const ws = Socket.latest;
  ws.readyState = 1; ws.fire('open');
  assert.equal(client.createRoom(), true);
  ws.packet({ type: 'joined', room, playerId: self, host: true });
  ws.packet({ type: 'peer_joined', playerId: peer });
  return { client, ws, events };
}
test('secure revive generates 12 random bytes and correlates acknowledgements across retries', () => {
  let tick = 1000, seed = 0;
  const cryptoImpl = { getRandomValues(bytes) { bytes.fill(++seed); return bytes; } };
  const { client, ws, events } = setup(cryptoImpl, () => tick);
  assert.equal(client.reviveWithGeneratedId(peer), true);
  const first = ws.sent.at(-1).data.requestId;
  assert.equal(first, '01'.repeat(12));
  tick = 6000;
  assert.equal(client.reviveWithGeneratedId(peer), true);
  const second = ws.sent.at(-1).data.requestId;
  assert.equal(second, '02'.repeat(12));
  ws.packet({ type: 'revive_accepted', targetId: peer, requestId: first });
  ws.packet({ type: 'revive_accepted', targetId: peer });
  assert.equal(events.filter(e => e.packet?.type === 'revive_accepted').length, 0);
  ws.packet({ type: 'revive_accepted', targetId: peer, requestId: second });
  assert.equal(events.filter(e => e.packet?.type === 'revive_accepted').length, 1);
  client.disconnect();
});
test('secure revive fails closed without cryptographic randomness', () => {
  const { client, ws } = setup(null);
  assert.equal(client.reviveWithGeneratedId(peer), false);
  assert.equal(ws.sent.filter(p => p.type === 'revive').length, 0);
  client.disconnect();
});
test('secure revive fails closed when random source throws', () => {
  const { client, ws } = setup({ getRandomValues() { throw new Error('unavailable'); } });
  assert.equal(client.reviveWithGeneratedId(peer), false);
  assert.equal(ws.sent.filter(p => p.type === 'revive').length, 0);
  client.disconnect();
});
