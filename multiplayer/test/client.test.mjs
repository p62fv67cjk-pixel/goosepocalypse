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
  ws.packet({ type: 'state', playerId: idB, data: { x: 2, z: 0 } });
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

test('outbound size limit counts UTF-8 bytes rather than JavaScript characters', () => {
  const client = createCoopClient({ url: 'wss://example.org', WebSocketImpl: FakeSocket });
  client.connect();
  const ws = FakeSocket.instances.at(-1);
  ws.open();
  ws.packet({ type: 'joined', room, playerId: idA });
  // A surrogate-pair emoji is two UTF-16 code units but four UTF-8 bytes.
  // This packet is below 2048 JS characters yet exceeds the relay's byte limit.
  const unicodePacket = { type: 'action', data: { note: '🪿'.repeat(650) } };
  assert.ok(JSON.stringify(unicodePacket).length < 2048);
  assert.ok(Buffer.byteLength(JSON.stringify(unicodePacket), 'utf8') > 2048);
  assert.equal(client.sendAction(unicodePacket.data), false);
  assert.equal(ws.sent.length, 0);
  assert.equal(client.sendAction({ kind: 'fire' }), true);
  assert.equal(ws.sent.length, 1);
  ws.close();
});

test('ignores undocumented relay events and oversized UTF-8 inbound messages', () => {
  const events = [];
  const client = createCoopClient({ url: 'wss://example.org', WebSocketImpl: FakeSocket, onEvent: e => events.push(e) });
  client.connect();
  const ws = FakeSocket.instances.at(-1);
  ws.open();
  ws.packet({ type: 'joined', room, playerId: idA });
  const before = events.length;
  ws.packet({ type: 'future_untrusted_command', data: { kind: 'revive' } });
  assert.equal(events.length, before);
  // 1100 goose emoji occupy 4400 UTF-8 bytes, despite 2200 UTF-16 code units.
  ws.packet({ type: 'error', message: '🪿'.repeat(1100) });
  assert.equal(events.length, before);
  ws.packet({ type: 'error', code: 'room_full' });
  assert.equal(events.length, before + 1);
  ws.close();
});


test('rejects malformed teammate snapshots and revives not addressed to this player', () => {
  const events = [];
  const client = createCoopClient({ url: 'wss://example.org', WebSocketImpl: FakeSocket, onEvent: e => events.push(e) });
  client.connect();
  const ws = FakeSocket.instances.at(-1);
  ws.open();
  ws.packet({ type: 'joined', room, playerId: idA, peerId: idB });
  const gameplay = () => events.filter(e => e.type === 'packet' && ['state', 'revive'].includes(e.packet.type));
  ws.packet({ type: 'state', playerId: idB, data: { x: 1 } });
  ws.packet({ type: 'state', playerId: idB, data: { x: 1, z: 2, health: 101 } });
  ws.packet({ type: 'state', playerId: idB, data: { x: 1, z: 2, nested: { unsafe: true } } });
  ws.packet({ type: 'state', playerId: idB, data: { x: 1, z: 2, downed: 'false' } });
  ws.packet({ type: 'revive', playerId: idB, data: { targetId: idB } });
  ws.packet({ type: 'revive', playerId: idB, data: { targetId: idA, extra: true } });
  assert.equal(gameplay().length, 0);
  ws.packet({ type: 'state', playerId: idB, data: { x: 1, z: 2, y: 0, downed: true } });
  ws.packet({ type: 'revive', playerId: idB, data: { targetId: idA } });
  assert.equal(gameplay().length, 2);
  ws.close();
});

test('outgoing state rejects malformed snapshots without sending to relay', () => {
  const client = createCoopClient({ url: 'wss://example.org', WebSocketImpl: FakeSocket });
  client.connect();
  const ws = FakeSocket.instances.at(-1);
  ws.open();
  ws.packet({ type: 'joined', room, playerId: idA });
  const invalid = [
    null, [], { x: 1 }, { x: NaN, z: 2 }, { x: Infinity, z: 2 },
    { x: 10001, z: 0 }, { x: 1, z: 2, y: Infinity },
    { x: 1, z: 2, health: -1 }, { x: 1, z: 2, downed: 'false' },
    { x: 1, z: 2, nested: {} }
  ];
  for (const data of invalid) assert.equal(client.sendState(data), false);
  assert.equal(ws.sent.length, 0);
  assert.equal(client.sendState({ x: 1, y: 0, z: 2, yaw: 1, health: 50, downed: false }), true);
  assert.equal(ws.sent.length, 1);
  ws.close();
});


test('outbound actions follow relay primitive field limits', () => {
  const client = createCoopClient({ url: 'wss://example.org', WebSocketImpl: FakeSocket });
  client.connect();
  const ws = FakeSocket.instances.at(-1);
  ws.open();
  ws.packet({ type: 'joined', room, playerId: idA });
  const invalid = [null, [], { nested: {} }, { note: 'x'.repeat(65) },
    { 'bad-key': 1 }, { a: Infinity }, { a: 10001 },
    { a: 1, b: 1, c: 1, d: 1, e: 1, f: 1, g: 1, h: 1, i: 1 }];
  for (const data of invalid) assert.equal(client.sendAction(data), false);
  assert.equal(ws.sent.length, 0);
  assert.equal(client.sendAction({ kind: 'fire', held: false, angle: 1.5 }), true);
  assert.deepEqual(ws.sent[0], { type: 'action', data: { kind: 'fire', held: false, angle: 1.5 } });
  ws.close();
});

