// Regression: jump must announce airborne state synchronously, not wait for a frame.
const fs = require('node:fs');
const assert = require('node:assert/strict');
const source = fs.readFileSync('game.js', 'utf8');
const start = source.indexOf('$("#jump").onpointerdown=');
const end = source.indexOf('function reload()', start);
assert.ok(start >= 0 && end > start, 'jump pointer handler exists');
const handler = source.slice(start, end);
assert.ok(handler.includes('onGround=false'), 'jump clears grounded state');
assert.ok(handler.includes('gwt:ground-state'), 'jump immediately broadcasts ground state');
assert.ok(handler.indexOf('onGround=false') < handler.indexOf('gwt:ground-state'), 'grounded flag clears before broadcast');
assert.ok(handler.includes('grounded:false,playing:true'), 'jump reports airborne and active gameplay');
console.log('Immediate jump ground-state regression passed');
