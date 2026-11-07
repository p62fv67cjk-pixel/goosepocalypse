// Pure maths tests for the goose animation poses. No three.js needed.
// Run: node --test tests/goose-pose.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import {createState,createPose,stepState,computePose,DEATH_FALL_SECONDS,DEATH_LIFETIME_SECONDS,JAW_AJAR,TAU} from '../goose-pose.js';

const finite=o=>Object.values(o).every(Number.isFinite);
function run(state,seconds,speed,attacking,dt=1/60){for(let t=0;t<seconds;t+=dt)stepState(state,dt,speed,attacking);return state}

test('every pose value stays finite across states, speeds and times',()=>{
 const pose=createPose();
 for(const seed of [0,1,3.5,6])for(const speed of [0,.5,1.3,3,9])for(const attacking of [false,true]){
  const s=createState(seed);run(s,3,speed,attacking);
  assert.ok(finite(computePose(s,pose)),`seed ${seed} speed ${speed} attack ${attacking}`);
 }
 const dead=createState(2);dead.dead=true;
 for(let d=0;d<4;d+=.05){dead.deadT=d;assert.ok(finite(computePose(dead,pose)),'dead at '+d)}
});

test('walking waddles: legs alternate, body rolls, and a stopped goose stands still',()=>{
 const pose=createPose(),s=createState(0);
 run(s,2,1.5,false);
 let maxLeg=0,maxRoll=0;
 for(let i=0;i<120;i++){stepState(s,1/60,1.5,false);computePose(s,pose);
  assert.ok(Math.abs(pose.legL+pose.legR)<1e-9,'legs must swing in opposition');
  maxLeg=Math.max(maxLeg,Math.abs(pose.legL));maxRoll=Math.max(maxRoll,Math.abs(pose.torsoRoll));}
 assert.ok(maxLeg>.5,'leg swing too small: '+maxLeg);
 assert.ok(maxRoll>.08,'waddle roll too small: '+maxRoll);
 run(s,3,0,false);computePose(s,pose);
 assert.ok(Math.abs(pose.legL)<.02&&Math.abs(pose.torsoRoll)<.02,'stopped goose must stop walking');
});

test('mouth is never fully shut so the teeth always show',()=>{
 const pose=createPose(),s=createState(1);
 for(let i=0;i<600;i++){stepState(s,1/60,i%200<100?2:0,i%300>150);computePose(s,pose);assert.ok(pose.jaw>=JAW_AJAR-1e-9)}
});

test('attacking lunges the head forward, chomps the jaw and flares the wings',()=>{
 const idle=createState(0),atk=createState(0),a=createPose(),b=createPose();
 run(idle,2,0,false);run(atk,2,0,true);
 let minHeadZ=0,maxJaw=0,maxSpread=0,maxRaise=0;
 for(let i=0;i<180;i++){stepState(atk,1/60,0,true);computePose(atk,b);
  minHeadZ=Math.min(minHeadZ,b.headZ);maxJaw=Math.max(maxJaw,b.jaw);maxSpread=Math.max(maxSpread,b.wingSpread);maxRaise=Math.max(maxRaise,b.wingRaise)}
 computePose(idle,a);
 assert.ok(a.headZ===0&&a.wingSpread===0,'idle goose must not lunge or flare');
 assert.ok(minHeadZ<-.12,'head must lunge forward (-Z): '+minHeadZ);
 assert.ok(maxJaw>JAW_AJAR+.35,'jaw must open wide: '+maxJaw);
 assert.ok(maxSpread>.5&&maxRaise>.6,'wings must flare and flap');
});

test('death: falls onto its side, then fades out at the end of its lifetime',()=>{
 const s=createState(1),p=createPose();s.dead=true;
 let prev=-1;
 for(let d=0;d<=DEATH_FALL_SECONDS;d+=.05){s.deadT=d;computePose(s,p);const roll=Math.abs(p.torsoRoll);assert.ok(roll>=prev-1e-9,'roll must not unwind');prev=roll}
 s.deadT=DEATH_FALL_SECONDS;computePose(s,p);
 assert.ok(Math.abs(p.torsoRoll)>1.4,'fallen goose lies on its side');
 assert.ok(p.torsoY<-.15,'body settles onto the ground');
 assert.equal(p.fade,0);
 s.deadT=DEATH_LIFETIME_SECONDS;computePose(s,p);assert.ok(Math.abs(p.fade-1)<1e-9,'fully faded at end of life');
 const left=createState(1),right=createState(5);left.dead=right.dead=true;left.deadT=right.deadT=1;
 const l=computePose(left,createPose()),r=computePose(right,createPose());
 assert.equal(Math.sign(l.torsoRoll),-Math.sign(r.torsoRoll),'geese can fall to either side');
});

test('stepState guards bad input and keeps the gait phase bounded',()=>{
 const s=createState(0);
 stepState(s,NaN,2,false);stepState(s,-1,2,false);stepState(s,0,2,false);
 assert.equal(s.clock,0);
 stepState(s,10,2,false);assert.ok(s.clock<=.05+1e-9,'huge dt is clamped');
 run(s,2000,5,false);assert.ok(s.phase<=TAU*32+1e-6,'phase must wrap');
 stepState(s,.016,-4,false);assert.ok(Number.isFinite(s.speed)&&s.speed>=0);
 const big=createState(0);big.scale=2.25;const small=createState(0);small.scale=.82;
 run(big,1,2,false);run(small,1,2,false);
 assert.ok(big.phase<small.phase,'big geese take slower strides');
});
