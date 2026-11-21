import assert from 'node:assert/strict';
import test from 'node:test';
import { createCoopClient } from '../multiplayer/client.mjs';

test('a throwing WebSocket bufferedAmount getter cannot crash lobby sends', () => {
  class BrokenQueueSocket {
    static OPEN = 1;
    constructor() { this.readyState = 1; this.listeners = new Map(); }
    addEventListener(type, callback) { this.listeners.set(type, callback); }
    get bufferedAmount() { throw new Error('socket queue inaccessible'); }
    send() { throw new Error('must not send when queue cannot be checked'); }
    close() { this.readyState = 3; }
  }
  const client = createCoopClient({
    url: 'wss://example.org/relay',
    WebSocketImpl: BrokenQueueSocket
  });
  client.connect();
  assert.doesNotThrow(() => assert.equal(client.createRoom(), false));
  assert.equal(client.status.room, null);
  client.disconnect();
});
