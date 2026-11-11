// Guard the mobile chase optimisation against accidental per-goose allocations.
// Run: node --test tests/goose-pursuit-allocation.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const game = readFileSync(new URL('../game.js', import.meta.url), 'utf8');
const chaseStart = game.indexOf('if(dist>biteRange){');
const chaseEnd = game.indexOf('}else if(canGooseBite(', chaseStart);

test('chase logic remains present and checks obstacle collisions', () => {
  assert.ok(chaseStart >= 0 && chaseEnd > chaseStart, 'expected goose pursuit branch');
  const chase = game.slice(chaseStart, chaseEnd);
  assert.match(chase, /arena\.collide\(nx,nz\)/);
  assert.match(chase, /arena\.collide\(fx,fz\)/);
});

test('chase loop does not allocate Three.js vectors each frame', () => {
  assert.ok(chaseStart >= 0 && chaseEnd > chaseStart);
  const chase = game.slice(chaseStart, chaseEnd);
  assert.doesNotMatch(chase, /new\s+THREE\.(?:Vector2|Vector3|Object3D)\s*\(/);
  assert.match(chase, /const\s+step=g\.userData\.speed\*dt/);
});

test('chase keeps both direct pursuit and obstacle flank movement', () => {
  assert.ok(chaseStart >= 0 && chaseEnd > chaseStart);
  const chase = game.slice(chaseStart, chaseEnd);
  assert.match(chase, /g\.position\.x=nx/);
  assert.match(chase, /g\.position\.z=nz/);
  assert.match(chase, /g\.position\.x=fx/);
  assert.match(chase, /g\.position\.z=fz/);
});
