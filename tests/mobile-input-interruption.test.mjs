// Regression guard for Safari touch interruption and audio ownership.
// Run: node --test tests/mobile-input-interruption.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const source = readFileSync(new URL('../game.js', import.meta.url), 'utf8');

test('backgrounding and blur clear gameplay input and suspend movement audio', () => {
  for (const event of ['blur', 'pagehide']) {
    assert.ok(source.includes(`window.addEventListener("${event}",suspendInterruptedSession)`),
      `${event} must suspend the session`);
  }
  assert.match(source, /document\.addEventListener\("visibilitychange",\(\)=>\{if\(document\.hidden\)suspendInterruptedSession\(\)\}\)/);
  assert.match(source, /function suspendInterruptedSession\(\)\{releaseInterruptedControls\(\);window\.dispatchEvent\(new CustomEvent\("gwt:ground-state",\{detail:\{grounded:onGround,playing:false\}\}\)\)\}/);
});

test('interrupted input clears stick, sprint and pointer ownership', () => {
  assert.match(source, /function releaseInterruptedControls\(\)\{/);
  assert.match(source, /cameraPointer=null;joystickPointer=null;sprintPointer=null;mx=my=0;sprint=false;stick\.style\.transform=""/);
  assert.match(source, /element\.releasePointerCapture\(id\)/);
});

test('jump leaves the ground immediately and notifies movement effects', () => {
  assert.match(source, /vy=5\.8;onGround=false;window\.dispatchEvent\(new CustomEvent\("gwt:ground-state",\{detail:\{grounded:false,playing:true\}\}\)\)/);
});

test('gameplay does not create a competing footsteps player', () => {
  assert.match(source, /Movement recordings are owned exclusively by effects\.js/);
  assert.doesNotMatch(source, /new Audio\([^\n]*(?:footstep|running|walking)/i);
});
