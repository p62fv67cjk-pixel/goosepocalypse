import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.170.0/+esm";
// Mountain arena extension. Keep draw calls low for mobile Safari.
export function createArena(scene){
 const rock=new THREE.MeshStandardMaterial({color:0x5a605e,roughness:.98,flatShading:true});
 const dirt=new THREE.MeshStandardMaterial({color:0x4e4a3c,roughness:1});
 const timber=new THREE.MeshStandardMaterial({color:0x5e4630,roughness:.92});
 const roofMat=new THREE.MeshStandardMaterial({color:0x2f363e,roughness:.88,metalness:.08});
 const gold=new THREE.MeshStandardMaterial({color:0xc9a04a,metalness:.6,roughness:.38});
 const obstacles=[],chests=[],steps=[];
 function block(x,y,z,w,h,d,mat=rock,solid=true){
  const m=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),mat);m.position.set(x,y,z);scene.add(m);
  if(solid)obstacles.push({x,z,w,d,h});return m;
 }
 // Distant ridgelines form a mountainous horizon without expensive terrain deformation.
 for(let i=0;i<32;i++){let a=i*Math.PI*2/32,r=91+(i%4)*4;
  let h=12+(i*17%19),m=new THREE.Mesh(new THREE.ConeGeometry(13,h,5),rock);
  m.position.set(Math.cos(a)*r,h*.47-1,Math.sin(a)*r);m.rotation.y=a;scene.add(m);
 }
 // Low boulders can be jumped over; larger rocks offer cover.
 for(let i=0;i<22;i++){let a=i*2.399,r=13+(i*11%57),x=Math.cos(a)*r,z=Math.sin(a)*r;
  const h=i%3===0?2.8:.65;block(x,h/2,z,i%3===0?3.2:1.35,h,i%3===0?2.5:1.1);
 }
 // Three watch huts: stairs are physical elevated walkable steps and roofs are platforms.
 for(const [cx,cz] of [[-18,-20],[23,-28],[12,29]]){
  // Four posts instead of a solid hut block: player can shelter underneath and reach stairs.
  for(const dx of [-3,3])for(const dz of [-2.5,2.5])block(cx+dx,1.45,cz+dz,.5,2.9,.5,timber);
  block(cx,3.15,cz,8,.35,7,roofMat,false);
  // Roof platform and stairs lead to a vantage point.
  steps.push({x:cx,z:cz,w:8,d:7,height:3.32});
  for(let i=0;i<8;i++){
   const x=cx-7.3+i*.82,z=cz+2.1,h=(i+1)*.42;
   block(x,h/2,z,.95,h,2.15,timber,false);
   // Thin front edge helps the step silhouette read on low-contrast mobile screens
   block(x,h+.02,z-1.05,.95,.04,.12,rock,false);
   steps.push({x,z,w:1.0,d:2.15,height:h});
  }
  // A side barrier gives cover without blocking the roof.
  block(cx+3.4,3.65,cz, .35,.8,5,rock,false);
 }
 // Weapon supply chests automatically open on approach, useful on touch devices.
 for(const [x,z] of [[-11,9],[29,7],[-29,-35],[5,-38],[36,36]]){
  const g=new THREE.Group(),base=new THREE.Mesh(new THREE.BoxGeometry(1.45,.7,.9),timber);
  base.position.y=.4;g.add(base);
  const lid=new THREE.Mesh(new THREE.BoxGeometry(1.5,.24,.95),gold);
  lid.position.y=.87;g.add(lid);
  const latch=new THREE.Mesh(new THREE.BoxGeometry(.22,.28,.08),gold);
  latch.position.set(0,.57,-.5);g.add(latch);
  g.position.set(x,0,z);scene.add(g);chests.push({x,z,g,lid,opened:false});
 }
 function groundHeight(x,z,currentFeet=0){let best=0;for(const s of steps){if(Math.abs(x-s.x)<s.w/2&&Math.abs(z-s.z)<s.d/2&&s.height<=currentFeet+.65)best=Math.max(best,s.height)}return best}
 function collide(x,z,feet=0){return obstacles.some(o=>feet<((o.h??2.8)-.15)&&Math.abs(x-o.x)<o.w/2+.35&&Math.abs(z-o.z)<o.d/2+.35)}
 function collect(x,z){for(const c of chests){if(!c.opened&&Math.hypot(x-c.x,z-c.z)<2.4){c.opened=true;c.lid.rotation.x=-.9;c.lid.position.z=.25;return true}}return false}
 function reset(){for(const c of chests){c.opened=false;c.lid.rotation.x=0;c.lid.position.z=0}}
 return {groundHeight,collide,collect,reset};
}
