'use strict';

// Deterministic local health transitions. Network messages are requests, never proof of revival.
function createReviveState(maxHealth, reviveFraction = 0.35) {
  if (!Number.isFinite(maxHealth) || maxHealth <= 0) throw new RangeError('maxHealth');
  if (!Number.isFinite(reviveFraction) || reviveFraction <= 0 || reviveFraction > 1) throw new RangeError('reviveFraction');
  let health = maxHealth;
  let downed = false;
  let generation = 0;
  return Object.freeze({
    snapshot: () => Object.freeze({health, maxHealth, downed, generation}),
    damage(amount) {
      if (!Number.isFinite(amount) || amount <= 0) return false;
      if (downed) return false;
      health = Math.max(0, health - amount);
      if (health === 0) { downed = true; generation++; }
      return true;
    },
    revive(authorized, expectedGeneration) {
      if (authorized !== true || !downed || expectedGeneration !== generation) return false;
      health = Math.max(1, Math.min(maxHealth, Math.ceil(maxHealth * reviveFraction)));
      downed = false;
      generation++;
      return true;
    },
    reset() { health = maxHealth; downed = false; generation++; }
  });
}
module.exports = {createReviveState};
