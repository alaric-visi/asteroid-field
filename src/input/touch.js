// Touch controls: a virtual stick on the left (point it where you want the
// ship to face; push to the rim to thrust) plus FIRE and THRUST buttons on the
// right and a pause button. Shown on touch devices only.

const STICK_RADIUS = 60;
const THRUST_AT = 0.92; // stick deflection that also thrusts

export function createTouchInput({ onFirstTouch } = {}) {
  const root = document.createElement('div');
  root.className = 'touch';
  root.innerHTML = `
    <div class="touch-stick"><div class="touch-stick-base"></div><div class="touch-stick-knob"></div></div>
    <button class="touch-btn touch-thrust" aria-label="Thrust">THRUST</button>
    <button class="touch-btn touch-fire" aria-label="Fire">FIRE</button>
    <button class="touch-btn touch-shield" aria-label="Shield">SHIELD</button>
    <button class="touch-btn touch-jump" aria-label="Hyperspace">JUMP</button>
    <button class="touch-pause" aria-label="Pause">II</button>
  `;
  document.body.appendChild(root);

  const zone = root.querySelector('.touch-stick');
  const base = root.querySelector('.touch-stick-base');
  const knob = root.querySelector('.touch-stick-knob');
  const held = { thrust: false, fire: false, shield: false };
  const pressed = { fire: false, pause: false, restart: false, hyperspace: false };
  let aim = null; // { x, y, mag } — direction in screen space
  let stickPointer = null;
  let origin = { x: 0, y: 0 };

  function enable() {
    if (document.body.classList.contains('touch-on')) return;
    document.body.classList.add('touch-on');
    onFirstTouch?.();
  }
  if (window.matchMedia?.('(pointer: coarse)').matches) enable();
  window.addEventListener('touchstart', enable, { passive: true });

  function placeStick(x, y, dx = 0, dy = 0) {
    base.style.transform = `translate(${x}px, ${y}px)`;
    knob.style.transform = `translate(${x + dx}px, ${y + dy}px)`;
  }

  zone.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    stickPointer = e.pointerId;
    zone.setPointerCapture(e.pointerId);
    const r = zone.getBoundingClientRect();
    origin = { x: e.clientX - r.left, y: e.clientY - r.top };
    root.classList.add('stick-active');
    placeStick(origin.x, origin.y);
  });
  zone.addEventListener('pointermove', (e) => {
    if (e.pointerId !== stickPointer) return;
    const r = zone.getBoundingClientRect();
    let dx = e.clientX - r.left - origin.x;
    let dy = e.clientY - r.top - origin.y;
    const len = Math.hypot(dx, dy);
    if (len > STICK_RADIUS) { dx *= STICK_RADIUS / len; dy *= STICK_RADIUS / len; }
    const mag = Math.min(1, len / STICK_RADIUS);
    aim = mag > 0.25 ? { x: dx, y: dy, mag } : null;
    placeStick(origin.x, origin.y, dx, dy);
  });
  const releaseStick = (e) => {
    if (e.pointerId !== stickPointer) return;
    stickPointer = null;
    aim = null;
    root.classList.remove('stick-active');
  };
  zone.addEventListener('pointerup', releaseStick);
  zone.addEventListener('pointercancel', releaseStick);

  function holdButton(selector, action, onPress) {
    const btn = root.querySelector(selector);
    btn.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      btn.setPointerCapture(e.pointerId);
      held[action] = true;
      btn.classList.add('down');
      onPress?.();
    });
    const up = () => { held[action] = false; btn.classList.remove('down'); };
    btn.addEventListener('pointerup', up);
    btn.addEventListener('pointercancel', up);
  }
  holdButton('.touch-fire', 'fire', () => { pressed.fire = true; pressed.restart = true; });
  holdButton('.touch-thrust', 'thrust');
  holdButton('.touch-shield', 'shield');
  holdButton('.touch-jump', 'jump', () => { pressed.hyperspace = true; });
  root.querySelector('.touch-pause').addEventListener('pointerdown', (e) => {
    e.preventDefault();
    pressed.pause = true;
  });

  return {
    snapshot() {
      const snap = {
        held: { thrust: held.thrust || (aim?.mag ?? 0) >= THRUST_AT, fire: held.fire, shield: held.shield },
        pressed: { ...pressed },
        aim,
      };
      Object.keys(pressed).forEach((k) => (pressed[k] = false));
      return snap;
    },
  };
}
