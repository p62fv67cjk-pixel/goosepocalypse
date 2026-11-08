// Run: node tests/joystick-nonowner-release.test.cjs
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

class Target {
  constructor(){this.handlers={};}
  addEventListener(type,fn,options={}){(this.handlers[type]??=[]).push({fn,capture:!!options.capture});}
  setPointerCapture(){}
  dispatchEvent(e){
    e.target=this;
    e.stopImmediatePropagation=()=>{e.stopped=true;};
    for(const {fn} of [...(this.handlers[e.type]||[])].sort((a,b)=>Number(b.capture)-Number(a.capture))){
      if(e.stopped)break;
      fn(e);
    }
  }
}
const move=new Target(),sprint=new Target(),canvas=new Target(),doc=new Target(),win=new Target(),orientation=new Target();
doc.querySelector=selector=>({'#move':move,'#sprint':sprint,'#game':canvas})[selector];
const context={document:doc,window:win,screen:{orientation},Event:class{},PointerEvent:class{},console};
vm.runInNewContext(fs.readFileSync('controls-fixes.js','utf8'),context);
let gameReleases=0;
move.addEventListener('pointerup',()=>gameReleases++);
const event=(type,pointerId)=>({type,pointerId,pointerType:'touch',buttons:1});
move.dispatchEvent(event('pointerdown',1));
move.dispatchEvent(event('pointerdown',2));
move.dispatchEvent(event('pointerup',2));
assert.equal(gameReleases,0,'non-owner must not stop movement');
move.dispatchEvent(event('pointerup',1));
assert.equal(gameReleases,1,'owner release must stop movement once');
move.dispatchEvent(event('pointerup',2));
assert.equal(gameReleases,1,'orphan release must not stop movement');
move.dispatchEvent(event('pointerdown',3));
move.dispatchEvent(event('pointerup',3));
assert.equal(gameReleases,2,'new movement gesture must release normally');
console.log('Joystick ownership regression passed');
