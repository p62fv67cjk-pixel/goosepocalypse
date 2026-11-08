// Run: node --test tests/hit-particle-disposal.test.cjs
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(require('node:path').join(__dirname, '../game.js'), 'utf8');
const match = source.match(/function disposeBurstParticle\(p\)\{[^}]+\}/);
test('hit particle cleanup releases both GPU resources and detaches mesh', () => {
  assert.ok(match, 'cleanup function must exist');
  const removed = [];
  const context = { S: { remove: p => removed.push(p) } };
  vm.runInNewContext(match[0] + ';this.cleanup=disposeBurstParticle;', context);
  let geometry = 0, material = 0;
  const particle = { geometry: { dispose: () => geometry++ }, material: { dispose: () => material++ } };
  context.cleanup(particle);
  assert.deepEqual(removed, [particle]);
  assert.equal(geometry, 1);
  assert.equal(material, 1);
});
test('both particle expiry and restart invoke cleanup', () => {
  assert.match(source, /parts\.splice\(0\)\.forEach\(disposeBurstParticle\)/);
  assert.match(source, /disposeBurstParticle\(p\);parts\.splice\(i,1\)/);
});
test('shared meat and weapon assets are not accidentally disposed by particle cleanup', () => {
  assert.ok(match);
  assert.doesNotMatch(match[0], /meatGeometry|meatMaterial|heldGun|weapon/i);
});
