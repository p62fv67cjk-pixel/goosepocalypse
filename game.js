import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.170.0/+esm";
import {createArena} from "./arena-upgrade.js";
import {canGooseBite} from "./bite-visibility.js";
import {canTraverse} from "./movement-collision.js";
const $=s=>document.querySelector(s),C=$("#game"),R=new THREE.WebGLRenderer({canvas:C,antialias:true,powerPreference:"high-performance"});R.setPixelRatio(Math.min(devicePixelRatio,1.35));R.outputColorSpace=THREE.SRGBColorSpace;const S=new THREE.Scene();S.background=new THREE.Color(0x10131b);S.fog=new THREE.FogExp2(0x202431,.012);const cam=new THREE.PerspectiveCamera(72,1,.1,120);cam.position.set(0,1.7,5);S.add(cam);S.add(new THREE.HemisphereLight(0x8399b4,0x160d0d,1.2));let ml=new THREE.DirectionalLight(0xffb6a0,2.8);ml.position.set(-12,18,9);S.add(ml);let rg=new THREE.PointLight(0xa11830,13,35);rg.position.set(12,7,-18);S.add(rg);
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
const geese=[],parts=[],meatDrops=[];const meatGeometry=new THREE.IcosahedronGeometry(.35,1),meatMaterial=new THREE.MeshStandardMaterial({color:0xa72c30,emissive:0x4d080c,emissiveIntensity:.3,roughness:.65});const MAX_ACTIVE_MEAT_DROPS=32;function dropMeat(goose){while(meatDrops.length>=MAX_ACTIVE_MEAT_DROPS){const oldest=meatDrops.shift();S.remove(oldest)}const m=new THREE.Mesh(meatGeometry,meatMaterial);m.position.set(goose.position.x,.55,goose.position.z);m.userData={heal:goose.userData.type==='boss'?45:goose.userData.type==='brute'?30:20,born:performance.now()};S.add(m);meatDrops.push(m)}function collectMeat(now){for(let i=meatDrops.length-1;i>=0;i--){const m=meatDrops[i];m.rotation.y+=.025;m.position.y=.55+Math.sin(now*.003+i)*.12;if(now-m.userData.born>45000){S.remove(m);meatDrops.splice(i,1);continue}if(hp<maxHp&&Math.hypot(cam.position.x-m.position.x,cam.position.z-m.position.z)<1.8){const healed=Math.min(maxHp-hp,m.userData.heal);hp+=healed;S.remove(m);meatDrops.splice(i,1);say('GOOSE MEAT +'+Math.ceil(healed)+' HEALTH',1000)}}}let hero="Phoenix",difficulty="medium",mate=null,hp=100,maxHp=100,ammo=14,maxAmmo=14,wave=1,score=0,playing=false,paused=false,yaw=0,pitch=0,mx=0,my=0,vy=0,onGround=true,sprint=false,reloading=false,pending=0,nextWave=false,run=0,last=performance.now();
let sfxCtx=null;
const recordedGunshot=new Audio(new URL("./Gun%201.wav",import.meta.url).href);
const recordedReload=new Audio(new URL("./gun-cocking-04.wav",import.meta.url).href);
recordedGunshot.preload="auto";recordedReload.preload="auto";
// Movement recordings are owned exclusively by effects.js. Do not prime or
// play duplicate HTMLAudioElements here: iOS Safari may settle those promises
// after the joystick has stopped or the player has jumped.
let gunBuffer=null,reloadBuffer=null,audioLoadPromise=null;
const weapons=[{name:"PISTOL",mag:14,damage:1.35,cooldown:280},{name:"RIFLE",mag:30,damage:1.05,cooldown:110},{name:"SHOTGUN",mag:8,damage:3.4,cooldown:750},{name:"HEAVY",mag:6,damage:5.5,cooldown:1050}];let weaponIndex=0,lastShot=-Infinity;const ownedWeapons=new Set([0]);const magazines=weapons.map(w=>w.mag),reserves=weapons.map(w=>w.mag*2);let lootCount=0;

 // First-person weapon viewmodels, attached to camera so the equipped gun is always visible.
 const heldGun=new THREE.Group();cam.add(heldGun);
 const gunSteel=new THREE.MeshStandardMaterial({color:0x30343b,metalness:.65,roughness:.35,depthTest:false,depthWrite:false});
 const gunDark=new THREE.MeshStandardMaterial({color:0x15191e,metalness:.35,roughness:.65,depthTest:false,depthWrite:false});
 const gunWood=new THREE.MeshStandardMaterial({color:0x79543b,roughness:.85,depthTest:false,depthWrite:false});
 const handMat=new THREE.MeshStandardMaterial({color:0xc99578,roughness:.9,depthTest:false,depthWrite:false});
 function gunBox(parent,x,y,z,w,h,d,mat=gunSteel){const mesh=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),mat);mesh.position.set(x,y,z);mesh.renderOrder=100;parent.add(mesh);return mesh}
 // Weapon swapping can happen hundreds of times in a session. Dispose only
 // generated viewmodel geometry: shared materials belong to the game.
 function clearHeldGun(){heldGun.traverse(object=>{if(object.isMesh)object.geometry?.dispose()});heldGun.clear()}
 function buildHeldGun(index){clearHeldGun();const long=index===1||index===2||index===3,heavy=index===3,shotgun=index===2;
  const length=heavy?1.12:shotgun?.98:index===1?1.06:.5;
  gunBox(heldGun,0,0,-.12,.19,.19,length,gunSteel);
  gunBox(heldGun,0,.13,-.19,.15,.075,length*.68,gunDark);
  gunBox(heldGun,0,-.18,.07,.13,.32,.16,gunDark);
  gunBox(heldGun,0,-.28,.12,.16,.23,.2,gunWood);
  gunBox(heldGun,0,-.075,-length*.48-.12,heavy?.25:.12,heavy?.24:.12,.22,gunDark);
  if(long){gunBox(heldGun,0,-.11,.22,.18,.18,.42,gunWood);gunBox(heldGun,0,.2,-.37,.07,.09,.24,gunDark)}
  if(shotgun)gunBox(heldGun,0,-.13,-.36,.14,.12,.46,gunWood);
  if(heavy)gunBox(heldGun,0,.23,-.2,.18,.13,.44,gunDark);
  gunBox(heldGun,.14,-.31,.28,.2,.22,.3,handMat);
  gunBox(heldGun,-.13,-.29,long?-.3:.12,.19,.2,.27,handMat);
  heldGun.position.set(.42,-.37,-.76);heldGun.rotation.set(-.035,-.12,-.035);
 }
 let visibleGunIndex=-1,gunKick=0;
 function animateHeldGun(now,dt){heldGun.visible=playing; if(visibleGunIndex!==weaponIndex){visibleGunIndex=weaponIndex;buildHeldGun(weaponIndex)}
  gunKick=Math.max(0,gunKick-dt*3.8);const bob=Math.hypot(mx,my)>.18&&onGround?Math.sin(now*.012)*.012:0;
  heldGun.position.set(.42,-.37+bob-gunKick*.045,-.76+gunKick*.16);
  heldGun.rotation.x=-.035+gunKick*.12;
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
 // Layered wing coverts and long flight feathers on both sides
 for(let side of[-1,1]){
  let wing=new THREE.Group();wing.position.set(side*.48,1.02,.04);wing.rotation.z=-side*.12;
  for(let j=0;j<9;j++){let f=new THREE.Mesh(new THREE.SphereGeometry(.17,9,7),featherMat);f.scale.set(.58,.38,1.55);f.position.set(side*j*.065,-.12-j*.018,.38-j*.145);f.rotation.y=side*.18;wing.add(f)}
  for(let j=0;j<6;j++){let f=new THREE.Mesh(new THREE.SphereGeometry(.14,8,6),plum);f.scale.set(.8,.48,1.25);f.position.set(side*j*.055,.06,.02-j*.12);wing.add(f)}
  g.add(wing);
 }
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
 // Animate the lower mandible only: the upper teeth remain visible as the goose lunges.
 const lowerJaw=lower;
 for(let i=-2;i<=2;i++){let t=new THREE.Mesh(new THREE.ConeGeometry(.038,.14,5),toothMat);t.position.set(i*.065,1.77,-1.12);t.rotation.x=Math.PI;g.add(t);let q=new THREE.Mesh(new THREE.ConeGeometry(.032,.11,5),toothMat);q.position.set(i*.065,.03,.015);lowerJaw.add(q)}
 // Orange webbed feet and dark claws
 for(let side of[-1,1]){let leg=new THREE.Mesh(new THREE.CylinderGeometry(.045,.055,.3,7),beakMat);leg.position.set(side*.22,.25,-.05);g.add(leg);let foot=new THREE.Mesh(new THREE.BoxGeometry(.22,.07,.32),beakMat);foot.position.set(side*.22,.09,-.16);g.add(foot);for(let k=-1;k<=1;k++){let claw=new THREE.Mesh(new THREE.ConeGeometry(.025,.12,5),dark);claw.rotation.x=Math.PI/2;claw.position.set(side*.22+k*.065,.075,-.32);g.add(claw)}}
 let angle=Math.random()*Math.PI*2,r=30+Math.random()*38;g.position.set(Math.sin(angle)*r,.02,Math.cos(angle)*r);
 let scale=boss?2.25:brute?1.45:fast?.82:1;g.scale.setScalar(scale);
 let dm=difficulty==="easy"?{hp:.72,speed:.86,damage:.62}:difficulty==="hard"?{hp:1.48,speed:1.24,damage:1.48}:{hp:1,speed:1,damage:1};
 g.userData={lowerJaw,attackPhase:Math.random()*Math.PI*2,nextCall:performance.now()+900+Math.random()*2800,hp:(boss?20+wave*2:brute?8+wave*.4:fast?2:3+wave*.18)*dm.hp,speed:(boss?.72:brute?.7:fast?1.8+wave*.03:1+wave*.03)*dm.speed*1.32,type,damage:(boss?35:brute?28:fast?16:20)*dm.damage,bob:Math.random()*6};
 S.add(g);geese.push(g);
 // Spawn calls previously used unsupported sfx kinds and were silent. Effects owns the low honk.
 if(boss||Math.random()<.7)window.dispatchEvent(new CustomEvent("gwt:goose-spawn",{detail:{boss}}))
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
 let belt=new THREE.Mesh(new THREE.BoxGeometry(.62,.09,.38),dark);belt.position.y=.72;g.add(belt);
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
 // Signature antenna silhouette: yellow loop for Mummy, purple triangular spike for Phoenix
 if(mummy){let stem=new THREE.Mesh(new THREE.CylinderGeometry(.035,.045,.24,8),outfit);stem.position.y=2.36;g.add(stem);let loop=new THREE.Mesh(new THREE.TorusGeometry(.17,.045,9,18),trim);loop.position.set(0,2.57,0);g.add(loop)}
 else{let stem=new THREE.Mesh(new THREE.CylinderGeometry(.035,.045,.2,8),outfit);stem.position.y=2.34;g.add(stem);let spike=new THREE.Mesh(new THREE.ConeGeometry(.18,.34,3),trim);spike.position.set(0,2.57,0);spike.rotation.y=Math.PI/2;g.add(spike)}
 g.userData={name,cd:0,bob:0};S.add(g);return g
}
function disposeCharacterMesh(character){S.remove(character);const geometries=new Set(),materials=new Set();character.traverse(object=>{if(!object.isMesh)return;if(object.geometry)geometries.add(object.geometry);for(const material of (Array.isArray(object.material)?object.material:[object.material]))if(material)materials.add(material)});for(const geometry of geometries)geometry.dispose();for(const material of materials)material.dispose()}
function disposeGooseMesh(goose){disposeCharacterMesh(goose)}
function say(t,ms=900){let e=$("#message");e.textContent=t;e.style.opacity=1;clearTimeout(say.t);say.t=setTimeout(()=>e.style.opacity=0,ms)}function disposeBurstParticle(p){S.remove(p);p.geometry.dispose();p.material.dispose()}
function burst(p,col=0xffc266){for(let i=0;i<3;i++){let x=new THREE.Mesh(new THREE.SphereGeometry(.03,4,3),new THREE.MeshBasicMaterial({color:col}));x.position.copy(p);x.userData={life:.25,v:new THREE.Vector3((Math.random()-.5)*2,Math.random(),(Math.random()-.5)*2)};S.add(x);parts.push(x)}}
function spawn(){nextWave=false;let token=run,count=Math.max(3,Math.min(24,Math.round((7+wave*2)*(difficulty==="easy"?.8:difficulty==="hard"?1.3:1)))),boss=wave%5===0;pending=count+(boss?1:0);say(boss?`BOSS WAVE ${wave}`:`WAVE ${wave}`,1200);$("#wave").textContent=`WAVE ${wave}`;for(let i=0;i<count;i++)setTimeout(()=>{if(!playing||run!==token)return;goose(i%7===6&&wave>2?"brute":i%5===4?"fast":"normal");pending--},i*110);if(boss)setTimeout(()=>{if(!playing||run!==token)return;goose("boss");pending--},600)}
function config(){if(hero==="Phoenix"){maxHp=100;maxAmmo=14}else{maxHp=140;maxAmmo=18}if(difficulty==="easy"){maxHp=Math.round(maxHp*1.35);maxAmmo+=4}else if(difficulty==="hard"){maxHp=Math.round(maxHp*.85)}hp=maxHp;ammo=maxAmmo;$("#heroHud").textContent=`${hero.toUpperCase()} + ${hero==="Phoenix"?"MUMMY":"PHOENIX"}`}document.querySelectorAll(".difficulty").forEach(b=>b.onclick=()=>{document.querySelectorAll(".difficulty").forEach(x=>x.classList.remove("on"));b.classList.add("on");difficulty=b.dataset.difficulty;config();say(`${difficulty.toUpperCase()} MODE`,700)});document.querySelectorAll(".pick").forEach(b=>b.onclick=()=>{document.querySelectorAll(".pick").forEach(x=>x.classList.remove("on"));b.classList.add("on");hero=b.dataset.hero;config()});
function reset(){audioReady();/* Release any Safari pointer captures from the previous run before clearing IDs. A stale captured touch must not steer a newly respawned player. */releaseInterruptedControls();/* A new run must never inherit a previous airborne/dead or held-control state. */vy=0;onGround=true;sprint=false;sprintPointer=null;joystickPointer=null;cameraPointer=null;mx=my=0;stick.style.transform="";yaw=0;pitch=0;run++;geese.splice(0).forEach(disposeGooseMesh);meatDrops.splice(0).forEach(x=>S.remove(x));/* Remove particles from the previous run before respawning. */parts.splice(0).forEach(disposeBurstParticle);if(mate)disposeCharacterMesh(mate);wave=1;score=0;pending=0;nextWave=false;reloading=false;cam.position.set(0,1.7,5);arena.reset();weaponIndex=0;lastShot=-Infinity;ownedWeapons.clear();ownedWeapons.add(0);lootCount=0;weapons.forEach((w,i)=>{magazines[i]=w.mag;reserves[i]=i===0?w.mag*2:0});config();mate=teammate(hero==="Phoenix"?"Mummy":"Phoenix");mate.position.set(2,0,4);playing=true;paused=false;$("#menu").style.display="none";$("#pauseMenu").style.display="none";say(`${hero.toUpperCase()} + ${mate.userData.name.toUpperCase()} • TEAM UP!`,1400);spawn()}$(".start").onclick=reset;
let cameraPointer=null,lx=0,ly=0;C.onpointerdown=e=>{if(cameraPointer!==null||paused||!playing)return;cameraPointer=e.pointerId;lx=e.clientX;ly=e.clientY;try{C.setPointerCapture(e.pointerId)}catch{}};C.onpointermove=e=>{if(e.pointerId!==cameraPointer||paused||!playing)return;yaw-=(e.clientX-lx)*.0058;pitch=Math.max(-.75,Math.min(.68,pitch-(e.clientY-ly)*.005));lx=e.clientX;ly=e.clientY};const releaseCamera=e=>{if(e.pointerId===cameraPointer)cameraPointer=null};C.onpointerup=C.onpointercancel=C.onlostpointercapture=releaseCamera;const pad=$("#move"),stick=$("#stick");let joystickPointer=null;const updateJoystick=e=>{if(e.pointerId!==joystickPointer)return;let r=pad.getBoundingClientRect(),x=e.clientX-r.left-r.width/2,y=e.clientY-r.top-r.height/2,d=Math.max(1,Math.hypot(x,y)),q=Math.min(42,d);mx=x/d*q/42;my=y/d*q/42;stick.style.transform=`translate(${mx*42}px,${my*42}px)`};pad.onpointerdown=e=>{if(!playing||paused||joystickPointer!==null)return;joystickPointer=e.pointerId;try{pad.setPointerCapture(e.pointerId)}catch{}updateJoystick(e)};pad.onpointermove=e=>{if(e.pointerId===joystickPointer)updateJoystick(e)};const releaseJoystick=e=>{if(e.pointerId!==joystickPointer)return;joystickPointer=null;mx=my=0;stick.style.transform="";/* effects.js owns movement audio */};pad.onpointerup=pad.onpointercancel=pad.onlostpointercapture=releaseJoystick;const sprintButton=$("#sprint");let sprintPointer=null;sprintButton.onpointerdown=e=>{if(!playing||paused||sprintPointer!==null)return;sprintPointer=e.pointerId;sprint=true;try{sprintButton.setPointerCapture(e.pointerId)}catch{}};const releaseSprint=e=>{if(e.pointerId!==sprintPointer)return;sprintPointer=null;sprint=false};sprintButton.onpointerup=sprintButton.onpointercancel=sprintButton.onlostpointercapture=releaseSprint;
// Keep actual movement physics in sync with the audio controller when Safari
// delivers a touch release to window instead of its captured control.
for(const type of ['pointerup','pointercancel']){
 window.addEventListener(type,releaseJoystick,{capture:true});
 window.addEventListener(type,releaseSprint,{capture:true});
 window.addEventListener(type,releaseCamera,{capture:true});
}
// Safari can background or blur without delivering pointerup. Release gameplay input
// alongside effects.js audio ownership so a resumed game cannot ghost-walk or sprint.
function clearTouchInput(){
 const moveId=joystickPointer,sprintId=sprintPointer,cameraId=cameraPointer;
 joystickPointer=null;sprintPointer=null;cameraPointer=null;
 mx=my=0;sprint=false;stick.style.transform="";
 for(const [element,id] of [[pad,moveId],[sprintButton,sprintId],[C,cameraId]]){
  if(id!==null){try{if(element.hasPointerCapture(id))element.releasePointerCapture(id)}catch{}}
 }
}
window.addEventListener('blur',clearTouchInput);
window.addEventListener('pagehide',clearTouchInput);
document.addEventListener('visibilitychange',()=>{if(document.hidden)clearTouchInput()});
$("#jump").onpointerdown=()=>{if(!playing||paused||!onGround)return;vy=5.8;onGround=false;window.dispatchEvent(new CustomEvent("gwt:ground-state",{detail:{grounded:false,playing:true}}))};
function reload(){if(!playing||paused||reloading||ammo===maxAmmo||reserves[weaponIndex]<=0)return;audioReady();sfx("reload");reloading=true;let token=run;say("RELOADING",600);setTimeout(()=>{if(run===token){{const needed=maxAmmo-ammo,taken=Math.min(needed,reserves[weaponIndex]);ammo+=taken;reserves[weaponIndex]-=taken;magazines[weaponIndex]=ammo;}reloading=false}},hero==="Mummy"?700:700)}function kill(g,team=false){if(!geese.includes(g))return;dropMeat(g);disposeGooseMesh(g);geese.splice(geese.indexOf(g),1);score+=g.userData.type==="boss"?1000:g.userData.type==="brute"?300:100;if(team)say(`${mate.userData.name.toUpperCase()} GOT ONE!`,400);if(!geese.length&&pending<=0&&!nextWave){nextWave=true;wave++;let token=run;setTimeout(()=>{if(run===token&&playing)spawn()},1200)}}
const ray=new THREE.Raycaster();function fire(){if(!playing||paused||reloading)return;const now=performance.now();if(now-lastShot<weapons[weaponIndex].cooldown)return;lastShot=now;audioReady();if(ammo<=0)return reload();sfx("shot");gunKick=1;ammo--;magazines[weaponIndex]=ammo;ray.setFromCamera(new THREE.Vector2(),cam);let hit=ray.intersectObjects(geese,true)[0];if(!hit)return;let g=hit.object;while(g.parent&&!geese.includes(g))g=g.parent;if(!geese.includes(g))return;g.userData.hp-=weapons[weaponIndex].damage*(hero==="Phoenix"?1.15:1)*(difficulty==="easy"?1.25:difficulty==="hard"?.9:1);burst(hit.point);if(g.userData.hp<=0)kill(g)}const swapButton=document.createElement("button");swapButton.id="swapWeapon";swapButton.type="button";swapButton.textContent="SWAP GUN";swapButton.setAttribute("aria-label","Switch collected weapon");swapButton.style.cssText="position:fixed;left:14px;top:calc(env(safe-area-inset-top) + 112px);z-index:4;padding:10px 12px;border:1px solid #b99853;border-radius:12px;background:#20232bcc;color:white;font-weight:bold;touch-action:manipulation";document.body.appendChild(swapButton);swapButton.onpointerdown=e=>{e.preventDefault();if(!playing||paused||reloading)return;const options=[...ownedWeapons].sort((a,b)=>a-b);if(options.length<2){say("FIND A WEAPON CHEST",700);return;}magazines[weaponIndex]=ammo;weaponIndex=options[(options.indexOf(weaponIndex)+1)%options.length];maxAmmo=weapons[weaponIndex].mag;ammo=magazines[weaponIndex];say("EQUIPPED "+weapons[weaponIndex].name,700)};$("#fire").onpointerdown=fire;$("#reload").onpointerdown=reload;$("#pause").onclick=()=>{paused=true;releaseInterruptedControls();window.dispatchEvent(new CustomEvent("gwt:ground-state",{detail:{grounded:onGround,playing:false}}));$("#pauseMenu").style.display="flex"};$(".resume").onclick=()=>{paused=false;$("#pauseMenu").style.display="none"};function releaseInterruptedControls(){// Clear ownership before releasing capture: lostpointercapture fires synchronously on some browsers.
 const captures=[[C,cameraPointer],[pad,joystickPointer],[sprintButton,sprintPointer]];
 cameraPointer=null;joystickPointer=null;sprintPointer=null;mx=my=0;sprint=false;stick.style.transform="";
 for(const [element,id] of captures){if(id===null)continue;try{if(element.hasPointerCapture(id))element.releasePointerCapture(id)}catch{}}
 /* effects.js exclusively owns movement audio. */}function suspendInterruptedSession(){releaseInterruptedControls();window.dispatchEvent(new CustomEvent("gwt:ground-state",{detail:{grounded:onGround,playing:false}}))}document.addEventListener("visibilitychange",()=>{if(document.hidden)suspendInterruptedSession()});window.addEventListener("blur",suspendInterruptedSession);window.addEventListener("pagehide",suspendInterruptedSession);
