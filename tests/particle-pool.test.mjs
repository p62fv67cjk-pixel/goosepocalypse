// Run: node --test tests/particle-pool.test.mjs  (needs three: npm i --no-save three@0.170.0)
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {makeBurst} from '../particle-pool.js';

test('hit sparks share one geometry and one material per colour, and are pooled',()=>{
 const burst=makeBurst(THREE),scene=new THREE.Scene(),list=[];
 for(let i=0;i<50;i++){burst(scene,list,new THREE.Vector3(i,1,0),i%2?0xffc266:0xc060ff);list.splice(0).forEach(p=>scene.remove(p))}
 assert.equal(burst.materials.size,2);
 assert.ok(burst.pool.length<=3,'pool should hold only the 3 reused sparks, has '+burst.pool.length);
 burst(scene,list,new THREE.Vector3(),0xffd23a);
 assert.equal(new Set(list.map(p=>p.geometry)).size,1);
 for(const p of list){assert.equal(p.userData.life,.25);assert.ok(p.userData.v instanceof THREE.Vector3);assert.equal(p.parent,scene)}
});

test('burst consumes Math.random in the same order as the original implementation',()=>{
 const seq=[.1,.2,.3,.4,.5,.6,.7,.8,.9];let i=0;const real=Math.random;
 Math.random=()=>seq[i++];
 try{
  const burst=makeBurst(THREE),scene=new THREE.Scene(),list=[];
  burst(scene,list,new THREE.Vector3());
  assert.equal(i,9);
  const v=list[0].userData.v;
  assert.ok(Math.abs(v.x-(.1-.5)*2)<1e-9&&Math.abs(v.y-.2)<1e-9&&Math.abs(v.z-(.3-.5)*2)<1e-9);
 }finally{Math.random=real}
});
