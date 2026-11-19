'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const {createReviveState} = require('../revive-state.cjs');
test('damage downs exactly at zero without negative health', () => {
 const s=createReviveState(100);s.damage(250);assert.deepEqual(s.snapshot(),{health:0,maxHealth:100,downed:true,generation:1});assert.equal(s.damage(10),false);
});
test('revival requires explicit authorization and current down generation', () => {
 const s=createReviveState(140);s.damage(140);assert.equal(s.revive(false,1),false);assert.equal(s.revive(true,0),false);assert.equal(s.revive(true,1),true);assert.equal(s.snapshot().health,49);assert.equal(s.revive(true,1),false);
});
test('reset invalidates stale revive acknowledgements', () => {
 const s=createReviveState(100);s.damage(100);s.reset();s.damage(100);assert.equal(s.revive(true,1),false);assert.equal(s.revive(true,3),true);
});
test('invalid inputs cannot heal or corrupt health', () => {
 assert.throws(()=>createReviveState(0),RangeError);assert.throws(()=>createReviveState(100,2),RangeError);
 const s=createReviveState(100);for(const n of [NaN,Infinity,-1,0])assert.equal(s.damage(n),false);assert.equal(s.snapshot().health,100);
});

test('revive never exceeds fractional maximum health', () => {
 const s = createReviveState(0.5);
 assert.equal(s.damage(0.5), true);
 assert.equal(s.revive(true, 1), true);
 assert.equal(s.snapshot().health, 0.5);
 assert.equal(s.snapshot().downed, false);
});
