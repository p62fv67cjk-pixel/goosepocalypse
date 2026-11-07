// Goose rig tests against the REAL three.js (installed by the workflow: npm i --no-save three@0.170.0).
// Run: node --test tests/goose-rig.test.mjs
import test,{mock} from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {makeGooseKit,MESHES_PER_GOOSE} from '../goose-rig.js';
import {JAW_AJAR,DEATH_LIFETIME_SECONDS} from '../goose-pose.js';

const meshesOf=o=>{const out=[];o.traverse(c=>{if(c.isMesh)out.push(c)});return out};
function setup(opts={}){
 let t=1000;
 const camera=new THREE.PerspectiveCamera();camera.position.set(0,1.7,5);
 const scene=new THREE.Scene();
 const kit=makeGooseKit(THREE,{camera,now:()=>t,...opts});
 const frame=(n=1,ms=16)=>{for(let i=0;i<n;i++){t+=ms;scene.updateMatrixWorld()}};
 const spawn=(type='normal',x=0,z=-30)=>{const g=kit.acquire(type);g.position.set(x,.02,z);g.userData={hp:3,type};kit.arm(g);scene.add(g);return g};
 return {kit,scene,camera,frame,spawn};
}

test('a goose is a small fixed number of meshes for every type',()=>{
 const {kit}=setup();
 assert.ok(MESHES_PER_GOOSE<=9);
 for(const type of ['normal','fast','brute','boss'])assert.equal(meshesOf(kit.acquire(type)).length,MESHES_PER_GOOSE,type);
});

test('all geese share geometry and materials (no per-goose GPU allocations)',()=>{
 const {kit,spawn}=setup();
 const geos=new Set(),mats=new Set();
 for(let i=0;i<40;i++){for(const m of meshesOf(spawn(['normal','fast','brute','boss'][i%4],i,-30))){geos.add(m.geometry.uuid);mats.add(m.material.uuid)}}
 assert.ok(geos.size<=27,'geometry objects: '+geos.size);   // 3 palettes x 9 parts, regardless of goose count
 assert.ok(mats.size<=3,'materials: '+mats.size);           // body, eyes, glow
 assert.equal(kit.stats.built,40);
});

test('triangle budget per goose stays bounded',()=>{
 const {kit}=setup();
 for(const type of ['normal','brute','boss']){
  let tris=0;for(const m of meshesOf(kit.acquire(type)))tris+=m.geometry.attributes.position.count/3;
  assert.ok(tris<9000,type+' goose has '+tris+' triangles');
 }
});

test('teeth are ivory, eyes are red, and the glow is additive and cannot be shot',()=>{
 const {kit,scene}=setup();
 const g=kit.acquire('normal');scene.add(g);scene.updateMatrixWorld();
 const colors=m=>{const a=m.geometry.attributes.color.array,out=[];for(let i=0;i<a.length;i+=3)out.push([a[i],a[i+1],a[i+2]]);return out};
 const ms=meshesOf(g);
 const ivory=ms.filter(m=>m.geometry.attributes.color).flatMap(colors).filter(([r,gr,b])=>r>.95&&gr>.8&&b>.55&&b<.8).length;
 assert.ok(ivory>150,'expected ~20 visible teeth, found '+ivory+' ivory vertices');
 const eyes=ms.find(m=>m.material.isMeshBasicMaterial&&m.material.vertexColors);
 assert.ok(eyes,'unlit eye mesh missing');
 assert.ok(colors(eyes).some(([r,gr,b])=>r>.9&&gr<.1&&b<.1),'eyes must contain saturated red');
 const halo=ms.find(m=>m.material.blending===THREE.AdditiveBlending);
 assert.ok(halo&&halo.material.transparent&&!halo.material.depthWrite,'eye glow must be additive, transparent, no depth write');
 const p=new THREE.Vector3();halo.getWorldPosition(p);
 const ray=new THREE.Raycaster(new THREE.Vector3(p.x,p.y,p.z+3),new THREE.Vector3(0,0,-1));
 assert.equal(ray.intersectObject(halo,false).length,0,'glow quad must never register a hit');
 assert.ok(ray.intersectObject(g,true).every(h=>h.object!==halo));
});

test('rigs are pooled: killed/removed geese are reused instead of reallocated',()=>{
 const {kit,scene,spawn}=setup();
 const first=Array.from({length:12},(_,i)=>spawn('normal',i,-30));
 assert.equal(kit.stats.built,12);
 first.forEach(g=>scene.remove(g));
 const second=Array.from({length:12},(_,i)=>spawn('normal',i,-30));
 assert.equal(kit.stats.built,12,'second wave must not build new rigs');
 assert.equal(new Set([...first,...second]).size,12,'same 12 objects reused');
 scene.remove(second[0]);scene.remove(second[0]);                // double removal must not double-pool
 assert.equal(kit.pools.normal.length,1);
 const again=kit.acquire('normal');assert.equal(again.rig.dead,false);assert.equal(again.rig.pooled,false);
});

