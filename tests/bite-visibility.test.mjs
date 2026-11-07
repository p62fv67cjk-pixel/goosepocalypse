import assert from 'node:assert/strict';
import test from 'node:test';
import {canGooseBite} from '../bite-visibility.js';

const clear={groundHeight:()=>0,collide:()=>false};
test('nearby unobstructed ground-level goose can bite',()=>{
 assert.equal(canGooseBite(clear,0,0,1,0,1.7,1.3),true);
});
test('out-of-range goose cannot bite',()=>{
 assert.equal(canGooseBite(clear,0,0,2,0,1.7,1.3),false);
});
test('rooftop player cannot be bitten by ground-level goose',()=>{
 assert.equal(canGooseBite(clear,0,0,.5,0,5.02,1.3),false);
});
test('solid cover between goose and player prevents bite',()=>{
 const arena={...clear,collide:(x)=>x>.35&&x<.65};
 assert.equal(canGooseBite(arena,0,0,1,0,1.7,1.3),false);
});
test('cover outside attack path does not prevent bite',()=>{
 const arena={...clear,collide:(x,z)=>z>1};
 assert.equal(canGooseBite(arena,0,0,1,0,1.7,1.3),true);
});
