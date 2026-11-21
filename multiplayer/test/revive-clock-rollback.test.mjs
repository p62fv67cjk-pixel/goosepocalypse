import test from 'node:test';
import assert from 'node:assert/strict';
import { createCoopClient } from '../client.mjs';

class Socket {
  static OPEN = 1;
  static latest;
  constructor() { this.readyState = 0; this.bufferedAmount = 0; this.handlers = {}; this.sent = []; Socket.latest = this; }
  addEventListener(name, fn) { (this.handlers[name] ||= []).push(fn); }
  fire(name, data = {}) { for (const fn of this.handlers[name] || []) fn(data); }
  send(raw) { this.sent.push(JSON.parse(raw)); }
  close() { this.readyState = 3; this.fire('close'); }
  packet(packet) { this.fire('message', { data: JSON.stringify(packet) }); }
}
test('backwards clock cannot bypass in-flight revive; forward timeout permits retry', () => {
  let time = 10000;
  const client = createCoopClient({
    url: 'wss://example.org', WebSocketImpl: Socket, now: () => time
  });
  client.connect();
  const ws = Socket.latest;
  ws.readyState = Socket.OPEN;
  ws.fire('open');
  assert.equal(client.createRoom(), true);
  ws.packet({ type: 'joined', room: 'a'.repeat(24), playerId: 'b'.repeat(24), host: true });
  ws.packet({ type: 'peer_joined', playerId: 'c'.repeat(24) });
  const target = 'c'.repeat(24);
  assert.equal(client.revive(target, '1'.repeat(24)), true);
  time = 9000;
  assert.equal(client.revive(target, '2'.repeat(24)), false);
  time = 14999;
  assert.equal(client.revive(target, '2'.repeat(24)), false);
  assert.equal(ws.sent.filter(packet => packet.type === 'revive').length, 1);
  time = 15000;
  assert.equal(client.revive(target, '2'.repeat(24)), true);
  assert.equal(ws.sent.filter(packet => packet.type === 'revive').length, 2);
  client.disconnect();
});
