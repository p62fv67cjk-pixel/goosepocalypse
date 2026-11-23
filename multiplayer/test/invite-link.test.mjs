import test from 'node:test';
import assert from 'node:assert/strict';
import { makeInviteLink, readInviteRoom } from '../invite-link.mjs';
const room = 'a'.repeat(24);
test('room invitations round-trip through fragments without leaking to query', () => {
  const link = makeInviteLink('https://example.org/game/index.html?mode=mobile#old', room);
  const url = new URL(link);
  assert.equal(url.hash, '#coop=' + room);
  assert.equal(url.search, '?mode=mobile');
  assert.equal(readInviteRoom(link), room);
});
test('rejects malformed, ambiguous or credential-bearing invitations', () => {
  for (const code of ['abc', 'A'.repeat(24), 'a'.repeat(23) + '/', 'a'.repeat(25)])
    assert.throws(() => makeInviteLink('https://example.org/game', code), /room code/);
  assert.throws(() => makeInviteLink('https://user:secret@example.org/game', room), /game URL/);
  assert.throws(() => makeInviteLink('javascript:alert(1)', room), /game URL/);
  for (const fragment of ['#coop=' + room + '&coop=' + room, '#coop=%61' + 'a'.repeat(23), '#other=' + room, '#coop=' + room + '&x=1'])
    assert.equal(readInviteRoom('https://example.org/game' + fragment), null);
  assert.equal(readInviteRoom('not a url'), null);
});
