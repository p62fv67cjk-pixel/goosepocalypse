// Geese With Teeth runtime effects controller.
// Keeps movement audio deterministic on iOS and prevents the older movement Audio objects
// in game.js from producing duplicate/ghost sounds.
const WALK_SRC='./mixkit-footsteps-on-tall-grass-532.wav';
const RUN_SRC='./thumblegray-running-on-the-floor-359909%202.mp3';
const GRAVEL_SRC='./freesound_community-footsteps-dirt-gravel-6823.mp3';

const nativePlay=HTMLMediaElement.prototype.play;
HTMLMediaElement.prototype.play=function(...args){
  const u=this.currentSrc||this.src||'';
  if(!this.__gwtManagedAudio && /mixkit-footsteps-on-tall-grass-532|freesound_community-footsteps-dirt-gravel-6823|thumblegray-running-on-the-floor-359909/i.test(u)){
    try{this.pause();this.currentTime=0}catch{}
    return Promise.resolve();
  }
  return nativePlay.apply(this,args);
};

const walk=new Audio(WALK_SRC),run=new Audio(RUN_SRC),gravel=new Audio(GRAVEL_SRC);
for(const a of [walk,run,gravel]){a.__gwtManagedAudio=true;a.preload='auto';a.loop=true;a.playsInline=true;a.volume=.92}
gravel.loop=false;
let moving=false,sprinting=false,jumping=false,current=null,unlocked=false;

function stopTrack(reset=true){
  for(const a of [walk,run]){try{a.pause();if(reset)a.currentTime=0}catch{}}
  current=null;
}
async function playTrack(a){
  if(current===a&&!a.paused)return;
  stopTrack(true);current=a;a.muted=false;a.loop=true;
  try{await nativePlay.call(a)}catch{}
}
function syncMovement(){
  if(!moving||jumping){stopTrack(true);return}
  playTrack(sprinting?run:walk);
}
async function unlock(){
  if(unlocked)return;unlocked=true;
  for(const a of [walk,run,gravel]){
    try{a.muted=true;await nativePlay.call(a);a.pause();a.currentTime=0;a.muted=false}catch{a.muted=false}
  }
  ensureCtx();
}

document.addEventListener('pointerdown',unlock,{once:true,capture:true});
document.querySelector('.start')?.addEventListener('pointerdown',unlock,{capture:true});

const pad=document.querySelector('#move');
if(pad){
  const readMove=e=>{
    const r=pad.getBoundingClientRect(),x=e.clientX-r.left-r.width/2,y=e.clientY-r.top-r.height/2;
    moving=Math.hypot(x,y)>Math.min(r.width,r.height)*.12;
    syncMovement();
  };
  pad.addEventListener('pointerdown',readMove,{capture:true});
  pad.addEventListener('pointermove',e=>{if(e.buttons!==0)readMove(e)},{capture:true});
  const stop=()=>{moving=false;stopTrack(true)};
  pad.addEventListener('pointerup',stop,{capture:true});
  pad.addEventListener('pointercancel',stop,{capture:true});
}
const sprintBtn=document.querySelector('#sprint');
sprintBtn?.addEventListener('pointerdown',()=>{sprinting=true;syncMovement()},{capture:true});
for(const ev of ['pointerup','pointercancel','pointerleave'])sprintBtn?.addEventListener(ev,()=>{sprinting=false;syncMovement()},{capture:true});

let ctx=null;
function ensureCtx(){
  try{const AC=window.AudioContext||window.webkitAudioContext;if(!AC)return null;if(!ctx)ctx=new AC();if(ctx.state==='suspended')ctx.resume();return ctx}catch{return null}
}
function jumpWhoosh(){
  const c=ensureCtx();if(!c)return;
  const dur=.34,n=Math.floor(c.sampleRate*dur),buf=c.createBuffer(1,n,c.sampleRate),d=buf.getChannelData(0);
  for(let i=0;i<n;i++){const t=i/n,env=Math.sin(Math.PI*t)*Math.pow(1-t,.45);d[i]=(Math.random()*2-1)*env}
  const src=c.createBufferSource(),filter=c.createBiquadFilter(),gain=c.createGain();
  src.buffer=buf;filter.type='lowpass';filter.frequency.setValueAtTime(1350,c.currentTime);filter.frequency.exponentialRampToValueAtTime(420,c.currentTime+dur);
  gain.gain.setValueAtTime(.0001,c.currentTime);gain.gain.exponentialRampToValueAtTime(.2,c.currentTime+.035);gain.gain.exponentialRampToValueAtTime(.0001,c.currentTime+dur);
  src.connect(filter);filter.connect(gain);gain.connect(c.destination);src.start();
}
function landingImpact(){
  try{gravel.pause();gravel.currentTime=0;gravel.volume=.58;nativePlay.call(gravel);setTimeout(()=>{gravel.pause();gravel.currentTime=0},170)}catch{}
}
const jumpBtn=document.querySelector('#jump');
jumpBtn?.addEventListener('pointerdown',()=>{
  if(jumping)return;
  jumping=true;
  stopTrack(true);
  jumpWhoosh();
  setTimeout(landingImpact,900);
  setTimeout(()=>{jumping=false;syncMovement()},1020);
},{capture:true});

