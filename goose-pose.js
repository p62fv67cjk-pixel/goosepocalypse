// Pure procedural pose maths for the geese.
// Deliberately free of any three.js import so it can be unit-tested in plain Node.
// goose-rig.js applies the resulting pose to the real pivots every frame.
//
// Conventions (goose local space, head points towards -Z):
//   rotation.x > 0 tips a forward-pointing part UP, so "head down" / "jaw open" are negative angles.
//   legL/legR are hip swing angles, wingRaise lifts the wing tip, wingSpread swings it away from the body.
export const TAU=Math.PI*2;
export const DEATH_FALL_SECONDS=.85;
export const DEATH_LIFETIME_SECONDS=1.7;
export const DEATH_FADE_SECONDS=.45;
export const WALK_FULL_SPEED=1;   // world units/second at which the waddle reaches full amplitude
export const JAW_AJAR=.2;         // radians: mouth is never fully shut so the teeth always read

const clamp01=v=>v<0?0:v>1?1:v;
const smooth=v=>{v=clamp01(v);return v*v*(3-2*v)};

export function resetPose(o){
 o.torsoY=0;o.torsoRoll=0;o.torsoYaw=0;o.torsoPitch=0;
 o.headZ=0;o.headPitch=0;o.headYaw=0;o.jaw=JAW_AJAR;
 o.wingRaise=0;o.wingSpread=0;o.legL=0;o.legR=0;o.fade=0;
 return o;
}
export function createPose(){return resetPose({})}
export function createState(seed=0){
 return {phase:0,speed:0,attack:0,clock:0,seed,side:seed>Math.PI?-1:1,dead:false,deadT:0,scale:1};
}

// Advance the animation state. moveSpeed is the goose's measured ground speed (units/second).
export function stepState(s,dt,moveSpeed,attacking){
 if(!(dt>0))return s;
 if(dt>.05)dt=.05;
 s.clock+=dt;
 const ms=moveSpeed>0?moveSpeed:0;
 s.speed+=(ms-s.speed)*Math.min(1,dt*8);
 s.attack+=((attacking?1:0)-s.attack)*Math.min(1,dt*10);
 if(s.speed>.12){
  // Stride rate rises with speed but big geese (boss) take slower, heavier steps.
  s.phase+=dt*(3+Math.min(s.speed,6)*1.9)/(.6+.4*s.scale);
  if(s.phase>TAU*32)s.phase-=TAU*32;
 }
 return s;
}

export function computePose(s,o){
 if(s.dead)return deadPose(s,o);
 const w=clamp01(s.speed/WALK_FULL_SPEED),a=s.attack,ph=s.phase,t=s.clock+s.seed;
 const run=clamp01((s.speed-2)/2);                 // fast geese lean and flutter harder
 const bite=.5+.5*Math.sin(t*9.5),chomp=.5+.5*Math.sin(t*13);
 const sw=Math.sin(ph);
 // Waddle: roll and yaw follow the stride, the body bobs twice per stride.
 o.torsoY=Math.abs(sw)*.05*w+Math.sin(t*2.1)*.012;
 o.torsoRoll=sw*.13*w;
 o.torsoYaw=sw*.07*w;
 o.torsoPitch=-(.05*w+.08*run+.14*a);
 o.legL=sw*.75*w;
 o.legR=-o.legL;
 // Head counter-bobs while walking; during an attack it lunges forward and snaps down.
 o.headZ=-.22*a*(.35+.65*bite);
 o.headPitch=Math.sin(ph*2+1.1)*.06*w-.32*a*bite;
 o.headYaw=-sw*.08*w+Math.sin(t*1.3)*.05*(1-a);
 o.jaw=JAW_AJAR+a*.55*chomp;
 // Wings stay mostly folded but flutter when running and flare + flap when attacking.
 o.wingRaise=.04+.03*Math.sin(t*3)+w*.08*Math.sin(ph*2)+run*.2*Math.sin(ph*2+.5)+a*(.5+.45*Math.sin(t*16));
 o.wingSpread=a*.7+run*.2;
 o.fade=0;
 return o;
}

// Death is a pure function of time since death, so it is deterministic and easy to test.
function deadPose(s,o){
 const d=s.deadT,f=smooth(d/DEATH_FALL_SECONDS),side=s.side;
 const kick=1-f;
 o.torsoY=-.18*f+(d<.3?.1*Math.sin(clamp01(d/.3)*Math.PI):0);
 o.torsoRoll=side*1.45*f;
 o.torsoYaw=side*.25*f;
 o.torsoPitch=.18*f;
 o.legL=.7*Math.sin(d*22)*kick+.45*f;
 o.legR=.7*Math.sin(d*22+2.3)*kick-.3*f;
 o.headZ=0;
 o.headPitch=-.45*f;
 o.headYaw=side*.5*f;
 o.jaw=JAW_AJAR+.6*f;
 o.wingRaise=.55*f+.2*kick*Math.sin(d*20);
 o.wingSpread=.9*f;
 o.fade=smooth((d-(DEATH_LIFETIME_SECONDS-DEATH_FADE_SECONDS))/DEATH_FADE_SECONDS);
 return o;
}
