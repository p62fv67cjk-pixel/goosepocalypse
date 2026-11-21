import test from 'node:test';
import assert from 'node:assert/strict';
import { createCoopClient } from '../client.mjs';

class Socket {
  static OPEN = 1;
  static last;
  constructor() {
    this.readyState = 0;
    this.bufferedAmount = 0;
    this.handlers = new Map();
    this.sent = [];
    Socket.last = this;
  }
  addEventListener(name, handler) { this.handlers.set(name, handler); }
  fire(name, data = {}) { this.handlers.get(name)?.(data); }
  open() { this.readyState = 1; this.fire('open'); }
  send(data) { this.sent.push(JSON.parse(data)); }
  close() { this.readyState = 3; this.fire('close'); }
  packet(data) { this.fire('message', { data: JSON.stringify(data) }); }
}

const room = 'c'.repeat(24), playerId = 'a'.repeat(24);
test('mobile state snapshots throttle at 10Hz, including clock rollback, without blocking later movement', () => {
  let time = 1000;
  const client = createCoopClient({
    url: 'wss://example.org', WebSocketImpl: Socket, now: () => time
  });
  client.connect();
  const ws = Socket.last;
  ws.open();
  assert.equal(client.createRoom(), true);
  ws.packet({ type: 'joined', room, playerId, host: true });
  assert.equal(client.sendState({ x: 0, z: 0 }), true);
  time = 1099;
  assert.equal(client.sendState({ x: 1, z: 0 }), false);
  time = 900;
  assert.equal(client.sendState({ x: 2, z: 0 }), false, 'clock rollback must not flood relay');
  time = 1100;
  assert.equal(client.sendState({ x: 3, z: 0 }), true);
  assert.deepEqual(ws.sent.filter(packet => packet.type === 'state').map(packet => packet.data.x), [0, 3]);
  client.disconnect();
});

test('stalled mobile socket rejects state without consuming send interval and resumes after drain', () => {
  let time = 1000;
  const client = createCoopClient({
    url: 'wss://example.org', WebSocketImpl: Socket, now: () => time
  });
  client.connect();
  const ws = Socket.last;
  ws.open();
  client.createRoom();
  ws.packet({ type: 'joined', room, playerId, host: true });
  ws.bufferedAmount = 65536;
  assert.equal(client.sendState({ x: 0, z: 0 }), false);
  ws.bufferedAmount = 0;
  assert.equal(client.sendState({ x: 1, z: 0 }), true, 'failed send must not consume throttle slot');
  assert.equal(ws.sent.filter(packet => packet.type === 'state').length, 1);
  client.disconnect();
});
