// Keyboard + mouse input. Held keys steer; one-shot presses (enter car,
// punch, pause, confirm, dialog advance, radio, mute) are queued as flags
// and taken once by the loop, so a press between frames is never lost.
export const ACTION_CONFIRM = 1;
export const ACTION_PAUSE = 2;
export const ACTION_ENTER = 4;
export const ACTION_PUNCH = 8;
export const ACTION_DIALOG = 16;
export const ACTION_RADIO = 32;
export const ACTION_MUTE = 64;

const UP = new Set(['ArrowUp', 'KeyW']);
const DOWN = new Set(['ArrowDown', 'KeyS']);
const LEFT = new Set(['ArrowLeft', 'KeyA']);
const RIGHT = new Set(['ArrowRight', 'KeyD']);

export function createInput(canvas) {
  const keys = { up: false, down: false, left: false, right: false };
  let actions = 0;
  let mouse = { x: 0, y: 0, down: false };
  let shootQueued = null;

  window.addEventListener('keydown', (event) => {
    if (UP.has(event.code)) keys.up = true;
    else if (DOWN.has(event.code)) keys.down = true;
    else if (LEFT.has(event.code)) keys.left = true;
    else if (RIGHT.has(event.code)) keys.right = true;
    else if (event.code === 'KeyE') { if (!event.repeat) actions |= ACTION_ENTER; }
    else if (event.code === 'KeyF') { if (!event.repeat) actions |= ACTION_PUNCH; }
    else if (event.code === 'KeyR') { if (!event.repeat) actions |= ACTION_RADIO; }
    else if (event.code === 'KeyM') { if (!event.repeat) actions |= ACTION_MUTE; }
    else if (event.code === 'Space' || event.code === 'Enter') { if (!event.repeat) actions |= ACTION_CONFIRM | ACTION_DIALOG; }
    else if (event.code === 'KeyP' || event.code === 'Escape') { if (!event.repeat) actions |= ACTION_PAUSE; }
    else return;
    event.preventDefault();
  });
  window.addEventListener('keyup', (event) => {
    if (UP.has(event.code)) keys.up = false;
    else if (DOWN.has(event.code)) keys.down = false;
    else if (LEFT.has(event.code)) keys.left = false;
    else if (RIGHT.has(event.code)) keys.right = false;
  });
  window.addEventListener('blur', () => {
    keys.up = keys.down = keys.left = keys.right = false;
    mouse.down = false;
  });
  canvas.addEventListener('mousemove', (event) => {
    const rect = canvas.getBoundingClientRect();
    mouse.x = event.clientX - rect.left;
    mouse.y = event.clientY - rect.top;
  });
  canvas.addEventListener('mousedown', (event) => {
    if (event.button !== 0) return;
    const rect = canvas.getBoundingClientRect();
    mouse.x = event.clientX - rect.left;
    mouse.y = event.clientY - rect.top;
    mouse.down = true;
    shootQueued = { x: mouse.x, y: mouse.y };
  });
  window.addEventListener('mouseup', () => { mouse.down = false; });

  return {
    keys,
    mouse,
    takeActions() {
      const taken = actions;
      actions = 0;
      return taken;
    },
    takeShoot() {
      const shot = shootQueued;
      shootQueued = null;
      return shot;
    },
  };
}
