import test from 'node:test';
import assert from 'node:assert/strict';
import { createCoopClient } from '../client.mjs';

class FakeSocket {
  static OPEN = 1;
  static instances = [];
  constructor(url) { this.url = url; this.readyState = 0; this.listeners = new Map(); this.sent = []; FakeSocket.instances.push(this); }
  addEventListener(type, handler) { const handlers = this.listeners.get(type) || []; handlers.push(handler); this.listeners.set(type, handlers); }
  fire(type, data = {}) { for (const handler of this.listeners.get(type) || []) handler(data); }
  open() { this.readyState = 1; this.fire('open'); }
  send(value) { this.sent.push(JSON.parse(value)); }
  close() { this.readyState = 3; this.fire('close'); }
  packet(packet) { this.fire('message', { data: JSON.stringify(packet) }); }
}
const idA = 'a'.repeat(24), idB = 'b'.repeat(24), room = 'c'.repeat(24);
test('rejects insecure endpoints and unavailable sockets', () => {
  assert.throws(() => createCoopClient({ url: 'ws://example.org', WebSocketImpl: FakeSocket }), /wss/);
  assert.throws(() => createCoopClient({ url: 'wss://example.org', WebSocketImpl: null }), /unavailable/);
});
test('creates and joins real rooms, relays state and limits revive to connected teammate', () => {
  const events = [];
  const client = createCoopClient({ url: 'wss://example.org', WebSocketImpl: FakeSocket, onEvent: e => events.push(e) });
  client.connect();
  const ws = FakeSocket.instances.at(-1);
  assert.equal(client.createRoom(), false);
  ws.open();
  assert.equal(client.createRoom(), true);
  assert.deepEqual(ws.sent.at(-1), { type: 'create' });
  ws.packet({ type: 'joined', room, playerId: idA, host: true });
  assert.equal(client.status.room, room);
  assert.equal(client.revive(idB), false);
  ws.packet({ type: 'peer_joined', playerId: idB });
  assert.equal(client.revive(idB), true);
  assert.deepEqual(ws.sent.at(-1), { type: 'revive', data: { targetId: idB } });
  assert.equal(client.sendState({ x: 2, z: 3 }), true);
  assert.deepEqual(ws.sent.at(-1), { type: 'state', data: { x: 2, z: 3 } });
  ws.packet({ type: 'peer_left', playerId: idB });
  assert.equal(client.revive(idB), false);
  assert.ok(events.some(e => e.type === 'packet'));
});
test('ignores stale sockets after reconnect and clears room state on disconnect', () => {
  const events = [];
  const client = createCoopClient({ url: 'wss://example.org', WebSocketImpl: FakeSocket, onEvent: e => events.push(e) });
  client.connect();
  const first = FakeSocket.instances.at(-1);
  first.open();
  first.packet({ type: 'joined', room, playerId: idA });
  client.disconnect();
  assert.equal(client.status.room, null);
  assert.equal(client.status.connected, false);
  client.connect();
  const second = FakeSocket.instances.at(-1);
  second.open();
  first.packet({ type: 'joined', room, playerId: idA });
  first.fire('close');
  assert.equal(client.status.room, null);
  second.packet({ type: 'joined', room, playerId: idB });
  assert.equal(client.status.playerId, idB);
  second.close();
  assert.equal(client.status.room, null);
  assert.equal(events.filter(e => e.type === 'disconnected').length, 1);
});
test('rejects malformed inbound packets and room codes without sending', () => {
  const client = createCoopClient({ url: 'wss://example.org', WebSocketImpl: FakeSocket });
  client.connect();
  const ws = FakeSocket.instances.at(-1);
  ws.open();
  assert.equal(client.joinRoom('invalid'), false);
  assert.equal(ws.sent.length, 0);
  ws.fire('message', { data: '{' });
  ws.fire('message', { data: JSON.stringify({ type: 'joined', room: 'bad', playerId: idA }) });
  assert.equal(client.status.room, null);
  assert.equal(client.joinRoom(room), true);
  assert.deepEqual(ws.sent.at(-1), { type: 'join', room });
});

test('does not send gameplay before joining and rejects forged teammate identities', () => {
  const client = createCoopClient({ url: 'wss://example.org', WebSocketImpl: FakeSocket });
  client.connect();
  const ws = FakeSocket.instances.at(-1);
  ws.open();
  assert.equal(client.sendState({ x: 1 }), false);
  assert.equal(client.sendAction({ kind: 'fire' }), false);
  ws.packet({ type: 'peer_joined', playerId: idB });
  assert.equal(client.status.peerId, null);
  ws.packet({ type: 'joined', room, playerId: idA, peerId: 'invalid' });
  assert.equal(client.status.room, null);
  ws.packet({ type: 'joined', room, playerId: idA });
  ws.packet({ type: 'peer_joined', playerId: 'invalid' });
  ws.packet({ type: 'peer_joined', playerId: idA });
  assert.equal(client.status.peerId, null);
  ws.packet({ type: 'peer_joined', playerId: idB });
  assert.equal(client.status.peerId, idB);
  assert.equal(client.sendAction({ kind: 'fire' }), true);
  assert.equal(ws.sent.length, 1);
  ws.close();
  assert.equal(client.sendState({ x: 1 }), false);
});

test('joined packets cannot replace established identity or assign self as peer', () => {
  const client = createCoopClient({ url: 'wss://example.org', WebSocketImpl: FakeSocket });
  client.connect();
  const ws = FakeSocket.instances.at(-1);
  ws.open();
  ws.packet({ type: 'joined', room, playerId: idA, peerId: idA });
  assert.equal(client.status.room, null);
  ws.packet({ type: 'joined', room, playerId: idA, peerId: idB });
  assert.equal(client.status.playerId, idA);
  assert.equal(client.status.peerId, idB);
  ws.packet({ type: 'joined', room: 'd'.repeat(24), playerId: idB });
  assert.equal(client.status.room, room);
  assert.equal(client.status.playerId, idA);
  assert.equal(client.status.peerId, idB);
  ws.close();
});

test('conflicting peer announcements and stale departures cannot replace active teammate', () => {
  const events = [];
  const client = createCoopClient({ url: 'wss://example.org', WebSocketImpl: FakeSocket, onEvent: e => events.push(e) });
  client.connect();
  const ws = FakeSocket.instances.at(-1);
  ws.open();
  ws.packet({ type: 'joined', room, playerId: idA, peerId: idB });
  const thirdId = 'd'.repeat(24);
  const before = events.length;
  ws.packet({ type: 'peer_joined', playerId: thirdId });
  ws.packet({ type: 'peer_left', playerId: thirdId });
  assert.equal(client.status.peerId, idB);
  assert.equal(events.length, before);
  assert.equal(client.revive(idB), true);
  assert.equal(client.revive(thirdId), false);
  ws.packet({ type: 'peer_left', playerId: idB });
  assert.equal(client.status.peerId, null);
  ws.packet({ type: 'peer_joined', playerId: thirdId });
  assert.equal(client.status.peerId, thirdId);
  ws.close();
});
