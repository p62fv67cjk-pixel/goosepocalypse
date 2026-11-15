import test from 'node:test';
import assert from 'node:assert/strict';
import { createCoopClient } from '../client.mjs';

class Socket {
  static OPEN = 1;
  static latest;
  constructor() { this.readyState = 0; this.listeners = {}; this.sent = []; Socket.latest = this; }
  addEventListener(type, cb) { (this.listeners[type] ||= []).push(cb); }
  fire(type, payload = {}) { for (const cb of this.listeners[type] || []) cb(payload); }
  send(raw) { this.sent.push(JSON.parse(raw)); }
  packet(value) { this.fire('message', { data: JSON.stringify(value) }); }
  close() { this.readyState = 3; this.fire('close'); }
}
const room = 'a'.repeat(24), self = 'b'.repeat(24), peer = 'c'.repeat(24);
test('lost revive acknowledgement does not permanently lock retry', () => {
  let time = 1000;
  const client = createCoopClient({ url: 'wss://example.org', WebSocketImpl: Socket, now: () => time });
  client.connect();
  const ws = Socket.latest;
  ws.readyState = 1; ws.fire('open');
  assert.equal(client.createRoom(), true);
  ws.packet({ type: 'joined', room, playerId: self });
  ws.packet({ type: 'peer_joined', playerId: peer });
  assert.equal(client.revive(peer), true);
  time += 4999;
  assert.equal(client.revive(peer), false);
  time += 1;
  assert.equal(client.revive(peer), true);
  assert.equal(ws.sent.filter(packet => packet.type === 'revive').length, 2);
  client.disconnect();
});
test('clock rollback does not strand a pending revive request', () => {
  let time = 9000;
  const client = createCoopClient({ url: 'wss://example.org', WebSocketImpl: Socket, now: () => time });
  client.connect();
  const ws = Socket.latest;
  ws.readyState = 1; ws.fire('open');
  assert.equal(client.createRoom(), true);
  ws.packet({ type: 'joined', room, playerId: self });
  ws.packet({ type: 'peer_joined', playerId: peer });
  assert.equal(client.revive(peer), true);
  time = 100;
  assert.equal(client.revive(peer), false, 'rollback cannot bypass pending revive');
  time = 14000;
  assert.equal(client.revive(peer), true, 'retry succeeds after forward timeout');
  client.disconnect();
});
