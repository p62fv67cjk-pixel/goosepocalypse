// Static regression guards for the iPhone audio/rendering fixes.
// Run: node --test tests/source-contracts.test.cjs
// These checks are NOT substitutes for Safari playback or rendered gameplay tests.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const game=fs.readFileSync(path.join(root,'game.js'),'utf8');
const effects=fs.readFileSync(path.join(root,'effects.js'),'utf8');
test('movement audio has one owner, with matching joystick deadzones',()=>{
 assert.match(effects,/function syncMovement\(\)/);
 assert.doesNotMatch(game,/stopMovementAudio\s*\(/);
 assert.match(effects,/>\.18;syncMovement\(\)/);
 assert.match(game,/Math\.hypot\(mx,my\)>\.18/);
});
test('airborne, sprint and stop states remain wired',()=>{
 assert.match(effects,/!moving\|\|jumping/);
 assert.match(effects,/playTrack\(sprinting\?run:walk\)/);
 assert.match(effects,/stopTrack\(true\);stopLanding\(\);jumpWhoosh\(\)/);
 assert.match(effects,/gwt:ground-state/);
 assert.match(game,/gwt:ground-state/);
});
test('recorded weapons and combat effects remain connected',()=>{
 assert.match(game,/recordedGunshot/);
 assert.match(game,/recordedReload/);
 assert.match(effects,/function splashBlood\(\)/);
 assert.match(effects,/function demonicHonk\(\)/);
});
test('scene renders every animation frame',()=>{
 assert.match(game,/R\.render\(S,cam\);requestAnimationFrame/);
});
