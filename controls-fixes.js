// iPhone/Safari control lifecycle hardening.
// game.js handles normal pointerup, but Safari can cancel touches, lose capture, background,
// or report buttons=0 during a perfectly valid touch drag. Keep the actual gameplay controls
// and the movement-audio controller in agreement without changing weapon/soundtrack code.
const sprintButton=document.querySelector('#sprint');
const movePad=document.querySelector('#move');
let activeMovePointer=null;

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

if(movePad){
  movePad.addEventListener('pointerdown',e=>{
    if(e.pointerType==='touch'||e.pointerType==='pen'){
      activeMovePointer=e.pointerId;
      try{movePad.setPointerCapture(e.pointerId)}catch{}
    }
  },{capture:true});

  // game.js historically ignores pointermove when e.buttons===0. iOS Safari may report exactly
  // that while a finger is still down. Re-emit only those active-touch moves with buttons=1 so
  // game.js updates mx/my; the managed audio controller still sees the real pointer normally.
  movePad.addEventListener('pointermove',e=>{
    if(activeMovePointer!==e.pointerId||e.buttons!==0||e.__gwtSafariMove)return;
    let fixed;
    try{
      fixed=new PointerEvent('pointermove',{
        bubbles:true,cancelable:true,pointerId:e.pointerId,pointerType:e.pointerType||'touch',
        isPrimary:e.isPrimary,clientX:e.clientX,clientY:e.clientY,screenX:e.screenX,screenY:e.screenY,
        pressure:e.pressure||.5,buttons:1,button:0
      });
      Object.defineProperty(fixed,'__gwtSafariMove',{value:true});
      movePad.dispatchEvent(fixed);
    }catch{}
  },{capture:true});

  const clearPointer=e=>{
    if(activeMovePointer===null||!e||e.pointerId===activeMovePointer)activeMovePointer=null;
  };
  for(const type of ['pointerup','pointercancel','lostpointercapture']){
    movePad.addEventListener(type,clearPointer,{capture:true});
  }
}

function releaseAllControls(){
  activeMovePointer=null;
  release(sprintButton);
  release(movePad);
}

document.addEventListener('visibilitychange',()=>{if(document.hidden)releaseAllControls()});
window.addEventListener('pagehide',releaseAllControls);
window.addEventListener('blur',releaseAllControls);
