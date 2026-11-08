import assert from 'node:assert/strict';
import {test} from 'node:test';
import {canTraverse} from '../movement-collision.js';

test('clear short movement traverses the whole segment',()=>{
 let calls=0;
 assert.equal(canTraverse(0,0,1,0,()=>{calls++;return false}),true);
 assert.equal(calls,40);
});
test('thin obstacle between endpoints stops movement',()=>{
 assert.equal(canTraverse(0,0,1,0,(x)=>x>=0.49&&x<=0.51),false);
});
test('non-finite and pathological displacement fail closed without callback work',()=>{
 let calls=0;const blocked=()=>{calls++;return false};
 for(const coords of [[0,0,Infinity,0],[0,0,Number.MAX_VALUE,Number.MAX_VALUE],[0,0,200,0]]){
  assert.equal(canTraverse(...coords,blocked),false);
 }
 assert.equal(canTraverse(0,0,1,0,blocked,Number.MIN_VALUE),false);
 assert.equal(calls,0);
});
test('invalid step size and blocker fail closed',()=>{
 assert.equal(canTraverse(0,0,1,0,()=>false,0),false);
 assert.equal(canTraverse(0,0,1,0,null),false);
});
