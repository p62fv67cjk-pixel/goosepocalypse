// Run with: node --test tests/viewmodel-disposal.test.cjs
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const source=fs.readFileSync(require('node:path').join(__dirname,'../game.js'),'utf8');

test('weapon swap disposes old meshes without disposing shared materials',()=>{
  const match=source.match(/function clearHeldGun\(\)\{[^\n]+\}/);
  assert.ok(match,'viewmodel cleanup function must exist');
  let disposed=0,materialsDisposed=0,cleared=0;
  const mesh={isMesh:true,geometry:{dispose(){disposed++}},material:{dispose(){materialsDisposed++}}};
  const group={traverse(fn){fn(mesh);fn({isMesh:false})},clear(){cleared++}};
  vm.runInNewContext(match[0]+';clearHeldGun()', {heldGun:group});
  assert.equal(disposed,1);
  assert.equal(cleared,1);
  assert.equal(materialsDisposed,0);
  assert.match(source,/function buildHeldGun\(index\)\{clearHeldGun\(\)/);
});
