import test from 'node:test';
import assert from 'node:assert/strict';
import { createCoopClient } from '../client.mjs';

class Socket {
  static OPEN = 1;
  static latest;
  constructor() { this.readyState = 0; this.listeners = {}; Socket.latest = this; }
  addEventListener(type, cb) { (this.listeners[type] ||= []).push(cb); }
  fire(type, payload = {}) { for (const cb of this.listeners[type] || []) cb(payload); }
  packet(value) { this.fire('message', { data: JSON.stringify(value) }); }
  send() {}
  close() { this.readyState = 3; this.fire('close'); }
}
const room = 'a'.repeat(24), self = 'b'.repeat(24), peer = 'c'.repeat(24);
function setup() {
  const events = [];
  const client = createCoopClient({ url: 'wss://example.org', WebSocketImpl: Socket, onEvent: e => events.push(e) });
  client.connect();
  const ws = Socket.latest;
  ws.readyState = 1; ws.fire('open');
  assert.equal(client.createRoom(), true);
  return { client, ws, events };
}
test('extended or malformed joined envelopes cannot establish membership', () => {
  const { client, ws, events } = setup();
  ws.packet({ type: 'joined', room, playerId: self, host: true, admin: true });
  ws.packet({ type: 'joined', room, playerId: self, host: 'true' });
  ws.packet({ type: 'joined', room, playerId: self, host: true, peerId: null });
  assert.equal(client.status.room, null);
  assert.equal(events.filter(e => e.packet?.type === 'joined').length, 0);
  ws.packet({ type: 'joined', room, playerId: self, host: true });
  assert.equal(client.status.room, room);
  client.disconnect();
});
test('host change requires an exact envelope for the local player', () => {
  const { client, ws, events } = setup();
  ws.packet({ type: 'joined', room, playerId: self, host: false, peerId: peer });
  ws.packet({ type: 'host_changed', playerId: self, elevated: true });
  ws.packet({ type: 'host_changed', playerId: peer });
  assert.equal(events.filter(e => e.packet?.type === 'host_changed').length, 0);
  ws.packet({ type: 'host_changed', playerId: self });
  assert.equal(events.filter(e => e.packet?.type === 'host_changed').length, 1);
  client.disconnect();
});
