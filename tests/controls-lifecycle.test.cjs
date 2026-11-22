// Run: node --test tests/controls-lifecycle.test.cjs
// DOM-free regression harness for iPhone pointer ownership. Does not simulate Safari rendering/audio.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
class Target {
  constructor(){this.handlers=new Map();this.events=[];}
  addEventListener(type,fn,options={}){const list=this.handlers.get(type)||[];list.push({fn,capture:!!options.capture});this.handlers.set(type,list);}
  dispatchEvent(event){event.target=this;event.stopImmediatePropagation=()=>{event.stopped=true};this.events.push(event);for(const {fn} of [...(this.handlers.get(event.type)||[])].sort((a,b)=>Number(b.capture)-Number(a.capture))){if(event.stopped)break;fn(event)}return true;}
  setPointerCapture(){}
  contains(){return false;}
}
class PointerEventMock {constructor(type,opts={}){Object.assign(this,{type,pointerId:-1,pointerType:'touch',buttons:1},opts);}}
function fixture(){
  const move=new Target(),sprint=new Target(),canvas=new Target(),doc=new Target(),win=new Target(),orientation=new Target();
  doc.querySelector=s=>({'#move':move,'#sprint':sprint,'#game':canvas})[s];
  const ctx={document:doc,window:win,screen:{orientation},PointerEvent:PointerEventMock,Event:PointerEventMock};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,'..','controls-fixes.js'),'utf8'),ctx);
  const send=(target,type,id,extra={})=>target.dispatchEvent(new PointerEventMock(type,{pointerId:id,...extra}));
  return {move,sprint,canvas,doc,win,orientation,send};
}
test('secondary finger cannot release or move joystick',()=>{
  const {move,send}=fixture();
  send(move,'pointerdown',1);send(move,'pointerdown',2);
  send(move,'pointermove',2);assert.equal(move.events.at(-1).stopped,true);
  send(move,'pointerup',2);assert.equal(move.events.at(-1).stopped,true);
  send(move,'pointermove',1,{buttons:0});assert.equal(move.events.at(-1).buttons,1);
  send(move,'pointerup',1);
  send(move,'pointermove',2);assert.equal(move.events.at(-1).stopped,true);
});
test('cancel creates one release, repeated interruption does not',()=>{
  const {move,doc,win,send}=fixture();
  send(move,'pointerdown',3);send(move,'pointercancel',3);
  assert.equal(move.events.filter(e=>e.type==='pointerup').length,1);
  doc.hidden=true;send(doc,'visibilitychange',-1);send(win,'blur',-1);
  assert.equal(move.events.filter(e=>e.type==='pointerup').length,1);
});
test('orientation releases owned controls',()=>{
  const {move,sprint,canvas,orientation,send}=fixture();
  for(const el of [move,sprint,canvas])send(el,'pointerdown',7);
  send(orientation,'change',-1);
  for(const el of [move,sprint,canvas])assert.equal(el.events.filter(e=>e.type==='pointerup').length,1);
});
test('owned sprint pointerleave does not end sprint',()=>{
  const {sprint,doc,send}=fixture();send(sprint,'pointerdown',9);
  // The production listener is capture-phase on document, not on the button.
  // Model the event at its document capture point while retaining the button target.
  const leave=new PointerEventMock('pointerleave',{pointerId:9});
  leave.target=sprint;
  leave.stopImmediatePropagation=()=>{leave.stopped=true};
  for(const {fn} of doc.handlers.get('pointerleave')||[])fn(leave);
  assert.equal(leave.stopped,true);
  send(sprint,'pointerup',9);assert.equal(sprint.events.at(-1).stopped,undefined);
});
