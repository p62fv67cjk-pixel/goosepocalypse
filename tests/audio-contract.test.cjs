// Run with: node tests/audio-contract.test.cjs
// Source-level regression guard. Does not replace Safari/iPhone playback testing.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const effects = fs.readFileSync(path.join(root, 'effects.js'), 'utf8');
const game = fs.readFileSync(path.join(root, 'game.js'), 'utf8');
const checks = [
  ['recorded walk/run/landing assets remain wired', () => {
    for (const asset of ['mixkit-footsteps-on-tall-grass-532', 'thumblegray-running-on-the-floor-359909', 'freesound_community-footsteps-dirt-gravel-6823']) assert.ok(effects.includes(asset));
  }],
  ['recorded local audio files exist and are nonempty', () => {
    // A source reference alone is insufficient: renamed/missing media would pass
    // the older checks but silently break footsteps or weapons on iPhone.
    for (const source of [effects, game]) {
      for (const match of source.matchAll(/['"`]((?:\\.\\/)[^'"`]+\\.(?:wav|mp3|ogg))['"`]/gi)) {
        const asset = decodeURIComponent(match[1]).replace(/^\\.\\//, '');
        const fullPath = path.resolve(root, asset);
        assert.ok(fullPath.startsWith(root + path.sep), 'audio path escapes repository: ' + asset);
        assert.ok(fs.existsSync(fullPath), 'missing audio asset: ' + asset);
        assert.ok(fs.statSync(fullPath).size > 0, 'empty audio asset: ' + asset);
      }
    }
  }],
  ['movement gated by activity, joystick and jump', () => assert.match(effects, /!gameActive\(\)\|\|!moving\|\|jumping/)],
  ['sprint selects recorded running track', () => assert.match(effects, /playTrack\(sprinting\?run:walk\)/)],
  ['joystick and sprint release are pointer-owned', () => {
    assert.match(effects, /e\.pointerId!==movePointer/);
    assert.match(effects, /e\.pointerId!==sprintPointer/);
    assert.match(game, /e\.pointerId!==joystickPointer/);
  }],
  ['touch cancellation and page interruption are handled', () => {
    for (const source of [effects, game]) {
      assert.ok(source.includes('pointercancel'));
      assert.ok(source.includes('visibilitychange'));
      assert.ok(source.includes('pagehide'));
    }
  }],
  ['game physics determines landing and jump gating', () => {
    assert.ok(effects.includes('gwt:ground-state'));
    assert.ok(game.includes("new CustomEvent('gwt:ground-state'"));
    assert.match(effects, /authoritativeGroundState&& !physicsGrounded|authoritativeGroundState&&!physicsGrounded/);
  }],
  ['recorded landing is nonlooping and synthetic landing overlay absent', () => {
    assert.match(effects, /gravel\.loop=false/);
    const landing = effects.split('function landingImpact()')[1]?.split('const jumpBtn=')[0] || '';
    assert.ok(landing.includes('nativePlay.call(gravel)'));
    assert.ok(!/noiseBurst\(|createOscillator\(/.test(landing));
  }],
  ['gameplay and audio agree on the joystick deadzone', () => {
    // Both controllers must use the same threshold or footsteps can play while
    // the player is stationary (or stay silent while the player is moving).
    const gameDeadzone = game.match(/activeStick=Math\.hypot\(mx,my\)>(\.[0-9]+)/);
    const audioDeadzone = effects.match(/moving=Math\.min\(42,Math\.hypot\(x,y\)\)\/42>(\.[0-9]+)/);
    assert.ok(gameDeadzone, 'gameplay joystick deadzone missing');
    assert.ok(audioDeadzone, 'audio joystick deadzone missing');
    assert.equal(Number(audioDeadzone[1]), Number(gameDeadzone[1]));
  }],
  ['movement remains silent during airborne physics frames', () => {
    assert.match(effects, /if\(!grounded\)\{/);
    assert.match(effects, /if\(!jumping\)\{jumping=true;stopTrack\(true\);stopLanding\(\)\}/);
    assert.match(effects, /if\(jumping\)\{jumping=false;[\s\S]*?landingImpact\(\)\}/);
    assert.match(game, /activeStick\?[-\w*]+/);
  }],
  ['blood, low honks, weapon recordings and blood moon remain present', () => {
    assert.ok(effects.includes('splashBlood()'));
    assert.ok(effects.includes('BITE_HONK_COOLDOWN_MS'));
    assert.ok(effects.includes('demonicHonk()'));
    for (const name of ['gunBuffer', 'reloadBuffer', 'bloodMoon']) assert.ok(game.includes(name));
  }],
];
for (const [name, check] of checks) {
  check();
  console.log('PASS', name);
}
console.log(checks.length + ' source-level audio/gameplay contract checks passed');
