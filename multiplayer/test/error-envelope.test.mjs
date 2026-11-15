import test from 'node:test';
import assert from 'node:assert/strict';
import { createCoopClient } from '../client.mjs';

class Socket {
  static OPEN = 1;
  static latest;
  constructor() { this.readyState = 0; this.handlers = {}; Socket.latest = this; }
  addEventListener(type, fn) { (this.handlers[type] ||= []).push(fn); }
  fire(type, payload = {}) { for (const fn of this.handlers[type] || []) fn(payload); }
  packet(value) { this.fire('message', { data: JSON.stringify(value) }); }
  send() {}
  close() { this.readyState = 3; this.fire('close'); }
}
const room = 'a'.repeat(24), self = 'b'.repeat(24), peer = 'c'.repeat(24);

test('malformed relay errors cannot unlock room requests', () => {
  const events = [];
  const client = createCoopClient({ url: 'wss://example.org', WebSocketImpl: Socket, onEvent: e => events.push(e) });
  client.connect();
  const socket = Socket.latest;
  socket.readyState = Socket.OPEN;
  socket.fire('open');
  assert.equal(client.joinRoom(room), true);
  for (const packet of [
    { type: 'error', code: 'room_not_found', room },
    { type: 'error', code: 'room_not_found', data: { retry: true } },
    { type: 'error', code: 5 },
    { type: 'error', code: 'room_not_found!', },
  ]) socket.packet(packet);
  assert.equal(client.joinRoom(room), false, 'malformed error cannot release pending join');
  assert.equal(events.filter(e => e.packet?.type === 'error').length, 0);
  socket.packet({ type: 'error', code: 'room_not_found' });
  assert.equal(client.joinRoom(room), true, 'documented error allows retry');
  client.disconnect();
});

test('malformed relay errors cannot cancel pending revival', () => {
  let time = 1000;
  const client = createCoopClient({ url: 'wss://example.org', WebSocketImpl: Socket, now: () => time });
  client.connect();
  const socket = Socket.latest;
  socket.readyState = Socket.OPEN;
  socket.fire('open');
  assert.equal(client.createRoom(), true);
  socket.packet({ type: 'joined', room, playerId: self });
  socket.packet({ type: 'peer_joined', playerId: peer });
  assert.equal(client.revive(peer), true);
  socket.packet({ type: 'error', code: 'revive_not_allowed', data: { downed: false } });
  assert.equal(client.revive(peer), false);
  socket.packet({ type: 'error', code: 'revive_not_allowed' });
  assert.equal(client.revive(peer), true);
  client.disconnect();
});
