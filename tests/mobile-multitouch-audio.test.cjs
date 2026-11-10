// Run with: node --test tests/mobile-multitouch-audio.test.cjs
// No browser, external dependencies or audio devices required.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const vm = require('node:vm');

function harness() {
  const listeners = new Map();
  function element(name) {
    const events = new Map();
    return {
      name, style: { setProperty() {} }, classList: { add() {}, remove() {} },
      textContent: '', innerHTML: '', children: [],
      addEventListener(type, fn) { (events.get(type) || (events.set(type, []), events.get(type))).push(fn); },
      dispatch(type, props = {}) { for (const fn of events.get(type) || []) fn({ pointerId: 1, clientX: 0, clientY: 0, ...props }); },
      getBoundingClientRect() { return { left: 0, top: 0, width: 100, height: 100 }; },
      setPointerCapture() {}, hasPointerCapture() { return false; }, releasePointerCapture() {},
      appendChild(child) { this.children.push(child); }
    };
  }
  const nodes = Object.fromEntries(['#move','#sprint','#jump','#menu','#pauseMenu','#pause','.resume','.start','#health','#geeseLeft'].map(k => [k,element(k)]));
  const doc = {
    hidden: false, head: element('head'), body: element('body'),
    querySelector(k) { return nodes[k] || null; },
    createElement(k) { return element(k); },
    addEventListener(type, fn) { (listeners.get('document:'+type) || (listeners.set('document:'+type,[]),listeners.get('document:'+type))).push(fn); }
  };
  const win = {
    addEventListener(type, fn) { (listeners.get(type) || (listeners.set(type,[]),listeners.get(type))).push(fn); },
    dispatch(type, detail) { for (const fn of listeners.get(type) || []) fn({ detail }); }
  };
  class Media {
    constructor(src) { this.src=src; this.paused=true; this.currentTime=0; this.plays=0; this.pauses=0; }
    play() { this.paused=false; this.plays++; return Promise.resolve(); }
    pause() { this.paused=true; this.pauses++; }
  }
  const audio=[];
  class Audio extends Media { constructor(src) { super(src); audio.push(this); } }
  const context = {
    document:doc, window:win, HTMLMediaElement:Media, Audio,
    MutationObserver:class { observe() {} },
    getComputedStyle:() => ({ display:'none' }),
    requestAnimationFrame:() => 0,
    setTimeout:() => 0,
    performance:{ now:() => 1000 },
    Math, Float32Array, console
  };
  vm.runInNewContext(readFileSync(join(__dirname,'..','effects.js'),'utf8'),context,{filename:'effects.js'});
  return { nodes, win, audio, dispatchWindow(type, props) {
    for (const fn of listeners.get(type) || []) fn({ pointerId:1,...props });
  }};
}

test('joystick deadzone, ownership, sprint and jump do not leak footstep loops', async () => {
  const {nodes,win,audio,dispatchWindow} = harness();
  const [walk,run,landing]=audio;
  const move=nodes['#move'], sprint=nodes['#sprint'];
  win.dispatch('gwt:ground-state',{grounded:true,playing:true});
  move.dispatch('pointerdown',{pointerId:11,clientX:50,clientY:50});
  assert.equal(walk.plays,0,'centred joystick must stay silent');
  move.dispatch('pointermove',{pointerId:11,clientX:85,clientY:50});
  assert.equal(walk.plays,1,'moving joystick starts walking');
  move.dispatch('pointerup',{pointerId:99});
  assert.equal(walk.paused,false,'unrelated finger must not stop movement');
  sprint.dispatch('pointerdown',{pointerId:22});
  assert.equal(walk.paused,true);
  assert.equal(run.plays,1,'sprint switches to running recording');
  dispatchWindow('pointerup',{pointerId:99});
  assert.equal(run.paused,false,'camera finger must not release sprint');
  win.dispatch('gwt:ground-state',{grounded:false,playing:true});
  assert.equal(run.paused,true,'airborne frames must silence running');
  move.dispatch('pointermove',{pointerId:11,clientX:90,clientY:50});
  assert.equal(run.paused,true,'moving joystick cannot restart airborne audio');
  win.dispatch('gwt:ground-state',{grounded:true,playing:true});
  assert.equal(landing.plays,1,'landing uses recorded impact once');
  assert.equal(run.plays,2,'held sprint resumes only after landing');
  dispatchWindow('pointerup',{pointerId:22});
  assert.equal(run.paused,true);
  assert.equal(walk.plays,2,'releasing sprint returns to walking');
  dispatchWindow('pointerup',{pointerId:11});
  assert.equal(walk.paused,true,'joystick release immediately stops audio');
});

test('pause/death clears held joystick ownership until a new touch', () => {
  const {nodes,win,audio}=harness();
  const move=nodes['#move'], walk=audio[0];
  win.dispatch('gwt:ground-state',{grounded:true,playing:true});
  move.dispatch('pointerdown',{pointerId:7,clientX:90,clientY:50});
  assert.equal(walk.plays,1);
  win.dispatch('gwt:ground-state',{grounded:true,playing:false});
  assert.equal(walk.paused,true);
  win.dispatch('gwt:ground-state',{grounded:true,playing:true});
  move.dispatch('pointermove',{pointerId:7,clientX:90,clientY:50});
  assert.equal(walk.plays,1,'old captured pointer cannot restart footsteps');
  move.dispatch('pointerdown',{pointerId:8,clientX:90,clientY:50});
  assert.equal(walk.plays,2,'new gesture can restart after recovery');
});
