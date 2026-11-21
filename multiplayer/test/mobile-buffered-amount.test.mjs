import test from 'node:test';
import assert from 'node:assert/strict';
import { createCoopClient } from '../client.mjs';

class Socket {
  static OPEN = 1;
  static latest;
  constructor() {
    this.readyState = 0;
    this.bufferedAmount = 0;
    this.handlers = {};
    this.sent = [];
    Socket.latest = this;
  }
  addEventListener(name, callback) { (this.handlers[name] ||= []).push(callback); }
  fire(name, data = {}) { for (const callback of this.handlers[name] || []) callback(data); }
  send(raw) { this.sent.push(JSON.parse(raw)); }
  close() { this.readyState = 3; this.fire('close'); }
  packet(data) { this.fire('message', { data: JSON.stringify(data) }); }
}

test('stalled mobile socket does not accumulate gameplay packets and recovers after draining', () => {
  let time = 1000;
  const client = createCoopClient({ url: 'wss://example.org', WebSocketImpl: Socket, now: () => time });
  client.connect();
  const ws = Socket.latest;
  ws.readyState = Socket.OPEN;
  ws.fire('open');
  assert.equal(client.createRoom(), true);
  ws.packet({ type: 'joined', room: 'a'.repeat(24), playerId: 'b'.repeat(24), host: true });
  ws.bufferedAmount = 65537;
  assert.equal(client.sendState({ x: 1, z: 2 }), false);
  assert.equal(client.sendAction({ kind: 'fire' }), false);
  assert.equal(ws.sent.filter(packet => packet.type === 'state').length, 0);
  ws.bufferedAmount = 0;
  assert.equal(client.sendState({ x: 1, z: 2 }), true);
  assert.equal(client.sendState({ x: 2, z: 3 }), false);
  time += 100;
  assert.equal(client.sendState({ x: 2, z: 3 }), true);
  assert.equal(ws.sent.filter(packet => packet.type === 'state').length, 2);
  client.disconnect();
});
