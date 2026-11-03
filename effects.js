// Geese With Teeth runtime effects controller.
// Owns movement audio so iOS never gets duplicate footstep loops from game.js.
const WALK_SRC='./mixkit-footsteps-on-tall-grass-532.wav';
const RUN_SRC='./thumblegray-running-on-the-floor-359909%202.mp3';
const GRAVEL_SRC='./freesound_community-footsteps-dirt-gravel-6823.mp3';
const nativePlay=HTMLMediaElement.prototype.play;
HTMLMediaElement.prototype.play=function(...args){
 const u=this.currentSrc||this.src||'';
 if(!this.__gwtManagedAudio&&/mixkit-footsteps-on-tall-grass-532|freesound_community-footsteps-dirt-gravel-6823|thumblegray-running-on-the-floor-359909/i.test(u)){try{this.pause();this.currentTime=0}catch{}return Promise.resolve()}
 return nativePlay.apply(this,args)
};
const walk=new Audio(WALK_SRC),run=new Audio(RUN_SRC),gravel=new Audio(GRAVEL_SRC);
for(const a of[walk,run,gravel]){a.__gwtManagedAudio=true;a.preload='auto';a.playsInline=true;a.volume=.92}walk.loop=run.loop=true;gravel.loop=false;
let moving=false,sprinting=false,jumping=false,current=null,unlocked=false,movePointer=null,sprintPointer=null,gamePaused=false;
let jumpY=0,jumpVY=0,jumpFrameTime=0;
function gameActive(){const menu=document.querySelector('#menu'),pause=document.querySelector('#pauseMenu');return !gamePaused&&menu&&getComputedStyle(menu).display==='none'&&(!pause||getComputedStyle(pause).display==='none')}
function stopTrack(reset=true){for(const a of[walk,run]){try{a.pause();if(reset)a.currentTime=0}catch{}}current=null}
async function playTrack(a){if(current===a&&!a.paused)return;stopTrack(true);current=a;a.muted=false;try{await nativePlay.call(a)}catch{}}
function syncMovement(){if(!gameActive()||!moving||jumping){stopTrack(true);return}playTrack(sprinting?run:walk)}
let ctx=null;
function ensureCtx(){try{const AC=window.AudioContext||window.webkitAudioContext;if(!AC)return null;if(!ctx)ctx=new AC();if(ctx.state==='suspended')ctx.resume().catch(()=>{});return ctx}catch{return null}}
function unlock(){
 // Resume WebAudio on every gesture: iOS can suspend it after calls, Siri or backgrounding.
 // Do NOT asynchronously prime walk/run recordings here. Awaiting play() used to race the
 // joystick's first pointerdown: the unlock continuation could pause and rewind the footstep
 // track *after* movement had started, leaving silent walking until another state change.
 // The movement state machine alone owns starting/stopping HTMLAudioElement playback.
 ensureCtx();
 unlocked=true;
}
document.addEventListener('pointerdown',unlock,{capture:true,passive:true});
const pad=document.querySelector('#move');
if(pad){
 const readMove=e=>{if(movePointer!==null&&e.pointerId!==movePointer)return;const r=pad.getBoundingClientRect(),x=e.clientX-r.left-r.width/2,y=e.clientY-r.top-r.height/2;moving=Math.hypot(x,y)>Math.min(r.width,r.height)*.12;syncMovement()};
 pad.addEventListener('pointerdown',e=>{movePointer=e.pointerId;try{pad.setPointerCapture(e.pointerId)}catch{}readMove(e)},{capture:true});
 // Do not depend on e.buttons for touch. Safari can report buttons=0 during an active touch drag.
 pad.addEventListener('pointermove',e=>{if(movePointer===e.pointerId)readMove(e)},{capture:true});
 const stop=e=>{if(e&&movePointer!==null&&e.pointerId!==movePointer)return;movePointer=null;moving=false;stopTrack(true)};
 for(const ev of['pointerup','pointercancel','lostpointercapture'])pad.addEventListener(ev,stop,{capture:true})
}
const sprintBtn=document.querySelector('#sprint');
if(sprintBtn){
 sprintBtn.addEventListener('pointerdown',e=>{if(sprintPointer!==null&&e.pointerId!==sprintPointer)return;sprintPointer=e.pointerId;try{sprintBtn.setPointerCapture(e.pointerId)}catch{}sprinting=true;syncMovement()},{capture:true});
 // A captured iPhone touch may emit pointerleave while the finger is still physically held.
 // Only the finger that started sprint may end sprint; unrelated multitouch releases are ignored.
 const stopSprint=e=>{if(sprintPointer===null||e.pointerId!==sprintPointer)return;sprintPointer=null;sprinting=false;syncMovement()};
 for(const ev of['pointerup','pointercancel','lostpointercapture'])sprintBtn.addEventListener(ev,stopSprint,{capture:true});
}
function noiseBurst(duration,peak,startHz,endHz){const c=ensureCtx();if(!c)return;const n=Math.floor(c.sampleRate*duration),b=c.createBuffer(1,n,c.sampleRate),d=b.getChannelData(0);for(let i=0;i<n;i++){const t=i/n;d[i]=(Math.random()*2-1)*Math.sin(Math.PI*t)*Math.pow(1-t,.45)}const src=c.createBufferSource(),f=c.createBiquadFilter(),g=c.createGain();src.buffer=b;f.type='lowpass';f.frequency.setValueAtTime(startHz,c.currentTime);f.frequency.exponentialRampToValueAtTime(endHz,c.currentTime+duration);g.gain.setValueAtTime(.0001,c.currentTime);g.gain.exponentialRampToValueAtTime(peak,c.currentTime+.025);g.gain.exponentialRampToValueAtTime(.0001,c.currentTime+duration);src.connect(f);f.connect(g);g.connect(c.destination);src.start()}
function jumpWhoosh(){noiseBurst(.34,.2,1350,420)}
function landingImpact(){if(!gameActive())return;try{gravel.pause();gravel.currentTime=0;gravel.volume=.58;nativePlay.call(gravel);setTimeout(()=>{gravel.pause();gravel.currentTime=0},170)}catch{}noiseBurst(.12,.08,420,150)}
const jumpBtn=document.querySelector('#jump');
jumpBtn?.addEventListener('pointerdown',()=>{if(jumping||!gameActive())return;jumping=true;jumpY=0;jumpVY=5.8;jumpFrameTime=performance.now();stopTrack(true);jumpWhoosh()},{capture:true});
// Mirror game.js jump integration instead of using a wall-clock timeout. game.js caps dt at .035,
// so a low-frame-rate iPhone can stay airborne longer than the ideal ~967 ms. Keeping the same
// simulated gravity prevents footsteps from restarting before the player actually lands.
function watchLanding(now){
 if(jumping&&gameActive()){
  // Pause/background time must not advance the mirrored jump. game.js also stops integrating
  // physics while paused and requestAnimationFrame is suspended while Safari is backgrounded.
  const dt=Math.min(.035,Math.max(0,(now-jumpFrameTime)/1000));jumpFrameTime=now;
  jumpVY-=12*dt;jumpY+=jumpVY*dt;
  if(jumpY<=0&&jumpVY<0){jumpY=0;jumpVY=0;jumping=false;landingImpact();syncMovement()}
 }else if(jumping){
  // Rebase the clock while paused so resume cannot consume hidden wall-clock time.
  jumpFrameTime=now;
 }
 requestAnimationFrame(watchLanding)
}requestAnimationFrame(watchLanding);
// Blood-on-bite overlay.
const style=document.createElement('style');style.textContent=`#bloodFX{position:fixed;inset:0;pointer-events:none;z-index:8;overflow:hidden;opacity:0;transition:opacity .34s ease-out;background:radial-gradient(circle at 50% 45%,transparent 45%,rgba(120,0,8,.25) 80%,rgba(55,0,0,.52))}#bloodFX.hit{opacity:1;transition:none}.bloodDrop{position:absolute;border-radius:55% 45% 60% 40%;background:radial-gradient(circle at 35% 30%,#e73535,#8b0010 48%,#3b0006 100%);box-shadow:0 0 6px #27000088;transform:rotate(var(--r)) scale(var(--s));filter:blur(.25px)}`;document.head.appendChild(style);const blood=document.createElement('div');blood.id='bloodFX';document.body.appendChild(blood);let lastHp=null,lastBlood=0;
function splashBlood(){const now=performance.now();if(now-lastBlood<250)return;lastBlood=now;blood.innerHTML='';blood.classList.add('hit');for(let i=0;i<13;i++){const d=document.createElement('i');d.className='bloodDrop';const size=8+Math.random()*30;d.style.width=size+'px';d.style.height=size*(.55+Math.random()*.8)+'px';d.style.left=3+Math.random()*94+'%';d.style.top=3+Math.random()*92+'%';d.style.setProperty('--r',Math.random()*180+'deg');d.style.setProperty('--s',(.6+Math.random()*1.8).toFixed(2));blood.appendChild(d)}setTimeout(()=>blood.classList.remove('hit'),95);setTimeout(()=>blood.innerHTML='',480)}
const health=document.querySelector('#health');if(health){const read=()=>{const m=health.textContent.match(/(\d+)/);if(!m)return;const hp=Number(m[1]);if(lastHp!==null&&hp<lastHp)splashBlood();lastHp=hp};new MutationObserver(read).observe(health,{childList:true,characterData:true,subtree:true});read()}
// Low distorted demonic honk, deliberately avoiding square/chiptune tones.
function demonicHonk(){const c=ensureCtx();if(!c)return;const t=c.currentTime,master=c.createGain(),lp=c.createBiquadFilter(),shaper=c.createWaveShaper();master.gain.setValueAtTime(.0001,t);master.gain.exponentialRampToValueAtTime(.16,t+.055);master.gain.exponentialRampToValueAtTime(.0001,t+1.05);lp.type='lowpass';lp.frequency.setValueAtTime(620,t);lp.frequency.exponentialRampToValueAtTime(180,t+1.05);const curve=new Float32Array(1024);for(let i=0;i<curve.length;i++){const x=i*2/(curve.length-1)-1;curve[i]=(1.8*x)/(1+1.25*Math.abs(x))}shaper.curve=curve;for(const[freq,det]of[[91,-8],[118,5],[147,-3]]){const o=c.createOscillator();o.type='sawtooth';o.frequency.setValueAtTime(freq,t);o.frequency.exponentialRampToValueAtTime(freq*.62,t+.85);o.detune.value=det;o.connect(shaper);o.start(t);o.stop(t+1.08)}shaper.connect(lp);lp.connect(master);master.connect(c.destination)}
function geeseAlive(){const e=document.querySelector('#geeseLeft');const n=Number((e?.textContent.match(/\d+/)||[0])[0]);return n>0&&gameActive()}
function scheduleHonk(){setTimeout(()=>{if(geeseAlive()&&Math.random()<.78)demonicHonk();scheduleHonk()},3600+Math.random()*4700)}scheduleHonk();
function suspendMovement({resetJump=false}={}){movePointer=null;sprintPointer=null;moving=false;sprinting=false;stopTrack(true);try{gravel.pause();gravel.currentTime=0}catch{}if(resetJump){jumping=false;jumpY=0;jumpVY=0;jumpFrameTime=0}}
// Pause/menu lifecycle is part of the audio state machine: no ghost footsteps under overlays.
// Preserve airborne state across pause/background interruptions because game.js preserves the
// physical jump too. Only a new run is allowed to discard that state.
document.querySelector('#pause')?.addEventListener('click',()=>{gamePaused=true;suspendMovement()},{capture:true});
document.querySelector('.resume')?.addEventListener('click',()=>{gamePaused=false;if(jumping)jumpFrameTime=performance.now();syncMovement()},{capture:true});
document.querySelector('.start')?.addEventListener('click',()=>{gamePaused=false;suspendMovement({resetJump:true})},{capture:true});
document.addEventListener('visibilitychange',()=>{if(document.hidden)suspendMovement();else if(jumping)jumpFrameTime=performance.now()});window.addEventListener('pagehide',()=>suspendMovement());window.addEventListener('blur',()=>suspendMovement());
