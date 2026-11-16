// Merges keyboard, gamepad, touch and UI-triggered presses into the single
// per-tick input the simulation consumes: { held, pressed, turn }.

const wrapAngle = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const AIM_GAIN = 2.5; // turn input per radian of aim error (touch steering)

export function createInput({ keyboard, gamepad, touch, getShipAngle }) {
  const virtual = { fire: false, pause: false, restart: false, hyperspace: false };
  let choice;

  return {
    /** Press an action from UI (e.g. tapping the game-over panel restarts). */
    press(action) { virtual[action] = true; },
    /** Pick an upgrade card (index) from UI. */
    choose(index) { choice = index; },

    snapshot() {
      const k = keyboard.snapshot();
      const g = gamepad.snapshot();
      const t = touch.snapshot();
      const held = {
        left: k.held.left || g.held.left,
        right: k.held.right || g.held.right,
        thrust: k.held.thrust || g.held.thrust || t.held.thrust,
        fire: k.held.fire || g.held.fire || t.held.fire,
        shield: k.held.shield || g.held.shield || t.held.shield,
      };
      const pressed = {};
      for (const a of ['fire', 'pause', 'restart', 'hyperspace']) pressed[a] = k.pressed[a] || g.pressed[a] || t.pressed[a] || virtual[a];
      Object.keys(virtual).forEach((a) => (virtual[a] = false));

      // Analog steering: gamepad stick, else touch aim (turn toward the stick
      // direction), else undefined so the simulation uses left/right buttons.
      let turn;
      if (held.left || held.right) turn = undefined;
      else if (g.turn !== undefined) turn = g.turn;
      else if (t.aim) {
        const error = wrapAngle(Math.atan2(t.aim.y, t.aim.x) - getShipAngle());
        turn = Math.max(-1, Math.min(1, error * AIM_GAIN));
      }
      const picked = choice;
      choice = undefined;
      return { held, pressed, turn, choice: picked };
    },
  };
}
