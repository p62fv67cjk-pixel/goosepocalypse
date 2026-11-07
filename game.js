import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.170.0/+esm";
import {createArena} from "./arena-upgrade.js";
const $=s=>document.querySelector(s),C=$("#game"),R=new THREE.WebGLRenderer({canvas:C,antialias:true,powerPreference:"high-performance"});R.setPixelRatio(Math.min(devicePixelRatio,1.35));R.outputColorSpace=THREE.SRGBColorSpace;const S=new THREE.Scene();S.background=new THREE.Color(0x10131b);S.fog=new THREE.FogExp2(0x1c2230,.0115);const cam=new THREE.PerspectiveCamera(72,1,.1,120);cam.position.set(0,1.7,5);S.add(cam);S.add(new THREE.HemisphereLight(0x8aa3c0,0x1a0f12,1.15));let ml=new THREE.DirectionalLight(0xffc4a8,2.6);ml.position.set(-14,20,8);S.add(ml);let rg=new THREE.PointLight(0xb01e38,11,38);rg.position.set(10,6.5,-16);S.add(rg);
const bloodMoon=new THREE.Group();
const moonCore=new THREE.Mesh(new THREE.SphereGeometry(8,40,32),new THREE.MeshStandardMaterial({color:0x8e101c,emissive:0x9e0718,emissiveIntensity:1.25,roughness:1,metalness:0}));
bloodMoon.add(moonCore);
const moonHalo=new THREE.Mesh(new THREE.SphereGeometry(10.1,32,24),new THREE.MeshBasicMaterial({color:0x9f1726,transparent:true,opacity:.16,side:THREE.BackSide,depthWrite:false}));
bloodMoon.add(moonHalo);
const moonLight=new THREE.PointLight(0x9d1424,22,150);moonLight.position.set(0,0,0);bloodMoon.add(moonLight);
bloodMoon.position.set(-27,37,-92);S.add(bloodMoon);
// Mobile-friendly atmospheric detail: textured ground, stones, tufts and moonlit haze.
// Stable seeded decoration avoids shifting landmarks on every reload.
let scenerySeed=0x6d6f6f6e;const sceneryRandom=()=>{scenerySeed=(Math.imul(scenerySeed,1664525)+1013904223)>>>0;return scenerySeed/4294967296;};
const groundTexture=(()=>{const c=document.createElement("canvas");c.width=c.height=128;const ctx=c.getContext("2d");ctx.fillStyle="#243126";ctx.fillRect(0,0,128,128);for(let i=0;i<1500;i++){const x=sceneryRandom()*128,y=sceneryRandom()*128,l=sceneryRandom()*12+12;ctx.fillStyle="rgba("+l+","+(l+13)+","+l+","+(sceneryRandom()*.16)+")";ctx.fillRect(x,y,sceneryRandom()*3+1,sceneryRandom()*3+1)}const t=new THREE.CanvasTexture(c);t.wrapS=t.wrapT=THREE.RepeatWrapping;t.repeat.set(44,44);t.colorSpace=THREE.SRGBColorSpace;return t})();
let ground=new THREE.Mesh(new THREE.PlaneGeometry(220,220),new THREE.MeshStandardMaterial({color:0x788e78,map:groundTexture,roughness:1}));ground.rotation.x=-Math.PI/2;ground.receiveShadow=true;S.add(ground);
const stoneMat=new THREE.MeshStandardMaterial({color:0x414744,roughness:1}),grassMat=new THREE.MeshStandardMaterial({color:0x354832,roughness:1,side:THREE.DoubleSide});
const stoneGeo=new THREE.DodecahedronGeometry(1,0),grassGeo=new THREE.ConeGeometry(.15,.58,3);
const stones=new THREE.InstancedMesh(stoneGeo,stoneMat,100),grass=new THREE.InstancedMesh(grassGeo,grassMat,360),dummy=new THREE.Object3D();
for(let i=0;i<460;i++){const a=sceneryRandom()*Math.PI*2,r=7+Math.sqrt(sceneryRandom())*95,x=Math.cos(a)*r,z=Math.sin(a)*r;dummy.position.set(x,0,z);dummy.rotation.set(0,sceneryRandom()*Math.PI*2,0);if(i<100){const sc=.12+sceneryRandom()*.42;const stoneHeight=.16+sceneryRandom()*.22;dummy.scale.set(sc,stoneHeight,sc);dummy.position.y=stoneHeight;dummy.updateMatrix();stones.setMatrixAt(i,dummy.matrix)}else{const sc=.6+sceneryRandom()*1.2;dummy.scale.set(sc,sc,sc);dummy.position.y=.29*sc;dummy.updateMatrix();grass.setMatrixAt(i-100,dummy.matrix)}}
stones.instanceMatrix.needsUpdate=true;grass.instanceMatrix.needsUpdate=true;S.add(stones,grass);
const haze=new THREE.Mesh(new THREE.PlaneGeometry(190,190),new THREE.MeshBasicMaterial({color:0x87929c,transparent:true,opacity:.035,depthWrite:false,side:THREE.DoubleSide}));haze.rotation.x=-Math.PI/2;haze.position.y=.16;S.add(haze);
const arena=createArena(S);
// Three instanced draw calls instead of 450 individual tree meshes. Preserve seeded positions and silhouettes.
const trunk=new THREE.MeshStandardMaterial({color:0x35241f}),leaf=new THREE.MeshStandardMaterial({color:0x10271b});
const treeCount=150;
const treeTrunks=new THREE.InstancedMesh(new THREE.CylinderGeometry(.13,.28,4.5,7),trunk,treeCount);
const treeLower=new THREE.InstancedMesh(new THREE.ConeGeometry(1.8,5.2,8),leaf,treeCount);
const treeUpper=new THREE.InstancedMesh(new THREE.ConeGeometry(1.35,4.1,8),leaf,treeCount);
const treeTransform=new THREE.Object3D();
for(let i=0;i<treeCount;i++){
 const a=sceneryRandom()*Math.PI*2,r=18+sceneryRandom()*78,x=Math.cos(a)*r,z=Math.sin(a)*r;
 // Vary height, width and orientation without extra draw calls or random reloads.
 // Scale each crown around its own base so smaller trees do not float above ground.
 const height=.72+sceneryRandom()*.62,width=.75+sceneryRandom()*.55,turn=sceneryRandom()*Math.PI*2;
 // Per-tree foliage tint breaks up uniform green silhouettes without new materials or draw calls.
 // Apply the same tint to both crown layers; trunks retain their bark material.
 const foliageTint=new THREE.Color().setRGB(.72+sceneryRandom()*.24,.78+sceneryRandom()*.20,.70+sceneryRandom()*.22);
 treeLower.setColorAt(i,foliageTint);treeUpper.setColorAt(i,foliageTint);
 for(const [mesh,y] of [[treeTrunks,2.25],[treeLower,5.1],[treeUpper,7.2]]){
  treeTransform.position.set(x,y*height,z);treeTransform.rotation.set(0,turn,0);treeTransform.scale.set(width,height,width);
  treeTransform.updateMatrix();mesh.setMatrixAt(i,treeTransform.matrix);
 }
}
for(const mesh of [treeTrunks,treeLower,treeUpper]){
 mesh.instanceMatrix.needsUpdate=true;
 if(mesh.instanceColor)mesh.instanceColor.needsUpdate=true;
 mesh.computeBoundingSphere(); // Ensure frustum culling covers the whole forest.
 S.add(mesh);
}
const geese=[],parts=[],meatDrops=[];const meatGeometry=new THREE.IcosahedronGeometry(.35,1),meatMaterial=new THREE.MeshStandardMaterial({color:0xa72c30,emissive:0x4d080c,emissiveIntensity:.3,roughness:.65});function dropMeat(goose){const m=new THREE.Mesh(meatGeometry,meatMaterial);m.position.set(goose.position.x,.55,goose.position.z);m.userData={heal:goose.userData.type==='boss'?45:goose.userData.type==='brute'?30:20,born:performance.now()};S.add(m);meatDrops.push(m)}function collectMeat(now){for(let i=meatDrops.length-1;i>=0;i--){const m=meatDrops[i];m.rotation.y+=.025;m.position.y=.55+Math.sin(now*.003+i)*.12;if(now-m.userData.born>45000){S.remove(m);meatDrops.splice(i,1);continue}if(hp<maxHp&&Math.hypot(cam.position.x-m.position.x,cam.position.z-m.position.z)<1.8){const healed=Math.min(maxHp-hp,m.userData.heal);hp+=healed;S.remove(m);meatDrops.splice(i,1);say('GOOSE MEAT +'+Math.ceil(healed)+' HEALTH',1000)}}}let hero="Phoenix",difficulty="medium",mate=null,hp=100,maxHp=100,ammo=14,maxAmmo=14,wave=1,score=0,playing=false,paused=false,yaw=0,pitch=0,mx=0,my=0,vy=0,onGround=true,sprint=false,reloading=false,pending=0,nextWave=false,run=0,last=performance.now();
let sfxCtx=null;
const recordedGunshot=new Audio(new URL("./Gun%201.wav",import.meta.url).href);
const recordedReload=new Audio(new URL("./gun-cocking-04.wav",import.meta.url).href);
recordedGunshot.preload="auto";recordedReload.preload="auto";
// Movement recordings are owned exclusively by effects.js. Do not prime or
// play duplicate HTMLAudioElements here: iOS Safari may settle those promises
// after the joystick has stopped or the player has jumped.
let gunBuffer=null,reloadBuffer=null,audioLoadPromise=null;
const weapons=[{name:"PISTOL",mag:14,damage:1.35,cooldown:280},{name:"RIFLE",mag:30,damage:1.05,cooldown:110},{name:"SHOTGUN",mag:8,damage:3.4,cooldown:750},{name:"HEAVY",mag:6,damage:5.5,cooldown:1050}];let weaponIndex=0,lastShot=-Infinity;const ownedWeapons=new Set([0]);const magazines=weapons.map(w=>w.mag),reserves=weapons.map(w=>w.mag*2);let lootCount=0;

 // First-person weapon viewmodels + muzzle flash. Kept depthTest/depthWrite off so the gun always draws on top on mobile Safari.
 const heldGun=new THREE.Group();cam.add(heldGun);
 const gunSteel=new THREE.MeshStandardMaterial({color:0x2c3138,metalness:.72,roughness:.28,depthTest:false,depthWrite:false});
 const gunDark=new THREE.MeshStandardMaterial({color:0x12161b,metalness:.4,roughness:.62,depthTest:false,depthWrite:false});
 const gunWood=new THREE.MeshStandardMaterial({color:0x6e4a32,roughness:.88,depthTest:false,depthWrite:false});
 const handMat=new THREE.MeshStandardMaterial({color:0xc99578,roughness:.92,depthTest:false,depthWrite:false});
 const flashMat=new THREE.MeshBasicMaterial({color:0xffe08a,transparent:true,opacity:0,depthTest:false,depthWrite:false,blending:THREE.AdditiveBlending});
 function gunBox(parent,x,y,z,w,h,d,mat=gunSteel){const mesh=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),mat);mesh.position.set(x,y,z);mesh.renderOrder=100;parent.add(mesh);return mesh}
 let muzzleFlash=null,muzzleLight=null;
 function buildHeldGun(index){heldGun.clear();muzzleFlash=null;muzzleLight=null;
  const long=index===1||index===2||index===3,heavy=index===3,shotgun=index===2;
  const length=heavy?1.18:shotgun?1.02:index===1?1.1:.52;
  // Receiver / barrel
  gunBox(heldGun,0,0,-.12,.17,.17,length,gunSteel);
  gunBox(heldGun,0,.12,-.18,.13,.06,length*.7,gunDark);
  // Grip and magazine
  gunBox(heldGun,0,-.19,.05,.12,.34,.15,gunDark);
  gunBox(heldGun,0,-.3,.1,.15,.22,.18,gunWood);
  // Muzzle device
  const muzzleZ=-length*.48-.14;
  gunBox(heldGun,0,-.06,muzzleZ,heavy?.22:.1,heavy?.2:.1,.2,gunDark);
  if(long){gunBox(heldGun,0,-.12,.2,.16,.16,.4,gunWood);gunBox(heldGun,0,.18,-.35,.06,.08,.22,gunDark)}
  if(shotgun)gunBox(heldGun,0,-.14,-.34,.13,.11,.44,gunWood);
  if(heavy)gunBox(heldGun,0,.22,-.18,.16,.12,.42,gunDark);
  // Trigger guard
  gunBox(heldGun,0,-.12,.02,.08,.08,.12,gunDark);
  // Visible hands (right dominant, left support)
  gunBox(heldGun,.15,-.32,.26,.18,.2,.28,handMat);
  gunBox(heldGun,-.12,-.3,long?-.28:.1,.17,.18,.25,handMat);
  // Muzzle flash (hidden until shot)
  muzzleFlash=new THREE.Mesh(new THREE.SphereGeometry(.09,8,6),flashMat.clone());
  muzzleFlash.position.set(0,0,muzzleZ-.12);muzzleFlash.renderOrder=110;muzzleFlash.visible=false;heldGun.add(muzzleFlash);
  muzzleLight=new THREE.PointLight(0xffc46a,0,4);muzzleLight.position.copy(muzzleFlash.position);heldGun.add(muzzleLight);
  heldGun.position.set(.4,-.36,-.78);heldGun.rotation.set(-.04,-.11,-.03);
 }
 let visibleGunIndex=-1,gunKick=0,gunSway=0;
 function animateHeldGun(now,dt){heldGun.visible=playing; if(visibleGunIndex!==weaponIndex){visibleGunIndex=weaponIndex;buildHeldGun(weaponIndex)}
  gunKick=Math.max(0,gunKick-dt*4.2);gunSway=Math.max(0,gunSway-dt*2.8);
  const moving=Math.hypot(mx,my)>.18&&onGround;
  const bob=moving?Math.sin(now*.013)*.014:0;
  const sway=moving?Math.sin(now*.009)*.008:0;
  heldGun.position.set(.4+sway*.4,-.36+bob-gunKick*.055,-.78+gunKick*.18);
  heldGun.rotation.x=-.04+gunKick*.14;
  heldGun.rotation.z=-.03+sway*.6-gunSway*.08;
  if(muzzleFlash){const op=Math.max(0,Math.min(1,gunKick*2.2));muzzleFlash.material.opacity=op;muzzleFlash.visible=op>.02;muzzleFlash.scale.setScalar(.7+op*1.6);if(muzzleLight)muzzleLight.intensity=op*9}
 }