test('walking goose waddles, charging goose bites; far geese stop animating',()=>{
 const {kit,camera,frame,spawn}=setup();
 const g=spawn('normal',0,-30);
 let maxLeg=0,maxRoll=0;
 for(let i=0;i<120;i++){g.position.z+=.04;frame();maxLeg=Math.max(maxLeg,Math.abs(g.rig.legs[0].rotation.x));maxRoll=Math.max(maxRoll,Math.abs(g.rig.torso.rotation.z))}
 assert.ok(maxLeg>.3,'legs should swing while walking: '+maxLeg);
 assert.ok(maxRoll>.05,'body should roll while walking: '+maxRoll);
 g.position.set(0,.02,camera.position.z-1);                    // in biting range of the player
 let minJaw=0,maxSpread=0,minHead=0;
 for(let i=0;i<90;i++){frame();minJaw=Math.min(minJaw,g.rig.jaw.rotation.x);maxSpread=Math.max(maxSpread,Math.abs(g.rig.wings[1].rotation.y));minHead=Math.min(minHead,g.rig.head.position.z)}
 assert.ok(minJaw<-(JAW_AJAR+.2),'jaw should open to bite: '+minJaw);
 assert.ok(maxSpread>.3,'wings should flare when attacking');
 assert.ok(minHead<-.7,'head should lunge forward');
 const far=spawn('normal',150,-150);frame(30);
 assert.equal(far.rig.legs[0].rotation.x,0);assert.equal(far.rig.halo.visible,false,'glow quad hidden when far away');
});

test('killing a goose plays a death animation on a corpse, which then expires and is recycled',()=>{
 mock.timers.enable({apis:['setTimeout']});
 try{
  const {kit,scene,frame,spawn}=setup();
  const g=spawn('boss',3,-8);g.scale.setScalar(2.25);
  assert.equal(scene.children.length,1);
  g.userData.hp-=99;                                              // what game.js's fire()/team() do
  assert.equal(scene.children.length,2,'a corpse is added alongside the goose the game is about to remove');
  const corpse=scene.children.find(c=>c!==g);
  assert.ok(corpse.rig.dead);assert.equal(corpse.position.x,3);assert.equal(corpse.scale.x,2.25);
  scene.remove(g);                                                // game.js kill()
  frame(70);
  assert.ok(Math.abs(corpse.rig.torso.rotation.z)>1.4,'corpse must have fallen on its side');
  assert.ok(corpse.rig.eyes.material!==g.rig.eyes.material,'dead eyes go dark');
  mock.timers.tick(DEATH_LIFETIME_SECONDS*1000+100);
  assert.equal(scene.children.length,0,'corpse removed after its lifetime');
  assert.ok(kit.pools.boss.includes(corpse),'corpse returns to the pool');
  g.userData.hp-=1;                                               // a second hit on a pooled goose must not spawn anything
  assert.equal(scene.children.length,0);
 }finally{mock.timers.reset()}
});

test('corpse count is capped so draw calls stay bounded in busy waves',()=>{
 mock.timers.enable({apis:['setTimeout']});
 try{
  const {kit,scene,spawn}=setup({maxCorpses:3});
  const geese=Array.from({length:10},(_,i)=>spawn('normal',i,-8));
  geese.forEach(g=>{g.userData.hp-=9;scene.remove(g)});
  assert.equal(scene.children.length,3);
  assert.equal(kit.corpses.length,3);
 }finally{mock.timers.reset()}
});

test('removing a goose that never died (new run / reset) spawns no corpse',()=>{
 const {scene,spawn}=setup();
 const g=spawn();scene.remove(g);assert.equal(scene.children.length,0);
});

test('transforms stay finite over a long randomised run',()=>{
 const {scene,camera,frame,spawn}=setup();
 const geese=Array.from({length:20},(_,i)=>spawn(['normal','fast','brute','boss'][i%4],(i-10)*3,-20));
 let seed=1;const rnd=()=>{seed=(seed*16807)%2147483647;return seed/2147483647};
 for(let i=0;i<400;i++){geese.forEach(g=>{g.position.x+=(rnd()-.5)*.3;g.position.z+=(rnd()-.4)*.2;g.lookAt(camera.position.x,g.position.y,camera.position.z);g.rotateY(Math.PI)});frame(1,rnd()<.1?90:16)}
 scene.traverse(o=>{for(const v of o.matrixWorld.elements)assert.ok(Number.isFinite(v),'non-finite matrix on '+o.name)});
});

test('dispose releases shared resources without throwing',()=>{
 const {kit,spawn}=setup();spawn();assert.doesNotThrow(()=>kit.dispose());
});
