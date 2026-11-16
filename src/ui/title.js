// Title screen over the live attract-mode game: mode select, high scores,
// how to play, and settings (the same settings menu as the pause screen).
// Keyboard (arrows, Enter, Esc), gamepad (d-pad, A, B) and pointer all work.
import { GAME_TITLE, TAGLINE } from '../data/meta.js';
import { ASTEROID_TYPES } from '../data/asteroidTypes.js';
import { PICKUPS } from '../data/pickups.js';
import { keyName } from './menu.js';

const MODES = ['campaign', 'endless', 'daily'];
const MODE_LABEL = { campaign: 'Campaign', endless: 'Endless', daily: 'Daily Challenge' };
const fmt = (n) => n.toLocaleString('en-US');

export function createTitleScreen({ doc = document, settings, highScores, settingsMenu, sfx, onStart, onTutorial }) {
  const el = (id) => doc.getElementById(id);
  const root = el('title');
  const list = el('titleMenu');
  const views = { scores: el('titleScores'), howto: el('titleHowto'), settings: el('titleSettings') };
  const hint = el('titleHint');
  el('titleLogo').textContent = GAME_TITLE;
  el('titleTagline').textContent = TAGLINE;

  let visible = false;
  let view = 'main';
  let index = 0;
  let scoreMode = 'campaign';
  const today = () => new Date().toISOString().slice(0, 10);

  const items = () => [
    { id: 'campaign', label: 'Campaign', sub: 'Three sectors · bosses · upgrades', best: highScores.best('campaign') },
    { id: 'endless', label: 'Endless', sub: 'Sectors loop, harder every lap', best: highScores.best('endless') },
    { id: 'daily', label: 'Daily Challenge', sub: `${today()} · the same run for everyone`, best: highScores.best('daily') },
    { id: 'scores', label: 'High Scores' },
    { id: 'howto', label: 'How to Play' },
    { id: 'settings', label: 'Settings' },
  ];

  function renderMain() {
    list.innerHTML = items().map((it, i) => `
      <li class="menu-item title-item ${i === index ? 'selected' : ''} ${it.sub ? 'mode' : ''}" data-index="${i}">
        <span class="menu-label">${it.label}${it.sub ? `<small>${it.sub}</small>` : ''}</span>
        <span class="menu-value">${it.best ? `<span class="title-best">BEST ${fmt(it.best)}</span>` : ''}</span>
      </li>`).join('');
  }

  function renderScores() {
    const rows = highScores.list(scoreMode);
    views.scores.innerHTML = `
      <div class="score-tabs">${MODES.map((m) => `<button class="score-tab ${m === scoreMode ? 'on' : ''}" data-mode="${m}">${MODE_LABEL[m]}</button>`).join('')}</div>
      ${rows.length ? `<ol class="score-list">${rows.map((r, i) => `
        <li><span class="rank">${i + 1}</span><b>${fmt(r.score)}</b><span>Sector ${r.sector}</span><span class="date">${r.date ?? ''}</span></li>`).join('')}</ol>`
        : '<p class="score-empty">No runs yet. Go set the bar.</p>'}
      <button class="title-back" data-back>← Back</button>`;
  }

  function renderHowto() {
    const b = settings.get().bindings;
    const keys = (a) => b[a].slice(0, 2).map((c) => `<kbd>${keyName(c)}</kbd>`).join(' ');
    const types = Object.entries(ASTEROID_TYPES).map(([, t]) => `
      <li><i style="background:hsl(${(t.color.hue[0] + t.color.hue[1]) / 2}, ${t.color.sat * 100}%, ${t.color.light * 100}%)"></i><b>${t.label}</b><span>${t.blurb}</span></li>`).join('');
    const pickups = Object.values(PICKUPS).map((p) => `<li><i style="background:${p.color}"></i><b>${p.label}</b></li>`).join('');
    views.howto.innerHTML = `
      <div class="howto-grid">
        <section><h3>Controls</h3><ul class="howto-keys">
          <li>${keys('left')} ${keys('right')}<span>Turn</span></li>
          <li>${keys('thrust')}<span>Thrust</span></li>
          <li>${keys('fire')}<span>Fire (hold to auto-fire)</span></li>
          <li>${keys('hyperspace')}<span>Hyperspace</span></li>
          <li>${keys('shield')}<span>Shield (hold)</span></li>
          <li>${keys('pause')}<span>Pause &amp; settings</span></li>
        </ul>
        <p class="howto-note">Gamepad and touch work too. Firing builds <b>heat</b>; the shield drains <b>energy</b>; quick kills build a <b>combo</b>.</p></section>
        <section><h3>Threats</h3><ul class="howto-legend">${types}</ul>
          <h3>Pickups</h3><ul class="howto-legend pickups">${pickups}</ul></section>
      </div>
      <div class="howto-actions"><button class="title-back" data-tutorial>Play the tutorial</button><button class="title-back" data-back>← Back</button></div>`;
  }

  function setView(v) {
    view = v;
    list.hidden = v !== 'main';
    for (const [name, node] of Object.entries(views)) node.hidden = name !== v;
    settingsMenu.open(v === 'settings');
    hint.textContent = {
      main: '↑ ↓ select · Enter start',
      scores: '← → switch mode · Esc back',
      howto: 'Enter play tutorial · Esc back',
      settings: '↑ ↓ select · ← → change · Esc back',
    }[v];
    if (v === 'main') renderMain();
    if (v === 'scores') renderScores();
    if (v === 'howto') renderHowto();
  }

  function activate() {
    const it = items()[index];
    sfx.uiSelect();
    if (MODES.includes(it.id)) onStart(it.id);
    else setView(it.id);
  }

  function move(dir) {
    index = (index + dir + items().length) % items().length;
    sfx.uiMove();
    renderMain();
  }

  function cycleScores(dir) {
    scoreMode = MODES[(MODES.indexOf(scoreMode) + dir + MODES.length) % MODES.length];
    sfx.uiMove();
    renderScores();
  }

  root.addEventListener('click', (e) => {
    const row = e.target.closest('.title-item');
    if (row) { index = Number(row.dataset.index); activate(); return; }
    const tab = e.target.closest('.score-tab');
    if (tab) { scoreMode = tab.dataset.mode; renderScores(); return; }
    if (e.target.closest('[data-tutorial]')) { onTutorial(); return; }
    if (e.target.closest('[data-back]')) setView('main');
  });

  return {
    get visible() { return visible; },
    show() {
      visible = true;
      root.classList.add('visible');
      setView('main');
    },
    hide() {
      visible = false;
      root.classList.remove('visible');
      settingsMenu.open(false);
    },
    back: () => setView('main'),
    /** Returns true if the key was handled. */
    handleKey(e) {
      if (!visible) return false;
      const code = e.code;
      const isBack = code === 'Escape' || code === 'Backspace';
      if (view === 'settings') {
        if (settingsMenu.handleKey(e)) return true;
        if (isBack) setView('main');
        return true;
      }
      if (view === 'main') {
        if (code === 'ArrowUp') move(-1);
        else if (code === 'ArrowDown') move(1);
        else if (code === 'Enter' || code === 'Space') activate();
        else return true;
      } else if (view === 'scores') {
        if (code === 'ArrowLeft') cycleScores(-1);
        else if (code === 'ArrowRight') cycleScores(1);
        else if (isBack || code === 'Enter') setView('main');
      } else if (view === 'howto') {
        if (code === 'Enter') onTutorial();
        else if (isBack) setView('main');
      }
      e.preventDefault();
      return true;
    },
    /** Gamepad menu edges. */
    navigate(m) {
      if (!visible) return;
      if (view === 'settings') { settingsMenu.navigate(m); return; }
      if (view === 'main') {
        if (m.up) move(-1);
        if (m.down) move(1);
        if (m.confirm) activate();
      } else if (view === 'scores') {
        if (m.left) cycleScores(-1);
        if (m.right) cycleScores(1);
        if (m.back || m.confirm) setView('main');
      } else if (view === 'howto') {
        if (m.confirm) onTutorial();
        if (m.back) setView('main');
      }
    },
  };
}
