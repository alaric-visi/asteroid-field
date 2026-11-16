// DOM HUD: corner readouts, status meters, boss bar, toasts, controls hint,
// centre panels (sector intro, upgrade cards, game over, pause) and world-space
// score pops. Writes to the DOM only when something changes.
import { COMBO, HYPERSPACE, WEAPON } from '../data/tuning.js';
import { PICKUPS } from '../data/pickups.js';
import { UPGRADE_BY_ID } from '../data/upgrades.js';
import { sectorDef, loopIndex } from '../systems/director.js';
import { ASTEROID_TYPES } from '../data/asteroidTypes.js';
import { SECTORS } from '../data/sectors.js';
import { THEMES } from '../data/themes.js';

const pct = (v) => `${Math.max(0, Math.min(100, v * 100)).toFixed(1)}%`;

const SHIP_ICON = `<svg viewBox="0 0 20 20"><path d="M10 1 L18 18 L10 13.5 L2 18 Z" fill="#5ab4ff" stroke="#bfe9ff" stroke-width="1"/></svg>`;
const HINT_SECONDS = 7;

export function createHud(doc = document) {
  const el = (id) => doc.getElementById(id);
  const ui = {
    score: el('score'), lives: el('lives'), level: el('level'), sector: el('sectorName'),
    controls: el('controls'), popups: el('popups'),
    gameOver: el('gameOver'), gameOverText: el('gameOverText'),
    levelUp: el('levelUp'), levelUpKicker: el('levelUpKicker'), levelUpText: el('levelUpText'), levelUpSubtitle: el('levelUpSubtitle'),
    levelUpThreats: el('levelUpThreats'), levelUpBoss: el('levelUpBoss'),
    paused: el('paused'),
    combo: el('combo'), comboMult: el('comboMult'), comboCount: el('comboCount'), comboBar: el('comboBar'),
    wave: el('wave'), bossBar: el('bossBar'), bossName: el('bossName'), bossFill: el('bossFill'),
    heatMeter: el('heatMeter'), heatFill: el('heatFill'), shieldMeter: el('shieldMeter'), shieldFill: el('shieldFill'),
    jumpMeter: el('jumpMeter'), jumpFill: el('jumpFill'), buffs: el('buffs'), toast: el('toast'),
    upgrade: el('upgrade'), cards: el('cards'), runStats: el('runStats'),
  };
  let cardIndex = 0;
  let cardChoices = null;
  let onChoose = null;

  const last = { lives: null, score: null, level: null, accent: null, hint: null, wave: null, buffs: null, mult: 1 };
  let shownScore = 0;
  const show = (node, on) => node.classList.toggle('visible', on);

  return {
    update(game, theme, frameSeconds) {
      // Score counts up rather than jumping.
      shownScore += (game.score - shownScore) * (1 - Math.exp(-frameSeconds * 12));
      if (Math.abs(game.score - shownScore) < 0.5) shownScore = game.score;
      const scoreText = Math.round(shownScore).toLocaleString('en-US');
      if (scoreText !== last.score) ui.score.textContent = last.score = scoreText;

      if (game.lives !== last.lives) {
        last.lives = game.lives;
        ui.lives.innerHTML = SHIP_ICON.repeat(Math.max(0, game.lives));
      }
      if (game.level !== last.level) {
        last.level = game.level;
        ui.level.textContent = game.level;
        ui.sector.textContent = theme.title;
      }
      if (theme.accent !== last.accent) {
        last.accent = theme.accent;
        doc.documentElement.style.setProperty('--accent', theme.accent);
      }

      // Combo
      const c = game.combo;
      ui.combo.classList.toggle('on', c.count >= 2);
      if (c.multiplier !== last.mult) {
        last.mult = c.multiplier;
        ui.comboMult.textContent = `×${c.multiplier}`;
        ui.combo.classList.remove('bump');
        void ui.combo.offsetWidth; // restart the animation
        if (c.multiplier > 1) ui.combo.classList.add('bump');
      }
      ui.comboCount.textContent = c.count >= 2 ? `${c.count} CHAIN` : '';
      ui.comboBar.style.width = pct(c.timer / COMBO.window);

      // Wave / boss
      const waveText = game.boss ? 'BOSS' : `WAVE ${Math.min(game.wave, sectorDef(game).waves)} / ${sectorDef(game).waves}`;
      if (waveText !== last.wave) {
        last.wave = waveText;
        ui.wave.textContent = waveText;
        ui.wave.classList.toggle('boss', !!game.boss);
      }
      ui.bossBar.classList.toggle('visible', !!game.boss);
      if (game.boss) {
        const name = sectorDef(game).boss.name;
        if (ui.bossName.textContent !== name) ui.bossName.textContent = name;
        ui.bossFill.style.width = pct(game.boss.hp / game.boss.maxHp);
        ui.bossBar.classList.toggle('shielded', game.boss.shieldTimer > 0);
      }

      // Status meters
      const { ship, stats } = game;
      ui.heatFill.style.width = pct(ship.heat / WEAPON.maxHeat);
      ui.heatMeter.classList.toggle('hot', ship.heat > 70);
      ui.heatMeter.classList.toggle('locked', ship.overheated);
      ui.shieldFill.style.width = pct(ship.energy / stats.shieldMax);
      ui.shieldMeter.classList.toggle('active', ship.shieldActive);
      const jumpReady = ship.jumpCooldown <= 0;
      ui.jumpFill.style.width = pct(1 - ship.jumpCooldown / (HYPERSPACE.cooldown * stats.jumpCooldownMul));
      ui.jumpMeter.classList.toggle('ready', jumpReady);
      const buffKey = Object.entries(ship.buffs).map(([k, t]) => `${k}:${Math.ceil(t)}`).join(',');
      if (buffKey !== last.buffs) {
        last.buffs = buffKey;
        ui.buffs.innerHTML = Object.entries(ship.buffs)
          .map(([k, t]) => `<span class="buff" style="color:${PICKUPS[k].color}">${PICKUPS[k].label} ${Math.ceil(t)}</span>`).join('');
      }

      const hint = game.paused || (game.mode === 'playing' && game.time < HINT_SECONDS) || game.mode === 'over';
      if (hint !== last.hint) {
        last.hint = hint;
        ui.controls.classList.toggle('hidden', !hint);
      }
    },

    /** Floating "+N" at a playfield position (game pixels == CSS pixels). */
    popScore(x, y, points, hue) {
      const span = doc.createElement('span');
      span.className = points >= 200 ? 'pop big' : 'pop';
      span.textContent = `+${points}`;
      span.style.left = `${x}px`;
      span.style.top = `${y}px`;
      span.style.color = `hsl(${Math.round(hue * 360)}, 95%, 72%)`;
      span.addEventListener('animationend', () => span.remove(), { once: true });
      ui.popups.appendChild(span);
    },

    /** Brief centred announcement, e.g. "WAVE 2" or "OVERHEAT". */
    toast(text, color = 'var(--accent)') {
      ui.toast.textContent = text;
      ui.toast.style.color = color;
      ui.toast.classList.remove('show');
      void ui.toast.offsetWidth;
      ui.toast.classList.add('show');
    },

    /** Show three upgrade cards; `choose(index)` is called on selection. */
    showUpgrades(choices, upgrades, choose) {
      cardChoices = choices;
      cardIndex = 0;
      onChoose = choose;
      const render = () => {
        ui.cards.innerHTML = choices.map((id, i) => {
          const u = UPGRADE_BY_ID[id];
          const have = upgrades[id] ?? 0;
          const pips = Array.from({ length: u.max }, (_, k) => `<i class="${k < have ? 'on' : k === have ? 'next' : ''}"></i>`).join('');
          return `<div class="card ${i === cardIndex ? 'selected' : ''}" data-index="${i}">
            <div class="card-key">${i + 1}</div>
            <div class="card-name">${u.name}</div>
            <div class="card-desc">${u.desc}</div>
            <div class="card-level">${pips}</div>
          </div>`;
        }).join('');
      };
      this._renderCards = render;
      render();
      show(ui.upgrade, true);
    },
    /** Keyboard/gamepad navigation for the upgrade cards. Returns true if handled. */
    upgradeNav(action) {
      if (!cardChoices) return false;
      if (action === 'left') cardIndex = (cardIndex + cardChoices.length - 1) % cardChoices.length;
      else if (action === 'right') cardIndex = (cardIndex + 1) % cardChoices.length;
      else if (action === 'confirm') { onChoose?.(cardIndex); return true; }
      else if (typeof action === 'number' && action < cardChoices.length) { onChoose?.(action); return true; }
      else return false;
      this._renderCards?.();
      return true;
    },
    hideUpgrades() {
      cardChoices = null;
      show(ui.upgrade, false);
    },
    cardsElement: ui.cards,

    /** Sector intro card: name, briefing, threat preview and the boss to expect. */
    showLevelUp(intro, level) {
      const def = SECTORS[(level - 1) % SECTORS.length];
      const theme = THEMES[(level - 1) % THEMES.length];
      const lap = loopIndex({ level });
      ui.levelUpKicker.textContent = `SECTOR ${level}${lap ? ` · LAP ${lap + 1}` : ''}`;
      ui.levelUpText.textContent = theme.title;
      ui.levelUpSubtitle.textContent = intro?.subtitle ?? '';
      const threats = Object.entries(def.weights).sort((a, b) => b[1] - a[1]).map(([type]) => {
        const t = ASTEROID_TYPES[type];
        return `<li><i style="background:hsl(${(t.color.hue[0] + t.color.hue[1]) / 2}, ${t.color.sat * 100}%, ${t.color.light * 100}%)"></i><b>${t.label}</b><span>${t.blurb}</span></li>`;
      });
      if (def.comets > 0) threats.push(`<li><i style="background:#bff4ff"></i><b>${ASTEROID_TYPES.comet.label}</b><span>${ASTEROID_TYPES.comet.blurb}</span></li>`);
      if (def.saucers.small > 0) threats.push('<li><i style="background:#ff6b8a"></i><b>Hunter</b><span>Small saucer that aims at you</span></li>');
      else if (def.saucers.big > 0) threats.push('<li><i style="background:#7dffb0"></i><b>Saucer</b><span>Sprays shots at random</span></li>');
      ui.levelUpThreats.innerHTML = threats.join('');
      ui.levelUpBoss.innerHTML = `${def.waves} waves, then <b>${def.boss.name}</b>`;
      show(ui.levelUp, true);
    },
    hideLevelUp: () => show(ui.levelUp, false),
    showGameOver(won, summary) {
      ui.gameOverText.textContent = won ? 'YOU WIN!' : 'GAME OVER';
      if (summary) {
        const mins = Math.floor(summary.time / 60), secs = Math.floor(summary.time % 60).toString().padStart(2, '0');
        ui.runStats.innerHTML = `
          <span>Score</span><b>${summary.score.toLocaleString('en-US')}</b>
          <span>Best (${summary.mode})</span><b>${summary.best.toLocaleString('en-US')}</b>
          <span>Sector reached</span><b>${summary.sector}</b>
          <span>Longest chain</span><b>${summary.bestCombo}</b>
          <span>Accuracy</span><b>${summary.shots ? Math.round((summary.hits / summary.shots) * 100) : 0}%</b>
          <span>Kills</span><b>${summary.kills}</b>
          <span>Time</span><b>${mins}:${secs}</b>
          ${summary.upgrades.length ? `<span>Upgrades</span><b class="upgrades">${summary.upgrades.join(', ')}</b>` : ''}
          ${summary.rank === 1 ? '<span class="best">NEW BEST</span>' : summary.rank ? `<span class="best">#${summary.rank} ALL-TIME</span>` : ''}`;
      }
      ui.gameOver.classList.toggle('panel-danger', !won);
      show(ui.gameOver, true);
    },
    showPaused: (on) => show(ui.paused, on),
    /** Rebuild the controls hint from the current key bindings. */
    setBindings(bindings, keyName) {
      const keys = (action) => bindings[action].slice(0, 2).map((c) => `<b>${keyName(c)}</b>`).join(' / ');
      ui.controls.innerHTML = [
        `<span>${keys('left')} ${keys('right')} turn</span>`,
        `<span>${keys('thrust')} thrust</span>`,
        `<span>${keys('fire')} fire</span>`,
        `<span>${keys('hyperspace')} jump</span>`,
        `<span>${keys('shield')} shield</span>`,
        `<span>${keys('pause')} pause</span>`,
      ].join('');
    },
    reset() {
      show(ui.gameOver, false);
      show(ui.levelUp, false);
      show(ui.paused, false);
      show(ui.upgrade, false);
      cardChoices = null;
      ui.popups.replaceChildren();
    },
  };
}
