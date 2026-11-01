// Orientation helper for Geese With Teeth.
// Gameplay is intentionally supported in both portrait and landscape. Never cover the game
// with a rotate-screen blocker: iPhone/iPad users may prefer either orientation.
let orientationHint=null;
function ensureHint(){
  if(orientationHint)return orientationHint;
  orientationHint=document.createElement('div');
  orientationHint.id='orientationHint';
  orientationHint.textContent='↻ Landscape gives you a wider view';
  Object.assign(orientationHint.style,{position:'fixed',left:'50%',bottom:'calc(env(safe-area-inset-bottom) + 150px)',transform:'translateX(-50%)',zIndex:'20',padding:'7px 12px',borderRadius:'999px',background:'#05060bcc',color:'#fff',font:'700 11px Arial,sans-serif',letterSpacing:'.2px',pointerEvents:'none',opacity:'0',transition:'opacity .25s',whiteSpace:'nowrap'});
  document.body.appendChild(orientationHint);
  return orientationHint;
}
function showPortraitHint(){
  if(innerHeight<=innerWidth)return;
  const h=ensureHint();h.style.opacity='.78';clearTimeout(showPortraitHint.t);showPortraitHint.t=setTimeout(()=>h.style.opacity='0',1800);
}
async function preferLandscape(){
  // Best effort only. Safari may reject fullscreen/orientation locking and that is fine.
  try{await screen.orientation?.lock?.('landscape')}catch{}
}
addEventListener('orientationchange',()=>setTimeout(()=>{if(innerHeight>innerWidth)showPortraitHint()},140),{passive:true});
document.querySelector('.start')?.addEventListener('click',()=>{if(innerWidth>=innerHeight)preferLandscape();else showPortraitHint()});
