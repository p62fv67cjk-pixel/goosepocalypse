// Exercises the actual fire() function extracted from game.js, not a duplicate implementation.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const source=readFileSync(new URL('../game.js',import.meta.url),'utf8');
const start=source.indexOf('function fire(){');
assert.ok(start>=0,'game.js must define fire()');
let depth=0,end=-1;
for(let i=source.indexOf('{',start);i<source.length;i++){
 if(source[i]==='{')depth++;
 if(source[i]==='}'&&--depth===0){end=i+1;break;}
}
assert.ok(end>start,'fire() body must be complete');
const fireSource=source.slice(start,end);

function harness({ammo=0,lastShot=900,now=1000,cooldown=1050}={}){
 const state={ammo,lastShot,reloads:0,shots:0};
 const context={playing:true,paused:false,reloading:false,performance:{now:()=>now},
 weapons:[{cooldown}],weaponIndex:0,ammo,lastShot,
 reload:()=>{state.reloads++},audioReady:()=>{},sfx:()=>{state.shots++},
 gunKick:0,magazines:[ammo],ray:{setFromCamera:()=>{},intersectObjects:()=>[]},
 THREE:{Vector2:class{}},cam:{},geese:[]};
 runInNewContext(fireSource+';fire()',context);
 state.lastShot=context.lastShot;
 state.ammo=context.ammo;
 return state;
}

test('empty trigger reloads even inside previous shot cooldown',()=>{
 const s=harness();assert.equal(s.reloads,1);assert.equal(s.lastShot,900);assert.equal(s.shots,0);
});
test('empty trigger does not consume ammo or emit gunshot',()=>{
 const s=harness({ammo:0,lastShot:-Infinity});assert.equal(s.ammo,0);assert.equal(s.shots,0);
});
test('loaded trigger respects firing cooldown',()=>{
 const s=harness({ammo:3});assert.equal(s.reloads,0);assert.equal(s.shots,0);assert.equal(s.ammo,3);
});
test('loaded trigger fires after cooldown',()=>{
 const s=harness({ammo:3,lastShot:-Infinity});assert.equal(s.reloads,0);assert.equal(s.shots,1);assert.equal(s.ammo,2);assert.equal(s.lastShot,1000);
});
