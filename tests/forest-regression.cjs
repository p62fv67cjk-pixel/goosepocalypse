// Run with: node tests/forest-regression.cjs
// Execute the actual procedural forest block against lightweight Three.js doubles.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(require('node:path').join(__dirname, '../game.js'), 'utf8');
const start = source.indexOf('let scenerySeed=');
const end = source.indexOf('const geese=[],parts=[];', start);
assert(start !== -1 && end > start, 'forest block must exist');
function run() {
  const meshes=[]; const scene=[];
  class Obj { constructor(){this.position={set(x,y,z){this.x=x;this.y=y;this.z=z;},y:0};this.rotation={set(x,y,z){this.x=x;this.y=y;this.z=z;},x:0};this.scale={set(x,y,z){this.x=x;this.y=y;this.z=z;}};} updateMatrix(){this.matrix={position:{...this.position},rotation:{...this.rotation},scale:{...this.scale}};} }
  class Mesh extends Obj { constructor(geo,mat){super();this.geometry=geo;this.material=mat;} }
  class Instanced extends Mesh { constructor(g,m,n){super(g,m);this.count=n;this.matrices=[];this.colors=[];this.instanceMatrix={needsUpdate:false};meshes.push(this);}setMatrixAt(i,m){assert(i>=0&&i<this.count);this.matrices[i]=JSON.parse(JSON.stringify(m));}setColorAt(i,c){this.colors[i]=[c.r,c.g,c.b];this.instanceColor={needsUpdate:false};}computeBoundingSphere(){this.boundingSphereComputed=true;} }
  class Color {setRGB(r,g,b){Object.assign(this,{r,g,b});return this;}}
  class Texture {constructor(){this.repeat={set(){}};}}
  const ctx={fillRect(){},set fillStyle(v){}};
  const THREE={Object3D:Obj,Mesh,InstancedMesh:Instanced,Color,CanvasTexture:Texture,MeshStandardMaterial:class{constructor(v){this.v=v;}},MeshBasicMaterial:class{constructor(v){this.v=v;}},PlaneGeometry:class{},DodecahedronGeometry:class{},ConeGeometry:class{},CylinderGeometry:class{},RepeatWrapping:1,SRGBColorSpace:1,DoubleSide:2};
  vm.runInNewContext(source.slice(start,end),{THREE,document:{createElement(){return {getContext(){return ctx;}};}},S:{add(...x){scene.push(...x);}},Math});
  return {meshes,scene};
}
const a=run(),b=run();
assert.equal(a.meshes.length,5,'stones, grass and three tree instanced meshes');
assert.deepEqual(a.meshes.map(m=>m.count),[100,360,150,150,150]);
for(let i=0;i<a.meshes.length;i++){
 const m=a.meshes[i];assert.equal(m.matrices.length,m.count);assert(m.instanceMatrix.needsUpdate);
 assert.deepEqual(m.matrices,b.meshes[i].matrices,'reloads must preserve scenery placement');
 for(const matrix of m.matrices)for(const v of Object.values(matrix.position))assert(Number.isFinite(v));
}
for(let i=2;i<5;i++)assert(a.meshes[i].boundingSphereComputed,'instanced trees must be frustum-cullable');
for(let i=0;i<150;i++){
 const [trunk,lower,upper]=a.meshes.slice(2).map(m=>m.matrices[i]);
 assert.equal(trunk.position.x,lower.position.x);assert.equal(trunk.position.z,upper.position.z);
 assert(trunk.position.y>0);assert(trunk.scale.y>=.72&&trunk.scale.y<1.34);
 assert.deepEqual(a.meshes[3].colors[i],a.meshes[4].colors[i]);
}
assert(source.includes('const recordedGunshot=new Audio('));
assert(source.includes('const recordedReload=new Audio('));
console.log('Forest regression passed: deterministic instancing, 150 aligned trees, colours, bounds and weapon audio references.');
