import test from 'node:test';
import assert from 'node:assert/strict';
import { createCoopClient } from '../client.mjs';

class FakeSocket { static OPEN = 1; }

test('relay endpoints must be valid secure URLs without embedded credentials or fragments', () => {
  for (const url of [
    'wss://', 'wss:///missing-host', 'ws://relay.example',
    'wss://user:password@relay.example', 'wss://relay.example/#secret',
    'wss://relay.example/#access_token=private', 'https://relay.example'
  ]) {
    assert.throws(() => createCoopClient({ url, WebSocketImpl: FakeSocket }), /wss:\/\//, url);
  }
  assert.doesNotThrow(() => createCoopClient({ url: 'wss://relay.example/socket', WebSocketImpl: FakeSocket }));
});
