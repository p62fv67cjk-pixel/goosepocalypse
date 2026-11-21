import test from 'node:test';
import assert from 'node:assert/strict';
import { createCoopClient } from '../client.mjs';

// Regression: a transient Safari socket send failure must not consume the
// 100ms movement snapshot budget or strand a reconnecting mobile player.
class Socket {
  static OPEN = 1;
  static latest;
  constructor() { this.readyState = 0; this.bufferedAmount = 0; this.handlers = new Map(); this.sent = []; Socket.latest = this; }
  addEventListener(type, fn) { this.handlers.set(type, [...(this.handlers.get(type) || []), fn]); }
  fire(type, value = {}) { for (const fn of this.handlers.get(type) || []) fn(value); }
  open() { this.readyState = 1; this.fire('open'); }
  send(value) { if (this.failSend) throw new Error('temporarily unavailable'); this.sent.push(JSON.parse(value)); }
  close() { this.readyState = 3; this.fire('close'); }
  packet(value) { this.fire('message', { data: JSON.stringify(value) }); }
}
const room = 'c'.repeat(24), playerId = 'a'.repeat(24);

test('failed movement send does not throttle a same-tick retry or leak state across reconnect', () => {
  let clock = 1000;
  const client = createCoopClient({ url: 'wss://example.org', WebSocketImpl: Socket, now: () => clock });
  client.connect();
  const first = Socket.latest;
  first.open();
  assert.equal(client.createRoom(), true);
  first.packet({ type: 'joined', room, playerId, host: true });
  first.failSend = true;
  assert.equal(client.sendState({ x: 1, z: 2 }), false);
  first.failSend = false;
  assert.equal(client.sendState({ x: 1, z: 2 }), true);
  assert.equal(client.sendState({ x: 2, z: 3 }), false);
  clock += 100;
  assert.equal(client.sendState({ x: 2, z: 3 }), true);
  client.disconnect();
  client.connect();
  const second = Socket.latest;
  second.open();
  assert.equal(client.createRoom(), true);
  second.packet({ type: 'joined', room, playerId, host: true });
  assert.equal(client.sendState({ x: 5, z: 6 }), true, 'new room should reset movement send budget');
  assert.deepEqual(second.sent.at(-1), { type: 'state', data: { x: 5, z: 6 } });
  client.disconnect();
});
