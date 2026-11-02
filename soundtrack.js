import './landscape.js';
import './effects.js?v=20261102-2';
import './controls-fixes.js?v=20261102-11';

// Live cinematic character-select artwork uploaded by the player.
const menu=document.querySelector('#menu');
if(menu){
  menu.style.background=" #05070b url('./0785915F-C2F5-4D94-9CB8-099B2054FEEB.png?v=1') center center / cover no-repeat";
  const style=document.createElement('style');
  style.textContent=`#menu .menuShade{background:linear-gradient(0deg,#0008 0%,transparent 30%),linear-gradient(90deg,#0005,transparent 18% 82%,#0005)}#menu .title,#menu .sub,#menu .portrait,#menu .name,#menu .ability{opacity:0;pointer-events:none}#menu .picks{position:absolute;inset:20% 14% 19%;width:auto;height:auto;gap:5%;grid-template-columns:1fr 1fr}#menu .pick{background:transparent;border-color:transparent!important;box-shadow:none!important;border-radius:24px}#menu .pick.on{background:#ffffff08;outline:3px solid #ffffff88;box-shadow:0 0 25px #fff5!important}#menu .start{position:absolute;left:50%;bottom:max(3vh,env(safe-area-inset-bottom));transform:translateX(-50%);z-index:4;width:min(360px,48vw);height:clamp(48px,8vh,72px);font-size:clamp(24px,4vw,42px)}#menu .start:active{transform:translateX(-50%) scale(.97)}@media (orientation:portrait){#menu{background-size:cover;background-position:center}#menu .picks{inset:24% 5% 18%;gap:2%}#menu .start{width:70vw;bottom:max(4vh,env(safe-area-inset-bottom))}}`;
  document.head.appendChild(style);
}

// Official Geese With Teeth soundtrack. One Audio instance only, so repeated runs never stack music loops.
const track=new Audio('./geese-with-teeth-suno.m4a');
track.loop=true;track.preload='auto';track.volume=.72;track.playsInline=true;
let wanted=false,starting=false;
const button=document.createElement('button');
button.id='musicToggle';button.textContent='♫ OFF';button.setAttribute('aria-label','Toggle music');button.setAttribute('aria-pressed','false');
Object.assign(button.style,{position:'fixed',right:'12px',top:'calc(env(safe-area-inset-top) + 115px)',zIndex:'16',width:'54px',height:'34px',borderRadius:'18px',border:'1px solid #ffffff88',background:'#111b',color:'#fff',fontWeight:'900',fontSize:'10px',touchAction:'manipulation'});
document.body.appendChild(button);
function paint(){const audible=wanted&&!track.paused;button.textContent=audible?'♫ ON':wanted?'♫ TAP':'♫ OFF';button.setAttribute('aria-pressed',String(audible))}
async function startMusic({restart=false}={}){wanted=true;if(starting)return;starting=true;try{if(restart)track.currentTime=0;await track.play()}catch{}finally{starting=false;paint()}}
function stopMusic(){wanted=false;track.pause();paint()}
button.addEventListener('click',e=>{e.stopPropagation();wanted?stopMusic():startMusic()});
// PLAY is a guaranteed user gesture on iPhone. Restart the official track exactly once for each new run.
document.querySelector('.start')?.addEventListener('click',()=>startMusic({restart:true}));
// iOS may suspend media when Safari backgrounds. Resume only if the player had music enabled.
document.addEventListener('visibilitychange',()=>{if(document.hidden){track.pause();paint()}else if(wanted)startMusic()});
window.addEventListener('pagehide',()=>{track.pause();paint()});
track.addEventListener('play',paint);track.addEventListener('pause',paint);track.addEventListener('error',()=>{button.textContent='♫ ERR';button.setAttribute('aria-pressed','false')});