// Keyboard → actions, using the player's (remappable) bindings. `held`
// actions are continuous; `pressed` actions are edge-triggered and buffered
// until a simulation tick consumes them, so a quick tap is never lost.

const HELD = ['left', 'right', 'thrust', 'fire', 'shield'];
const PRESSED = ['fire', 'pause', 'restart', 'hyperspace'];

export function createKeyboardInput(target = window, { onFirstInput } = {}) {
  const held = Object.fromEntries(HELD.map((a) => [a, false]));
  const pressed = Object.fromEntries(PRESSED.map((a) => [a, false]));
  // Held actions tapped since the last tick: a key pressed and released between
  // two ticks still counts as held for one tick, so quick taps aren't lost.
  const tapped = Object.fromEntries(HELD.map((a) => [a, false]));
  let codeToAction = new Map();

  target.addEventListener('keydown', (e) => {
    onFirstInput?.();
    const action = codeToAction.get(e.code);
    if (!action) return;
    e.preventDefault();
    if (action in held) held[action] = tapped[action] = true;
    if (!e.repeat && action in pressed) pressed[action] = true;
  });
  target.addEventListener('keyup', (e) => {
    const action = codeToAction.get(e.code);
    if (action in held) held[action] = false;
  });
  // Keys released while the window is unfocused would otherwise stay stuck.
  target.addEventListener('blur', () => HELD.forEach((a) => (held[a] = false)));

  return {
    /** bindings: { action: [KeyboardEvent.code, ...] } */
    setBindings(bindings) {
      codeToAction = new Map();
      for (const [action, codes] of Object.entries(bindings)) for (const code of codes) codeToAction.set(code, action);
      HELD.forEach((a) => (held[a] = false));
    },
    snapshot() {
      const snap = { held: {}, pressed: { ...pressed } };
      for (const a of HELD) {
        snap.held[a] = held[a] || tapped[a];
        tapped[a] = false;
      }
      PRESSED.forEach((a) => (pressed[a] = false));
      return snap;
    },
  };
}
