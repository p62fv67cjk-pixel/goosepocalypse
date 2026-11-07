// Static contract tests for how game.js uses the goose rig. No three.js needed.
// Run: node --test tests/goose-integration.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const game=fs.readFileSync(path.join(root,'game.js'),'utf8');
const gooseFn=game.slice(game.indexOf('function goose('),game.indexOf('function teammate('));

test('game.js imports the goose rig and the pooled burst',()=>{
 assert.match(game,/import \{makeGooseKit\} from "\.\/goose-rig\.js";/);
 assert.match(game,/import \{makeBurst\} from "\.\/particle-pool\.js";/);
 assert.match(game,/const gooseKit=makeGooseKit\(THREE,\{camera:cam\}\),emitBurst=makeBurst\(THREE\);/);
});

test('goose() takes a pooled rig and builds no per-goose meshes, groups or materials',()=>{
 assert.ok(gooseFn.length>200,'goose() not found');
 assert.ok(gooseFn.includes('gooseKit.acquire(type)'));
 for(const banned of ['new THREE.Mesh(','new THREE.Group(','new THREE.MeshStandardMaterial(','new THREE.MeshBasicMaterial(','Geometry(']){
  assert.ok(!gooseFn.includes(banned),'goose() must not allocate: '+banned);
 }
});

test('goose() keeps the gameplay contract (spawn ring, scale, stats, registration)',()=>{
 assert.match(gooseFn,/r=30\+Math\.random\(\)\*38;g\.position\.set\(Math\.sin\(angle\)\*r,\.02,Math\.cos\(angle\)\*r\)/);
 assert.match(gooseFn,/let scale=boss\?2\.25:brute\?1\.45:fast\?\.82:1;g\.scale\.setScalar\(scale\)/);
 for(const key of ['nextCall:','hp:','speed:','type,','damage:','bob:'])assert.ok(gooseFn.includes(key),'userData.'+key+' missing');
 assert.match(gooseFn,/S\.add\(g\);geese\.push\(g\)/);
});

test('burst() delegates to the pooled emitter and no per-spark geometry remains',()=>{
 assert.match(game,/function burst\(p,col=0xffc266\)\{emitBurst\(S,parts,p,col\)\}/);
 assert.ok(!game.includes('new THREE.SphereGeometry(.03,4,3)'));
});

test('kit is created after the forest block so tests/forest-regression.cjs can still extract it',()=>{
 const geesePos=game.indexOf('const geese=[],parts=[];');
 assert.ok(geesePos>0&&game.indexOf('const gooseKit=')>geesePos);
 assert.ok(game.indexOf('let scenerySeed=')<geesePos);
});

test('existing render-loop contract is unchanged',()=>{
 assert.match(game,/R\.render\(S,cam\);requestAnimationFrame/);
});
