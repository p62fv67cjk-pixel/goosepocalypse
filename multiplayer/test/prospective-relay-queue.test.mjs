import test from 'node:test';
import assert from 'node:assert/strict';
import { MAX_QUEUED_BYTES, wouldExceedQueue } from '../backpressure.mjs';

test('relay prospective queue guard counts the next UTF-8 packet', () => {
  const payload = JSON.stringify({ type: 'action', data: { sound: '🪿' } });
  const bytes = Buffer.byteLength(payload, 'utf8');
  assert.ok(bytes > payload.length);
  assert.equal(wouldExceedQueue(MAX_QUEUED_BYTES - bytes, bytes), false);
  assert.equal(wouldExceedQueue(MAX_QUEUED_BYTES - bytes + 1, bytes), true);
  assert.equal(wouldExceedQueue(MAX_QUEUED_BYTES, 1), true);
});

test('relay queue guard rejects invalid amounts and accepts empty queue', () => {
  assert.equal(wouldExceedQueue(0, 2048), false);
  assert.equal(wouldExceedQueue(NaN, 1), true);
  assert.equal(wouldExceedQueue(Infinity, 1), true);
  assert.equal(wouldExceedQueue(0, Infinity), true);
  assert.equal(wouldExceedQueue(0, -1), true);
});
