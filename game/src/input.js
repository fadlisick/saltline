// Keyboard and mouse, and the pointer lock that turns the mouse into look. Plain
// browser APIs only: the game asks the canvas for pointer lock and reads movementX/Y
// while it holds it. Weapon keys, grenade, interact and the buy menu ride along.
// The right mouse button is the scope: held while locked, it scopes the DMR.
export function createInput(canvas, onLockChange) {
  const keys = new Set();
  const state = { keys, locked: false, firing: false, scoping: false, lookX: 0, lookY: 0 };
  const pressed = new Set();
  let trigger = false;

  function setKey(event, down) {
    if (down) {
      if (!keys.has(event.code)) pressed.add(event.code);
      keys.add(event.code);
    } else {
      keys.delete(event.code);
    }
    if (event.code === 'Space') event.preventDefault();
  }

  window.addEventListener('keydown', (event) => setKey(event, true));
  window.addEventListener('keyup', (event) => setKey(event, false));
  window.addEventListener('blur', () => { keys.clear(); pressed.clear(); });
  window.addEventListener('mousemove', (event) => {
    if (!state.locked) return;
    state.lookX += event.movementX;
    state.lookY += event.movementY;
  });
  window.addEventListener('mousedown', (event) => {
    if (state.locked && event.button === 0) {
      state.firing = true;
      trigger = true;
    }
    if (state.locked && event.button === 2) state.scoping = true;
  });
  window.addEventListener('mouseup', (event) => {
    if (event.button === 0) state.firing = false;
    if (event.button === 2) state.scoping = false;
  });
  // No context menu on right-click: the button is the scope, not a menu.
  canvas.addEventListener('contextmenu', (event) => event.preventDefault());
  document.addEventListener('pointerlockchange', () => {
    state.locked = document.pointerLockElement === canvas;
    if (!state.locked) {
      keys.clear();
      state.firing = false;
    }
    onLockChange(state.locked);
  });

  return {
    state,
    requestLock() {
      canvas.requestPointerLock();
    },
    takeLook() {
      const x = state.lookX;
      const y = state.lookY;
      state.lookX = 0;
      state.lookY = 0;
      return { x, y };
    },
    // One-shot key presses since the last frame: B for buy, G for grenade, digits
    // for weapons. Held keys (WASD, E, R, Ctrl) stay in state.keys.
    takePressed() {
      const out = new Set(pressed);
      pressed.clear();
      return out;
    },
    // One trigger pull since the last frame: semi-automatic weapons fire once per
    // pull, automatics fire while the button is held.
    takeTrigger() {
      const out = trigger;
      trigger = false;
      return out;
    },
  };
}
