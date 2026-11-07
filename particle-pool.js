// Hit-spark particles for Geese With Teeth.
// The old burst() created a new mesh, geometry AND material for every spark and never disposed them, which leaks
// GPU buffers on iPhone. Here one geometry and one material per colour are shared, and spark meshes are pooled:
// any spark removed from a scene (the game's frame loop or reset) returns to the pool automatically.
// Math.random is called in exactly the same order as before, so seeded runs stay comparable.
export function makeBurst(THREE){
 const geo=new THREE.SphereGeometry(.03,4,3),mats=new Map(),pool=[];
 const matFor=c=>{let m=mats.get(c);if(!m){m=new THREE.MeshBasicMaterial({color:c});mats.set(c,m)}return m};
 const onRemoved=function(){pool.push(this)};
 function spark(){
  let m=pool.pop();
  if(!m){m=new THREE.Mesh(geo,matFor(0xffffff));m.userData={life:0,v:new THREE.Vector3()};m.addEventListener("removed",onRemoved)}
  return m;
 }
 function burst(scene,list,pos,col=0xffc266){
  for(let i=0;i<3;i++){
   const m=spark(),u=m.userData;
   m.material=matFor(col);m.position.copy(pos);
   u.life=.25;u.v.set((Math.random()-.5)*2,Math.random(),(Math.random()-.5)*2);
   scene.add(m);list.push(m);
  }
 }
 burst.pool=pool;burst.geometry=geo;burst.materials=mats;
 return burst;
}
