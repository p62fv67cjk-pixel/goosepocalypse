import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
const source=readFileSync(new URL('../game.js',import.meta.url),'utf8');
const begin=source.indexOf('function disposeCharacterMesh(');
const end=source.indexOf('\nfunction say(',begin);
assert.ok(begin>=0&&end>begin,'character and goose disposal helpers exist');
test('defeated goose releases mesh GPU resources including material arrays',()=>{
 let removed=0,geometry=0,materials=0;
 const mesh={isMesh:true,geometry:{dispose(){geometry++}},material:[{dispose(){materials++}},{dispose(){materials++}}]};
 const nonMesh={isMesh:false};
 const goose={traverse(callback){callback(mesh);callback(nonMesh)}};
 const context=vm.createContext({S:{remove(value){assert.equal(value,goose);removed++}},Set});
 vm.runInContext(source.slice(begin,end),context);
 context.disposeGooseMesh(goose);
 assert.equal(removed,1);assert.equal(geometry,1);assert.equal(materials,2);
});
test('kill and reset both use goose disposal',()=>{
 assert.match(source,/dropMeat\(g\);disposeGooseMesh\(g\);geese\.splice/);
 assert.match(source,/geese\.splice\(0\)\.forEach\(disposeGooseMesh\)/);
});