// Blood-on-bite screen splashes, driven by actual health loss so it works without touching game internals.
const style=document.createElement('style');
style.textContent=`#bloodFX{position:fixed;inset:0;pointer-events:none;z-index:8;overflow:hidden;opacity:0;transition:opacity .34s ease-out;background:radial-gradient(circle at 50% 45%,transparent 45%,rgba(120,0,8,.25) 80%,rgba(55,0,0,.52))}#bloodFX.hit{opacity:1;transition:none}.bloodDrop{position:absolute;border-radius:55% 45% 60% 40%;background:radial-gradient(circle at 35% 30%,#e73535,#8b0010 48%,#3b0006 100%);box-shadow:0 0 6px #27000088;transform:rotate(var(--r)) scale(var(--s));filter:blur(.25px)}`;
document.head.appendChild(style);
const blood=document.createElement('div');blood.id='bloodFX';document.body.appendChild(blood);
let lastHp=null,lastBlood=0;
function splashBlood(){
  const now=performance.now();if(now-lastBlood<250)return;lastBlood=now;
  blood.innerHTML='';blood.classList.add('hit');
  for(let i=0;i<13;i++){
    const d=document.createElement('i');d.className='bloodDrop';
    const size=8+Math.random()*30;d.style.width=size+'px';d.style.height=(size*(.55+Math.random()*.8))+'px';
    d.style.left=(3+Math.random()*94)+'%';d.style.top=(3+Math.random()*92)+'%';d.style.setProperty('--r',(Math.random()*180)+'deg');d.style.setProperty('--s',(.6+Math.random()*1.8).toFixed(2));blood.appendChild(d);
  }
  setTimeout(()=>blood.classList.remove('hit'),95);
  setTimeout(()=>blood.innerHTML='',480);
}
const health=document.querySelector('#health');
if(health){
  const read=()=>{const m=health.textContent.match(/(\d+)/);if(!m)return;const hp=Number(m[1]);if(lastHp!==null&&hp<lastHp)splashBlood();lastHp=hp};
  new MutationObserver(read).observe(health,{childList:true,characterData:true,subtree:true});read();
}

// Low, distorted demonic honk. Deliberately avoids square-wave / chiptune tones.
function demonicHonk(){
  const c=ensureCtx();if(!c)return;
  const t=c.currentTime,master=c.createGain(),lp=c.createBiquadFilter(),shaper=c.createWaveShaper();
  master.gain.setValueAtTime(.0001,t);master.gain.exponentialRampToValueAtTime(.16,t+.055);master.gain.exponentialRampToValueAtTime(.0001,t+1.05);
  lp.type='lowpass';lp.frequency.setValueAtTime(620,t);lp.frequency.exponentialRampToValueAtTime(180,t+1.05);
  const curve=new Float32Array(1024);for(let i=0;i<curve.length;i++){const x=i*2/(curve.length-1)-1;curve[i]=(1.8*x)/(1+1.25*Math.abs(x))}shaper.curve=curve;
  for(const [freq,det] of [[91,-8],[118,5],[147,-3]]){const o=c.createOscillator();o.type='sawtooth';o.frequency.setValueAtTime(freq,t);o.frequency.exponentialRampToValueAtTime(freq*.62,t+.85);o.detune.value=det;o.connect(shaper);o.start(t);o.stop(t+1.08)}
  const n=Math.floor(c.sampleRate*.8),b=c.createBuffer(1,n,c.sampleRate),data=b.getChannelData(0);for(let i=0;i<n;i++)data[i]=(Math.random()*2-1)*Math.pow(1-i/n,1.8);
  const ns=c.createBufferSource(),ng=c.createGain();ns.buffer=b;ng.gain.value=.13;ns.connect(ng);ng.connect(lp);ns.start(t);
  shaper.connect(lp);lp.connect(master);master.connect(c.destination);
}
function geeseAlive(){const e=document.querySelector('#geeseLeft');const n=Number((e?.textContent.match(/\d+/)||[0])[0]);return n>0&&getComputedStyle(document.querySelector('#menu')).display==='none'}
function scheduleHonk(){setTimeout(()=>{if(geeseAlive()&&Math.random()<.78)demonicHonk();scheduleHonk()},3600+Math.random()*4700)}
scheduleHonk();

document.addEventListener('visibilitychange',()=>{if(document.hidden)stopTrack(true)});
