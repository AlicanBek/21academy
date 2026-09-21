// Basic strategy, transcribed from the Blackjack Apprenticeship chart
// (4-8 decks, dealer hits soft 17). Single source of truth: the coach,
// the grader and the in-app chart all read these tables.

export const DEALER_COLS = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'A'];

const row = (s) => s.trim().split(/\s+/);

// Hard totals 8 through 17. Below 8 always hit, 18 and up always stand.
export const HARD = {
  17: row('S  S  S  S  S  S  S  S  S  S'),
  16: row('S  S  S  S  S  H  H  H  H  H'),
  15: row('S  S  S  S  S  H  H  H  H  H'),
  14: row('S  S  S  S  S  H  H  H  H  H'),
  13: row('S  S  S  S  S  H  H  H  H  H'),
  12: row('H  H  S  S  S  H  H  H  H  H'),
  11: row('D  D  D  D  D  D  D  D  D  D'),
  10: row('D  D  D  D  D  D  D  D  H  H'),
  9:  row('H  D  D  D  D  H  H  H  H  H'),
  8:  row('H  H  H  H  H  H  H  H  H  H'),
};

// Soft totals, keyed by the card riding with the ace. A,9 down to A,2.
export const SOFT = {
  9: row('S  S  S  S  S  S  S  S  S  S'),
  8: row('S  S  S  S  Ds S  S  S  S  S'),
  7: row('Ds Ds Ds Ds Ds S  S  H  H  H'),
  6: row('H  D  D  D  D  H  H  H  H  H'),
  5: row('H  H  D  D  D  H  H  H  H  H'),
  4: row('H  H  D  D  D  H  H  H  H  H'),
  3: row('H  H  H  D  D  H  H  H  H  H'),
  2: row('H  H  H  D  D  H  H  H  H  H'),
};

// Pairs. YN means split only when double after split is offered.
export const PAIRS = {
  A: row('Y  Y  Y  Y  Y  Y  Y  Y  Y  Y'),
  T: row('N  N  N  N  N  N  N  N  N  N'),
  9: row('Y  Y  Y  Y  Y  N  Y  Y  N  N'),
  8: row('Y  Y  Y  Y  Y  Y  Y  Y  Y  Y'),
  7: row('Y  Y  Y  Y  Y  Y  N  N  N  N'),
  6: row('YN Y  Y  Y  Y  N  N  N  N  N'),
  5: row('N  N  N  N  N  N  N  N  N  N'),
  4: row('N  N  N  YN YN N  N  N  N  N'),
  3: row('YN YN Y  Y  Y  Y  N  N  N  N'),
  2: row('YN YN Y  Y  Y  Y  N  N  N  N'),
};

export const PAIR_ROWS = ['A', 'T', '9', '8', '7', '6', '5', '4', '3', '2'];
export const SOFT_ROWS = [9, 8, 7, 6, 5, 4, 3, 2];
export const HARD_ROWS = [17, 16, 15, 14, 13, 12, 11, 10, 9, 8];

export const CODE_LABEL = {
  H: 'Hit',
  S: 'Stand',
  D: 'Double if allowed, otherwise hit',
  Ds: 'Double if allowed, otherwise stand',
  Y: 'Split the pair',
  YN: 'Split if double after split is offered',
  N: "Don't split the pair",
};

function dealerIndex(rank) {
  if (rank === 'A') return 9;
  const v = rank === 'T' || rank === 'J' || rank === 'Q' || rank === 'K' ? 10 : Number(rank);
  return v - 2;
}

export function dealerColLabel(rank) {
  return DEALER_COLS[dealerIndex(rank)];
}

function chartRank(rank) {
  if (rank === 'A') return 'A';
  if (rank === 'T' || rank === 'J' || rank === 'Q' || rank === 'K') return 'T';
  return rank;
}

