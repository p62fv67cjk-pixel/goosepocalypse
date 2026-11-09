// Run with: node tests/window-terminal-pointer.test.cjs
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const source=fs.readFileSync('controls-fixes.js','utf8');
const start=source.indexOf("// Safari may deliver the terminal event to window");
const end=source.indexOf('function releaseAllControls(){',start);
assert(start>=0&&end>start,'window terminal handler must exist');
const handlers={};
const element=name=>({name,contains:()=>false});
const movePad=element('move'),sprintButton=element('sprint'),gameCanvas=element('game');
let activeMovePointer=11,activeSprintPointer=22,activeLookPointer=33;
const releases=[];
const window={addEventListener:(type,fn)=>{handlers[type]=fn}};
const release=(el,id)=>releases.push([el.name,id]);
const ctx={window,movePad,sprintButton,gameCanvas,release};
Object.defineProperties(ctx,{
 activeMovePointer:{get:()=>activeMovePointer,set:v=>{activeMovePointer=v}},
 activeSprintPointer:{get:()=>activeSprintPointer,set:v=>{activeSprintPointer=v}},
 activeLookPointer:{get:()=>activeLookPointer,set:v=>{activeLookPointer=v}}
});
vm.runInNewContext(source.slice(start,end),ctx);
assert.equal(typeof handlers.pointerup,'function');
assert.equal(typeof handlers.pointercancel,'function');
handlers.pointerup({pointerId:99,target:{},composedPath:()=>[]});
assert.equal(releases.length,0,'unrelated finger cannot release controls');
handlers.pointerup({pointerId:11,target:movePad,composedPath:()=>[movePad]});
assert.equal(activeMovePointer,11,'normal pad release belongs to pad handler');
handlers.pointercancel({pointerId:11,target:{},composedPath:()=>[]});
assert.equal(activeMovePointer,null,'window cancel must clear orphaned joystick ownership');
assert.deepEqual(releases.pop(),['move',11]);
handlers.pointerup({pointerId:22,target:{},composedPath:()=>[]});
assert.equal(activeSprintPointer,null,'window up must clear sprint ownership');
assert.deepEqual(releases.pop(),['sprint',22]);
handlers.pointercancel({pointerId:33,target:{},composedPath:()=>[]});
assert.equal(activeLookPointer,null,'window cancel must clear camera ownership');
assert.deepEqual(releases.pop(),['game',33]);
console.log('Safari window terminal pointer ownership regression passed');
