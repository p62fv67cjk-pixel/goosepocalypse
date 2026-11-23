import test from 'node:test';
import assert from 'node:assert/strict';
import { createCoopClient } from '../client.mjs';

class Socket {
  static OPEN = 1;
  static latest;
  constructor() { this.readyState = 0; this.bufferedAmount = 0; this.listeners = {}; Socket.latest = this; }
  addEventListener(type, fn) { (this.listeners[type] ||= []).push(fn); }
  fire(type, payload = {}) { for (const fn of this.listeners[type] || []) fn(payload); }
  packet(packet) { this.fire('message', { data: JSON.stringify(packet) }); }
  send() {}
  close() { this.readyState = 3; this.fire('close'); }
}

test('state and action packets reject extra envelope fields but allow valid peer traffic', () => {
  const packets = [];
  const client = createCoopClient({
    url: 'wss://example.org', WebSocketImpl: Socket,
    onEvent: event => { if (event.type === 'packet') packets.push(event.packet); }
  });
  const room = 'a'.repeat(24), self = 'b'.repeat(24), peer = 'c'.repeat(24);
  client.connect();
  const ws = Socket.latest;
  ws.readyState = Socket.OPEN;
  ws.fire('open');
  assert.equal(client.createRoom(), true);
  ws.packet({ type: 'joined', room, playerId: self, host: true });
  ws.packet({ type: 'peer_joined', playerId: peer });
  ws.packet({ type: 'state', playerId: peer, data: { x: 1, z: 2 }, health: 0 });
  ws.packet({ type: 'action', playerId: peer, data: { jump: true }, admin: true });
  ws.packet({ type: 'state', playerId: peer, data: { x: 1, z: 2 } });
  ws.packet({ type: 'action', playerId: peer, data: { jump: true } });
  assert.deepEqual(packets.map(packet => packet.type), ['joined', 'peer_joined', 'state', 'action']);
  client.disconnect();
});