function team(dt){if(!mate)return;mate.userData.cd-=dt;mate.userData.bob+=dt*5;let home=new THREE.Vector3(cam.position.x+Math.sin(yaw)*2,0,cam.position.z+Math.cos(yaw)*2),d=home.sub(mate.position);d.y=0;if(d.length()>2.7)mate.position.add(d.normalize().multiplyScalar(dt*5));mate.position.y=Math.sin(mate.userData.bob)*.03;let target=null,best=12;for(let g of geese){let q=mate.position.distanceTo(g.position);if(q<best){best=q;target=g}}if(target){mate.lookAt(target.position.x,mate.position.y,target.position.z);if(best<11&&mate.userData.cd<=0){mate.userData.cd=mate.userData.name==="Phoenix"?.48:.68;target.userData.hp-=(mate.userData.name==="Phoenix"?1.1:1.4)*(difficulty==="easy"?1.25:difficulty==="hard"?.9:1);burst(target.position,mate.userData.name==="Phoenix"?0xc060ff:0xffd23a);if(target.userData.hp<=0)kill(target,true)}}}
function resize(){const b=C.getBoundingClientRect();/* Safari can briefly report zero dimensions while rotating or restoring a tab. Keep the last valid projection instead of writing NaN/Infinity into the camera. */if(!Number.isFinite(b.width)||!Number.isFinite(b.height)||b.width<1||b.height<1)return;R.setSize(b.width,b.height,false);cam.aspect=b.width/b.height;cam.updateProjectionMatrix()}new ResizeObserver(resize).observe(C);resize();function frame(now){let dt=Math.min(.035,(now-last)/1000);last=now;if(playing&&!paused&&!document.hidden){const moving=Math.hypot(mx,my)>.18&&onGround;cam.rotation.order="YXZ";cam.rotation.set(pitch,yaw,0);let sp=(hero==="Phoenix"?6.5:5.5)*(sprint?1.55:1),f=new THREE.Vector3(-Math.sin(yaw),0,-Math.cos(yaw)),r=new THREE.Vector3(Math.cos(yaw),0,-Math.sin(yaw));// Match the joystick audio deadzone: a resting thumb must not drift the camera silently.
const activeStick=Math.hypot(mx,my)>.18;const previousX=cam.position.x,previousZ=cam.position.z;cam.position.add(f.multiplyScalar(activeStick?-my*sp*dt:0)).add(r.multiplyScalar(activeStick?mx*sp*dt:0));if(!canTraverse(previousX,previousZ,cam.position.x,cam.position.z,(x,z)=>arena.collide(x,z,cam.position.y-1.7))){cam.position.x=previousX;cam.position.z=previousZ;}cam.position.x=Math.max(-95,Math.min(95,cam.position.x));cam.position.z=Math.max(-95,Math.min(95,cam.position.z));vy-=12*dt;cam.position.y+=vy*dt;const floor=1.7+arena.groundHeight(cam.position.x,cam.position.z,cam.position.y-1.7);if(onGround&&floor>cam.position.y&&floor-cam.position.y<=.65){cam.position.y=floor;vy=0}if(cam.position.y<=floor){cam.position.y=floor;vy=0;onGround=true}else{onGround=false}if(arena.collect(cam.position.x,cam.position.z)){lootCount++;const available=weapons.map((_,i)=>i).filter(i=>!ownedWeapons.has(i));const found=available.length?available[(lootCount-1)%available.length]:lootCount%weapons.length;const fresh=!ownedWeapons.has(found);ownedWeapons.add(found);reserves[found]+=weapons[found].mag*(fresh?2:1);magazines[weaponIndex]=ammo;weaponIndex=found;maxAmmo=weapons[found].mag;ammo=magazines[found];reloading=false;hp=Math.min(maxHp,hp+10);say((fresh?"NEW WEAPON: ":"AMMO FOUND: ")+weapons[found].name+" • +"+weapons[found].mag*(fresh?2:1)+" ROUNDS",1900)}collectMeat(now);window.dispatchEvent(new CustomEvent('gwt:ground-state',{detail:{grounded:onGround,playing:playing&&!paused}}));team(dt);for(let g of geese){if(now>g.userData.nextCall){g.userData.nextCall=now+(g.userData.type==="boss"?4200:6500)+Math.random()*6500}g.userData.bob+=dt*5;g.position.y=.02+Math.sin(g.userData.bob)*.025;let d=new THREE.Vector3(cam.position.x-g.position.x,0,cam.position.z-g.position.z),dist=d.length();// Telegraph close-range bites with a visibly opening beak, without adding per-frame meshes.
 const biteRange=1.3*g.scale.x;
 const threatening=dist<Math.max(4.2,biteRange*2.5);
 const jawOpen=threatening?Math.pow(.5+.5*Math.sin(now*.014+g.userData.attackPhase),3):0;
 g.userData.lowerJaw.position.y=1.69-.16*jawOpen;
 g.userData.lowerJaw.rotation.x=-.22*jawOpen;
 // Keep the beak and teeth aimed at the player even after the goose stops advancing to bite.
 g.lookAt(cam.position.x,g.position.y,cam.position.z);g.rotateY(Math.PI);
 if(dist>biteRange){const direction=d.normalize();const step=g.userData.speed*dt;const nx=g.position.x+direction.x*step,nz=g.position.z+direction.z*step;if(!arena.collide(nx,nz)){g.position.x=nx;g.position.z=nz}else{const flank=new THREE.Vector3(-direction.z,0,direction.x);const sign=Math.sin(g.userData.bob*.6)>0?1:-1;const fx=g.position.x+flank.x*step*sign,fz=g.position.z+flank.z*step*sign;if(!arena.collide(fx,fz)){g.position.x=fx;g.position.z=fz}}}else if(canGooseBite(arena,g.position.x,g.position.z,cam.position.x,cam.position.z,cam.position.y,1.3*g.scale.x)){hp-=g.userData.damage*dt}}for(let i=parts.length-1;i>=0;i--){let p=parts[i];p.userData.life-=dt;p.position.addScaledVector(p.userData.v,dt);if(p.userData.life<=0){disposeBurstParticle(p);parts.splice(i,1)}}$("#health").textContent=`❤ ${Math.max(0,Math.round(hp))}/${maxHp}`;$("#score").textContent=`SCORE ${score}`;$("#ammo").textContent=reloading?"RELOADING":`${weapons[weaponIndex].name} ${ammo}/${reserves[weaponIndex]}`;$("#geeseLeft").textContent=`GEESE ${geese.length+pending}`;$("#damage").style.opacity=hp<45?String((45-hp)/65):"0";if(hp<=0){playing=false;window.dispatchEvent(new CustomEvent('gwt:ground-state',{detail:{grounded:onGround,playing:false}}));run++;say("THE FLOCK GOT YOU",900);const deathRun=run,deathScore=score,deathWave=wave;setTimeout(()=>{if(run!==deathRun||playing)return;$("#menu").style.display="flex";$(".start").textContent=`RESPAWN • SCORE ${deathScore} • WAVE ${deathWave}`},650)}}animateHeldGun(now,dt);R.render(S,cam);requestAnimationFrame(frame)}requestAnimationFrame(frame);