// Run: node tests/weapon-swap-layout.test.cjs
const assert = require('node:assert/strict');
const fs = require('node:fs');
const html = fs.readFileSync('index.html', 'utf8');
const game = fs.readFileSync('game.js', 'utf8');
const match = game.match(/swapButton\.style\.cssText="([^"]+)"/);
assert.ok(match, 'weapon swap button must exist');
const css = match[1];
assert.match(css, /position:fixed;/);
assert.match(css, /left:14px;/);
assert.match(css, /top:calc\(env\(safe-area-inset-top\) \+ 112px\)/);
assert.doesNotMatch(css, /bottom:/, 'swap button must not overlap lower-right controls');
assert.doesNotMatch(css, /z-index:30/, 'swap button must not obscure other controls');
for (const rule of [/#sprint\{right:20px;bottom:133px/, /#sprint\{right:13px;bottom:108px/, /#sprint\{right:16px;bottom:109px/]) {
  assert.match(html, rule, 'right-thumb sprint must remain in each viewport layout');
}
console.log('Weapon swap placement checks passed');
