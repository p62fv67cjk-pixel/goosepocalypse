// iPhone/Safari control lifecycle hardening.
// game.js already handles normal pointerup, but sprint can otherwise remain latched when
// Safari cancels a touch, loses capture, backgrounds, or the finger leaves the button.
const sprintButton=document.querySelector('#sprint');
const movePad=document.querySelector('#move');

function release(el){
  if(!el)return;
  try{el.dispatchEvent(new PointerEvent('pointerup',{bubbles:true,pointerId:-1,pointerType:'touch'}))}
  catch{el.dispatchEvent(new Event('pointerup',{bubbles:true}))}
}

if(sprintButton){
  for(const type of ['pointercancel','lostpointercapture','pointerleave']){
    sprintButton.addEventListener(type,()=>release(sprintButton),{capture:true});
  }
}

function releaseAllControls(){
  release(sprintButton);
  release(movePad);
}

document.addEventListener('visibilitychange',()=>{if(document.hidden)releaseAllControls()});
window.addEventListener('pagehide',releaseAllControls);
window.addEventListener('blur',releaseAllControls);
