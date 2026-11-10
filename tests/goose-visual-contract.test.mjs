// Guard the scary goose and blood-moon visual requirements against accidental removal.
// Run: node --test tests/goose-visual-contract.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const game=readFileSync(new URL('../game.js',import.meta.url),'utf8');
test('blood moon remains a lit, emissive scene object',()=>{
 assert.match(game,/const bloodMoon=new THREE\.Group\(\)/);
 assert.match(game,/emissiveIntensity:\s*1\.25/);
 assert.match(game,/bloodMoon\.position\.set\(/);
 assert.match(game,/S\.add\(bloodMoon\)/);
});
test('geese retain layered feathers and threatening forward-facing eyes',()=>{
 assert.match(game,/Layered wing coverts and long flight feathers/);
 assert.match(game,/Tail fan feathers/);
 assert.match(game,/emissiveIntensity:\s*3\.8/);
 assert.match(game,/Brow ridges and glowing eyes facing forward/);
});
test('geese retain visible tooth geometry and biting behavior',()=>{
 assert.match(game,/const toothMat=new THREE\.MeshStandardMaterial/);
 assert.match(game,/Open mouth cavity, upper\/lower beak and individually visible teeth/);
 assert.match(game,/canGooseBite/);
});
test('mobile rendering retains pixel ratio ceiling',()=>{
 assert.match(game,/setPixelRatio\(Math\.min\(devicePixelRatio,1\.35\)\)/);
});
