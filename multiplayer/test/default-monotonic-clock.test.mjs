import test from 'node:test';
import assert from 'node:assert/strict';
import { createCoopClient } from '../client.mjs';

class Socket {
  static OPEN = 1;
  static latest;
  constructor() { this.readyState = 0; this.bufferedAmount = 0; this.handlers = {}; this.sent = []; Socket.latest = this; }
  addEventListener(name, callback) { (this.handlers[name] ||= []).push(callback); }
  fire(name, data = {}) { for (const callback of this.handlers[name] || []) callback(data); }
  send(value) { this.sent.push(JSON.parse(value)); }
  close() { this.readyState = 3; this.fire('close'); }
  packet(value) { this.fire('message', { data: JSON.stringify(value) }); }
}

test('default browser clock uses monotonic performance time despite wall-clock rollback', () => {
  const originalPerformance = globalThis.performance;
  const originalDateNow = Date.now;
  let monotonic = 1000;
  let wallClock = 100000;
  let client;
  try {
    Object.defineProperty(globalThis, 'performance', {
      configurable: true, value: { now: () => monotonic }
    });
    Date.now = () => wallClock;
    client = createCoopClient({ url: 'wss://example.org', WebSocketImpl: Socket });
    client.connect();
    const ws = Socket.latest;
    ws.readyState = Socket.OPEN;
    ws.fire('open');
    assert.equal(client.createRoom(), true);
    ws.packet({ type: 'joined', room: 'a'.repeat(24), playerId: 'b'.repeat(24), host: true });
    assert.equal(client.sendState({ x: 1, z: 2 }), true);
    wallClock = -100000;
    monotonic = 1050;
    assert.equal(client.sendState({ x: 2, z: 3 }), false);
    monotonic = 1100;
    assert.equal(client.sendState({ x: 3, z: 4 }), true);
    assert.equal(ws.sent.filter(p => p.type === 'state').length, 2);
  } finally {
    client?.disconnect();
    Date.now = originalDateNow;
    Object.defineProperty(globalThis, 'performance', {
      configurable: true, value: originalPerformance
    });
  }
});
