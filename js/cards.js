// Card, hand and shoe primitives.

export const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', 'T', 'J', 'Q', 'K'];
export const SUITS = ['S', 'H', 'D', 'C'];

const SUIT_GLYPH = { S: '♠', H: '♥', D: '♦', C: '♣' };
const RANK_LABEL = { T: '10' };

export function cardValue(rank) {
  if (rank === 'A') return 11;
  if (rank === 'T' || rank === 'J' || rank === 'Q' || rank === 'K') return 10;
  return Number(rank);
}

export function rankLabel(rank) {
  return RANK_LABEL[rank] || rank;
}

export function suitGlyph(suit) {
  return SUIT_GLYPH[suit];
}

export function isRed(suit) {
  return suit === 'H' || suit === 'D';
}

// Returns the best total plus whether an ace is still counted as 11.
export function handValue(cards) {
  let total = 0;
  let aces = 0;
  for (const card of cards) {
    total += cardValue(card.rank);
    if (card.rank === 'A') aces += 1;
  }
  while (total > 21 && aces > 0) {
    total -= 10;
    aces -= 1;
  }
  return { total, soft: aces > 0 };
}

export function isBlackjack(cards) {
  return cards.length === 2 && handValue(cards).total === 21;
}

export function isBust(cards) {
  return handValue(cards).total > 21;
}

// Two cards of the same chart rank. Every ten-valued card is one rank for splitting.
export function isPair(cards) {
  if (cards.length !== 2) return false;
  return cardValue(cards[0].rank) === cardValue(cards[1].rank);
}

// Hi-Lo tag, kept so a count trainer can be layered on later.
export function hiLoTag(rank) {
  const v = cardValue(rank);
  if (v >= 2 && v <= 6) return 1;
  if (v >= 10 || rank === 'A') return -1;
  return 0;
}

export class Shoe {
  constructor(decks = 6, penetration = 0.75) {
    this.decks = decks;
    this.penetration = penetration;
    this.cards = [];
    this.index = 0;
    this.cutIndex = 0;
    this.runningCount = 0;
    this.build();
  }

  build() {
    const cards = [];
    for (let d = 0; d < this.decks; d += 1) {
      for (const suit of SUITS) {
        for (const rank of RANKS) {
          cards.push({ rank, suit, uid: `${d}${suit}${rank}` });
        }
      }
    }
    this.cards = cards;
    this.shuffle();
  }

  shuffle() {
    const cards = this.cards;
    for (let i = cards.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [cards[i], cards[j]] = [cards[j], cards[i]];
    }
    this.index = 0;
    this.runningCount = 0;
    // Cut card lands a little randomly around the target penetration.
    const target = Math.floor(cards.length * this.penetration);
    const jitter = Math.floor(cards.length * 0.04);
    this.cutIndex = target + Math.floor(Math.random() * (jitter * 2 + 1)) - jitter;
  }

  draw() {
    if (this.index >= this.cards.length) this.shuffle();
    const card = this.cards[this.index];
    this.index += 1;
    this.runningCount += hiLoTag(card.rank);
    return { rank: card.rank, suit: card.suit };
  }

  get needsShuffle() {
    return this.index >= this.cutIndex;
  }

  get cardsRemaining() {
    return this.cards.length - this.index;
  }

  get decksRemaining() {
    return this.cardsRemaining / 52;
  }

  get trueCount() {
    const d = this.decksRemaining;
    return d > 0.25 ? this.runningCount / d : 0;
  }

  get penetrationPct() {
    return Math.min(100, Math.round((this.index / this.cutIndex) * 100));
  }
}
