import test from 'node:test';
import assert from 'node:assert/strict';
import { createCoopClient } from '../client.mjs';

class FakeSocket {
  static OPEN = 1;
  constructor() { this.readyState = 0; this.bufferedAmount = 0; this.listeners = new Map(); this.sent = []; }
  addEventListener(name, fn) { this.listeners.set(name, fn); }
  open() { this.readyState = 1; this.listeners.get('open')?.(); }
  send(raw) { this.sent.push(JSON.parse(raw)); }
  close() { this.readyState = 3; this.listeners.get('close')?.(); }
  packet(data) { this.listeners.get('message')?.({ data: JSON.stringify(data) }); }
}

test('malicious caller-owned getters and proxies cannot crash iPhone game loop', () => {
  let ws;
  class Socket extends FakeSocket { constructor() { super(); ws = this; } }
  const client = createCoopClient({ url: 'wss://example.test', WebSocketImpl: Socket });
  client.connect();
  ws.open();
  assert.equal(client.createRoom(), true);
  ws.packet({ type: 'joined', room: 'a'.repeat(24), playerId: 'b'.repeat(24), host: true });
  const throwingPosition = { get x() { throw Error('getter'); }, z: 2 };
  const throwingAction = { get kind() { throw Error('getter'); } };
  const throwingKeys = new Proxy({}, { ownKeys() { throw Error('proxy'); } });
  assert.doesNotThrow(() => {
    assert.equal(client.sendState(throwingPosition), false);
    assert.equal(client.sendState(throwingKeys), false);
    assert.equal(client.sendAction(throwingAction), false);
    assert.equal(client.sendAction(throwingKeys), false);
  });
  assert.equal(ws.sent.length, 1, 'invalid gameplay never reaches the relay');
  assert.equal(client.sendState({ x: 1, z: 2 }), true, 'valid movement resumes');
  assert.equal(client.sendAction({ kind: 'fire' }), true, 'valid actions still work');
  assert.equal(ws.sent.length, 3);
  client.disconnect();
});
