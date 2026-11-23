import test from 'node:test';
import assert from 'node:assert/strict';
import { createRoomInvite, readRoomInvite } from './share-link.mjs';

const room = '0123456789abcdef01234567';
test('invitation strips private query parameters and uses fragment only', () => {
  const link = createRoomInvite('https://game.example/play?token=secret#private', room);
  assert.equal(link, 'https://game.example/play#coop=' + room);
  assert.equal(readRoomInvite(link), room);
});
test('rejects malformed, duplicated, or injected room identifiers', () => {
  for (const value of ['', 'ABCDEF0123456789abcdef01', '../room', 'x'.repeat(24)])
    assert.throws(() => createRoomInvite('https://game.example/', value));
  for (const link of [
    'https://game.example/#coop=' + room + '&coop=' + room,
    'https://game.example/#coop=%2Fadmin',
    'https://game.example/?room=' + room,
    'https://game.example/?token=secret#coop=' + room,
    'https://game.example/#coop=' + room + '&token=secret'
  ]) assert.equal(readRoomInvite(link), null);
});
test('rejects unsafe URLs and embedded credentials', () => {
  for (const url of ['javascript:alert(1)', 'https://user:pass@game.example/', 'http://game.example/'])
    assert.throws(() => createRoomInvite(url, room));
  assert.equal(readRoomInvite('https://user:pass@game.example/#coop=' + room), null);
  assert.equal(readRoomInvite('http://game.example/#coop=' + room), null);
});
