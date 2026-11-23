import test from 'node:test';
import assert from 'node:assert/strict';
import { createCoopClient } from '../client.mjs';

class FakeSocket {
  static OPEN = 1;
  static instances = [];
  constructor(url) {
    this.url = url;
    this.readyState = 0;
    this.bufferedAmount = 0;
    this.sent = [];
    this.listeners = new Map();
    FakeSocket.instances.push(this);
  }
  addEventListener(type, handler) {
    const handlers = this.listeners.get(type) || [];
    handlers.push(handler);
    this.listeners.set(type, handlers);
  }
  dispatch(type, event = {}) {
    for (const handler of this.listeners.get(type) || []) handler(event);
  }
  open() { this.readyState = 1; this.dispatch('open'); }
  message(packet) { this.dispatch('message', { data: JSON.stringify(packet) }); }
  send(payload) { this.sent.push(JSON.parse(payload)); }
  close() { this.readyState = 3; this.dispatch('close'); }
}

const room = 'a'.repeat(24);
const playerId = 'b'.repeat(24);
const peerId = 'c'.repeat(24);
function connectedClient(clock) {
  FakeSocket.instances.length = 0;
  const events = [];
  const client = createCoopClient({
    url: 'wss://relay.example.test',
    WebSocketImpl: FakeSocket,
    now: () => clock.value,
    onEvent: event => events.push(event),
  });
  client.connect();
  const socket = FakeSocket.instances.at(-1);
  socket.open();
  assert.equal(client.createRoom(), true);
  socket.message({ type: 'joined', room, playerId, host: true });
  assert.equal(client.status.room, room);
  return { client, socket, events };
}

test('state snapshots are throttled without flooding a 60fps render loop', () => {
  const clock = { value: 1000 };
  const { client, socket } = connectedClient(clock);
  assert.equal(client.sendState({ x: 1, z: 2 }), true);
  clock.value = 1016;
  assert.equal(client.sendState({ x: 2, z: 3 }), false);
  clock.value = 1100;
  assert.equal(client.sendState({ x: 3, z: 4 }), true);
  assert.equal(socket.sent.filter(packet => packet.type === 'state').length, 2);
});

test('mobile socket backpressure rejects snapshots without consuming the throttle budget', () => {
  const clock = { value: 1000 };
  const { client, socket } = connectedClient(clock);
  socket.bufferedAmount = 65536;
  assert.equal(client.sendState({ x: 1, z: 2 }), false);
  socket.bufferedAmount = 0;
  assert.equal(client.sendState({ x: 1, z: 2 }), true);
});

test('disconnect clears room state and ignores delayed messages from old sockets', () => {
  const clock = { value: 1000 };
  const { client, socket, events } = connectedClient(clock);
  client.disconnect();
  assert.equal(client.status.room, null);
  assert.equal(client.status.connected, false);
  const before = events.length;
  socket.message({ type: 'peer_joined', playerId: peerId });
  assert.equal(events.length, before);
  assert.equal(client.sendState({ x: 1, z: 2 }), false);
});

test('only the announced teammate may send gameplay snapshots', () => {
  const clock = { value: 1000 };
  const { socket, events } = connectedClient(clock);
  socket.message({ type: 'state', playerId: peerId, data: { x: 1, z: 2 } });
  assert.equal(events.filter(event => event.packet?.type === 'state').length, 0);
  socket.message({ type: 'peer_joined', playerId: peerId });
  socket.message({ type: 'state', playerId: peerId, data: { x: 1, z: 2 } });
  assert.equal(events.filter(event => event.packet?.type === 'state').length, 1);
});
