const fs = require('node:fs');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const source = fs.readFileSync('game.js', 'utf8');
const start = source.indexOf('const MAX_ACTIVE_MEAT_DROPS=');
const end = source.indexOf('function collectMeat(now)', start);
assert.ok(start > 0 && end > start, 'bounded dropMeat implementation exists');
const removed = [];
const scene = {add(){}, remove(mesh){removed.push(mesh)}};
class Mesh { constructor(geometry, material){this.geometry=geometry;this.material=material;this.position={set(x,y,z){Object.assign(this,{x,y,z})}};this.userData={};}}
const context = {THREE:{Mesh}, meatDrops:[],meatGeometry:{},meatMaterial:{},S:scene,performance:{now:()=>100}};
vm.createContext(context);
vm.runInContext(source.slice(start,end)+';this.dropMeat=dropMeat;this.cap=MAX_ACTIVE_MEAT_DROPS;',context);
const goose={position:{x:0,z:0},userData:{type:'normal'}};
for(let i=0;i<80;i++){goose.position.x=i;context.dropMeat(goose);}
assert.equal(context.cap,32);
assert.equal(context.meatDrops.length,32);
assert.equal(removed.length,48);
assert.equal(context.meatDrops[0].position.x,48);
assert.equal(context.meatDrops[31].position.x,79);
assert.equal(context.meatDrops[0].userData.heal,20);
assert.ok(context.meatDrops.every(x=>x.geometry===context.meatGeometry && x.material===context.meatMaterial),'shared assets remain intact');
console.log('PASS: meat pickups bounded; oldest removed; healing and shared assets preserved');
