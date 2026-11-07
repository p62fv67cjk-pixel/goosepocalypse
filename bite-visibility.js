// Reject goose bites through solid cover and from below inaccessible rooftops.
// The goose attacks at ground level; cameraY is the player's eye height.
export function canGooseBite(arena, gooseX, gooseZ, playerX, playerZ, cameraY, reach) {
  const distance = Math.hypot(playerX-gooseX, playerZ-gooseZ);
  if (![gooseX, gooseZ, playerX, playerZ, cameraY, reach].every(Number.isFinite) || reach < 0 || distance > reach) return false;
  const feetY = cameraY - 1.7;
  const gooseFloor = arena.groundHeight(gooseX, gooseZ, 0);
  if (Math.abs(feetY-gooseFloor) > 1.1) return false;
  // Sample the short attack path rather than only the goose's endpoint.
  // Use the goose's own floor for collision checks to prevent wall clipping.
  const samples = Math.max(2, Math.ceil(distance / 0.2));
  // Include the player endpoint: a thin wall immediately in front of the player
  // must still block a bite, even when all interior samples are clear.
  for (let i=1; i<=samples; i++) {
    const t=i/samples;
    if (arena.collide(gooseX+(playerX-gooseX)*t, gooseZ+(playerZ-gooseZ)*t, gooseFloor)) return false;
  }
  return true;
}
