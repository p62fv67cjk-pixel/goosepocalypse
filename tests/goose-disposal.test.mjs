import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
const source=readFileSync(new URL('../game.js',import.meta.url),'utf8');
const match=source.match(/function disposeGooseMesh\(goose\)\{[\s\S]*?\}\nfunction say/);
assert.ok(match,'goose disposal helper must exist');
const fn=new Function('S',match[0].replace(/\nfunction say$/,'')+';return disposeGooseMesh;');
test('defeated goose releases mesh GPU resources including material arrays',()=>{
 let removed=0,geometry=0,materials=0;
 const mesh={isMesh:true,geometry:{dispose(){geometry++}},material:[{dispose(){materials++}},{dispose(){materials++}}]};
 const nonMesh={isMesh:false};
 const goose={traverse(callback){callback(mesh);callback(nonMesh)}};
 fn({remove(value){assert.equal(value,goose);removed++}})(goose);
 assert.equal(removed,1);assert.equal(geometry,1);assert.equal(materials,2);
});
test('kill and reset both use goose disposal',()=>{
 assert.match(source,/dropMeat\(g\);disposeGooseMesh\(g\);geese\.splice/);
 assert.match(source,/geese\.splice\(0\)\.forEach\(disposeGooseMesh\)/);
});
