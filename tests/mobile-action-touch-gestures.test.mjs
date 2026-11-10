// Run: node --test tests/mobile-action-touch-gestures.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const css=html.match(/<style>([\\s\\S]*?)<\\/style>/)?.[1];
test('all held gameplay actions opt out of native Safari touch gestures',()=>{
  assert.ok(css,'gameplay stylesheet exists');
  const rule=css.match(/#fire,#jump,#reload,#sprint,#pause\\s*\\{([^}]*)\\}/g)?.at(-1);
  assert.ok(rule,'shared action-button rule exists');
  assert.match(rule,/touch-action\\s*:\\s*none\\s*;/);
  assert.match(rule,/-webkit-user-select\\s*:\\s*none\\s*;/);
});
test('joystick still disables native touch gestures',()=>{
  assert.match(css,/#move\\s*\\{[^}]*touch-action\\s*:\\s*none/);
});
