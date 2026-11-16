// Gamepad (standard mapping) → actions. Polled once per frame.
//   Left stick / d-pad  turn (analog)      RT, B, d-pad up  thrust
//   A, RB, X            fire               Start            pause
//   A, Y                restart (game over)
//   LB                  hyperspace         LT               shield (hold)
// Menu navigation edges (d-pad / stick, A confirm, B back) are exposed separately.

const DEADZONE = 0.2;
const B = { A: 0, B: 1, X: 2, Y: 3, LB: 4, RB: 5, LT: 6, RT: 7, START: 9, UP: 12, DOWN: 13, LEFT: 14, RIGHT: 15 };

export function createGamepadInput() {
  let pad = null;
  let prev = {};
  let prevStickY = 0;
  let prevStickX = 0;
  const held = { left: false, right: false, thrust: false, fire: false, shield: false };
  const pressed = { fire: false, pause: false, restart: false, hyperspace: false };
  const menu = { up: false, down: false, left: false, right: false, confirm: false, back: false };
  let turn;

  function poll() {
    const pads = navigator.getGamepads?.() ?? [];
    pad = [...pads].find((p) => p && p.connected) ?? null;
    if (!pad) {
      Object.keys(held).forEach((k) => (held[k] = false));
      turn = undefined;
      return;
    }
    const down = (i) => !!pad.buttons[i]?.pressed;
    const value = (i) => pad.buttons[i]?.value ?? 0;
    const rose = (i) => down(i) && !prev[i];

    const x = pad.axes[0] ?? 0;
    const y = pad.axes[1] ?? 0;
    const stick = Math.abs(x) < DEADZONE ? 0 : Math.sign(x) * ((Math.abs(x) - DEADZONE) / (1 - DEADZONE));
    const dpad = (down(B.RIGHT) ? 1 : 0) - (down(B.LEFT) ? 1 : 0);
    turn = dpad !== 0 ? dpad : stick !== 0 ? stick : undefined;

    held.thrust = value(B.RT) > 0.25 || down(B.B) || down(B.UP);
    held.fire = down(B.A) || down(B.RB) || down(B.X);
    held.shield = value(B.LT) > 0.3;
    if (rose(B.LB)) pressed.hyperspace = true;
    if (rose(B.A) || rose(B.RB) || rose(B.X)) pressed.fire = true;
    if (rose(B.START)) pressed.pause = true;
    if (rose(B.A) || rose(B.Y)) pressed.restart = true;

    // Menu edges (stick counts as a d-pad press when it crosses 0.6).
    const stickUp = y < -0.6 && prevStickY >= -0.6;
    const stickDown = y > 0.6 && prevStickY <= 0.6;
    const stickLeft = x < -0.6 && prevStickX >= -0.6;
    const stickRight = x > 0.6 && prevStickX <= 0.6;
    if (rose(B.UP) || stickUp) menu.up = true;
    if (rose(B.DOWN) || stickDown) menu.down = true;
    if (rose(B.LEFT) || stickLeft) menu.left = true;
    if (rose(B.RIGHT) || stickRight) menu.right = true;
    if (rose(B.A)) menu.confirm = true;
    if (rose(B.B)) menu.back = true;

    prevStickX = x;
    prevStickY = y;
    prev = Object.fromEntries(pad.buttons.map((b, i) => [i, b.pressed]));
  }

  return {
    poll,
    get connected() { return pad !== null; },
    snapshot() {
      const snap = { held: { ...held }, pressed: { ...pressed }, turn };
      Object.keys(pressed).forEach((k) => (pressed[k] = false));
      return snap;
    },
    /** Menu navigation edges since the last call. */
    takeMenu() {
      const m = { ...menu };
      Object.keys(menu).forEach((k) => (menu[k] = false));
      return m;
    },
    rumble(strong, weak, ms) {
      pad?.vibrationActuator?.playEffect?.('dual-rumble', {
        duration: ms, strongMagnitude: strong, weakMagnitude: weak,
      })?.catch?.(() => {});
    },
  };
}
