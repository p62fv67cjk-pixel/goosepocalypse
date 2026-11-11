// Run with: node --test tests/reload-race.test.cjs
// Exercise the actual reload() implementation with deterministic timers and no browser dependencies.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'..','game.js'),'utf8');
const start=source.indexOf('function reload(){');
const end=source.indexOf('function kill(',start);
assert.ok(start>=0&&end>start,'reload implementation must be found');
const implementation=source.slice(start,end);
function harness(){
  const timers=[];
  const state={playing:true,paused:false,reloading:false,ammo:2,maxAmmo:14,weaponIndex:0,run:1,reloadSequence:0,
    reserves:[28,60],magazines:[2,30],weapons:[{mag:14},{mag:30}],
    audioReady(){},sfx(){},say(){},setTimeout(fn){timers.push(fn);}};
  vm.createContext(state);
  vm.runInContext(implementation,state);
  return {state,timers,reload:()=>vm.runInContext('reload()',state)};
}
test('a normal reload fills only available rounds',()=>{
  const {state,timers,reload}=harness();
  state.reserves[0]=5;reload();assert.equal(timers.length,1);timers.shift()();
  assert.equal(state.ammo,7);assert.equal(state.reserves[0],0);assert.equal(state.magazines[0],7);assert.equal(state.reloading,false);
});
test('old reload cannot modify a newly looted weapon',()=>{
  const {state,timers,reload}=harness();
  reload();state.reloading=false;state.weaponIndex=1;state.ammo=10;state.maxAmmo=30;
  const reserve=state.reserves[1];timers.shift()();
  assert.equal(state.ammo,10);assert.equal(state.reserves[1],reserve);
});
test('old reload cannot complete a newer reload of the same gun',()=>{
  const {state,timers,reload}=harness();
  reload();state.reloading=false;reload();
  assert.equal(timers.length,2);timers.shift()();
  assert.equal(state.ammo,2);assert.equal(state.reloading,true);
  timers.shift()();assert.equal(state.ammo,14);assert.equal(state.reloading,false);
});
test('old run timers cannot modify a restarted game',()=>{
  const {state,timers,reload}=harness();
  reload();state.run++;state.reloading=false;state.ammo=6;timers.shift()();
  assert.equal(state.ammo,6);
});
test('paused or full-magazine reload requests do nothing',()=>{
  const {state,timers,reload}=harness();
  state.paused=true;reload();state.paused=false;state.ammo=14;reload();
  assert.equal(timers.length,0);
});
