// Pause menu: settings and key rebinding. Driven by keyboard (arrows, Enter,
// Esc), gamepad (d-pad, A, B) or pointer (click/tap rows and ◀ ▶ arrows).

const MAIN = [
  { id: 'resume', label: 'Resume', type: 'action' },
  { key: 'masterVolume', label: 'Master volume', type: 'range' },
  { key: 'musicVolume', label: 'Music', type: 'range' },
  { key: 'sfxVolume', label: 'Effects', type: 'range' },
  { key: 'shake', label: 'Screen shake', type: 'choice', labels: { full: 'Full', reduced: 'Reduced', off: 'Off' } },
  { key: 'flashes', label: 'Flashes', type: 'choice', labels: { full: 'Full', reduced: 'Reduced' } },
  { key: 'palette', label: 'Colours', type: 'choice', labels: { standard: 'Standard', colorblind: 'Colour-blind safe' } },
  { key: 'quality', label: 'Graphics', type: 'choice', labels: { auto: 'Auto', low: 'Low', medium: 'Medium', high: 'High', ultra: 'Ultra' } },
  { key: 'gameSpeed', label: 'Game speed', type: 'choice', labels: { 1: '100%', 0.75: '75%' } },
  { key: 'fireMode', label: 'Fire', type: 'choice', labels: { hold: 'Hold to auto-fire', tap: 'Tap per shot' } },
  { key: 'assist', label: 'Flight assist', type: 'choice', labels: { false: 'Off', true: 'On' } },
  { id: 'controls', label: 'Controls…', type: 'action' },
];

const ACTIONS = [
  ['left', 'Turn left'], ['right', 'Turn right'], ['thrust', 'Thrust'],
  ['fire', 'Fire'], ['hyperspace', 'Hyperspace'], ['shield', 'Shield (hold)'],
  ['pause', 'Pause'], ['restart', 'Restart'],
];

const KEY_NAMES = {
  ArrowLeft: '←', ArrowRight: '→', ArrowUp: '↑', ArrowDown: '↓', Space: 'Space', Escape: 'Esc',
  Enter: 'Enter', ShiftLeft: 'L-Shift', ShiftRight: 'R-Shift', ControlLeft: 'L-Ctrl', ControlRight: 'R-Ctrl',
  AltLeft: 'L-Alt', AltRight: 'R-Alt', Tab: 'Tab', Backspace: 'Backspace',
};
export const keyName = (code) => KEY_NAMES[code] ?? code.replace(/^Key|^Digit|^Numpad/, '');

export function createMenu({ root, settings, onResume, onQuit, sfx, resumeLabel = 'Resume' }) {
  let isOpen = false;
  let view = 'main';
  let index = 0;
  let rebinding = null;

  function items() {
    if (view === 'main') {
      const main = MAIN.map((m) => (m.id === 'resume' ? { ...m, label: resumeLabel } : m));
      return onQuit ? [...main, { id: 'quit', label: 'Quit to title', type: 'action' }] : main;
    }
    return [
      ...ACTIONS.map(([action, label]) => ({ id: `bind:${action}`, action, label, type: 'binding' })),
      { id: 'resetKeys', label: 'Reset to defaults', type: 'action' },
      { id: 'back', label: '← Back', type: 'action' },
    ];
  }

  function valueHtml(item, s) {
    if (item.type === 'range') {
      const v = s[item.key];
      const bars = Array.from({ length: 10 }, (_, i) => `<i class="${i < Math.round(v * 10) ? 'on' : ''}"></i>`).join('');
      return `<button class="menu-arrow" data-dir="-1" aria-label="Decrease">◀</button><span class="menu-bars">${bars}</span><button class="menu-arrow" data-dir="1" aria-label="Increase">▶</button>`;
    }
    if (item.type === 'choice') {
      return `<button class="menu-arrow" data-dir="-1" aria-label="Previous">◀</button><span class="menu-choice">${item.labels[String(s[item.key])]}</span><button class="menu-arrow" data-dir="1" aria-label="Next">▶</button>`;
    }
    if (item.type === 'binding') {
      if (rebinding === item.action) return '<span class="menu-key waiting">Press a key… (Esc cancels)</span>';
      return s.bindings[item.action].map((c) => `<span class="menu-key">${keyName(c)}</span>`).join('');
    }
    return '';
  }

  function render() {
    if (!isOpen) return;
    const s = settings.get();
    const list = items();
    index = Math.min(index, list.length - 1);
    root.innerHTML = list.map((item, i) => `
      <li class="menu-item ${i === index ? 'selected' : ''} type-${item.type}" data-index="${i}">
        <span class="menu-label">${item.label}</span>
        <span class="menu-value">${valueHtml(item, s)}</span>
      </li>`).join('');
  }

  function change(dir) {
    const item = items()[index];
    if (item.type === 'range') settings.nudge(item.key, dir);
    else if (item.type === 'choice') settings.cycle(item.key, dir);
    else return;
    sfx?.uiMove();
  }

  function activate() {
    const item = items()[index];
    if (item.type === 'choice' || item.type === 'range') return change(1);
    sfx?.uiSelect();
    if (item.id === 'resume') return onResume();
    if (item.id === 'quit') return onQuit?.();
    if (item.id === 'controls') { view = 'controls'; index = 0; }
    else if (item.id === 'back') { view = 'main'; index = MAIN.findIndex((m) => m.id === 'controls'); }
    else if (item.id === 'resetKeys') settings.resetBindings();
    else if (item.type === 'binding') rebinding = item.action;
    render();
  }

  function move(dir) {
    const n = items().length;
    index = (index + dir + n) % n;
    sfx?.uiMove();
    render();
  }

  function back() {
    if (view === 'controls') {
      view = 'main';
      index = MAIN.findIndex((m) => m.id === 'controls');
      render();
      return true;
    }
    return false;
  }

  root.addEventListener('click', (e) => {
    const row = e.target.closest('.menu-item');
    if (!row) return;
    index = Number(row.dataset.index);
    const arrow = e.target.closest('.menu-arrow');
    if (arrow) change(Number(arrow.dataset.dir));
    else activate();
    render();
  });

  settings.subscribe(render);

  return {
    open(on) {
      isOpen = on;
      view = 'main';
      index = 0;
      rebinding = null;
      if (on) render();
    },
    /** Keyboard handler; returns true if the menu consumed the key. */
    handleKey(e) {
      if (!isOpen) return false;
      if (rebinding) {
        e.preventDefault();
        if (e.code !== 'Escape') settings.bind(rebinding, e.code);
        rebinding = null;
        sfx?.uiSelect();
        render();
        return true;
      }
      switch (e.code) {
        case 'ArrowUp': e.preventDefault(); move(-1); return true;
        case 'ArrowDown': e.preventDefault(); move(1); return true;
        case 'ArrowLeft': e.preventDefault(); change(-1); return true;
        case 'ArrowRight': e.preventDefault(); change(1); return true;
        case 'Enter':
        case 'Space': e.preventDefault(); activate(); return true;
        case 'Escape':
        case 'Backspace': return back(); // on the main view, Esc falls through to "resume"
        default: return false;
      }
    },
    /** Gamepad menu edges from gamepad.takeMenu(). */
    navigate(m) {
      if (!isOpen) return;
      if (m.up) move(-1);
      if (m.down) move(1);
      if (m.left) change(-1);
      if (m.right) change(1);
      if (m.confirm) activate();
      if (m.back && !back()) onResume();
    },
  };
}
