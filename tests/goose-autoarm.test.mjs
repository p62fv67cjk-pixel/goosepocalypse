// Real-three.js test for the automatic death hook. Run: node --test tests/goose-autoarm.test.mjs
import test,{mock} from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {makeGooseKit} from '../goose-rig.js';

test('geese are armed automatically when game.js adds them to the scene (no explicit arm call)',()=>{
 mock.timers.enable({apis:['setTimeout']});
 try{
  const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera();
  const kit=makeGooseKit(THREE,{camera,now:()=>1000});
  // Mirror game.js goose(): acquire, set position/scale, assign userData wholesale, then S.add(g).
  const g=kit.acquire('normal');g.position.set(0,.02,-10);g.scale.setScalar(1);
  g.userData={hp:3,type:'normal',speed:1.3,damage:20,bob:0};
  const before=Object.getOwnPropertyDescriptor(g.userData,'hp');
  assert.ok('value' in before,'hp is a plain data property until the goose enters the scene');
  scene.add(g);
  const after=Object.getOwnPropertyDescriptor(g.userData,'hp');
  assert.ok(typeof after.get==='function','hp becomes an accessor once added');
  assert.equal(g.userData.hp,3);
  g.userData.hp-=1.5;assert.equal(g.userData.hp,1.5);assert.equal(scene.children.length,1,'a hit that does not kill spawns nothing');
  g.userData.hp-=2;                                                 // fire()/team() killing blow
  assert.equal(scene.children.length,2,'killing blow spawns a corpse');
  // The pooled goose is re-armed correctly on reuse with a brand new userData object.
  scene.remove(g);
  const again=kit.acquire('normal');assert.equal(again,scene.children.length?again:again);
  again.userData={hp:2,type:'normal'};scene.add(again);
  again.userData.hp-=5;assert.ok(scene.children.filter(c=>c.rig.dead).length>=1);
  // Corpses carry no hp, so adding them must not arm anything or throw.
  assert.doesNotThrow(()=>scene.children.forEach(c=>c.userData));
 }finally{mock.timers.reset()}
});
