// iPhone/Safari control lifecycle hardening.
// game.js handles normal pointerup, but Safari can cancel touches, lose capture, background,
// or report buttons=0 during a perfectly valid touch drag. Keep the actual gameplay controls
// and the movement-audio controller in agreement without changing weapon/soundtrack code.
const sprintButton=document.querySelector('#sprint');
const movePad=document.querySelector('#move');
const gameCanvas=document.querySelector('#game');
let activeSprintPointer=null;
let activeMovePointer=null;
let activeLookPointer=null;

function release(el,pointerId=-1){
  if(!el)return;
  try{el.dispatchEvent(new PointerEvent('pointerup',{bubbles:true,pointerId,pointerType:'touch'}))}
  catch{el.dispatchEvent(new Event('pointerup',{bubbles:true}))}
}

// Sprint is a held control, so give it explicit pointer ownership. This prevents a second finger,
// a stray pointerleave, or an interrupted Safari gesture from toggling the run state incorrectly.
if(sprintButton){
  sprintButton.addEventListener('pointerdown',e=>{
    if(activeSprintPointer!==null&&activeSprintPointer!==e.pointerId)return;
    activeSprintPointer=e.pointerId;
    try{sprintButton.setPointerCapture(e.pointerId)}catch{}
  },{capture:true});
  const endSprint=e=>{
    if(activeSprintPointer===null||e.pointerId!==activeSprintPointer)return;
    const id=activeSprintPointer;
    activeSprintPointer=null;
    if(e.type!=='pointerup')release(sprintButton,id);
  };
  for(const type of ['pointerup','pointercancel','lostpointercapture']){
    sprintButton.addEventListener(type,endSprint,{capture:true});
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

// game.js stores its camera-look drag as a boolean and only clears it on pointerup. On iPhone,
// an interrupted gesture can therefore leave the camera permanently dragging. Capture the look
// pointer and convert cancellation/lost-capture into the pointerup game.js already understands.
if(gameCanvas){
  gameCanvas.addEventListener('pointerdown',e=>{
    if(e.pointerType==='touch'||e.pointerType==='pen'){
      activeLookPointer=e.pointerId;
      try{gameCanvas.setPointerCapture(e.pointerId)}catch{}
    }
  },{capture:true});
  const endLook=e=>{
    if(activeLookPointer===null||e.pointerId!==activeLookPointer)return;
    const id=activeLookPointer;
    activeLookPointer=null;
    if(e.type!=='pointerup')release(gameCanvas,id);
  };
  for(const type of ['pointerup','pointercancel','lostpointercapture']){
    gameCanvas.addEventListener(type,endLook,{capture:true});
  }
}

function releaseAllControls(){
  const sprintId=activeSprintPointer;
  const lookId=activeLookPointer;
  activeSprintPointer=null;
  activeMovePointer=null;
  activeLookPointer=null;
  release(sprintButton,sprintId??-1);
  release(movePad);
  release(gameCanvas,lookId??-1);
}

document.addEventListener('visibilitychange',()=>{if(document.hidden)releaseAllControls()});
window.addEventListener('pagehide',releaseAllControls);
window.addEventListener('blur',releaseAllControls);
