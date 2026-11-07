// Dependency-free integration checks for mountain geometry and weapon startup.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const source=fs.readFileSync('arena-upgrade.js','utf8');
const game=fs.readFileSync('game.js','utf8');
class V { constructor(){this.x=0;this.y=0;this.z=0} set(x,y,z){this.x=x;this.y=y;this.z=z} }
class Obj { constructor(){this.position=new V();this.rotation=new V();this.children=[]} add(x){this.children.push(x)} }
class Mesh extends Obj {constructor(geo,mat){super();this.geometry=geo;this.material=mat}}
class Group extends Obj {}
const THREE={MeshStandardMaterial:class{constructor(o){Object.assign(this,o)}},BoxGeometry:class{},ConeGeometry:class{},Mesh,Group};
const context={THREE,Math};
vm.createContext(context);
vm.runInContext(source.replace(/^import .*;\s*/,'').replace('export function createArena','function createArena')+'\nthis.createArena=createArena;',context);
const scene=new Group(),arena=context.createArena(scene);
assert.equal(typeof arena.collide,'function');
assert.equal(arena.groundHeight(0,0,0),0);
assert.equal(arena.collide(0,0,0),false,'spawn must be unobstructed');
assert.equal(arena.collide(-15,-17.5,0),true,'hut posts block at ground level');
assert.equal(arena.groundHeight(-25.3,-17.9,0),.415,'first stair reachable');
let feet=0;
for(let i=0;i<8;i++){const x=-25.3+i*.78;feet=arena.groundHeight(x,-17.9,feet);assert.ok(Math.abs(feet-(i+1)*.415)<1e-6,'stair '+i+' must be walkable')}
assert.equal(arena.groundHeight(-18,-20,feet),3.32,'roof reachable from stairs');
assert.equal(arena.groundHeight(-18,-20,0),0,'cannot teleport onto roof');
assert.equal(arena.collect(-11,9),true,'chest pickup');
assert.equal(arena.collect(-11,9),false,'chest cannot be collected twice');
arena.reset();
assert.equal(arena.collect(-11,9),true,'chest resets for next game');
assert.match(game,/let weaponIndex=0,lastShot=-Infinity/,'initial weapon must fire immediately');
assert.match(game,/weaponIndex=0;lastShot=-Infinity/,'restart must fire immediately');
assert.match(game,/new Audio\(new URL\("\.\/Gun%201\.wav"/,'recorded gunshot retained');
assert.match(game,/new Audio\(new URL\("\.\/Reload%201\.wav"/,'recorded reload retained');
console.log('Mountain arena geometry, stairs, collision, chest lifecycle and weapon startup checks passed');
