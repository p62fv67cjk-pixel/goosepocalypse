import test from 'node:test';
import assert from 'node:assert/strict';
import { createCoopClient } from '../client.mjs';

test('connect uses the validated WSS URL even when a URL-like input changes', () => {
  const addresses = ['wss://relay.example.test/room', 'ws://attacker.example.test/room'];
  let reads = 0;
  const input = { toString() { return addresses[Math.min(reads++, addresses.length - 1)]; } };
  const opened = [];
  class Socket {
    constructor(address) { opened.push(address); this.readyState = 0; }
    addEventListener() {}
    close() {}
  }
  const client = createCoopClient({ url: input, WebSocketImpl: Socket });
  client.connect();
  assert.equal(opened.length, 1);
  assert.equal(opened[0], 'wss://relay.example.test/room');
  assert.equal(reads, 1, 'the untrusted URL-like value must only be read during validation');
  client.disconnect();
});

test('rejects an insecure URL before constructing any socket', () => {
  let constructed = false;
  class Socket { constructor() { constructed = true; } }
  assert.throws(() => createCoopClient({ url: 'ws://relay.example.test', WebSocketImpl: Socket }), /wss:\/\//);
  assert.equal(constructed, false);
});
