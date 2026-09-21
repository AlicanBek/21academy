import { Game, TABLE_MIN, TABLE_MAX } from './engine.js';
import { UI } from './ui.js';
import { load, save, resetAll } from './storage.js';
import { advise, DEALER_COLS } from './strategy.js';
import { RULES } from './engine.js';

const state = load();
let bet = Math.max(TABLE_MIN, Math.min(state.settings.lastBet, state.stats.bankroll));
let busy = false;

const game = new Game({
  settings: state.settings,
  stats: state.stats,
  onEvent: (ev) => {
    if (ev.type === 'grade') {
      ui.showGrade(game.lastGrade);
      return;
    }
    ui.render(game);
    if (ev.type === 'settle') {
      persist();
      busy = false;
      ui.showRoundOutcome(game);
    }
  },
});

function persist() {
  state.settings.lastBet = bet;
  save(state.settings, state.stats);
}

function clampBet(v) {
  return Math.max(0, Math.min(v, TABLE_MAX, state.stats.bankroll));
}

const ui = new UI({
  getBet: () => bet,
  getStats: () => state.stats,
  getAll: () => state,

  addChip(v) {
    bet = clampBet(bet + v);
    ui.render(game);
  },

  clearBet() {
    bet = 0;
    ui.render(game);
  },

  rebet() {
    bet = clampBet(TABLE_MAX);
    ui.render(game);
  },

  canBet: () => game.phase === 'bet',

  nextHand() {
    ui.clearBanner();
    ui.showGrade(null);
    game.nextRound();
  },

  async deal() {
    if (busy) return;
    if (bet < TABLE_MIN || bet > state.stats.bankroll) return;
    busy = true;
    ui.setRevealed(false);
    ui.showGrade(null);
    ui.clearBanner();

    // Seat count changes take effect between rounds.
    const wanted = Math.max(0, Math.min(5, state.settings.aiPlayers));
    if (game.seats.length - 1 !== wanted) game.buildSeats();

    persist();
    await game.playRound(bet);
    bet = clampBet(bet);
    ui.render(game);
  },

  act(action, revealed) {
    game.submit(action, { revealed });
    ui.setRevealed(false);
  },

  insurance(choice, revealed) {
    game.submit(choice === 'yes' ? 'insurance' : 'decline', { revealed });
    ui.setRevealed(false);
  },

  reveal() {
    ui.setRevealed(true);
    ui.render(game);
  },

  currentSituation() {
    if (game.phase !== 'player' || !game.currentHand) return null;
    const opts = game.handOptions(0, game.activeHand);
    const a = advise({
      cards: game.currentHand.cards,
      dealerUp: game.dealer.cards[0],
      canDouble: opts.canDouble,
      canSplit: opts.canSplit,
      das: RULES.das,
    });
    return a.rowKey === null || a.rowKey === undefined ? null : a;
  },

  setSetting(key, value) {
    state.settings[key] = value;
    persist();
    ui.render(game);
  },

  refill() {
    if (state.stats.bankroll >= TABLE_MIN) return;
    game.refill();
    bet = clampBet(Math.max(TABLE_MIN, state.settings.lastBet));
    persist();
    ui.render(game);
  },

  resetAll() {
    resetAll();
    location.reload();
  },
});

ui.render(game);

// Surfaces a crash instead of silently freezing the table mid-deal.
window.addEventListener('error', (e) => console.error('[21] error', e.message, e.filename, e.lineno));
window.addEventListener('unhandledrejection', (e) =>
  console.error('[21] rejection', (e.reason && e.reason.stack) || e.reason)
);
window.__game = game;

// Keyboard shortcuts help on desktop while testing.
document.addEventListener('keydown', (e) => {
  if (game.phase === 'player') {
    const map = { h: 'hit', s: 'stand', d: 'double', p: 'split' };
    const action = map[e.key.toLowerCase()];
    if (action) {
      const btn = document.querySelector(`[data-action="${action}"]`);
      if (btn && !btn.disabled) ui.h.act(action, ui.revealed);
    }
    if (e.key === '?') ui.h.reveal();
  } else if (e.key === 'Enter' && !document.querySelector('.modal-wrap')) {
    ui.h.deal();
  }
});

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  });
}

// Keep the layout stable when iOS shows and hides its bars.
const setVh = () => document.documentElement.style.setProperty('--vh', `${window.innerHeight * 0.01}px`);
setVh();
window.addEventListener('resize', setVh);
window.addEventListener('orientationchange', setVh);
