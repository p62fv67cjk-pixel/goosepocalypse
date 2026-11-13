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
  assert.equal(events.filter(e => e.type === 'disconnected').length, 1, 'explicit disconnect must clear teammate UI immediately');
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
  assert.equal(events.filter(e => e.type === 'disconnected').length, 2, 'stale socket close must not emit an extra disconnect');
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

test('outbound packets fail safely on cycles, oversized data and socket send errors', () => {
  const client = createCoopClient({ url: 'wss://example.org', WebSocketImpl: FakeSocket });
  client.connect();
  const ws = FakeSocket.instances.at(-1);
  ws.open();
  ws.packet({ type: 'joined', room, playerId: idA });
  const cyclic = {};
  cyclic.self = cyclic;
  assert.equal(client.sendAction(cyclic), false);
  assert.equal(client.sendAction({ note: 'x'.repeat(3000) }), false);
  assert.equal(ws.sent.length, 0);
  ws.send = () => { throw new Error('Socket closing'); };
  assert.equal(client.sendState({ x: 1, z: 2 }), false);
  ws.close();
});

test('does not surface gameplay packets before a room is joined', () => {
  const events = [];
  const client = createCoopClient({ url: 'wss://example.org', WebSocketImpl: FakeSocket, onEvent: e => events.push(e) });
  client.connect();
  const ws = FakeSocket.instances.at(-1);
  ws.open();
  ws.packet({ type: 'state', playerId: idB, data: { x: 2 } });
  ws.packet({ type: 'action', playerId: idB, data: { kind: 'fire' } });
  ws.packet({ type: 'revived', playerId: idB });
  assert.equal(events.filter(e => e.type === 'packet').length, 0);
  ws.packet({ type: 'error', message: 'room unavailable' });
  assert.equal(events.filter(e => e.type === 'packet').length, 1);
  ws.packet({ type: 'joined', room, playerId: idA });
  ws.packet({ type: 'peer_joined', playerId: idB });
  ws.packet({ type: 'state', playerId: idB, data: { x: 2 } });
  assert.equal(events.filter(e => e.type === 'packet').length, 4);
  ws.close();
});

test('accepts gameplay only from the currently connected teammate', () => {
  const events = [];
  const client = createCoopClient({ url: 'wss://example.org', WebSocketImpl: FakeSocket, onEvent: e => events.push(e) });
  client.connect();
  const ws = FakeSocket.instances.at(-1);
  ws.open();
  ws.packet({ type: 'joined', room, playerId: idA });
  const gameplay = () => events.filter(e => e.type === 'packet' && ['state', 'action', 'revive'].includes(e.packet.type));
  ws.packet({ type: 'state', playerId: idB, data: { x: 1, z: 2 } });
  assert.equal(gameplay().length, 0);
  ws.packet({ type: 'peer_joined', playerId: idB });
  ws.packet({ type: 'state', playerId: idA, data: { x: 1, z: 2 } });
  ws.packet({ type: 'action', playerId: 'd'.repeat(24), data: { kind: 'fire' } });
  assert.equal(gameplay().length, 0);
  ws.packet({ type: 'state', playerId: idB, data: { x: 1, z: 2 } });
  ws.packet({ type: 'action', playerId: idB, data: { kind: 'fire' } });
  assert.equal(gameplay().length, 2);
  ws.packet({ type: 'peer_left', playerId: idB });
  ws.packet({ type: 'revive', playerId: idB, data: { targetId: idA } });
  assert.equal(gameplay().length, 2);
  ws.close();
});
