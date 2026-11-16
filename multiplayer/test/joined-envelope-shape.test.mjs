import test from 'node:test';
import assert from 'node:assert/strict';
import { createCoopClient } from '../client.mjs';

class Socket {
  static OPEN = 1;
  constructor() { this.readyState = 0; this.handlers = new Map(); }
  addEventListener(type, fn) { this.handlers.set(type, fn); }
  open() { this.readyState = 1; this.handlers.get('open')?.(); }
  send() {}
  close() { this.readyState = 3; this.handlers.get('close')?.(); }
  receive(packet) { this.handlers.get('message')?.({ data: JSON.stringify(packet) }); }
}

test('joined envelope requires explicit host role and operation-specific peer identity', () => {
  for (const operation of ['create', 'join']) {
    let socket;
    class FakeSocket extends Socket { constructor() { super(); socket = this; } }
    const client = createCoopClient({ url: 'wss://relay.example', WebSocketImpl: FakeSocket });
    const room = 'a'.repeat(24), playerId = 'b'.repeat(24), peerId = 'c'.repeat(24);
    client.connect();
    socket.open();
    assert.equal(operation === 'create' ? client.createRoom() : client.joinRoom(room), true);
    const valid = { type: 'joined', room, playerId, host: operation === 'create' };
    if (operation === 'join') valid.peerId = peerId;
    const missingRole = { ...valid };
    delete missingRole.host;
    socket.receive(missingRole);
    assert.equal(client.status.room, null, 'missing host role must not join');
    const invalidPeer = { ...valid };
    if (operation === 'create') invalidPeer.peerId = peerId;
    else delete invalidPeer.peerId;
    socket.receive(invalidPeer);
    assert.equal(client.status.room, null, 'unexpected or missing peer ID must not join');
    socket.receive(valid);
    assert.equal(client.status.room, room, 'valid acknowledgement should still join');
    client.disconnect();
  }
});
