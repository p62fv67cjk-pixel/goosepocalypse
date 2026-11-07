// Run: node --test tests/bite-endpoint.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const source = await readFile(new URL('../bite-visibility.js', import.meta.url), 'utf8');
const {canGooseBite} = await import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'));
const arena = (blocked = () => false) => ({
  groundHeight: () => 0,
  collide: (x,z,y) => blocked(x,z,y)
});
test('clear ground-level attack remains possible', () => {
  assert.equal(canGooseBite(arena(),0,0,1,0,1.7,1.5),true);
});
test('out of range and elevated player remain protected', () => {
  assert.equal(canGooseBite(arena(),0,0,2,0,1.7,1.5),false);
  assert.equal(canGooseBite(arena(),0,0,1,0,4,1.5),false);
});
test('thin cover at player endpoint blocks attack', () => {
  assert.equal(canGooseBite(arena(x=>x>=.99),0,0,1,0,1.7,1.5),false);
});
test('interior cover blocks attack', () => {
  assert.equal(canGooseBite(arena(x=>x>.45&&x<.55),0,0,1,0,1.7,1.5),false);
});
test('invalid coordinates or negative reach never allow a bite', () => {
  assert.equal(canGooseBite(arena(),0,0,NaN,0,1.7,1.5),false);
  assert.equal(canGooseBite(arena(),0,0,1,0,1.7,-1),false);
});
