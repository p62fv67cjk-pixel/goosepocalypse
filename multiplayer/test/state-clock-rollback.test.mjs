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
  close() { this.readyState = 3; this.fire('close'); }
  packet(value) { this.fire('message', { data: JSON.stringify(value) }); }
}

test('clock rollback or frozen clock cannot flood the 10 Hz state budget', () => {
  let tick = 10000;
  const client = createCoopClient({ url: 'wss://example.org', WebSocketImpl: Socket, now: () => tick });
  client.connect();
  const ws = Socket.latest;
  ws.readyState = Socket.OPEN;
  ws.fire('open');
  assert.equal(client.createRoom(), true);
  ws.packet({ type: 'joined', room: 'a'.repeat(24), playerId: 'b'.repeat(24) });
  const state = { x: 1, z: 2 };
  assert.equal(client.sendState(state), true);
  for (let i = 0; i < 100; i++) {
    tick = 9000 + i;
    assert.equal(client.sendState(state), false);
  }
  tick = 10000;
  assert.equal(client.sendState(state), false);
  tick = 10099;
  assert.equal(client.sendState(state), false);
  tick = 10100;
  assert.equal(client.sendState(state), true);
  assert.equal(ws.sent.filter(packet => packet.type === 'state').length, 2);
  client.disconnect();
});
