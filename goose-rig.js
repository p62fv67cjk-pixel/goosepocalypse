// Goose rendering + animation for Geese With Teeth.
//
// Why this exists: every goose used to be ~70 separate meshes, each with its own freshly created geometry, and
// ~12 fresh materials, none of which were ever disposed. That meant ~70 draw calls per goose, a steady
// GPU-memory leak and a lot of garbage on iPhone. Here every goose is MESHES_PER_GOOSE meshes that share
// geometry and materials between ALL geese, and goose rigs are pooled and reused.
//
// Realism pass: the body, neck, bill, wings and feet are now modelled shapes (see goose-shapes.js) instead of
// stacked primitives, with a tiling feather-scale texture and soft belly/back shading. The rig, pivots, pose
// maths and draw-call budget are unchanged.
//
// three.js is injected (makeGooseKit(THREE)) so game.js and this file always use the same three instance and
// the logic can be unit-tested in Node. Weapons, loot and gameplay code are deliberately NOT touched here.
import {createState,createPose,resetPose,stepState,computePose,TAU,DEATH_LIFETIME_SECONDS} from "./goose-pose.js";
import {bodyShape,tubeShape,billShape,footShape} from "./goose-shapes.js";

// body, skull, eyes, eye glow, jaw, 2 wings, 2 legs
export const MESHES_PER_GOOSE=9;
// Pivot points in the original goose coordinate system (head faces -Z).
const T=[0,.8,0],H=[0,1.86,-.64],J=[0,1.72,-.9],O=[0,0,0];
// Wing shoulder (goose space). Wing geometry is built with +x outward, +z towards the tail, folded against the flank.
const SHOULDER=[.52,1.07,-.2];
// Texel in the corner of the feather texture that is plain white: parts that must NOT show feather scales
// (bill, teeth, feet, eyes) point all their UVs here. Canvas row 0 is v=1 because textures are flipped on upload.
const SOLID_UV=[3/128,1-3/128];

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
 const sphFeather=new THREE.SphereGeometry(1,7,4);      // thin lens-shaped feather blade once scaled
 const cone=new THREE.ConeGeometry(1,1,5),box=new THREE.BoxGeometry(1,1,1),plane=new THREE.PlaneGeometry(1,1);
 const legGeo=new THREE.CylinderGeometry(.045,.055,.3,6);

 // ---- shared materials (one set for every goose in the game) ----
 const featherTexture=(options.featherTexture!==undefined?options.featherTexture:makeFeatherTexture());
 const bodyMat=new THREE.MeshStandardMaterial({vertexColors:true,roughness:.88,metalness:0,map:featherTexture||null});
 const eyeMat=new THREE.MeshBasicMaterial({vertexColors:true});
 const eyeDeadMat=new THREE.MeshBasicMaterial({vertexColors:true,color:0x2a0508});
 const glowTexture=(options.glowTexture!==undefined?options.glowTexture:makeGlowTexture());
 const haloMat=new THREE.MeshBasicMaterial({map:glowTexture||null,color:0xff2a3c,transparent:true,opacity:.7,blending:THREE.AdditiveBlending,depthWrite:false,side:THREE.DoubleSide});
 // game.js disposes whatever a removed goose references; shared resources must survive that.
 for(const m of[bodyMat,eyeMat,eyeDeadMat,haloMat])m.userData.shared=true;

 // Tiling feather-scale texture, multiplied with the per-vertex plumage colour. 128px keeps it cheap on iPhone.
 function makeFeatherTexture(){
  if(typeof document==="undefined")return null;
  const c=document.createElement("canvas");c.width=c.height=128;
  const x=c.getContext("2d");if(!x)return null;
  x.fillStyle="#cfcfcf";x.fillRect(0,0,128,128);
  // 8 x 8 overlapping scallops, every other row offset by half a scale. Rows/columns -1 and 8 wrap the edges so it tiles.
  for(let row=-1;row<=8;row++)for(let col=-1;col<=8;col++){
   const cx=col*16+(row&1?8:0),cy=row*16+8;
   const g=x.createRadialGradient(cx,cy-3,1,cx,cy,11);
   g.addColorStop(0,"#f4f4f4");g.addColorStop(.65,"#dcdcdc");g.addColorStop(1,"#a2a2a2");
   x.fillStyle=g;x.beginPath();x.arc(cx,cy,10,0,Math.PI*2);x.fill();
  }
  x.fillStyle="#ffffff";x.fillRect(0,0,6,6);              // the solid texel that plain parts sample (SOLID_UV)
  const t=new THREE.CanvasTexture(c);
  t.wrapS=t.wrapT=THREE.RepeatWrapping;t.colorSpace=THREE.SRGBColorSpace;return t;
 }
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
 // uv option: false = no UVs, "keep" = copy each part's own UVs (glow quad), true = feather texture where a part
 // asks for it (tex:true) and the plain white texel everywhere else.
 const _m=new THREE.Matrix4(),_q=new THREE.Quaternion(),_e=new THREE.Euler(),_p=new THREE.Vector3(),_s=new THREE.Vector3(),_c=new THREE.Color(),_n=new THREE.Vector3();
 class Builder{
  constructor(rng,pivot,{uv=false}={}){this.rng=rng;this.pivot=pivot;this.uvMode=uv;this.pos=[];this.nor=[];this.col=[];this.uv=[]}
  _tint(color,jitter,k){_c.set(color);const j=jitter?1+(this.rng()*2-1)*jitter:1;_c.multiplyScalar(j*k)}
  _pushUV(ua,i,tex,uvScale){
   if(!this.uvMode)return;
   if(this.uvMode==="keep"){this.uv.push(ua[2*i],ua[2*i+1]);return}
   if(tex)this.uv.push(ua[2*i]*uvScale[0],ua[2*i+1]*uvScale[1]);else this.uv.push(SOLID_UV[0],SOLID_UV[1]);
  }
  // A transformed copy of a shared three.js primitive.
  add(geo,p,s,color,{r=O,jitter=0,k=1,shade=null,tex=false,uvScale=[1,1]}={}){
   const g=geo.index?geo.toNonIndexed():geo.clone();
   _e.set(r[0],r[1],r[2]);_q.setFromEuler(_e);
   _p.set(p[0]-this.pivot[0],p[1]-this.pivot[1],p[2]-this.pivot[2]);_s.set(s[0],s[1],s[2]);
   _m.compose(_p,_q,_s);g.applyMatrix4(_m);
   this._tint(color,jitter,k);
   const pa=g.attributes.position.array,na=g.attributes.normal.array,n=pa.length/3,ua=this.uvMode?g.attributes.uv.array:null;
   for(let i=0;i<pa.length;i++){this.pos.push(pa[i]);this.nor.push(na[i])}
   for(let i=0;i<n;i++){
    const sh=shade?shade(pa[3*i]+this.pivot[0],pa[3*i+1]+this.pivot[1],pa[3*i+2]+this.pivot[2],na[3*i],na[3*i+1],na[3*i+2]):1;
    this.col.push(_c.r*sh,_c.g*sh,_c.b*sh);
    this._pushUV(ua,i,tex,uvScale);
   }
   g.dispose();return this;
  }
  // A transformed copy of a generated shape from goose-shapes.js (indexed arrays). Normals are rotated, not scaled.
  addShape(shape,p,s,color,{r=O,jitter=0,k=1,shade=null,tex=false,uvScale=[1,1]}={}){
   _e.set(r[0],r[1],r[2]);_q.setFromEuler(_e);
   this._tint(color,jitter,k);
   const P=shape.pos,N=shape.nor,U=shape.uv,I=shape.idx,count=P.length/3,tp=new Array(P.length),tn=new Array(N.length);
   for(let v=0;v<count;v++){
    _p.set(P[3*v]*s[0],P[3*v+1]*s[1],P[3*v+2]*s[2]).applyQuaternion(_q);
    tp[3*v]=_p.x+p[0]-this.pivot[0];tp[3*v+1]=_p.y+p[1]-this.pivot[1];tp[3*v+2]=_p.z+p[2]-this.pivot[2];
    _n.set(N[3*v],N[3*v+1],N[3*v+2]).applyQuaternion(_q).normalize();
    tn[3*v]=_n.x;tn[3*v+1]=_n.y;tn[3*v+2]=_n.z;
   }
   for(let t=0;t<I.length;t++){
    const v=I[t];
    this.pos.push(tp[3*v],tp[3*v+1],tp[3*v+2]);this.nor.push(tn[3*v],tn[3*v+1],tn[3*v+2]);
    const sh=shade?shade(tp[3*v]+this.pivot[0],tp[3*v+1]+this.pivot[1],tp[3*v+2]+this.pivot[2],tn[3*v],tn[3*v+1],tn[3*v+2]):1;
    this.col.push(_c.r*sh,_c.g*sh,_c.b*sh);
    this._pushUV(U,v,tex,uvScale);
   }
   return this;
  }
  build(){
   // Never let a bad number reach the GPU (a NaN position would make the whole goose vanish).
   for(const a of[this.pos,this.nor,this.col])for(let i=0;i<a.length;i++)if(!Number.isFinite(a[i]))a[i]=0;
   const g=new THREE.BufferGeometry();
   g.setAttribute("position",new THREE.Float32BufferAttribute(this.pos,3));
   g.setAttribute("normal",new THREE.Float32BufferAttribute(this.nor,3));
   g.setAttribute("color",new THREE.Float32BufferAttribute(this.col,3));
   if(this.uvMode)g.setAttribute("uv",new THREE.Float32BufferAttribute(this.uv,2));
   g.computeBoundingSphere();g.computeBoundingBox();
   g.userData.shared=true;                    // shared between all geese: game.js must not dispose it per kill
   return g;
  }
 }

 // Back is a touch darker than the belly, like real plumage.
 const bodyShade=(x,y,z,nx,ny)=>1.06-.1*ny;
 // Where the flank surface is (half-width of the body at world z), so wing feathers can lie along it.
 const flank=zw=>.56-.3*Math.pow(Math.max(0,(zw-.2)/.9),2);

 const palettes={};
 function palette(key){return palettes[key]||(palettes[key]=buildPalette(key))}
 function buildPalette(key){
  const boss=key==="boss",brute=key==="brute",rng=mulberry32(boss?7:brute?5:3);
  const plum=boss?0x28252d:brute?0x454950:0xe7e2d7,feather=boss?0x17151d:brute?0x353a40:0xf7f0e4;
  const beak=boss?0x6f151d:0xd65a18,dark=0x100b12,tooth=0xfff1d7,mouth=0x21050a,gum=0x7b1c2b;
  const neckPts=[[0,1,-.46],[0,1.28,-.62],[0,1.56,-.6],[0,1.78,-.64]],neckStops=[[0,.27],[.35,.205],[.75,.155],[1,.16]];
  const neckShape=tubeShape(neckPts,neckStops,{radial:12,samples:14});
  // Torso: smooth body, saddle feathers, tail fan, S-curved neck, thighs (all static relative to the torso pivot).
  const torso=new Builder(rng,T,{uv:true});
  torso.addShape(bodyShape(),[0,.82,.06],[1,1,1],plum,{jitter:.03,tex:true,shade:bodyShade});
  for(let i=-2;i<=2;i++)torso.add(sphFeather,[i*.14,1.335-Math.abs(i)*.03,.18],[.09,.022,.34],feather,{r:[.04,i*.07,i*.22],jitter:.07,tex:true});
  // Tail fan feathers
  for(let i=-4;i<=4;i++)torso.add(sphFeather,[i*.05,.99+Math.abs(i)*.004,1.2],[.075,.02,.24],feather,{r:[-.2,i*.09,0],jitter:.06,k:.95,tex:true});
  torso.addShape(neckShape,[0,0,0],[1,1,1],plum,{jitter:.02,tex:true,shade:bodyShade});
  for(const side of[-1,1])torso.add(sphLo,[side*.27,.56,.12],[.2,.25,.3],plum,{jitter:.03,tex:true});
  // Skull: head, cheeks, neck stub, brows, eye sockets, goose bill, mouth cavity, upper teeth + fangs.
  const head=new Builder(rng,H,{uv:true});
  head.add(sphHead,[0,1.94,-.67],[.255,.24,.33],plum,{jitter:.02,tex:true,uvScale:[2,2]});
  for(const side of[-1,1])head.add(sphLo,[side*.16,1.88,-.8],[.1,.085,.15],plum,{tex:true});
  head.addShape(tubeShape([[0,1.7,-.62],[0,1.82,-.66],[0,1.93,-.7]],[[0,.165],[1,.15]],{radial:10,samples:6}),[0,0,0],[1,1,1],plum,{tex:true});
  // Brow ridges and glowing eyes facing forward
  for(const side of[-1,1]){
   head.add(box,[side*.155,2.09,-.86],[.22,.075,.11],dark,{r:[0,0,side*.16]});
   head.add(sphLo,[side*.155,1.99,-.91],[.105,.105,.105],dark);
  }
  head.addShape(billShape({len:.42,hw0:.15,hw1:.085,hh0:.075,hh1:.042,droop:.035}),[0,1.865,-.94],[1,1,1],beak);
  head.add(sphLo,[0,1.835,-1.355],[.05,.022,.045],dark);                    // dark nail at the bill tip
  // Open mouth cavity, upper/lower beak and individually visible teeth
  head.add(box,[0,1.78,-1.02],[.38,.19,.16],mouth);
  for(let i=-2;i<=2;i++)head.add(cone,[i*.06,1.765,-1.19+Math.abs(i)*.02],[.042,.17-Math.abs(i)*.012,.042],tooth,{r:[Math.PI,0,0]});
  for(const side of[-1,1]){
   head.add(cone,[side*.15,1.76,-1.1],[.038,.22,.038],tooth,{r:[Math.PI,0,side*.08]});                  // fangs
   for(let m=0;m<4;m++)head.add(cone,[side*(.135-.012*m),1.795,-1-.09*m],[.026,.1,.026],tooth,{r:[Math.PI,0,side*.1]});   // serrated tomium
  }
  // Eyes: unlit red eyeballs with a hot core. Unlit so they glow regardless of the scene lighting.
  const eyes=new Builder(rng,H);
  for(const side of[-1,1]){
   eyes.add(sphLo,[side*.155,1.99,-.99],[.075,.075,.07],0xff0a20);
   eyes.add(sphLo,[side*.15,2,-1.04],[.028,.028,.028],0xffc7c7);
  }
  // Eye glow: two additive quads in front of the eyes.
  const halo=new Builder(rng,H,{uv:"keep"});
  for(const side of[-1,1])halo.add(plane,[side*.155,1.99,-1.03],[.44,.44,1],0xffffff);
  // Lower jaw (hinged): lower bill, lower teeth, tusks, tongue.
  const jaw=new Builder(rng,J,{uv:true});
  jaw.addShape(billShape({len:.38,hw0:.135,hw1:.075,hh0:.05,hh1:.03,droop:-.01}),[0,1.69,-.92],[1,1,1],beak);
  for(let i=-2;i<=2;i++)jaw.add(cone,[i*.06,1.72,-1.15+Math.abs(i)*.02],[.04,.15-Math.abs(i)*.01,.04],tooth);
  for(const side of[-1,1]){
   jaw.add(cone,[side*.1,1.74,-1.05],[.034,.2,.034],tooth,{r:[0,0,-side*.06]});                           // lower tusks
   for(let m=0;m<3;m++)jaw.add(cone,[side*(.115-.012*m),1.725,-1.0-.09*m],[.024,.085,.024],tooth);
  }
  jaw.add(box,[0,1.705,-1.02],[.2,.03,.22],gum);
  const pal={body:torso.build(),head:head.build(),eyes:eyes.build(),halo:halo.build(),jaw:jaw.build(),wing:{},leg:{}};
  for(const side of[-1,1]){
   // Wings: built in shoulder-local space, folded along the flank with the tip towards the tail.
   const w=new Builder(rng,O,{uv:true});
   const sx=(zl,extra)=>side*(flank(zl-.2)+extra-.52);                    // x offset that follows the body's taper
   // Layered wing coverts and long flight feathers on both sides
   w.add(sphMid,[side*.03,.03,.12],[.12,.17,.24],plum,{jitter:.03,tex:true,uvScale:[1.5,1.5]});
   for(let r=0;r<3;r++)for(let i=0;i<6;i++){
    const zl=.05+i*.12+r*.05;
    w.add(sphFeather,[sx(zl,.04+.02*r),.07-.085*r,zl],[.06,.016,.13],r?feather:plum,{r:[.04,-side*.06,0],jitter:.06,tex:true});
   }
   for(let k=0;k<8;k++){                                                  // secondaries
    const zl=.28+k*.085;
    w.add(sphFeather,[sx(zl,.03),-.1-.012*k,zl],[.055,.016,.3],feather,{r:[.05,-side*.08,0],jitter:.06,tex:true});
   }
   for(let k=0;k<6;k++){                                                  // primaries: longest, darker, tips cross over the tail
    const tip=1.42-.035*k,half=.58-.045*k,zl=tip-half;
    w.add(sphFeather,[sx(zl,.06+.012*k),-.15-.035*k,zl],[.05,.014,half],feather,{r:[.07,-side*.2,0],jitter:.07,k:.82,tex:true});
   }
   pal.wing[side]=w.build();
   // Legs: feathered thigh, scaled tarsus, ankle, webbed foot with three claws (hip-local space).
   const l=new Builder(rng,O,{uv:true});
   l.add(sphLo,[0,.02,.02],[.11,.15,.13],plum,{jitter:.03,tex:true});
   l.add(legGeo,[0,-.2,0],[1,1.33,1],beak);
   l.add(sphLo,[0,-.385,0],[.055,.045,.06],beak);
   l.addShape(footShape(),[0,-.405,-.02],[1,1,1],beak);
   for(const [cx,cz] of[[-.17,-.36],[0,-.4],[.17,-.36]])l.add(cone,[cx,-.405,cz-.05],[.022,.11,.022],dark,{r:[-Math.PI/2,0,0]});
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
   const w=new THREE.Group();w.position.set(side*SHOULDER[0]-T[0],SHOULDER[1]-T[1],SHOULDER[2]-T[2]);w.add(part(pal.wing[side],bodyMat));torso.add(w);wings.push(w);
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
  // Wings hang folded along the flank. Raise rolls the wing open about its long axis, spread swings the tip outward.
  r.wings[0].rotation.set(0,-p.wingSpread,-p.wingRaise);     // left wing (side -1)
  r.wings[1].rotation.set(0,p.wingSpread,p.wingRaise);       // right wing (side +1)
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
  for(const g of[sphLo,sphMid,sphHead,sphFeather,cone,box,plane,legGeo])g.dispose();
  for(const m of[bodyMat,eyeMat,eyeDeadMat,haloMat])m.dispose();
  if(glowTexture)glowTexture.dispose();
  if(featherTexture)featherTexture.dispose();
  for(const pal of Object.values(palettes)){
   for(const k of["body","head","eyes","halo","jaw"])pal[k].dispose();
   for(const k of[-1,1]){pal.wing[k].dispose();pal.leg[k].dispose()}
  }
 }

 return {acquire,arm,die,dispose,palette,stats,pools,corpses,MESHES_PER_GOOSE};
}
