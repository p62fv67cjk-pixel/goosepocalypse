import test from 'node:test';
import assert from 'node:assert/strict';
import { createCoopClient } from '../client.mjs';

class Socket {
  static OPEN = 1;
  static latest;
  constructor() { this.readyState = Socket.OPEN; this.sent = []; this.handlers = new Map(); Socket.latest = this; }
  addEventListener(type, fn) { this.handlers.set(type, [...(this.handlers.get(type) || []), fn]); }
  fire(type, data = {}) { for (const fn of this.handlers.get(type) || []) fn(data); }
  send(data) { this.sent.push(JSON.parse(data)); }
  close() { this.readyState = 3; this.fire('close'); }
  packet(data) { this.fire('message', { data: JSON.stringify(data) }); }
}

test('action validation rejects serialization hooks, accessors, and hidden fields', () => {
  const client = createCoopClient({ url: 'wss://example.org', WebSocketImpl: Socket });
  client.connect();
  assert.equal(client.createRoom(), true);
  const socket = Socket.latest;
  socket.packet({ type: 'joined', room: 'c'.repeat(24), playerId: 'a'.repeat(24), host: true });

  const hooked = { damage: 1, toJSON() { return { damage: 10000 }; } };
  const inherited = Object.assign(Object.create({ toJSON() { return {}; } }), { damage: 1 });
  const accessor = {};
  Object.defineProperty(accessor, 'damage', { enumerable: true, get() { throw Error('getter invoked'); } });
  const hidden = { damage: 1 };
  Object.defineProperty(hidden, 'secret', { value: 'x', enumerable: false });
  const symbolic = { damage: 1, [Symbol('secret')]: 'x' };

  for (const action of [hooked, inherited, accessor, hidden, symbolic]) {
    assert.equal(client.sendAction(action), false);
  }
  assert.equal(socket.sent.filter(p => p.type === 'action').length, 0);
  assert.equal(client.sendAction({ damage: 1, active: true, label: 'bite' }), true);
  assert.deepEqual(socket.sent.at(-1).data, { damage: 1, active: true, label: 'bite' });
  client.disconnect();
});
