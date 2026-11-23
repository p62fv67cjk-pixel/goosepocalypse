import test from 'node:test';
import assert from 'node:assert/strict';
import { createRoomInvite, readRoomInvite } from '../share-link.mjs';

const code = 'abcdef0123456789abcdef01';

test('creates an HTTPS room invitation without leaking prior query or fragment', () => {
  const invite = createRoomInvite('https://game.example/play?token=private#session', code);
  assert.equal(invite, 'https://game.example/play#coop=' + code);
  assert.equal(readRoomInvite(invite), code);
});

test('rejects malformed, duplicated and insecure invitations', () => {
  for (const url of [
    'http://game.example/play#coop=' + code,
    'https://game.example/play#coop=invalid',
    'https://game.example/play#coop=' + code + '&coop=' + code,
    'https://game.example/play?token=secret#coop=' + code,
    'https://game.example/play#access_token=secret',
    'https://game.example/play#room=' + code,
    'https://game.example/play?room=' + code,
    'https://user:secret@game.example/play#coop=' + code,
    'not a url'
  ]) assert.equal(readRoomInvite(url), null);
  assert.throws(() => createRoomInvite('http://game.example', code), /game URL/);
  assert.throws(() => createRoomInvite('https://game.example', 'bad'), /room code/);
  assert.throws(() => createRoomInvite('https://user:secret@game.example', code), /game URL/);
});
