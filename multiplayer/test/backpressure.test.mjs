import test from 'node:test';
import assert from 'node:assert/strict';
import { isBackpressured, MAX_QUEUED_BYTES } from '../backpressure.mjs';

test('slow receiver queue is capped without rejecting normal queued traffic', () => {
  assert.equal(isBackpressured(0), false);
  assert.equal(isBackpressured(MAX_QUEUED_BYTES), false);
  assert.equal(isBackpressured(MAX_QUEUED_BYTES + 1), true);
  assert.equal(isBackpressured(Infinity), true);
  assert.equal(isBackpressured(undefined), true);
});