test('rejects malformed inbound teammate actions before gameplay dispatch', () => {
  const events = [];
  const client = createCoopClient({ url: 'wss://example.org', WebSocketImpl: FakeSocket, onEvent: e => events.push(e) });
  client.connect();
  const ws = FakeSocket.instances.at(-1);
  ws.open();
  ws.packet({ type: 'joined', room, playerId: idA, peerId: idB });
  const actions = () => events.filter(e => e.type === 'packet' && e.packet.type === 'action');
  for (const data of [null, [], { nested: {} }, { note: 'x'.repeat(65) },
    { 'bad-key': true }, { angle: 10001 }, { angle: 'x', extra: [] },
    { a: 1, b: 1, c: 1, d: 1, e: 1, f: 1, g: 1, h: 1, i: 1 }]) {
    ws.packet({ type: 'action', playerId: idB, data });
  }
  assert.equal(actions().length, 0);
  ws.packet({ type: 'action', playerId: idB, data: { kind: 'fire', held: true, angle: 0.5 } });
  assert.equal(actions().length, 1);
  ws.close();
});

test('throttles 60fps state snapshots without disconnecting and resets on rejoin', () => {
  let time = 1000;
  const client = createCoopClient({ url: 'wss://example.org', WebSocketImpl: FakeSocket, now: () => time });
  client.connect();
  const first = FakeSocket.instances.at(-1);
  first.open();
  first.packet({ type: 'joined', room, playerId: idA });
  let accepted = 0;
  for (let frame = 0; frame < 60; frame++) {
    if (client.sendState({ x: frame, z: 0 })) accepted++;
    time += 1000 / 60;
  }
  assert.ok(accepted >= 9 && accepted <= 11, 'only ~10 updates per second should reach relay');
  assert.equal(first.sent.length, accepted);
  client.disconnect();
  client.connect();
  const second = FakeSocket.instances.at(-1);
  second.open();
  second.packet({ type: 'joined', room, playerId: idB });
  assert.equal(client.sendState({ x: 0, z: 0 }), true, 'new room gets an immediate snapshot');
  assert.equal(client.sendState({ x: 1, z: 0 }), false, 'consecutive snapshots are throttled');
  time += 100;
  assert.equal(client.sendState({ x: 2, z: 0 }), true);
  second.close();
});

test('failed state sends do not consume the next throttle slot', () => {
  let time = 1000;
  const client = createCoopClient({ url: 'wss://example.org', WebSocketImpl: FakeSocket, now: () => time });
  client.connect();
  const ws = FakeSocket.instances.at(-1);
  ws.open();
  ws.packet({ type: 'joined', room, playerId: idA });
  const original = ws.send;
  ws.send = () => { throw new Error('temporary send failure'); };
  assert.equal(client.sendState({ x: 1, z: 0 }), false);
  ws.send = original;
  assert.equal(client.sendState({ x: 1, z: 0 }), true);
  ws.close();
});

test('ignores forged revive acknowledgements and host changes', () => {
  const events = [];
  const client = createCoopClient({
    url: 'wss://example.org', WebSocketImpl: FakeSocket,
    onEvent: event => events.push(event)
  });
  client.connect();
  const ws = FakeSocket.instances.at(-1);
  ws.open();
  ws.packet({ type: 'joined', room, playerId: idA, host: true });
  ws.packet({ type: 'peer_joined', playerId: idB });
  const packets = () => events.filter(event => event.type === 'packet').map(event => event.packet);
  const before = packets().length;
  ws.packet({ type: 'revive_accepted', targetId: idA });
  ws.packet({ type: 'revive_accepted', targetId: 'd'.repeat(24) });
  ws.packet({ type: 'host_changed', playerId: idB });
  assert.equal(packets().length, before, 'forged control messages must not reach UI');
  ws.packet({ type: 'revive_accepted', targetId: idB });
  ws.packet({ type: 'host_changed', playerId: idA });
  assert.deepEqual(packets().slice(-2).map(packet => packet.type),
    ['revive_accepted', 'host_changed']);
  ws.packet({ type: 'peer_left', playerId: idB });
  const afterLeave = packets().length;
  ws.packet({ type: 'revive_accepted', targetId: idB });
  assert.equal(packets().length, afterLeave, 'departed teammate cannot be revived');
});

test('recovers state pacing after a backwards mobile clock adjustment', () => {
  let time = 10000;
  const client = createCoopClient({ url: 'wss://example.org', WebSocketImpl: FakeSocket, now: () => time });
  client.connect();
  const ws = FakeSocket.instances.at(-1);
  ws.open();
  ws.packet({ type: 'joined', room, playerId: idA });
  assert.equal(client.sendState({ x: 0, z: 0 }), true);
  time = 100;
  assert.equal(client.sendState({ x: 1, z: 0 }), true, 'clock rollback must not freeze state for seconds');
  assert.equal(client.sendState({ x: 2, z: 0 }), false, 'pacing must resume immediately');
  time = 200;
  assert.equal(client.sendState({ x: 3, z: 0 }), true);
  assert.equal(ws.sent.length, 3);
  ws.close();
});
