// Starlane Courier — input. Keyboard and touch both feed one small set of
// named actions, so the game itself never asks which device is playing.
// Actions are edge-triggered: each press is queued once and consumed by
// the game loop, which keeps a fast double-tap from being read twice.

const KEY_ACTIONS = {
  ArrowLeft: 'left',
  KeyA: 'left',
  ArrowRight: 'right',
  KeyD: 'right',
  ArrowUp: 'jump',
  KeyW: 'jump',
  Space: 'jump',
  ArrowDown: 'slide',
  KeyS: 'slide',
  Enter: 'confirm',
  KeyP: 'pause',
  KeyM: 'mute',
};

/** Create the input feed attached to a DOM element (usually window). */
export function createInput(target) {
  const queue = [];
  const pressed = new Set();

  function press(action) {
    if (pressed.has(action)) return;
    pressed.add(action);
    queue.push(action);
  }
  function release(action) {
    pressed.delete(action);
  }

  target.addEventListener('keydown', (event) => {
    const action = KEY_ACTIONS[event.code];
    if (!action) return;
    event.preventDefault();
    if (!event.repeat) press(action);
  });
  target.addEventListener('keyup', (event) => {
    const action = KEY_ACTIONS[event.code];
    if (action) release(action);
  });
  target.addEventListener('blur', () => pressed.clear());

  // Touch: a short swipe steers, jumps or slides; a plain tap confirms.
  let touchStart = null;
  target.addEventListener('touchstart', (event) => {
    const touch = event.changedTouches[0];
    touchStart = { x: touch.clientX, y: touch.clientY, time: performance.now() };
  }, { passive: true });
  target.addEventListener('touchend', (event) => {
    if (!touchStart) return;
    const touch = event.changedTouches[0];
    const dx = touch.clientX - touchStart.x;
    const dy = touch.clientY - touchStart.y;
    touchStart = null;
    const adx = Math.abs(dx);
    const ady = Math.abs(dy);
    if (Math.max(adx, ady) < 24) {
      press('confirm');
      release('confirm');
      return;
    }
    const action = adx > ady ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'slide' : 'jump');
    press(action);
    release(action);
  }, { passive: true });

  return {
    /** Take the next queued action, or null when there is none. */
    next() {
      return queue.length > 0 ? queue.shift() : null;
    },
    /**
     * Queue an action from a button or a test, as a tap: it always
     * queues, bypassing the held-key set — a click is not a held key,
     * and routing it through the set swallowed the next keyboard press.
     */
    press(action) {
      queue.push(action);
    },
  };
}
