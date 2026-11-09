// node tests/sprint-nonowner-release.test.cjs
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
class Target{
 constructor(){this.handlers={};this.releases=[]}
 addEventListener(type,fn){(this.handlers[type]??=[]).push(fn)}
 setPointerCapture(){}
 dispatchEvent(e){e.target??=this;for(const fn of this.handlers[e.type]??[]){fn(e);if(e.stopped)break}return !e.stopped}
 contains(){return false}
}
const sprint=new Target(),move=new Target(),canvas=new Target(),doc=new Target(),win=new Target(),orientation=new Target();
doc.querySelector=s=>({'#sprint':sprint,'#move':move,'#game':canvas})[s]??null;
const ctx={document:doc,window:win,screen:{orientation},Event:class{constructor(type){this.type=type}},PointerEvent:class{constructor(type,opts){Object.assign(this,opts);this.type=type}},console};
vm.runInNewContext(fs.readFileSync('controls-fixes.js','utf8'),ctx);
function send(target,type,id){const e={type,pointerId:id,pointerType:'touch',target,stopped:false,stopImmediatePropagation(){this.stopped=true}};target.dispatchEvent(e);return e}
send(sprint,'pointerdown',11);
assert.equal(send(sprint,'pointerup',22).stopped,true,'other finger release must be blocked');
assert.equal(send(sprint,'pointerup',11).stopped,false,'owner release must reach gameplay');
assert.equal(send(sprint,'pointerup',22).stopped,true,'orphan release must be blocked');
send(sprint,'pointerdown',33);
assert.equal(send(sprint,'pointerup',33).stopped,false,'new owner can release normally');
console.log('Sprint non-owner release regression passed');
