import test from 'node:test';
import assert from 'node:assert/strict';
import { createCoopClient } from '../client.mjs';

test('movement recovers from a backwards clock without flooding the relay', () => {
  let clock = 1000;
  let ws;
  class FakeSocket {
    static OPEN = 1;
    constructor() { this.readyState = 1; this.handlers = new Map(); this.sent = []; ws = this; }
    addEventListener(type, fn) { this.handlers.set(type, fn); }
    send(data) { this.sent.push(JSON.parse(data)); }
    close() { this.readyState = 3; }
    receive(packet) { this.handlers.get('message')({ data: JSON.stringify(packet) }); }
  }
  const client = createCoopClient({ url: 'wss://example.test', WebSocketImpl: FakeSocket, now: () => clock });
  client.connect();
  assert.equal(client.createRoom(), true);
  ws.receive({ type: 'joined', room: 'a'.repeat(24), playerId: 'b'.repeat(24), host: true });
  const state = { x: 1, z: 2 };
  assert.equal(client.sendState(state), true);
  clock = 500;
  assert.equal(client.sendState(state), true, 'rollback permits a fresh position');
  assert.equal(client.sendState(state), false, 'same-frame repeat stays throttled');
  clock = 599;
  assert.equal(client.sendState(state), false);
  clock = 600;
  assert.equal(client.sendState(state), true);
  assert.equal(ws.sent.filter(packet => packet.type === 'state').length, 3);
  client.disconnect();
});
