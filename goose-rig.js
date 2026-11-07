// Goose rendering + animation for Geese With Teeth.
//
// Why this exists: every goose used to be ~70 separate meshes, each with its own freshly created geometry, and
// ~12 fresh materials, none of which were ever disposed. That meant ~70 draw calls per goose, a steady
// GPU-memory leak and a lot of garbage on iPhone. Here every goose is MESHES_PER_GOOSE meshes that share
// geometry and materials between ALL geese, and goose rigs are pooled and reused.
//
// three.js is injected (makeGooseKit(THREE)) so game.js and this file always use the same three instance and
// the logic can be unit-tested in Node. Weapons, loot and gameplay code are deliberately NOT touched here.
import {createState,createPose,resetPose,stepState,computePose,TAU,DEATH_LIFETIME_SECONDS} from "./goose-pose.js";

// body, skull, eyes, eye glow, jaw, 2 wings, 2 legs
export const MESHES_PER_GOOSE=9;
// Pivot points in the original goose coordinate system (head faces -Z).
const T=[0,.8,0],H=[0,1.86,-.64],J=[0,1.72,-.9],O=[0,0,0];

function mulberry32(a){return function(){a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296}}

export function makeGooseKit(THREE,options={}){
 const camera=options.camera||null;
 const maxCorpses=options.maxCorpses??8;
 const clock=options.now||(()=>performance.now());
 const LOD_FAR=options.lodFar??62;      // beyond this distance geese stop animating (saves CPU)
 const HALO_FAR=options.haloFar??46;    // beyond this distance the eye glow quad is hidden (saves a draw call)
 const stats={built:0,recycled:0,corpses:0};
 const pools={normal:[],brute:[],boss:[]};
 const corpses=[];
 const noRaycast=()=>{};
 let seedCounter=0x9e3779b9,deathCounter=0;
 // Deterministic seeds: must NOT consume Math.random so the game's spawn sequence is unchanged.
 const nextSeed=()=>{seedCounter=(Math.imul(seedCounter,1664525)+1013904223)>>>0;return seedCounter/4294967296*TAU};

 // ---- shared primitives (unit-sized; scaled per part when merged) ----
 const sphLo=new THREE.SphereGeometry(1,8,6),sphMid=new THREE.SphereGeometry(1,16,12),sphHead=new THREE.SphereGeometry(1,14,10);
 const cone=new THREE.ConeGeometry(1,1,5),box=new THREE.BoxGeometry(1,1,1),plane=new THREE.PlaneGeometry(1,1);
 const neckGeo=new THREE.CylinderGeometry(.145,.22,.78,10),legGeo=new THREE.CylinderGeometry(.045,.055,.3,6);

 // ---- shared materials (one set for every goose in the game) ----
 const bodyMat=new THREE.MeshStandardMaterial({vertexColors:true,roughness:.9,metalness:0});
 const eyeMat=new THREE.MeshBasicMaterial({vertexColors:true});
 const eyeDeadMat=new THREE.MeshBasicMaterial({vertexColors:true,color:0x2a0508});
 const glowTexture=(options.glowTexture!==undefined?options.glowTexture:makeGlowTexture());
 const haloMat=new THREE.MeshBasicMaterial({map:glowTexture||null,color:0xff2a3c,transparent:true,opacity:.7,blending:THREE.AdditiveBlending,depthWrite:false,side:THREE.DoubleSide});
 function makeGlowTexture(){
  if(typeof document==="undefined")return null;
  const c=document.createElement("canvas");c.width=c.height=64;
  const x=c.getContext("2d");if(!x)return null;
  const g=x.createRadialGradient(32,32,0,32,32,32);
  g.addColorStop(0,"rgba(255,215,215,1)");g.addColorStop(.25,"rgba(255,40,56,.8)");g.addColorStop(1,"rgba(255,0,20,0)");
  x.fillStyle=g;x.fillRect(0,0,64,64);
  const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;return t;
 }

 // ---- geometry merging: bakes parts (position, rotation, scale, colour) into one vertex-coloured geometry ----
 const _m=new THREE.Matrix4(),_q=new THREE.Quaternion(),_e=new THREE.Euler(),_p=new THREE.Vector3(),_s=new THREE.Vector3(),_c=new THREE.Color();
 class Builder{
  constructor(rng,pivot,withUV=false){this.rng=rng;this.pivot=pivot;this.withUV=withUV;this.pos=[];this.nor=[];this.col=[];this.uv=[]}
  add(geo,p,s,color,{r=O,jitter=0}={}){
   const g=geo.index?geo.toNonIndexed():geo.clone();
   _e.set(r[0],r[1],r[2]);_q.setFromEuler(_e);
   _p.set(p[0]-this.pivot[0],p[1]-this.pivot[1],p[2]-this.pivot[2]);_s.set(s[0],s[1],s[2]);
   _m.compose(_p,_q,_s);g.applyMatrix4(_m);
   _c.set(color);if(jitter)_c.multiplyScalar(1+(this.rng()*2-1)*jitter);   // per-feather tint so plumage is not flat
   const pa=g.attributes.position.array,na=g.attributes.normal.array,n=pa.length/3;
   for(let i=0;i<pa.length;i++){this.pos.push(pa[i]);this.nor.push(na[i])}
   for(let i=0;i<n;i++)this.col.push(_c.r,_c.g,_c.b);
   if(this.withUV){const ua=g.attributes.uv.array;for(let i=0;i<ua.length;i++)this.uv.push(ua[i])}
   g.dispose();return this;
  }
  build(){
   const g=new THREE.BufferGeometry();
   g.setAttribute("position",new THREE.Float32BufferAttribute(this.pos,3));
   g.setAttribute("normal",new THREE.Float32BufferAttribute(this.nor,3));
   g.setAttribute("color",new THREE.Float32BufferAttribute(this.col,3));
   if(this.withUV)g.setAttribute("uv",new THREE.Float32BufferAttribute(this.uv,2));
   g.computeBoundingSphere();g.computeBoundingBox();return g;
  }
 }

 const palettes={};
 function palette(key){return palettes[key]||(palettes[key]=buildPalette(key))}
 function buildPalette(key){
  const boss=key==="boss",brute=key==="brute",rng=mulberry32(boss?7:brute?5:3);
  const plum=boss?0x28252d:brute?0x454950:0xe7e2d7,feather=boss?0x17151d:brute?0x353a40:0xf7f0e4;
  const beak=boss?0x6f151d:0xd65a18,dark=0x100b12,tooth=0xfff1d7,mouth=0x21050a,gum=0x7b1c2b;
  // Torso: body, back feathers, tail fan, neck (all static relative to the torso pivot).
  const torso=new Builder(rng,T);
  torso.add(sphMid,[0,.8,0],[.632,.484,.88],plum,{jitter:.03});
  for(let i=-2;i<=2;i++)torso.add(sphLo,[i*.17,1.08-Math.abs(i)*.04,.12],[.13,.07,.34],feather,{r:[0,0,i*.18],jitter:.07});
  for(let i=-3;i<=3;i++)torso.add(sphLo,[i*.105,.98,1.02+Math.abs(i)*.025],[.1045,.0855,.3135],feather,{r:[-.18,i*.13,0],jitter:.06});
  torso.add(neckGeo,[0,1.48,-.56],[1,1,1],plum,{r:[-.22,0,0]});
  // Skull: head, brows, eye sockets, upper beak, mouth cavity, upper teeth + two fangs.
  const head=new Builder(rng,H);
  head.add(sphHead,[0,1.94,-.66],[.29,.2668,.3277],plum,{jitter:.02});
  for(const side of[-1,1]){
   head.add(box,[side*.155,2.09,-.86],[.22,.075,.11],dark,{r:[0,0,side*.16]});
   head.add(sphLo,[side*.155,1.99,-.91],[.105,.105,.105],dark);
  }
  head.add(cone,[0,1.86,-1.17],[.22,.43,.22],beak,{r:[-Math.PI/2,0,0]});
  head.add(box,[0,1.78,-1.02],[.38,.19,.16],mouth);
  for(let i=-2;i<=2;i++)head.add(cone,[i*.065,1.765,-1.13],[.044,.17,.044],tooth,{r:[Math.PI,0,0]});
  for(const side of[-1,1])head.add(cone,[side*.15,1.76,-1.1],[.038,.22,.038],tooth,{r:[Math.PI,0,side*.08]});
  // Eyes: unlit red eyeballs with a hot core. Unlit so they glow regardless of the scene lighting.
  const eyes=new Builder(rng,H);
  for(const side of[-1,1]){
   eyes.add(sphLo,[side*.155,1.99,-.99],[.075,.075,.07],0xff0a20);
   eyes.add(sphLo,[side*.15,2,-1.04],[.028,.028,.028],0xffc7c7);
  }
  // Eye glow: two additive quads in front of the eyes.
  const halo=new Builder(rng,H,true);
  for(const side of[-1,1])halo.add(plane,[side*.155,1.99,-1.03],[.44,.44,1],0xffffff);
  // Lower jaw (hinged): lower beak, lower teeth, tongue.
  const jaw=new Builder(rng,J);
  jaw.add(box,[0,1.69,-1.12],[.36,.085,.3],beak);
  for(let i=-2;i<=2;i++)jaw.add(cone,[i*.065,1.72,-1.105],[.04,.15,.04],tooth);
  jaw.add(box,[0,1.705,-1.02],[.2,.03,.22],gum);
  const pal={body:torso.build(),head:head.build(),eyes:eyes.build(),halo:halo.build(),jaw:jaw.build(),wing:{},leg:{}};
  for(const side of[-1,1]){
   // Wings and legs are built in their own pivot-local coordinates.
   const w=new Builder(rng,O);
   for(let j=0;j<9;j++)w.add(sphLo,[side*j*.065,-.12-j*.018,.38-j*.145],[.0986,.0646,.2635],feather,{r:[0,side*.18,0],jitter:.06});
   for(let j=0;j<6;j++)w.add(sphLo,[side*j*.055,.06,.02-j*.12],[.112,.0672,.175],plum,{jitter:.05});
   pal.wing[side]=w.build();
   const l=new Builder(rng,O);
   l.add(legGeo,[0,-.17,0],[1,1,1],beak);
   l.add(box,[0,-.33,-.11],[.22,.07,.32],beak);
   for(let k=-1;k<=1;k++)l.add(cone,[k*.065,-.345,-.27],[.025,.12,.025],dark,{r:[Math.PI/2,0,0]});
   pal.leg[side]=l.build();
  }
  return pal;
 }

 // ---- rig construction ----
 function part(geo,mat){const m=new THREE.Mesh(geo,mat);m.updateMatrix();m.matrixAutoUpdate=false;return m}
 function buildRig(key){
  const pal=palette(key);
  const root=new THREE.Group();root.name="goose";
  const torso=new THREE.Group();torso.position.set(T[0],T[1],T[2]);root.add(torso);
  torso.add(part(pal.body,bodyMat));
  const head=new THREE.Group();head.position.set(H[0]-T[0],H[1]-T[1],H[2]-T[2]);torso.add(head);
  const eyes=part(pal.eyes,eyeMat),halo=part(pal.halo,haloMat);
  halo.raycast=noRaycast;halo.renderOrder=2;      // glow must never intercept or register a shot
  head.add(part(pal.head,bodyMat),eyes,halo);
  const jaw=new THREE.Group();jaw.position.set(J[0]-H[0],J[1]-H[1],J[2]-H[2]);head.add(jaw);
  jaw.add(part(pal.jaw,bodyMat));
  const wings=[],legs=[];
  for(const side of[-1,1]){
   const w=new THREE.Group();w.position.set(side*.48-T[0],1.02-T[1],.04-T[2]);w.add(part(pal.wing[side],bodyMat));torso.add(w);wings.push(w);
   const l=new THREE.Group();l.position.set(side*.22,.42,-.05);l.add(part(pal.leg[side],bodyMat));root.add(l);legs.push(l);
  }
  root.rig={palette:key,state:createState(0),pose:createPose(),torso,head,jaw,wings,legs,eyes,halo,
   dead:false,deadAt:0,deathId:0,baseScale:1,px:0,pz:0,fresh:true,last:0,pooled:false};
  // Animate right before this goose's matrices are recomputed, so the pose applies in the same frame and the
  // game's own frame loop does not need to know about the rig.
  root.updateMatrixWorld=function(force){animate(this);THREE.Object3D.prototype.updateMatrixWorld.call(this,force)};
  // Any goose or corpse removed from a scene (kill, reset, corpse expiry) returns to the pool automatically.
  root.addEventListener("removed",()=>{
   const r=root.rig;if(r.pooled)return;
   r.pooled=true;pools[r.palette].push(root);
   const i=corpses.indexOf(root);if(i>=0)corpses.splice(i,1);
  });
  // game.js assigns g.userData after acquire() and before S.add(g). Arm the death hook as the goose enters the
  // scene, so game.js needs no extra call. Corpses and already-armed geese (accessor hp) are skipped.
  root.addEventListener("added",()=>{
   const d=Object.getOwnPropertyDescriptor(root.userData,"hp");
   if(d&&"value" in d&&typeof d.value==="number")arm(root);
  });
  stats.built++;
  return root;
 }

 function applyPose(r,p){
  r.torso.position.y=T[1]+p.torsoY;r.torso.rotation.set(p.torsoPitch,p.torsoYaw,p.torsoRoll);
  r.head.position.z=H[2]-T[2]+p.headZ;r.head.rotation.set(p.headPitch,p.headYaw,0);
  r.jaw.rotation.x=-p.jaw;
  r.wings[0].rotation.set(0,p.wingSpread,-(p.wingRaise-.12));   // left wing (side -1)
  r.wings[1].rotation.set(0,-p.wingSpread,p.wingRaise-.12);     // right wing (side +1)
  r.legs[0].rotation.x=p.legL;r.legs[1].rotation.x=p.legR;
 }

 function animate(g){
  const r=g.rig,t=clock();
  let dt=(t-r.last)*.001;r.last=t;
  if(!(dt>0))return;
  const moveDt=dt>.035?.035:dt;           // the game caps its own step at .035s, so measure speed the same way
  if(dt>.05)dt=.05;
  const s=r.state,pose=r.pose;
  // Shared glow pulse (one assignment for all geese).
  const pulse=Math.sin(t*.0062);eyeMat.color.setScalar(.9+.14*pulse);haloMat.opacity=.55+.2*Math.sin(t*.0062+1);
  if(r.dead){
   s.deadT=(t-r.deadAt)*.001;computePose(s,pose);applyPose(r,pose);
   g.scale.setScalar(Math.max(.001,r.baseScale*(1-pose.fade)));
   return;
  }
  const x=g.position.x,z=g.position.z;
  if(r.fresh){r.px=x;r.pz=z;r.fresh=false}
  const mx=x-r.px,mz=z-r.pz;r.px=x;r.pz=z;
  let dist=1e9;
  if(camera){const dx=camera.position.x-x,dz=camera.position.z-z;dist=Math.sqrt(dx*dx+dz*dz)}
  if(dist>LOD_FAR){r.halo.visible=false;return}
  s.scale=g.scale.x;
  stepState(s,dt,Math.sqrt(mx*mx+mz*mz)/moveDt,dist<1.3*g.scale.x+.55);
  computePose(s,pose);applyPose(r,pose);
  r.halo.visible=dist<HALO_FAR;
 }

 function resetRig(g){
  const r=g.rig;
  r.state=createState(nextSeed());r.dead=false;r.fresh=true;r.last=clock();r.pooled=false;r.deathId=0;r.baseScale=1;
  r.eyes.material=eyeMat;r.halo.visible=true;
  resetPose(r.pose);applyPose(r,r.pose);
  g.visible=true;g.userData={};g.position.set(0,0,0);g.quaternion.identity();g.scale.setScalar(1);
 }

 // Get a goose rig (recycled if one is available). type: "normal" | "fast" | "brute" | "boss".
 function acquire(type="normal"){
  const key=type==="boss"?"boss":type==="brute"?"brute":"normal";
  let g=pools[key].pop();
  if(g)stats.recycled++;else g=buildRig(key);
  resetRig(g);
  return g;
 }

 // Spawn an animated corpse where goose g is standing. The game removes g itself immediately afterwards.
 function die(g){
  const parent=g.parent,r=g.rig;
  if(!parent||!r||r.dead||r.pooled)return null;
  const c=acquire(r.palette),cr=c.rig;
  c.position.copy(g.position);c.quaternion.copy(g.quaternion);c.scale.copy(g.scale);
  cr.dead=true;cr.deadAt=clock();cr.baseScale=g.scale.x;cr.state.dead=true;cr.state.deadT=0;cr.state.side=r.state.side;
  cr.eyes.material=eyeDeadMat;cr.halo.visible=false;cr.deathId=++deathCounter;
  parent.add(c);corpses.push(c);stats.corpses++;
  while(corpses.length>maxCorpses){const old=corpses.shift();if(old.parent)old.parent.remove(old)}
  const id=cr.deathId;
  setTimeout(()=>{if(cr.deathId===id&&c.parent)c.parent.remove(c)},DEATH_LIFETIME_SECONDS*1000+50);
  return c;
 }

 // Wire the death animation to the goose's hit points: when hp drops to 0 or below, a corpse appears.
 // Normally automatic (see the "added" listener in buildRig); calling arm(g) again is harmless.
 function arm(g){
  const u=g.userData,d=Object.getOwnPropertyDescriptor(u,"hp");
  if(!d||!("value" in d))return;           // no hp yet, or already armed
  let hp=d.value;
  Object.defineProperty(u,"hp",{get(){return hp},set(v){const was=hp;hp=v;if(was>0&&v<=0)die(g)},enumerable:true,configurable:true});
 }

 function dispose(){
  for(const g of[sphLo,sphMid,sphHead,cone,box,plane,neckGeo,legGeo])g.dispose();
  for(const m of[bodyMat,eyeMat,eyeDeadMat,haloMat])m.dispose();
  if(glowTexture)glowTexture.dispose();
  for(const pal of Object.values(palettes)){
   for(const k of["body","head","eyes","halo","jaw"])pal[k].dispose();
   for(const k of[-1,1]){pal.wing[k].dispose();pal.leg[k].dispose()}
  }
 }

 return {acquire,arm,die,dispose,stats,pools,corpses,MESHES_PER_GOOSE};
}
