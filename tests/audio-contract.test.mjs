// Regression guard for the recorded audio and single-owner movement contract.
// Run with: node --test tests/audio-contract.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, existsSync} from 'node:fs';
const read = path => readFileSync(new URL('../'+path,import.meta.url),'utf8');
const game=read('game.js'),effects=read('effects.js'),html=read('index.html');
test('weapon recordings remain the actual gameplay sources',()=>{
  for(const filename of ['Gun 1.wav','gun-cocking-04.wav']){
    assert.ok(existsSync(new URL('../'+filename,import.meta.url)),filename+' missing');
  }
  assert.match(game,/new Audio\(new URL\("\.\/Gun%201\.wav"/);
  assert.match(game,/new Audio\(new URL\("\.\/gun-cocking-04\.wav"/);
  assert.match(game,/playBuffer\(gunBuffer,recordedGunshot/);
  assert.match(game,/playBuffer\(reloadBuffer,recordedReload/);
});
test('movement audio has one owner and separate walk and sprint recordings',()=>{
  assert.match(html,/src="effects\.js"/);
  assert.match(effects,/const WALK_SRC=/);
  assert.match(effects,/const RUN_SRC=/);
  assert.match(effects,/const nativePlay=HTMLMediaElement\.prototype\.play/);
  assert.match(effects,/playTrack\(sprinting\?run:walk\)/);
  assert.match(effects,/if\(!gameActive\(\)\|\|!moving\|\|jumping/);
  assert.match(effects,/playbackGeneration\+\+/);
  assert.doesNotMatch(game,/new Audio\([^\n]*(?:footsteps-on-tall-grass|running-on-the-floor)/);
});
test('ground physics, interruption and landing are explicit',()=>{
  assert.match(effects,/gwt:ground-state/);
  assert.match(effects,/physicsGrounded=grounded===true/);
  assert.match(effects,/if\(!grounded\)/);
  assert.match(effects,/if\(jumping&&observedAirborne\)/);
  assert.match(effects,/landingImpact\(\)/);
  assert.match(effects,/pointercancel/);
  assert.match(effects,/visibilitychange|pagehide/);
});
test('soundtrack module remains wired and action touch controls stay iPhone safe',()=>{
  assert.match(html,/src="soundtrack\.js"/);
  assert.match(html,/#fire,#jump,#reload,#sprint,#pause\{touch-action:none/);
});
