import './landscape.js';

// Official Geese With Teeth soundtrack, recorded from the chosen Suno version.
// iOS requires playback to begin from a user gesture, so Play and the music button
// both count as explicit starts.
const track = new Audio('./geese-with-teeth-suno.m4a');
track.loop = true;
track.preload = 'auto';
track.volume = 0.72;
track.playsInline = true;

let wanted = false;

const button = document.createElement('button');
button.id = 'musicToggle';
button.textContent = '♫ OFF';
button.setAttribute('aria-label', 'Toggle music');
Object.assign(button.style, {
  position: 'fixed',
  right: '12px',
  top: 'calc(env(safe-area-inset-top) + 115px)',
  zIndex: '6',
  width: '54px',
  height: '34px',
  borderRadius: '18px',
  border: '1px solid #ffffff88',
  background: '#111b',
  color: '#fff',
  fontWeight: '900',
  fontSize: '10px'
});
document.body.appendChild(button);

async function startMusic() {
  wanted = true;
  try {
    await track.play();
    button.textContent = '♫ ON';
  } catch (error) {
    // Safari can still reject playback if a gesture has expired. Keep the user's
    // intent and retry on their next tap instead of breaking the game.
    button.textContent = '♫ TAP';
  }
}

function stopMusic() {
  wanted = false;
  track.pause();
  button.textContent = '♫ OFF';
}

button.addEventListener('click', (event) => {
  event.stopPropagation();
  if (!track.paused && wanted) stopMusic();
  else startMusic();
});

// Start the soundtrack with the same deliberate tap that starts gameplay.
document.querySelector('.start')?.addEventListener('click', () => {
  track.currentTime = 0;
  startMusic();
});

// Pause when the game is backgrounded. Resume only if the player left music on.
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    track.pause();
  } else if (wanted) {
    startMusic();
  }
});

// If an audio load fails, make the state obvious without affecting gameplay.
track.addEventListener('error', () => {
  button.textContent = '♫ ERR';
});
