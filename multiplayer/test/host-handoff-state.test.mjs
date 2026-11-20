import test from 'node:test';
import assert from 'node:assert/strict';
import { createCoopClient } from '../client.mjs';

class Socket {
  static OPEN = 1;
  static current;
  constructor() { this.readyState = 0; this.bufferedAmount = 0; this.listeners = new Map(); Socket.current = this; }
  addEventListener(name, fn) { this.listeners.set(name, fn); }
  fire(name, payload = {}) { this.listeners.get(name)?.(payload); }
  open() { this.readyState = 1; this.fire('open'); }
  send() {}
  close() { this.readyState = 3; this.fire('close'); }
  packet(value) { this.fire('message', { data: JSON.stringify(value) }); }
}

const room = 'c'.repeat(24);
const host = 'a'.repeat(24);
const guest = 'b'.repeat(24);

test('guest becomes host after a validated host handoff and resets on disconnect', () => {
  const client = createCoopClient({ url: 'wss://example.org', WebSocketImpl: Socket });
  client.connect();
  const socket = Socket.current;
  socket.open();
  assert.equal(client.joinRoom(room), true);
  socket.packet({ type: 'joined', room, playerId: guest, host: false, peerId: host });
  assert.equal(client.status.isHost, false);
  socket.packet({ type: 'host_changed', playerId: host });
  assert.equal(client.status.isHost, false, 'foreign host announcement must not promote this player');
  socket.packet({ type: 'peer_left', playerId: host });
  socket.packet({ type: 'host_changed', playerId: guest });
  assert.equal(client.status.isHost, true);
  client.disconnect();
  assert.equal(client.status.isHost, false);
  client.connect();
  const second = Socket.current;
  second.open();
  assert.equal(client.createRoom(), true);
  second.packet({ type: 'joined', room, playerId: host, host: true });
  assert.equal(client.status.isHost, true);
  second.close();
  assert.equal(client.status.isHost, false);
});
