import test from 'node:test';
import assert from 'node:assert/strict';
import { createCoopClient } from '../client.mjs';

class FakeSocket {
  static OPEN = 1;
  constructor() { this.readyState = 0; this.handlers = new Map(); }
  addEventListener(type, handler) { this.handlers.set(type, handler); }
  open() { this.readyState = 1; this.handlers.get('open')?.(); }
  send() {}
  close() { this.readyState = 3; this.handlers.get('close')?.(); }
  receive(packet) { this.handlers.get('message')?.({ data: JSON.stringify(packet) }); }
}

test('create and join acknowledgements cannot claim the opposite host role', () => {
  for (const operation of ['create', 'join']) {
    let socket;
    class Socket extends FakeSocket { constructor() { super(); socket = this; } }
    const client = createCoopClient({ url: 'wss://relay.example', WebSocketImpl: Socket });
    const room = 'a'.repeat(24), playerId = 'b'.repeat(24), peerId = 'c'.repeat(24);
    client.connect();
    socket.open();
    if (operation === 'create') assert.equal(client.createRoom(), true);
    else assert.equal(client.joinRoom(room), true);
    const joined = { type: 'joined', room, playerId, host: operation !== 'create' };
    if (operation === 'join') joined.peerId = peerId;
    socket.receive(joined);
    assert.equal(client.status.room, null, 'mismatched role must not establish membership');
    joined.host = operation === 'create';
    socket.receive(joined);
    assert.equal(client.status.room, room, 'corrected acknowledgement can establish membership');
    client.disconnect();
  }
});
