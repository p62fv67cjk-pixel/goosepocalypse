import test from 'node:test';
import assert from 'node:assert/strict';
import { createCoopClient } from '../client.mjs';

class Socket {
  static OPEN = 1;
  static current;
  constructor() {
    this.readyState = 0;
    this.bufferedAmount = 0;
    this.handlers = {};
    this.sent = [];
    Socket.current = this;
  }
  addEventListener(type, fn) { (this.handlers[type] ||= []).push(fn); }
  fire(type, payload = {}) { for (const fn of this.handlers[type] || []) fn(payload); }
  send(raw) {
    this.sent.push(JSON.parse(raw));
    this.bufferedAmount += new TextEncoder().encode(raw).byteLength;
  }
  close() { this.readyState = 3; this.fire('close'); }
}

test('mobile queue limit accounts for bytes about to be sent and recovers after draining', () => {
  const client = createCoopClient({ url: 'wss://example.org', WebSocketImpl: Socket });
  client.connect();
  const ws = Socket.current;
  ws.readyState = Socket.OPEN;
  ws.fire('open');
  assert.equal(client.createRoom(), true);
  ws.fire('message', { data: JSON.stringify({ type: 'joined', room: 'a'.repeat(24), playerId: 'b'.repeat(24), host: true }) });
  const packet = JSON.stringify({ type: 'action', data: { kind: 'fire' } });
  const packetBytes = new TextEncoder().encode(packet).byteLength;
  ws.bufferedAmount = 65536 - packetBytes + 1;
  assert.equal(client.sendAction({ kind: 'fire' }), false);
  assert.equal(ws.sent.filter(item => item.type === 'action').length, 0);
  ws.bufferedAmount = 65536 - packetBytes;
  assert.equal(client.sendAction({ kind: 'fire' }), true);
  assert.equal(ws.bufferedAmount, 65536);
  assert.equal(client.sendAction({ kind: 'fire' }), false);
  ws.bufferedAmount = 0;
  assert.equal(client.sendAction({ kind: 'fire' }), true);
  client.disconnect();
});
