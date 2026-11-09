// Regression: physics may report grounded for one frame after the jump button fires.
// Do not play landing audio until an actual airborne physics frame has been observed.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const source=fs.readFileSync(require('node:path').join(__dirname,'..','effects.js'),'utf8');
const start=source.indexOf("window.addEventListener('gwt:ground-state',event=>{");
const end=source.indexOf("\n});",start);
assert(start>=0&&end>start,'ground-state handler exists');
const handler=source.slice(start,end+4);
let landings=0, stops=0, syncs=0;
const state={window:{addEventListener:(_name,fn)=>{state.onGround=fn}},authoritativeGroundState:false,
 observedAirborne:false,physicsGrounded:true,physicsPlaying:true,wasPhysicsPlaying:true,
 jumping:true,jumpY:1,jumpVY:5,landingImpact:()=>landings++,
 syncMovement:()=>syncs++,stopTrack:()=>stops++,stopLanding:()=>{},suspendMovement:()=>{}};
vm.createContext(state);
vm.runInContext(handler,state);
state.onGround({detail:{grounded:true,playing:true}});
assert.equal(landings,0,'grounded frame before takeoff cannot land');
assert.equal(state.jumping,true,'jump remains active');
state.onGround({detail:{grounded:false,playing:true}});
assert.equal(state.observedAirborne,true);
state.onGround({detail:{grounded:true,playing:true}});
assert.equal(landings,1,'landing plays once after actual flight');
assert.equal(state.jumping,false);
state.onGround({detail:{grounded:true,playing:true}});
assert.equal(landings,1,'repeated grounded frames do not replay landing');
console.log('Landing physics transition regression passed');
