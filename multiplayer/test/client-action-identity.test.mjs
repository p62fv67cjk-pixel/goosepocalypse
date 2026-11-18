import test from 'node:test';
import assert from 'node:assert/strict';
import { createCoopClient } from '../client.mjs';

class FakeSocket {
  static OPEN = 1;
  static last;
  constructor() { FakeSocket.last = this; this.readyState = 0; this.sent = []; this.listeners = new Map(); }
  addEventListener(type, callback) { this.listeners.set(type, callback); }
  open() { this.readyState = 1; this.listeners.get('open')?.(); }
  send(payload) { this.sent.push(JSON.parse(payload)); }
  close() { this.readyState = 3; this.listeners.get('close')?.(); }
  receive(packet) { this.listeners.get('message')?.({ data: JSON.stringify(packet) }); }
}

test('browser refuses reserved identity action fields before sending to relay', () => {
  const client = createCoopClient({ url: 'wss://game.example', WebSocketImpl: FakeSocket });
  client.connect();
  const socket = FakeSocket.last;
  socket.open();
  assert.equal(client.createRoom(), true);
  socket.receive({ type: 'joined', room: 'c'.repeat(24), playerId: 'a'.repeat(24), host: true });
  socket.sent.length = 0;
  for (const key of ['playerId', 'peerId', 'room', 'host']) {
    assert.equal(client.sendAction({ kind: 'fire', [key]: 'b'.repeat(24) }), false, key);
  }
  assert.deepEqual(socket.sent, []);
  assert.equal(client.sendAction({ kind: 'fire', yaw: 1.2 }), true);
  assert.deepEqual(socket.sent, [{ type: 'action', data: { kind: 'fire', yaw: 1.2 } }]);
  client.disconnect();
});
