import test from 'node:test';
import assert from 'node:assert/strict';
import { makeInviteLink, readInviteRoom } from './invite-link.mjs';

const room = '0123456789abcdef01234567';

test('canonical invite removes sensitive query and replaces fragment', () => {
  const url = makeInviteLink('https://game.example/play?access_token=secret#old', room);
  assert.equal(url, 'https://game.example/play#coop=' + room);
  assert.equal(readInviteRoom(url), room);
});

test('reader refuses query-bearing invite even with valid room fragment', () => {
  assert.equal(readInviteRoom('https://game.example/play?access_token=secret#coop=' + room), null);
});

test('rejects credentials, malformed rooms, and duplicate fragment keys', () => {
  assert.throws(() => makeInviteLink('https://user:pass@game.example/', room));
  assert.throws(() => makeInviteLink('https://game.example/', 'x'.repeat(24)));
  assert.equal(readInviteRoom('https://game.example/#coop=' + room + '&coop=' + room), null);
});

test('public invitations require HTTPS but loopback development HTTP remains supported', () => {
  assert.throws(() => makeInviteLink('http://game.example/play', room), TypeError);
  assert.equal(readInviteRoom('http://game.example/play#coop=' + room), null);
  for (const host of ['localhost:8080', '127.0.0.1:8080', '[::1]:8080']) {
    const link = makeInviteLink('http://' + host + '/play', room);
    assert.equal(readInviteRoom(link), room);
  }
});
