import test from 'node:test';
import assert from 'node:assert/strict';
import { createCoopClient } from '../client.mjs';

test('movement clock rollback fails closed until the original 100 ms budget expires', () => {
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
  for (let frame = 0; frame < 120; frame++)
    assert.equal(client.sendState(state), false, 'rollback or frozen clock must not flood relay');
  clock = 1099;
  assert.equal(client.sendState(state), false, 'original interval still applies');
  clock = 1100;
  assert.equal(client.sendState(state), true, 'movement resumes at original 100 ms boundary');
  assert.equal(client.sendState(state), false, 'same-frame repeat stays throttled');
  clock = 1200;
  assert.equal(client.sendState(state), true);
  assert.equal(ws.sent.filter(packet => packet.type === 'state').length, 3);
  client.disconnect();
});
