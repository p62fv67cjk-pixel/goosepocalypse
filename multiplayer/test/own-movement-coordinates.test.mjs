import test from 'node:test';
import assert from 'node:assert/strict';
import { createCoopClient } from '../client.mjs';

class Socket {
  static OPEN = 1;
  static latest;
  constructor() { this.readyState = 0; this.bufferedAmount = 0; this.handlers = new Map(); this.sent = []; Socket.latest = this; }
  addEventListener(type, handler) { this.handlers.set(type, [...(this.handlers.get(type) || []), handler]); }
  fire(type, payload = {}) { for (const handler of this.handlers.get(type) || []) handler(payload); }
  send(message) { this.sent.push(JSON.parse(message)); }
  close() { this.readyState = 3; this.fire('close'); }
  packet(value) { this.fire('message', { data: JSON.stringify(value) }); }
}

test('movement snapshots must own x and z rather than inheriting coordinates', () => {
  let clock = 1000;
  const client = createCoopClient({ url: 'wss://example.org', WebSocketImpl: Socket, now: () => clock });
  client.connect();
  const socket = Socket.latest;
  socket.readyState = Socket.OPEN;
  assert.equal(client.createRoom(), true);
  socket.packet({ type: 'joined', room: 'c'.repeat(24), playerId: 'a'.repeat(24), host: true });

  const inheritedBoth = Object.create({ x: 2, z: 3 });
  const inheritedZ = Object.assign(Object.create({ z: 3 }), { x: 2 });
  assert.equal(client.sendState(inheritedBoth), false);
  assert.equal(client.sendState(inheritedZ), false);
  assert.equal(socket.sent.filter(packet => packet.type === 'state').length, 0);

  // Rejected snapshots must not consume the 100ms movement send interval.
  assert.equal(client.sendState({ x: 2, z: 3 }), true);
  assert.equal(client.sendState({ x: 4, z: 5 }), false);
  clock += 100;
  assert.equal(client.sendState({ x: 4, z: 5 }), true);
  assert.equal(socket.sent.filter(packet => packet.type === 'state').length, 2);
  client.disconnect();
});
