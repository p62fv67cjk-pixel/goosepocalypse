// Run with: node --test tests/audio-ownership.test.cjs
// Static contract checks protect iPhone audio ownership during viewmodel changes.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const game = fs.readFileSync(path.join(__dirname, '../game.js'), 'utf8');
const effects = fs.readFileSync(path.join(__dirname, '../effects.js'), 'utf8');

test('recorded gunshot and reload sources remain wired to game', () => {
  assert.match(game, /Gun%201\.wav/);
  assert.match(game, /gun-cocking-04\.wav/);
  assert.match(game, /playBuffer\(gunBuffer,recordedGunshot/);
  assert.match(game, /playBuffer\(reloadBuffer,recordedReload/);
});
test('effects controller exclusively owns jump and landing sound', () => {
  assert.match(effects, /function jumpWhoosh\(/);
  assert.match(effects, /function landingImpact\(/);
  assert.match(effects, /const GRAVEL_SRC=/);
  assert.doesNotMatch(game, /function jumpSound\(/, 'Do not add a second synthetic jump cue in game.js');
});
test('movement audio respects joystick ownership, ground and sprint state', () => {
  assert.match(effects, /movePointer===e\.pointerId/);
  assert.match(effects, /authoritativeGroundState&&!physicsGrounded/);
  assert.match(effects, /playTrack\(sprinting\?run:walk\)/);
  assert.match(effects, /playbackGeneration\+\+/);
  assert.match(effects, /visibilitychange/);
});
test('ground-state events are emitted from physics', () => {
  assert.match(game, /gwt:ground-state/);
  assert.match(effects, /addEventListener\('gwt:ground-state'/);
});
