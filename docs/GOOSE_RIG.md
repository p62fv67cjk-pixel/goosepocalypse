# Goose rig (render performance + animation)

Owner: Claude. Files: `goose-rig.js`, `goose-pose.js`, `particle-pool.js`. Wired into `game.js` in three places only
(imports + init line, `goose()` builder, `burst()` body).

## What changed and why

| | Before | After |
|---|---|---|
| Meshes per goose | ~71 | 9 (body, skull, eyes, eye glow, jaw, 2 wings, 2 legs) |
| Geometries created per spawn | ~71, never disposed | 0 (built once per palette: normal/brute/boss) |
| Materials created per spawn | ~12, never disposed | 0 (3 shared for the whole game) |
| Goose objects after a kill | garbage | pooled and reused |
| Hit sparks | new mesh + geometry + material each, never disposed | pooled, 1 geometry, 1 material per colour |
| Animation | vertical bob only | waddle, wing flap/flare, head lunge + jaw chomp, death fall |

Mesh counts are from reading the code (the old builder is visible in the git history), not from a GPU capture.

## Look
- Eyes are unlit red (they glow regardless of lighting) with a hot core, plus an additive glow quad that pulses
  and is hidden beyond ~46 units. The glow quad has `raycast` disabled so it can never register a hit.
- Mouth is never fully shut (`JAW_AJAR`): upper teeth + two fangs and lower teeth always read; the jaw chomps when attacking.
- Per-feather colour jitter (seeded, deterministic) breaks up the flat plumage.
- Same silhouette and proportions as before; only mesh organisation changed.

## Animation (all procedural, no GLB required)
`goose-pose.js` is pure maths (no three.js): `stepState` advances gait/attack state, `computePose` returns angles.
`goose-rig.js` applies them to pivots (torso, head, jaw, 2 wings, 2 legs) from an `updateMatrixWorld` override, i.e.
right before the goose's matrices are recomputed. **game.js's frame loop is not involved.**
- Walk/run is detected from the goose's real movement (position delta / `min(dt,.035)`), attack from distance to the camera.
- Geese beyond 62 units skip animation entirely (CPU).
- Death: when `g.userData.hp` goes from >0 to <=0 an animated corpse is placed where the goose stands, falls on its
  side, and is removed/recycled after 1.7s. At most 8 corpses exist at once so draw calls stay bounded.

## Integration rules (for anyone editing `game.js`)
- Spawn geese with `gooseKit.acquire(type)`; do not build geese from raw meshes.
- `S.remove(g)` returns the goose to the pool automatically. **Do not keep references to a goose after `kill()`**:
  the object can be reused by a later spawn.
- `g.userData` is replaced wholesale by `goose()`; the death hook arms itself when the goose is added to a scene
  (`added` event). Do not rely on `userData` object identity across spawns.
- Hit detection is unchanged: `ray.intersectObjects(geese,true)` then walk `parent` to the root in `geese`.
- `burst(p,col)` keeps its signature and its `Math.random` call order.
- `goose-rig.js` must never consume `Math.random` (it uses its own seeded counter) so spawn sequences stay reproducible.

## Tuning constants
`goose-pose.js`: `JAW_AJAR`, `DEATH_*`, amplitudes inside `computePose`. `goose-rig.js` options: `maxCorpses` (8),
`lodFar` (62), `haloFar` (46).

## Tests
- `node --test tests/goose-pose.test.mjs` (pure, no dependencies)
- `node --test tests/goose-integration.test.mjs` (static contracts on `game.js`, no dependencies)
- `npm i --no-save three@0.170.0 && node --test tests/goose-rig.test.mjs tests/goose-autoarm.test.mjs tests/particle-pool.test.mjs`
- CI definition: `docs/workflows/goose-rig.yml` (move it to `.github/workflows/` to enable; see the note inside it).

## Known limitations
- Not verified on a physical iPhone; visual quality (feather shapes, eye glow, teeth) needs an eyes-on check.
- No skeletal/GLB animation: this is procedural. A Blender-exported GLB could replace the rig later; the pool/hook API would stay.
- Per-frame `new THREE.Vector3` allocations in `frame()`'s goose loop (and `team()`) are untouched, because they sit on
  the same long line as weapon/loot code. Worth fixing after the weapon work settles.
- Goose silhouette is deliberately unchanged; no new shadow, texture or normal-map work yet.
