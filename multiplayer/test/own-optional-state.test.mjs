import test from 'node:test';
import assert from 'node:assert/strict';
import { createCoopClient } from '../client.mjs';

class Socket {
  static OPEN = 1;
  static latest;
  constructor() { this.readyState = 0; this.bufferedAmount = 0; this.handlers = new Map(); this.sent = []; Socket.latest = this; }
  addEventListener(type, fn) { this.handlers.set(type, [...(this.handlers.get(type) || []), fn]); }
  fire(type, data = {}) { for (const fn of this.handlers.get(type) || []) fn(data); }
  send(value) { this.sent.push(JSON.parse(value)); }
  close() { this.readyState = 3; this.fire('close'); }
  packet(value) { this.fire('message', { data: JSON.stringify(value) }); }
}

test('inherited optional state cannot silently disappear from network snapshots', () => {
  let now = 1000;
  const client = createCoopClient({ url: 'wss://example.org', WebSocketImpl: Socket, now: () => now });
  client.connect();
  const socket = Socket.latest;
  socket.readyState = Socket.OPEN;
  assert.equal(client.createRoom(), true);
  socket.packet({ type: 'joined', room: 'c'.repeat(24), playerId: 'a'.repeat(24), host: true });

  for (const [key, value] of [['downed', true], ['health', 0], ['yaw', 1.2], ['y', 4]]) {
    const state = Object.assign(Object.create({ [key]: value }), { x: 1, z: 2 });
    assert.equal(client.sendState(state), false, key);
  }
  assert.equal(socket.sent.filter(p => p.type === 'state').length, 0);
  assert.equal(client.sendState({ x: 1, z: 2, downed: true, health: 0 }), true);
  assert.deepEqual(socket.sent.at(-1).data, { x: 1, z: 2, downed: true, health: 0 });
  now += 100;
  assert.equal(client.sendState({ x: 1, z: 2, downed: false }), true);
  client.disconnect();
});