function loadRecordedAudio(){if(audioLoadPromise)return audioLoadPromise;audioLoadPromise=(async()=>{try{const urls=[recordedGunshot.src,recordedReload.src];const responses=await Promise.all(urls.map(u=>fetch(u,{cache:"force-cache"})));const bad=responses.findIndex(r=>!r.ok);if(bad>=0)throw new Error("Audio file unavailable: "+urls[bad]);const data=await Promise.all(responses.map(r=>r.arrayBuffer()));const c=audioReady();if(!c)return;[gunBuffer,reloadBuffer]=await Promise.all(data.map(b=>c.decodeAudioData(b)));console.info("Geese With Teeth recorded weapon audio loaded",{gun:!!gunBuffer,reload:!!reloadBuffer})}catch(e){console.warn("Recorded weapon audio load failed; using HTML audio fallback",e)}})();return audioLoadPromise}
function unlockGameAudio(){const c=audioReady();if(c&&c.state==="suspended")c.resume();loadRecordedAudio()}
window.addEventListener("pointerdown",unlockGameAudio,{passive:true});
function playBuffer(buffer,fallback,volume=1){const c=audioReady();if(c&&buffer){const src=c.createBufferSource(),gain=c.createGain();src.buffer=buffer;gain.gain.value=volume;src.connect(gain);gain.connect(c.destination);src.start(0)}else playRecorded(fallback,volume)}
function playRecorded(a,volume=1){try{a.pause();a.currentTime=0;a.volume=volume;const p=a.play();if(p&&p.catch)p.catch(()=>{})}catch(e){}}
function audioReady(){try{const AC=window.AudioContext||window.webkitAudioContext;if(!AC)return null;if(!sfxCtx)sfxCtx=new AC();if(sfxCtx.state==="suspended")sfxCtx.resume();return sfxCtx}catch(e){return null}}
function sfx(kind){if(kind==="shot")playBuffer(gunBuffer,recordedGunshot,1);else if(kind==="reload")playBuffer(reloadBuffer,recordedReload,1)}
const white=new THREE.MeshStandardMaterial({color:0xe9e5d9}),orange=new THREE.MeshStandardMaterial({color:0xe77616}),gum=new THREE.MeshStandardMaterial({color:0x7b1c2b});
function goose(type="normal"){
 let g=new THREE.Group(),boss=type==="boss",fast=type==="fast",brute=type==="brute";
 const plum=new THREE.MeshStandardMaterial({color:boss?0x28252d:brute?0x454950:0xe7e2d7,roughness:.94});
 const featherMat=new THREE.MeshStandardMaterial({color:boss?0x17151d:brute?0x353a40:0xf7f0e4,roughness:.88});
 const dark=new THREE.MeshStandardMaterial({color:0x100b12,roughness:.55});
 const red=new THREE.MeshStandardMaterial({color:0xff061b,emissive:0xff0018,emissiveIntensity:3.8});
 const beakMat=new THREE.MeshStandardMaterial({color:boss?0x6f151d:0xd65a18,roughness:.55});
 const toothMat=new THREE.MeshStandardMaterial({color:0xfff1d7,roughness:.32});
 const body=new THREE.Mesh(new THREE.SphereGeometry(.62,20,14),plum);body.scale.set(1.02,.78,1.42);body.position.y=.8;g.add(body);
 // Tail fan feathers
 for(let i=-3;i<=3;i++){let f=new THREE.Mesh(new THREE.SphereGeometry(.19,9,7),featherMat);f.scale.set(.55,.45,1.65);f.position.set(i*.105,.98,1.02+Math.abs(i)*.025);f.rotation.x=-.18;f.rotation.y=i*.13;g.add(f)}
 // Layered wing coverts and long flight feathers on both sides. Store wing groups for flap animation.
 const wingGroups=[];
 for(let side of[-1,1]){
  let wing=new THREE.Group();wing.position.set(side*.48,1.02,.04);wing.rotation.z=-side*.12;wing.userData.baseZ=-side*.12;wing.userData.side=side;
  for(let j=0;j<9;j++){let f=new THREE.Mesh(new THREE.SphereGeometry(.17,9,7),featherMat);f.scale.set(.58,.38,1.55);f.position.set(side*j*.065,-.12-j*.018,.38-j*.145);f.rotation.y=side*.18;wing.add(f)}
  for(let j=0;j<6;j++){let f=new THREE.Mesh(new THREE.SphereGeometry(.14,8,6),plum);f.scale.set(.8,.48,1.25);f.position.set(side*j*.055,.06,.02-j*.12);wing.add(f)}
  g.add(wing);wingGroups.push(wing);
 }
 g.userData.wings=wingGroups;
 // Upright curved-looking neck and head
 let neck=new THREE.Mesh(new THREE.CylinderGeometry(.145,.22,.78,12),plum);neck.position.set(0,1.48,-.56);neck.rotation.x=-.22;g.add(neck);
 let head=new THREE.Mesh(new THREE.SphereGeometry(.29,16,12),plum);head.scale.set(1,.92,1.13);head.position.set(0,1.94,-.66);g.add(head);
 // Brow ridges and glowing eyes facing forward
 for(let side of[-1,1]){
  let brow=new THREE.Mesh(new THREE.BoxGeometry(.22,.075,.11),dark);brow.position.set(side*.155,2.09,-.86);brow.rotation.z=side*.16;g.add(brow);
  let socket=new THREE.Mesh(new THREE.SphereGeometry(.105,12,9),dark);socket.position.set(side*.155,1.99,-.91);g.add(socket);
  let eye=new THREE.Mesh(new THREE.SphereGeometry(.071,12,9),red);eye.position.set(side*.155,1.99,-.99);g.add(eye);
  let pupil=new THREE.Mesh(new THREE.SphereGeometry(.027,8,6),new THREE.MeshBasicMaterial({color:0xffc7c7}));pupil.position.set(side*.155-.012,2.01,-1.05);g.add(pupil);
 }
 // Open mouth cavity, upper/lower beak and individually visible teeth
 let mouth=new THREE.Mesh(new THREE.BoxGeometry(.38,.19,.16),new THREE.MeshBasicMaterial({color:0x21050a}));mouth.position.set(0,1.78,-1.02);g.add(mouth);
 let upper=new THREE.Mesh(new THREE.ConeGeometry(.22,.43,5),beakMat);upper.rotation.x=-Math.PI/2;upper.position.set(0,1.86,-1.17);g.add(upper);
 let lower=new THREE.Mesh(new THREE.BoxGeometry(.36,.085,.3),beakMat);lower.position.set(0,1.69,-1.12);g.add(lower);
 for(let i=-2;i<=2;i++){let t=new THREE.Mesh(new THREE.ConeGeometry(.038,.14,5),toothMat);t.position.set(i*.065,1.77,-1.12);t.rotation.x=Math.PI;g.add(t);let q=new THREE.Mesh(new THREE.ConeGeometry(.032,.11,5),toothMat);q.position.set(i*.065,1.72,-1.105);g.add(q)}
 // Orange webbed feet and dark claws
 for(let side of[-1,1]){let leg=new THREE.Mesh(new THREE.CylinderGeometry(.045,.055,.3,7),beakMat);leg.position.set(side*.22,.25,-.05);g.add(leg);let foot=new THREE.Mesh(new THREE.BoxGeometry(.22,.07,.32),beakMat);foot.position.set(side*.22,.09,-.16);g.add(foot);for(let k=-1;k<=1;k++){let claw=new THREE.Mesh(new THREE.ConeGeometry(.025,.12,5),dark);claw.rotation.x=Math.PI/2;claw.position.set(side*.22+k*.065,.075,-.32);g.add(claw)}}
 let angle=Math.random()*Math.PI*2,r=30+Math.random()*38;g.position.set(Math.sin(angle)*r,.02,Math.cos(angle)*r);
 let scale=boss?2.25:brute?1.45:fast?.82:1;g.scale.setScalar(scale);
 let dm=difficulty==="easy"?{hp:.72,speed:.86,damage:.62}:difficulty==="hard"?{hp:1.48,speed:1.24,damage:1.48}:{hp:1,speed:1,damage:1};
 g.userData={nextCall:performance.now()+900+Math.random()*2800,hp:(boss?20+wave*2:brute?8+wave*.4:fast?2:3+wave*.18)*dm.hp,speed:(boss?.72:brute?.7:fast?1.8+wave*.03:1+wave*.03)*dm.speed*1.32,type,damage:(boss?35:brute?28:fast?16:20)*dm.damage,bob:Math.random()*6};
 S.add(g);geese.push(g);if(boss)sfx("bossgoose");else if(Math.random()<.7)sfx("goose")
}
function teammate(name){
 let g=new THREE.Group(),mummy=name==="Mummy";
 const outfit=new THREE.MeshStandardMaterial({color:mummy?0xf0c51c:0x7436c8,roughness:.78});
 const trim=new THREE.MeshStandardMaterial({color:mummy?0xffe56a:0xb88bff,roughness:.7});
 const skin=new THREE.MeshStandardMaterial({color:mummy?0xe9b99d:0xd99b78,roughness:.82});
 const hair=new THREE.MeshStandardMaterial({color:mummy?0x70472e:0x3b261c,roughness:.95});
 const dark=new THREE.MeshStandardMaterial({color:0x241916});
 const shoe=new THREE.MeshStandardMaterial({color:mummy?0x382b24:0x25202d});
 // Body, jacket panels, collar and belt make each outfit read as clothing
 let torso=new THREE.Mesh(new THREE.CapsuleGeometry(.34,.68,5,10),outfit);torso.position.y=1.08;g.add(torso);
 let bib=new THREE.Mesh(new THREE.BoxGeometry(.39,.48,.045),trim);bib.position.set(0,1.16,-.31);g.add(bib);
 let belt=new THREE.Mesh(new THREE.BoxGeometry(.62,.09,.38,dark));belt.position.y=.72;g.add(belt);
 // Separate legs and boots for a human silhouette
 for(let side of[-1,1]){let leg=new THREE.Mesh(new THREE.CapsuleGeometry(.115,.48,4,8),outfit);leg.position.set(side*.17,.39,0);g.add(leg);let boot=new THREE.Mesh(new THREE.BoxGeometry(.23,.14,.34),shoe);boot.position.set(side*.17,.09,-.055);g.add(boot);
  let arm=new THREE.Mesh(new THREE.CapsuleGeometry(.105,.48,4,8),outfit);arm.position.set(side*.43,1.12,0);arm.rotation.z=side*-.12;g.add(arm);let hand=new THREE.Mesh(new THREE.SphereGeometry(.105,9,7),skin);hand.position.set(side*.44,.78,-.02);g.add(hand)}
 // Neck and shaped head with ears, cheeks, nose, eyes and brows
 let neck=new THREE.Mesh(new THREE.CylinderGeometry(.105,.12,.18,10),skin);neck.position.y=1.65;g.add(neck);
 let head=new THREE.Mesh(new THREE.SphereGeometry(.3,20,16),skin);head.scale.set(.88,1.08,.88);head.position.set(0,1.96,-.015);g.add(head);
 for(let side of[-1,1]){let ear=new THREE.Mesh(new THREE.SphereGeometry(.075,10,8),skin);ear.position.set(side*.27,1.97,-.005);g.add(ear);
  let eyeWhite=new THREE.Mesh(new THREE.SphereGeometry(.047,10,8),new THREE.MeshStandardMaterial({color:0xfff7ed}));eyeWhite.position.set(side*.105,2.005,-.266);g.add(eyeWhite);
  let pupil=new THREE.Mesh(new THREE.SphereGeometry(.023,8,6),dark);pupil.position.set(side*.105,2.005,-.306);g.add(pupil);
  let brow=new THREE.Mesh(new THREE.BoxGeometry(.11,.035,.035),hair);brow.position.set(side*.105,2.075,-.27);g.add(brow)}
 let nose=new THREE.Mesh(new THREE.SphereGeometry(.055,9,7),skin);nose.scale.set(.8,.75,.8);nose.position.set(0,1.94,-.29);g.add(nose);
 let mouth=new THREE.Mesh(new THREE.BoxGeometry(.105,.018,.018),dark);mouth.position.set(0,1.84,-.277);g.add(mouth);
 // Hair cap plus fringe/side locks
 let cap=new THREE.Mesh(new THREE.SphereGeometry(.305,16,10,0,Math.PI*2,0,Math.PI*.58),hair);cap.position.set(0,2.055,-.005);g.add(cap);
 for(let side of[-1,1]){let lock=new THREE.Mesh(new THREE.SphereGeometry(.105,9,7),hair);lock.scale.set(.75,1.5,.8);lock.position.set(side*.235,1.98,-.02);g.add(lock)}
 let fringe=new THREE.Mesh(new THREE.SphereGeometry(.2,12,8),hair);fringe.scale.set(1.2,.45,.75);fringe.position.set(0,2.14,-.2);g.add(fringe);
 // Signature antenna silhouette: yellow loop for Mummy, purple for Phoenix
 let antenna=new THREE.Mesh(new THREE.TorusGeometry(.18,.035,8,16,Math.PI*1.4),new THREE.MeshStandardMaterial({color:mummy?0xffe56a:0xb88bff,emissive:mummy?0x66520a:0x3a2060,emissiveIntensity:.4}));antenna.position.set(0,2.35,0);antenna.rotation.x=Math.PI/2;g.add(antenna);
 g.position.set(0,.02,0);g.userData={name,hp:mummy?140:100,speed:mummy?.9:1.15,bob:0};S.add(g);return g
}
function kill(g){const i=geese.indexOf(g);if(i<0)return;geese.splice(i,1);score+=g.userData.type==="boss"?250:g.userData.type==="brute"?80:g.userData.type==="fast"?45:30;dropMeat(g);burst(g.position.clone().add(new THREE.Vector3(0,1,0)),0xff2244);for(let c of g.children){let p=c.clone();p.position.copy(g.localToWorld(c.position.clone()));p.userData={life:.8+Math.random()*.6,v:new THREE.Vector3((Math.random()-.5)*4,Math.random()*3,(Math.random()-.5)*4)};S.add(p);parts.push(p)}S.remove(g);if(geese.length+pending===0){wave++;nextWave=true;setTimeout(()=>{if(playing&&nextWave)spawn()},1800)}}
function say(t,ms=1400){const e=$("#message");e.textContent=t;e.style.opacity=1;setTimeout(()=>e.style.opacity=0,ms)}
function burst(p,col=0xffc266){for(let i=0;i<6;i++){let x=new THREE.Mesh(new THREE.SphereGeometry(.025+Math.random()*.03,5,4),new THREE.MeshBasicMaterial({color:col,transparent:true,opacity:.95}));x.position.copy(p);x.userData={life:.2+Math.random()*.25,v:new THREE.Vector3((Math.random()-.5)*3.2,Math.random()*1.8+.2,(Math.random()-.5)*3.2)};S.add(x);parts.push(x)}}
function spawn(){nextWave=false;let token=run,count=Math.max(3,Math.min(24,Math.round((7+wave*2)*(difficulty==="easy"?.8:difficulty==="hard"?1.3:1)))),boss=wave%5===0;pending=count+(boss?1:0);say(boss?`BOSS WAVE ${wave}`:`WAVE ${wave}`,1200);$("#wave").textContent=`WAVE ${wave}`;for(let i=0;i<count;i++)setTimeout(()=>{if(!playing||run!==token)return;goose(i%7===6&&wave>2?"brute":i%5===4?"fast":"normal");pending--},i*110);if(boss)setTimeout(()=>{if(!playing||run!==token)return;goose("boss");pending--},count*110+200)}
function team(dt){if(!mate)return;mate.userData.bob+=dt*4;mate.position.y=.02+Math.sin(mate.userData.bob)*.02;const target=new THREE.Vector3(cam.position.x-Math.sin(yaw)*1.4,0,cam.position.z-Math.cos(yaw)*1.4);const d=target.clone().sub(mate.position);d.y=0;if(d.length()>1.2){d.normalize();mate.position.x+=d.x*mate.userData.speed*1.4*dt;mate.position.z+=d.z*mate.userData.speed*1.4*dt}mate.lookAt(cam.position.x,mate.position.y,cam.position.z)}
const ray=new THREE.Raycaster();function fire(){if(!playing||paused||reloading)return;const now=performance.now();if(now-lastShot<weapons[weaponIndex].cooldown)return;lastShot=now;audioReady();if(ammo<=0)return reload();sfx("shot");gunKick=1;gunSway=.7+Math.random()*.4;ammo--;magazines[weaponIndex]=ammo;ray.setFromCamera(new THREE.Vector2(),cam);let hit=ray.intersectObjects(geese,true)[0];if(!hit)return;let g=hit.object;while(g.parent&&!geese.includes(g))g=g.parent;if(!geese.includes(g))return;g.userData.hp-=weapons[weaponIndex].damage*(hero==="Phoenix"?1.15:1)*(difficulty==="easy"?1.25:difficulty==="hard"?.9:1);burst(hit.point);if(g.userData.hp<=0)kill(g)}const swapButton=document.createElement("button");swapButton.id="swapWeapon";swapButton.type="button";swapButton.textContent="SWAP GUN";swapButton.setAttribute("aria-label","Switch collected weapon");swapButton.style.cssText="position:fixed;right:14px;bottom:145px;z-index:30;padding:10px 12px;border:1px solid #b99853;border-radius:12px;background:#20232bcc;color:white;font-weight:bold;touch-action:manipulation";document.body.appendChild(swapButton);swapButton.onpointerdown=e=>{e.preventDefault();if(!playing||paused||reloading)return;const options=[...ownedWeapons].sort((a,b)=>a-b);if(options.length<2)return;const idx=options.indexOf(weaponIndex);magazines[weaponIndex]=ammo;weaponIndex=options[(idx+1)%options.length];maxAmmo=weapons[weaponIndex].mag;ammo=magazines[weaponIndex];say(weapons[weaponIndex].name,700)};function reload(){if(reloading||ammo===maxAmmo||reserves[weaponIndex]<=0)return;reloading=true;sfx("reload");const need=maxAmmo-ammo,take=Math.min(need,reserves[weaponIndex]);setTimeout(()=>{if(!playing)return;ammo+=take;reserves[weaponIndex]-=take;magazines[weaponIndex]=ammo;reloading=false},900)}function resize(){const w=innerWidth,h=innerHeight;R.setSize(w,h,false);cam.aspect=w/h;cam.updateProjectionMatrix()}addEventListener("resize",resize);resize();
// Touch / mouse look
let drag=false,lx=0,ly=0;C.addEventListener("pointerdown",e=>{if(e.pointerType==="touch"||e.pointerType==="pen"||e.button===0){drag=true;lx=e.clientX;ly=e.clientY;try{C.setPointerCapture(e.pointerId)}catch{}}});C.addEventListener("pointermove",e=>{if(!drag||!playing||paused)return;const dx=e.clientX-lx,dy=e.clientY-ly;lx=e.clientX;ly=e.clientY;yaw-=dx*.004;pitch=Math.max(-1.2,Math.min(1.2,pitch-dy*.0035))});const endLook=()=>drag=false;C.addEventListener("pointerup",endLook);C.addEventListener("pointercancel",endLook);C.addEventListener("lostpointercapture",endLook);
// Joystick
const pad=$("#move"),stick=$("#stick");let jx=0,jy=0;function joy(e){const r=pad.getBoundingClientRect(),x=e.clientX-r.left-r.width/2,y=e.clientY-r.top-r.height/2,m=Math.min(42,Math.hypot(x,y)),a=Math.atan2(y,x);jx=Math.cos(a)*m/42;jy=Math.sin(a)*m/42;stick.style.left=38+jx*38+"px";stick.style.top=38+jy*38+"px";mx=jx;my=jy}pad.addEventListener("pointerdown",e=>{try{pad.setPointerCapture(e.pointerId)}catch{};joy(e)});pad.addEventListener("pointermove",e=>{if(e.buttons||e.pointerType==="touch")joy(e)});const endJoy=()=>{mx=my=0;stick.style.left="38px";stick.style.top="38px"};pad.addEventListener("pointerup",endJoy);pad.addEventListener("pointercancel",endJoy);pad.addEventListener("lostpointercapture",endJoy);
$("#fire").onpointerdown=e=>{e.preventDefault();fire()};$("#reload").onpointerdown=e=>{e.preventDefault();reload()};$("#jump").onpointerdown=e=>{e.preventDefault();if(onGround&&playing&&!paused){vy=5.8;onGround=false}};$("#sprint").onpointerdown=e=>{e.preventDefault();sprint=true};$("#sprint").onpointerup=()=>sprint=false;$("#sprint").onpointercancel=()=>sprint=false;$("#pause").onclick=()=>{paused=!paused;$("#pauseMenu").style.display=paused?"flex":"none"};document.querySelector(".resume").onclick=()=>{paused=false;$("#pauseMenu").style.display="none"};
document.querySelectorAll(".pick").forEach(b=>b.onclick=()=>{document.querySelectorAll(".pick").forEach(x=>x.classList.remove("on"));b.classList.add("on");hero=b.dataset.hero});document.querySelectorAll(".difficulty").forEach(b=>b.onclick=()=>{document.querySelectorAll(".difficulty").forEach(x=>x.classList.remove("on"));b.classList.add("on");difficulty=b.dataset.difficulty});document.querySelector(".start").onclick=()=>{$("#menu").style.display="none";playing=true;paused=false;hp=hero==="Mummy"?140:100;maxHp=hp;ammo=14;maxAmmo=14;weaponIndex=0;ownedWeapons.clear();ownedWeapons.add(0);magazines.fill(0);magazines[0]=14;reserves.fill(0);reserves[0]=28;wave=1;score=0;geese.splice(0).forEach(g=>S.remove(g));parts.splice(0).forEach(p=>S.remove(p));meatDrops.splice(0).forEach(m=>S.remove(m));if(mate){S.remove(mate);mate=null}mate=teammate(hero==="Phoenix"?"Mummy":"Phoenix");arena.reset();cam.position.set(0,1.7,5);yaw=0;pitch=0;vy=0;onGround=true;spawn();unlockGameAudio()};
function frame(now){const dt=Math.min(.035,(now-last)/1000);last=now;if(playing&&!paused){const sp=(sprint?2.35:1.35)*(hero==="Phoenix"?1.12:1);const f=new THREE.Vector3(-Math.sin(yaw),0,-Math.cos(yaw)),r=new THREE.Vector3(Math.cos(yaw),0,-Math.sin(yaw));cam.rotation.order="YXZ";cam.rotation.y=yaw;cam.rotation.x=pitch;const activeStick=Math.hypot(mx,my)>.18;const previousX=cam.position.x,previousZ=cam.position.z;cam.position.add(f.multiplyScalar(activeStick?-my*sp*dt:0)).add(r.multiplyScalar(activeStick?mx*sp*dt:0));if(arena.collide(cam.position.x,cam.position.z,cam.position.y-1.7)){cam.position.x=previousX;cam.position.z=previousZ;}cam.position.x=Math.max(-95,Math.min(95,cam.position.x));cam.position.z=Math.max(-95,Math.min(95,cam.position.z));vy-=12*dt;cam.position.y+=vy*dt;const floor=1.7+arena.groundHeight(cam.position.x,cam.position.z,cam.position.y-1.7);if(onGround&&floor>cam.position.y&&floor-cam.position.y<=.65){cam.position.y=floor;vy=0}if(cam.position.y<=floor){cam.position.y=floor;vy=0;onGround=true}else{onGround=false}if(arena.collect(cam.position.x,cam.position.z)){lootCount++;const available=weapons.map((_,i)=>i).filter(i=>!ownedWeapons.has(i));const found=available.length?available[(lootCount-1)%available.length]:lootCount%weapons.length;const fresh=!ownedWeapons.has(found);ownedWeapons.add(found);reserves[found]+=weapons[found].mag*(fresh?2:1);magazines[weaponIndex]=ammo;weaponIndex=found;maxAmmo=weapons[found].mag;ammo=magazines[found];reloading=false;hp=Math.min(maxHp,hp+10);say((fresh?"NEW WEAPON: ":"AMMO FOUND: ")+weapons[found].name+" • +"+weapons[found].mag*(fresh?2:1)+" ROUNDS",1900)}collectMeat(now);window.dispatchEvent(new CustomEvent('gwt:ground-state',{detail:{grounded:onGround,playing:playing&&!paused}}));team(dt);for(let g of geese){if(now>g.userData.nextCall){g.userData.nextCall=now+(g.userData.type==="boss"?4200:6500)+Math.random()*6500}g.userData.bob+=dt*5;const bobY=Math.sin(g.userData.bob)*.03;g.position.y=.02+bobY;
 // Wing flap: faster when chasing, subtler when close
 const flap=Math.sin(g.userData.bob*2.4)*(g.userData.speed>.9?.35:.18);
 if(g.userData.wings){for(const w of g.userData.wings){w.rotation.z=w.userData.baseZ+flap*w.userData.side;w.rotation.x=flap*.4}}
 let d=new THREE.Vector3(cam.position.x-g.position.x,0,cam.position.z-g.position.z),dist=d.length();
 if(dist>1.3*g.scale.x){const direction=d.normalize();const step=g.userData.speed*dt;const nx=g.position.x+direction.x*step,nz=g.position.z+direction.z*step;if(!arena.collide(nx,nz)){g.position.x=nx;g.position.z=nz}else{const flank=new THREE.Vector3(-direction.z,0,direction.x);const sign=Math.sin(g.userData.bob*.6)>0?1:-1;const fx=g.position.x+flank.x*step*sign,fz=g.position.z+flank.z*step*sign;if(!arena.collide(fx,fz)){g.position.x=fx;g.position.z=fz}}g.lookAt(cam.position.x,g.position.y,cam.position.z);g.rotateY(Math.PI)}
 else {
  // Close-range attack lunge: brief forward hop + damage
  if(!g.userData.lunging){g.userData.lunging=true;g.userData.lungeT=0}
  g.userData.lungeT+=dt;const lunge=Math.sin(Math.min(1,g.userData.lungeT*4)*Math.PI)*.18;
  g.position.y=.02+bobY+lunge;hp-=g.userData.damage*dt;
  if(g.userData.lungeT>1.1)g.userData.lunging=false;
 }}for(let i=parts.length-1;i>=0;i--){let p=parts[i];p.userData.life-=dt;p.position.addScaledVector(p.userData.v,dt);if(p.userData.life<=0){S.remove(p);parts.splice(i,1)}}$("#health").textContent=`❤ ${Math.max(0,Math.round(hp))}/${maxHp}`;$("#score").textContent=`SCORE ${score}`;$("#ammo").textContent=reloading?"RELOADING":`${weapons[weaponIndex].name} ${ammo}/${reserves[weaponIndex]}`;$("#geeseLeft").textContent=`GEESE ${geese.length+pending}`;$("#damage").style.opacity=hp<45?String((45-hp)/65):"0";if(hp<=0){playing=false;window.dispatchEvent(new CustomEvent('gwt:ground-state',{detail:{grounded:onGround,playing:false}}));run++;say("THE FLOCK GOT YOU",900);const deathRun=run,deathScore=score,deathWave=wave;setTimeout(()=>{if(run!==deathRun||playing)return;$("#menu").style.display="flex";$(".start").textContent=`RESPAWN • SCORE ${deathScore} • WAVE ${deathWave}`},650)}}animateHeldGun(now,dt);R.render(S,cam);requestAnimationFrame(frame)}requestAnimationFrame(frame);
