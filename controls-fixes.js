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
  // Never invent a pointerup when this control has no active owner. releaseAllControls can run
  // more than once for one interruption (blur + pagehide, or both orientation APIs on iPhone).
  // A fake pointerId=-1 release would leak into game.js/effects.js as a second terminal gesture.
  if(!el||pointerId===null||pointerId<0)return;
  try{el.dispatchEvent(new PointerEvent('pointerup',{bubbles:true,pointerId,pointerType:'touch'}))}
  catch{el.dispatchEvent(new Event('pointerup',{bubbles:true}))}
}

// effects.js used to treat pointerleave as sprint release. On iPhone a held/captured touch can
// produce pointerleave while the finger is still down, which drops running audio back to walking
// even though game.js still considers sprint held. Consume leave during owned sprint gestures;
// pointerup, pointercancel and lostpointercapture are the only terminal events.
document.addEventListener('pointerleave',e=>{
  if(sprintButton&&activeSprintPointer!==null&&e.target===sprintButton&&e.pointerId===activeSprintPointer){
    e.stopImmediatePropagation();
  }
},{capture:true});

// Sprint is a held control, so give it explicit pointer ownership. This prevents a second finger,
// a stray pointerleave, or an interrupted Safari gesture from toggling the run state incorrectly.
if(sprintButton){
  sprintButton.addEventListener('pointerdown',e=>{
    if(activeSprintPointer!==null&&activeSprintPointer!==e.pointerId){
      e.stopImmediatePropagation();
      return;
    }
    activeSprintPointer=e.pointerId;
    try{sprintButton.setPointerCapture(e.pointerId)}catch{}
  },{capture:true});
  const endSprint=e=>{
    if(activeSprintPointer===null||e.pointerId!==activeSprintPointer){
      if(activeSprintPointer!==null)e.stopImmediatePropagation();
      return;
    }
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
    if(e.pointerType!=='touch'&&e.pointerType!=='pen')return;
    if(activeMovePointer!==null&&activeMovePointer!==e.pointerId){
      e.stopImmediatePropagation();
      return;
    }
    activeMovePointer=e.pointerId;
    try{movePad.setPointerCapture(e.pointerId)}catch{}
  },{capture:true});

  // Keep every non-owner move away from game.js. Blocking only the second pointerdown is not
  // sufficient on multi-touch Safari: later pointermove events can still target the joystick and
  // overwrite mx/my even though the first finger owns the control. After the owner releases, a
  // previously rejected second finger may remain on-screen and Safari can retarget its moves to
  // the pad. With no active owner those orphaned moves must also be rejected or they can restart
  // movement/footsteps without a valid joystick pointerdown. Mouse hover remains unaffected.
  // For the owner, repair Safari's occasional buttons=0.
  movePad.addEventListener('pointermove',e=>{
    const touchLike=e.pointerType==='touch'||e.pointerType==='pen';
    if(touchLike&&activeMovePointer===null){
      e.stopImmediatePropagation();
      return;
    }
    if(activeMovePointer!==null&&e.pointerId!==activeMovePointer){
      e.stopImmediatePropagation();
      return;
    }
    if(activeMovePointer!==e.pointerId||e.buttons!==0||e.__gwtSafariMove)return;
    // Replace the broken Safari event rather than letting both the repaired event and the
    // original buttons=0 event reach game.js/effects.js. Otherwise the original can immediately
    // overwrite the repaired joystick state or make downstream listeners process one physical
    // finger movement twice.
    e.stopImmediatePropagation();
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

  const endMove=e=>{
    if(activeMovePointer===null||e.pointerId!==activeMovePointer){
      if(activeMovePointer!==null)e.stopImmediatePropagation();
      return;
    }
    const id=activeMovePointer;
    activeMovePointer=null;
    // game.js historically releases movement on pointerup. Safari can terminate an otherwise
    // valid joystick gesture with pointercancel or lostpointercapture, so translate either into
    // the same terminal pointerup after clearing ownership. This keeps gameplay velocity and the
    // effects.js footstep state machine from disagreeing and prevents "stuck walking" on iPhone.
    if(e.type!=='pointerup')release(movePad,id);
  };
  for(const type of ['pointerup','pointercancel','lostpointercapture']){
    movePad.addEventListener(type,endMove,{capture:true});
  }
}

// game.js stores its camera-look drag as a boolean and only clears it on pointerup. On iPhone,
// an interrupted gesture can therefore leave the camera permanently dragging. Keep strict
// one-finger ownership just like the joystick: a second look touch must never steal the pointer,
// otherwise releasing the first finger can leave game.js drag=true with no valid owner.
if(gameCanvas){
  gameCanvas.addEventListener('pointerdown',e=>{
    if(e.pointerType!=='touch'&&e.pointerType!=='pen')return;
    if(activeLookPointer!==null&&activeLookPointer!==e.pointerId){
      e.stopImmediatePropagation();
      return;
    }
    activeLookPointer=e.pointerId;
    try{gameCanvas.setPointerCapture(e.pointerId)}catch{}
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
  const moveId=activeMovePointer;
  const lookId=activeLookPointer;
  activeSprintPointer=null;
  activeMovePointer=null;
  activeLookPointer=null;
  release(sprintButton,sprintId);
  release(movePad,moveId);
  release(gameCanvas,lookId);
}

document.addEventListener('visibilitychange',()=>{if(document.hidden)releaseAllControls()});
window.addEventListener('pagehide',releaseAllControls);
window.addEventListener('blur',releaseAllControls);
// Rotating an iPhone can invalidate pointer capture and change control geometry without a clean
// terminal event. Release held movement/look/sprint before the new portrait/landscape layout is
// used so stale coordinates cannot leave the player walking, running, or camera-dragging.
window.addEventListener('orientationchange',releaseAllControls);
screen.orientation?.addEventListener?.('change',releaseAllControls);
