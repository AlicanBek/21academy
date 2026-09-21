// Everything that survives a reload lives here.

const KEY = 'twentyone.academy.v1';

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
  return {
    settings: { ...DEFAULT_SETTINGS, ...(saved.settings || {}) },
    stats: { ...DEFAULT_STATS, ...(saved.stats || {}) },
  };
}

export function save(settings, stats) {
  try {
    localStorage.setItem(KEY, JSON.stringify({ settings, stats }));
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
