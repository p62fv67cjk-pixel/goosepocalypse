import test from 'node:test';
import assert from 'node:assert/strict';
import { createCoopClient } from '../client.mjs';

class Socket {
  static OPEN = 1;
  static latest;
  constructor() {
    this.readyState = 0;
    this.handlers = {};
    this.sent = [];
    this.queue = 0;
    this.reads = 0;
    Socket.latest = this;
  }
  get bufferedAmount() { this.reads++; return this.queue; }
  addEventListener(name, fn) { (this.handlers[name] ||= []).push(fn); }
  fire(name, data = {}) { for (const fn of this.handlers[name] || []) fn(data); }
  send(data) { this.sent.push(JSON.parse(data)); }
  close() { this.readyState = 3; this.fire('close'); }
  packet(data) { this.fire('message', { data: JSON.stringify(data) }); }
}

test('mobile socket reads queued bytes once per send and rejects malformed counters', () => {
  const client = createCoopClient({ url: 'wss://example.org', WebSocketImpl: Socket });
  client.connect();
  const ws = Socket.latest;
  ws.readyState = Socket.OPEN;
  ws.fire('open');
  assert.equal(client.createRoom(), true);
  ws.packet({ type: 'joined', room: 'a'.repeat(24), playerId: 'b'.repeat(24), host: true });
  for (const malformed of [-1, 1.5, NaN, Infinity, undefined, '0']) {
    ws.queue = malformed;
    const before = ws.sent.length;
    assert.equal(client.sendAction({ kind: 'fire' }), false);
    assert.equal(ws.sent.length, before);
  }
  ws.queue = 65520;
  assert.equal(client.sendAction({ kind: 'fire' }), false);
  ws.queue = 0;
  const reads = ws.reads;
  assert.equal(client.sendAction({ kind: 'fire' }), true);
  assert.equal(ws.reads - reads, 1);
  client.disconnect();
});
