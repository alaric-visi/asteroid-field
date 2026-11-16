// First-run tutorial: contextual prompts during the opening wave of the
// campaign. Each step completes when the player actually does the thing.
// The ship is indestructible (game.options.training) until it finishes.
// Prompts show controls for the device the player is using.
import { keyName } from './menu.js';

const GLYPHS = {
  gamepad: { turn: 'Left stick', thrust: 'RT', fire: 'A', shield: 'LT (hold)', hyperspace: 'LB', skip: 'Start' },
  touch: { turn: 'Left stick', thrust: 'THRUST', fire: 'FIRE', shield: 'SHIELD (hold)', hyperspace: 'JUMP', skip: '' },
};

const STEPS = [
  { id: 'turn', text: (k) => `${k('turn')} to turn`, done: (t) => t.turned > Math.PI * 0.9 },
  { id: 'thrust', text: (k) => `${k('thrust')} to thrust`, done: (t) => t.thrust > 0.7 },
  { id: 'fire', text: (k) => `${k('fire')} to fire — hold for auto-fire, but watch the heat`, done: (t) => t.shots >= 4 },
  { id: 'shield', text: (k) => `${k('shield')} for the shield — it smashes small rocks`, done: (t) => t.shield > 0.5 },
  { id: 'hyperspace', text: (k) => `${k('hyperspace')} to hyperspace out of trouble`, done: (t) => t.jumps >= 1 },
  { id: 'go', text: () => 'Clear the field. Chain kills for a combo. Good hunting.', done: (t) => t.stepTime > 3 },
];

export function createTutorial({ root, getDevice, getBindings, onFinish, sfx }) {
  let active = false;
  let game = null;
  let index = 0;
  let t = null;
  let lastAngle = 0;
  let celebrate = 0; // brief "✓" between steps
  let rendered = '';

  function keyLabel(action) {
    const device = getDevice();
    if (GLYPHS[device]) return `<kbd>${GLYPHS[device][action]}</kbd>`;
    const b = getBindings();
    if (action === 'turn') return `${b.left.slice(0, 1).map((c) => `<kbd>${keyName(c)}</kbd>`).join('')} ${b.right.slice(0, 1).map((c) => `<kbd>${keyName(c)}</kbd>`).join('')}`;
    if (action === 'skip') return '<kbd>Enter</kbd>';
    return `<kbd>${keyName(b[action][0])}</kbd>`;
  }

  function render() {
    if (!active) return;
    const step = STEPS[index];
    const skip = keyLabel('skip');
    const html = `<span class="step">${celebrate > 0 ? '✓ NICE' : `${index + 1} / ${STEPS.length}`}</span>
      <span>${step.text(keyLabel)}</span>${skip && index < STEPS.length - 1 ? `<span class="skip">${skip} skip</span>` : ''}`;
    if (html !== rendered) {
      root.innerHTML = html;
      rendered = html;
    }
    root.classList.toggle('done', celebrate > 0);
  }

  function finish() {
    if (!active) return;
    active = false;
    if (game) game.options.training = false;
    root.classList.remove('visible');
    onFinish();
  }

  return {
    get active() { return active; },
    start(g) {
      game = g;
      active = true;
      index = 0;
      celebrate = 0;
      t = { turned: 0, thrust: 0, shots: 0, shield: 0, jumps: 0, stepTime: 0 };
      lastAngle = g.ship.angle;
      game.options.training = true;
      rendered = '';
      root.classList.add('visible');
      render();
    },
    skip: finish,
    stop() {
      if (!active) return;
      active = false;
      if (game) game.options.training = false;
      root.classList.remove('visible');
    },
    onEvent(e) {
      if (!active) return;
      if (e.type === 'shoot') t.shots++;
      if (e.type === 'hyperspaceOut') t.jumps++;
    },
    update(dt) {
      if (!active) return;
      // Only coach during live play (not over intro cards, upgrades or pause).
      const live = game.mode === 'playing' && !game.paused;
      root.classList.toggle('visible', live);
      if (!live) return;
      const { ship } = game;
      t.turned += Math.abs(ship.angle - lastAngle);
      lastAngle = ship.angle;
      if (ship.boosting) t.thrust += dt;
      if (ship.shieldActive) t.shield += dt;
      t.stepTime += dt;

      if (celebrate > 0) {
        celebrate -= dt;
        if (celebrate <= 0) {
          index++;
          t.stepTime = 0;
          if (index >= STEPS.length) return finish();
        }
      } else if (STEPS[index].done(t)) {
        if (index === STEPS.length - 1) return finish();
        celebrate = 0.7;
        sfx?.uiSelect();
      }
      render();
    },
  };
}