function value(rank) {
  if (rank === 'A') return 11;
  if (rank === 'T' || rank === 'J' || rank === 'Q' || rank === 'K') return 10;
  return Number(rank);
}

function total(cards) {
  let sum = 0;
  let aces = 0;
  for (const c of cards) {
    sum += value(c.rank);
    if (c.rank === 'A') aces += 1;
  }
  while (sum > 21 && aces > 0) {
    sum -= 10;
    aces -= 1;
  }
  return { sum, soft: aces > 0 };
}

/**
 * The chart's answer for a situation.
 * Returns { action, code, table, rowKey, col, label, chartLabel }
 * where action is one of hit | stand | double | split.
 */
export function advise({ cards, dealerUp, canDouble = false, canSplit = false, das = true }) {
  const col = dealerIndex(dealerUp.rank);
  const { sum, soft } = total(cards);
  const pair = cards.length === 2 && value(cards[0].rank) === value(cards[1].rank);

  if (pair) {
    const key = chartRank(cards[0].rank);
    const code = PAIRS[key][col];
    const wantsSplit = code === 'Y' || (code === 'YN' && das);
    if (wantsSplit && canSplit) {
      return build('split', code, 'pair', key, col);
    }
    if (wantsSplit && !canSplit) {
      // Chart says split but the table will not allow another hand.
      const fallback = fallbackTotals({ sum, soft, cards, col, canDouble });
      return { ...fallback, note: 'Chart says split, but no split is available here.' };
    }
    if (!wantsSplit) {
      const fallback = fallbackTotals({ sum, soft, cards, col, canDouble });
      return { ...fallback, pairCode: code, pairKey: key };
    }
  }

  return fallbackTotals({ sum, soft, cards, col, canDouble });
}

function fallbackTotals({ sum, soft, cards, col, canDouble }) {
  if (soft) {
    const partner = sum - 11;
    if (partner >= 2 && partner <= 9) {
      return build(null, SOFT[partner][col], 'soft', partner, col, canDouble);
    }
    // Soft 12 (A,A that cannot be split) or soft 21.
    if (sum === 21) return build('stand', 'S', 'soft', null, col);
    return build('hit', 'H', 'soft', null, col);
  }
  if (sum >= 18) return build('stand', 'S', 'hard', null, col);
  if (sum <= 7) return build('hit', 'H', 'hard', null, col);
  return build(null, HARD[sum][col], 'hard', sum, col, canDouble);
}

function build(forced, code, table, rowKey, col, canDouble = false) {
  let action = forced;
  if (!action) {
    if (code === 'S') action = 'stand';
    else if (code === 'H') action = 'hit';
    else if (code === 'D') action = canDouble ? 'double' : 'hit';
    else if (code === 'Ds') action = canDouble ? 'double' : 'stand';
    else action = 'hit';
  }
  return {
    action,
    code,
    table,
    rowKey,
    col,
    label: ACTION_LABEL[action],
    chartLabel: CODE_LABEL[code] || ACTION_LABEL[action],
  };
}

export const ACTION_LABEL = {
  hit: 'Hit',
  stand: 'Stand',
  double: 'Double',
  split: 'Split',
  insurance: 'Take insurance',
  decline: 'Decline',
};

// The chart's insurance line: never take it, and never take even money.
export function adviseInsurance() {
  return {
    action: 'decline',
    label: 'Decline',
    chartLabel: 'Insurance or even money: don’t take',
  };
}

// True when the chart splits this pair against at least one upcard.
// Tens and fives are never split, so there is no decision worth asking about.
export function pairEverSplits(rank, das = true) {
  const row = PAIRS[chartRank(rank)];
  if (!row) return false;
  return row.some((code) => code === 'Y' || (code === 'YN' && das));
}

// Row label shown in the chart view.
export function rowLabel(table, key) {
  if (table === 'pair') return key === 'T' ? 'T,T' : `${key},${key}`;
  if (table === 'soft') return `A,${key}`;
  return String(key);
}
