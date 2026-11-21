import test from 'node:test';
import assert from 'node:assert/strict';
import { createRoomShareLink, readRoomShareLink } from './share-link.mjs';

const room = '0123456789abcdef01234567';
test('share link preserves unrelated query parameters and strips fragments', () => {
  const link = createRoomShareLink(room, 'https://game.example/play?difficulty=hard#private');
  assert.equal(link, 'https://game.example/play?difficulty=hard&room=' + room);
  assert.equal(readRoomShareLink(link), room);
});
test('rejects malformed, duplicated, or injected room identifiers', () => {
  for (const value of ['', 'ABCDEF0123456789abcdef01', '../room', 'x'.repeat(24)])
    assert.throws(() => createRoomShareLink(value, 'https://game.example/'));
  assert.equal(readRoomShareLink('https://game.example/?room=' + room + '&room=' + room), null);
  assert.equal(readRoomShareLink('https://game.example/?room=%2Fadmin'), null);
});
test('rejects unsafe page URL schemes and embedded credentials', () => {
  for (const url of ['javascript:alert(1)', 'https://user:pass@game.example/', 'file:///index.html'])
    assert.throws(() => createRoomShareLink(room, url));
  assert.equal(readRoomShareLink('https://user:pass@game.example/?room=' + room), null);
});
