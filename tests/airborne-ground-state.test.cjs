// Run with: node --test tests/airborne-ground-state.test.cjs
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(require('node:path').join(__dirname, '..', 'game.js'), 'utf8');
const match = source.match(/if\(cam\.position\.y<=floor\)\{cam\.position\.y=floor;vy=0;onGround=true\}else\{onGround=false\}/);
assert.ok(match, 'ground-state transition must remain present in gameplay');
function resolveGroundState(y, floor, verticalSpeed, previouslyGrounded) {
  const context = {cam: {position: {y}}, floor, vy: verticalSpeed, onGround: previouslyGrounded};
  vm.runInNewContext(match[0], context);
  return {y: context.cam.position.y, vy: context.vy, grounded: context.onGround};
}
test('walking off a rooftop immediately marks player airborne', () => {
  const state = resolveGroundState(5, 1.7, -0.4, true);
  assert.equal(state.grounded, false);
  assert.equal(state.y, 5);
  assert.equal(state.vy, -0.4);
});
test('jump ascent remains airborne and does not trigger footsteps', () => {
  assert.equal(resolveGroundState(2.4, 1.7, 4.2, false).grounded, false);
});
test('landing restores grounded state and cancels falling velocity', () => {
  assert.deepEqual(resolveGroundState(1.6, 1.7, -3, false), {y: 1.7, vy: 0, grounded: true});
});
test('standing on ground remains grounded', () => {
  assert.equal(resolveGroundState(1.7, 1.7, 0, true).grounded, true);
});
