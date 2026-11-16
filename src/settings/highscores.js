// Local high scores, top 10 per run mode. Storage may be unavailable, so
// every access is guarded; without it the table just lasts for the session.
const KEY = 'asteroids3d.highscores.v1';
const LIMIT = 10;

function safeStorage() {
  try { return window.localStorage; } catch { return null; }
}

export function createHighScores(storage = safeStorage()) {
  let table = {};
  try { table = JSON.parse(storage?.getItem(KEY) ?? '{}') || {}; } catch { table = {}; }

  const save = () => {
    try { storage?.setItem(KEY, JSON.stringify(table)); } catch { /* session-only */ }
  };

  return {
    list: (mode) => [...(table[mode] ?? [])],
    best: (mode) => table[mode]?.[0]?.score ?? 0,
    /** Record a finished run. Returns its 1-based rank, or null if it didn't place. */
    record(mode, entry) {
      const list = [...(table[mode] ?? []), { ...entry, date: new Date().toISOString().slice(0, 10) }];
      list.sort((a, b) => b.score - a.score);
      table[mode] = list.slice(0, LIMIT);
      save();
      const rank = table[mode].findIndex((e) => e.score === entry.score && e.sector === entry.sector) + 1;
      return rank > 0 ? rank : null;
    },
  };
}

/** Same seed for everyone on a given UTC day. */
export function dailySeed(date = new Date()) {
  const s = date.toISOString().slice(0, 10);
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}
