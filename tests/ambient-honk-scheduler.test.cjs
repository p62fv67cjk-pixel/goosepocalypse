// Regression: the ambient honk timer must survive transient WebAudio failures.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(require('node:path').join(__dirname, '..', 'effects.js'), 'utf8');
const match = source.match(/function scheduleHonk\(\)\{[^\n]+\}scheduleHonk\(\);/);
assert.ok(match, 'ambient honk scheduler must exist');
const queue=[];
let honks=0, active=true, throwOnce=true;
const sandbox={
 setTimeout(fn, delay){assert.ok(delay>=3600 && delay<=8300);queue.push(fn)},
 geeseAlive(){return active},
 demonicHonk(){honks++;if(throwOnce){throwOnce=false;throw Error('audio interrupted')}},
 Math:{random:()=>0}
};
vm.runInNewContext(match[0],sandbox);
assert.equal(queue.length,1);
queue.shift()();
assert.equal(honks,1);
assert.equal(queue.length,1,'WebAudio failure must not kill scheduling');
active=false;queue.shift()();
assert.equal(honks,1,'inactive game must stay silent');
assert.equal(queue.length,1,'inactive game must still reschedule');
active=true;queue.shift()();
assert.equal(honks,2,'honks resume in next active round');
console.log('Ambient honk scheduling regression passed');
