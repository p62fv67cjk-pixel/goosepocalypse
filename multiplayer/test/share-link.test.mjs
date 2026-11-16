import test from 'node:test';
import assert from 'node:assert/strict';
import { createRoomInvite, readRoomInvite } from '../share-link.mjs';

const code = 'abcdef0123456789abcdef01';

test('creates an HTTPS room invitation without leaking prior query or fragment', () => {
  const invite = createRoomInvite('https://game.example/play?token=private#session', code);
  assert.equal(invite, 'https://game.example/play?room=' + code);
  assert.equal(readRoomInvite(invite), code);
});

test('rejects malformed, duplicated and insecure invitations', () => {
  for (const url of [
    'http://game.example/play?room=' + code,
    'https://game.example/play?room=invalid',
    'https://game.example/play?room=' + code + '&room=' + code,\n    'https://game.example/play?room=' + code + '&token=secret',\n    'https://game.example/play?token=secret&room=' + code,
    'https://user:secret@game.example/play?room=' + code,
    'not a url'
  ]) assert.equal(readRoomInvite(url), null);
  assert.throws(() => createRoomInvite('http://game.example', code), /HTTPS/);
  assert.throws(() => createRoomInvite('https://game.example', 'bad'), /room code/);
  assert.throws(() => createRoomInvite('https://user:secret@game.example', code), /Credential/);
});
