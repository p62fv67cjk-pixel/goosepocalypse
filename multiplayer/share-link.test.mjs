import test from 'node:test';
import assert from 'node:assert/strict';
import { createRoomInvite, readRoomInvite } from './share-link.mjs';

const room = '0123456789abcdef01234567';
test('invite strips private URL parameters and fragments', () => {
  const link = createRoomInvite('https://game.example/play?token=secret#private', room);
  assert.equal(link, 'https://game.example/play?room=' + room);
  assert.equal(readRoomInvite(link), room);
});
test('rejects malformed, duplicated, or injected room identifiers', () => {
  for (const value of ['', 'ABCDEF0123456789abcdef01', '../room', 'x'.repeat(24)])
    assert.throws(() => createRoomInvite('https://game.example/', value));
  assert.equal(readRoomInvite('https://game.example/?room=' + room + '&room=' + room), null);
  assert.equal(readRoomInvite('https://game.example/?room=%2Fadmin'), null);
  assert.equal(readRoomInvite('https://game.example/?room=' + room + '&token=secret'), null);
});
test('rejects unsafe URLs and embedded credentials', () => {
  for (const url of ['javascript:alert(1)', 'https://user:pass@game.example/', 'http://game.example/'])
    assert.throws(() => createRoomInvite(url, room));
  assert.equal(readRoomInvite('https://user:pass@game.example/?room=' + room), null);
  assert.equal(readRoomInvite('https://game.example/?room=' + room + '#private'), null);
});
