// Regression guard: iPhone Safari can hide/blur without pointerup.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const game=readFileSync(new URL('../game.js',import.meta.url),'utf8');
const effects=readFileSync(new URL('../effects.js',import.meta.url),'utf8');
const reset=game.match(/function clearTouchInput\(\)\{([\s\S]*?)\n\}/)?.[1];
assert.ok(reset,'gameplay must provide a touch-input cleanup function');
for(const token of ['joystickPointer=null','sprintPointer=null','cameraPointer=null','mx=my=0','sprint=false','stick.style.transform=""','releasePointerCapture'])assert.ok(reset.includes(token),'missing reset: '+token);
for(const event of ['blur','pagehide','visibilitychange']){
 assert.ok(game.includes(event),'gameplay missing '+event+' cleanup');
 assert.ok(effects.includes(event),'audio controller missing '+event+' cleanup');
}
assert.match(game,/if\(document\.hidden\)clearTouchInput\(\)/);
console.log('Mobile input lifecycle regression: passed');
