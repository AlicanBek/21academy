// Everything that survives a reload lives here.

const KEY = 'twentyone.academy.v1';
const SCHEMA = 2;

export const DEFAULT_SETTINGS = {
  aiPlayers: 0,
  fastPlay: false,
  autoReveal: false,
  showCount: false,
  lastBet: 100,
};

export const DEFAULT_STATS = {
  bankroll: 5000,
  peakBankroll: 5000,
  handsPlayed: 0,
  handsWon: 0,
  handsLost: 0,
  handsPushed: 0,
  net: 0,
  refills: 0,
  decisions: 0,
  graded: 0,
  correct: 0,
  revealed: 0,
  biggestWin: 0,
  streak: 0,
  bestStreak: 0,
};

export function load() {
  let saved = {};
  try {
    saved = JSON.parse(localStorage.getItem(KEY) || '{}');
  } catch (err) {
    saved = {};
  }
  const settings = { ...DEFAULT_SETTINGS, ...(saved.settings || {}) };
  const stats = { ...DEFAULT_STATS, ...(saved.stats || {}) };
  // Saves made before the table went heads-up carried bots along with
  // them. Reset the seats once, leave the money and stats alone.
  if ((saved.v || 1) < SCHEMA) settings.aiPlayers = 0;
  return { settings, stats };
}

export function save(settings, stats) {
  try {
    localStorage.setItem(KEY, JSON.stringify({ v: SCHEMA, settings, stats }));
  } catch (err) {
    /* private mode or full storage: play on without persistence */
  }
}

export function resetAll() {
  try {
    localStorage.removeItem(KEY);
  } catch (err) {
    /* nothing to do */
  }
}
