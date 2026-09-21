// Round flow and money. Rules are fixed: 6 decks, H17, peek, BJ 3:2,
// double any two, DAS, split to 4 hands, aces one card and no resplit,
// insurance offered, no surrender.

import { Shoe, handValue, isBlackjack, isPair } from './cards.js?v=3';
import { advise } from './strategy.js?v=3';

export const RULES = {
  decks: 6,
  penetration: 0.75,
  hitSoft17: true,
  peek: true,
  blackjackPays: 1.5,
  doubleAnyTwo: true,
  das: true,
  maxHands: 4,
  resplitAces: false,
  surrender: false,
  insurance: true,
};

export const TABLE_MIN = 25;
export const TABLE_MAX = 2000;
export const STARTING_BANKROLL = 5000;
export const REFILL_AMOUNT = 5000;

const AI_NAMES = ['Mert', 'Dana', 'Kai', 'Rosa', 'Theo'];

let handSeq = 0;

function makeHand(bet, opts = {}) {
  handSeq += 1;
  return {
    id: handSeq,
    cards: [],
    bet,
    doubled: false,
    fromSplit: !!opts.fromSplit,
    splitAce: !!opts.splitAce,
    done: false,
    result: null,
    payout: 0,
  };
}

export class Game {
  constructor({ settings, stats, onEvent }) {
    this.settings = settings;
    this.stats = stats;
    this.onEvent = onEvent || (() => {});
    this.shoe = new Shoe(RULES.decks, RULES.penetration);
    this.phase = 'bet';
    this.dealer = { cards: [], holeDown: true };
    this.seats = [];
    this.insurance = { offered: false, taken: false, amount: 0, resolved: false };
    this.activeSeat = -1;
    this.activeHand = -1;
    this.message = '';
    this.lastGrade = null;
    this.roundResults = [];
    this._resolve = null;
    this.buildSeats();
  }

  // ---- table shape -------------------------------------------------

  buildSeats() {
    const ai = Math.max(0, Math.min(5, this.settings.aiPlayers));
    this.seats = [{ id: 'you', kind: 'player', name: 'You', hands: [], bet: 0 }];
    for (let i = 0; i < ai; i += 1) {
      this.seats.push({ id: `ai${i}`, kind: 'ai', name: AI_NAMES[i], hands: [], bet: 0 });
    }
  }

  get playerSeat() {
    return this.seats[0];
  }

  get playerHands() {
    return this.playerSeat.hands;
  }

  get currentHand() {
    if (this.activeSeat !== 0) return null;
    return this.playerHands[this.activeHand] || null;
  }

  emit(type, data) {
    this.onEvent({ type, ...data });
  }

  wait(ms) {
    const factor = this.settings.fastPlay ? 0.45 : 1;
    return new Promise((r) => setTimeout(r, Math.max(0, ms * factor)));
  }

  // ---- money -------------------------------------------------------

  get bankroll() {
    return this.stats.bankroll;
  }

  set bankroll(v) {
    this.stats.bankroll = v;
    if (v > this.stats.peakBankroll) this.stats.peakBankroll = v;
  }

  canCoverMinimum() {
    return this.bankroll >= TABLE_MIN;
  }

  refill() {
    this.bankroll += REFILL_AMOUNT;
    this.stats.refills += 1;
    this.emit('update');
  }

  // ---- decisions ---------------------------------------------------

  awaitDecision() {
    return new Promise((resolve) => {
      this._resolve = resolve;
    });
  }

  submit(action, meta = {}) {
    if (!this._resolve) return;
    const resolve = this._resolve;
    this._resolve = null;
    resolve({ action, ...meta });
  }

  // ---- round -------------------------------------------------------

  async playRound(bet) {
    if (this.phase !== 'bet') return;
    if (bet > this.bankroll) return;

    if (this.shoe.needsShuffle) {
      this.shoe.shuffle();
      this.message = 'Shuffling a fresh shoe';
      this.emit('shuffle');
      await this.wait(700);
    }

    handSeq = 0;
    this.roundResults = [];
    this.lastGrade = null;
    this.message = '';
    this.dealer = { cards: [], holeDown: true };
    this.insurance = { offered: false, taken: false, amount: 0, resolved: false };

    this.bankroll -= bet;
    this.playerSeat.bet = bet;
    this.playerSeat.hands = [makeHand(bet)];
    for (const seat of this.seats.slice(1)) {
      seat.bet = this.aiBet();
      seat.hands = [makeHand(seat.bet)];
    }

    this.phase = 'deal';
    this.emit('update');

    // Two passes around the table, dealer last, hole card face down.
    for (let pass = 0; pass < 2; pass += 1) {
      for (const seat of this.seats) {
        seat.hands[0].cards.push(this.shoe.draw());
        this.emit('deal');
        await this.wait(190);
      }
      this.dealer.cards.push(this.shoe.draw());
      this.emit('deal');
      await this.wait(190);
    }

    const up = this.dealer.cards[0];
    const dealerHasBJ = isBlackjack(this.dealer.cards);

    if (RULES.insurance && up.rank === 'A') {
      await this.offerInsurance();
    }

    // Dealer peeks on ace or ten, so nobody doubles or splits into a blackjack.
    if (RULES.peek && (up.rank === 'A' || handValue([up]).total === 10)) {
      if (dealerHasBJ) {
        this.dealer.holeDown = false;
        this.message = 'Dealer has blackjack';
        this.phase = 'settle';
        this.emit('update');
        await this.wait(600);
        this.settle();
        return;
      }
    }

    if (isBlackjack(this.playerHands[0].cards)) {
      this.playerHands[0].done = true;
    }

    this.phase = 'player';
    await this.playSeat(0);

    for (let i = 1; i < this.seats.length; i += 1) {
      this.phase = 'ai';
      await this.playSeat(i);
    }

    this.activeSeat = -1;
    this.activeHand = -1;
    await this.playDealer();
    this.settle();
  }

  aiBet() {
    const options = [25, 50, 100, 100, 200, 250, 500];
    return options[Math.floor(Math.random() * options.length)];
  }

  async offerInsurance() {
    const hand = this.playerHands[0];
    const cost = Math.floor(hand.bet / 2);
    if (cost < 1 || cost > this.bankroll) return;

    this.insurance.offered = true;
    this.insurance.evenMoney = isBlackjack(hand.cards);
    this.phase = 'insurance';
    this.emit('update');

    const { action, revealed } = await this.awaitDecision();
    this.gradeInsurance(action, revealed);

    if (action === 'insurance') {
      this.bankroll -= cost;
      this.insurance.taken = true;
      this.insurance.amount = cost;
    }
    this.insurance.offered = false;
    this.emit('update');
    await this.wait(200);
  }

  handOptions(seatIndex, handIndex) {
    const seat = this.seats[seatIndex];
    const hand = seat.hands[handIndex];
    const first = hand.cards.length === 2;
    const isPlayer = seat.kind === 'player';
    const funds = isPlayer ? this.bankroll : Infinity;
    const canDouble = first && !hand.splitAce && funds >= hand.bet;
    const canSplit =
      first &&
      isPair(hand.cards) &&
      seat.hands.length < RULES.maxHands &&
      !(hand.splitAce && !RULES.resplitAces) &&
      funds >= hand.bet;
    return { canHit: true, canStand: true, canDouble, canSplit };
  }

  async playSeat(seatIndex) {
    const seat = this.seats[seatIndex];
    this.activeSeat = seatIndex;

    for (let h = 0; h < seat.hands.length; h += 1) {
      const hand = seat.hands[h];
      this.activeHand = h;
      this.emit('update');

      if (seat.kind === 'ai') await this.wait(320);

      while (!hand.done) {
        const { total } = handValue(hand.cards);
        if (total >= 21 || hand.splitAce) {
          hand.done = true;
          break;
        }
        const opts = this.handOptions(seatIndex, h);
        const chart = advise({
          cards: hand.cards,
          dealerUp: this.dealer.cards[0],
          canDouble: opts.canDouble,
          canSplit: opts.canSplit,
          das: RULES.das,
        });

        let action;
        if (seat.kind === 'player') {
          this.emit('update');
          const decision = await this.awaitDecision();
          action = decision.action;
          this.gradeMove(action, chart, decision.revealed);
        } else {
          await this.wait(420);
          action = chart.action;
          if (action === 'split' && !opts.canSplit) action = 'hit';
          if (action === 'double' && !opts.canDouble) action = 'hit';
        }

        await this.applyAction(seatIndex, h, action);
      }

      this.emit('update');
      if (seat.kind === 'ai') await this.wait(220);
    }
  }

  async applyAction(seatIndex, handIndex, action) {
    const seat = this.seats[seatIndex];
    const hand = seat.hands[handIndex];
    const isPlayer = seat.kind === 'player';

    if (action === 'hit') {
      hand.cards.push(this.shoe.draw());
      this.emit('deal');
      await this.wait(240);
      if (handValue(hand.cards).total >= 21) hand.done = true;
      return;
    }

    if (action === 'stand') {
      hand.done = true;
      return;
    }

    if (action === 'double') {
      if (isPlayer) this.bankroll -= hand.bet;
      hand.bet *= 2;
      hand.doubled = true;
      hand.cards.push(this.shoe.draw());
      this.emit('deal');
      await this.wait(300);
      hand.done = true;
      return;
    }

    if (action === 'split') {
      const moved = hand.cards.pop();
      const splitAce = moved.rank === 'A';
      const next = makeHand(hand.bet, { fromSplit: true, splitAce });
      next.cards.push(moved);
      hand.fromSplit = true;
      hand.splitAce = splitAce;
      if (isPlayer) this.bankroll -= hand.bet;
      seat.hands.splice(handIndex + 1, 0, next);

      hand.cards.push(this.shoe.draw());
      this.emit('deal');
      await this.wait(240);
      next.cards.push(this.shoe.draw());
      this.emit('deal');
      await this.wait(240);
    }
  }

  async playDealer() {
    this.phase = 'dealer';
    this.dealer.holeDown = false;
    this.emit('update');
    await this.wait(450);

    const anyLive = this.seats.some((s) =>
      s.hands.some((h) => handValue(h.cards).total <= 21)
    );
    const playerOnlyBlackjack =
      this.seats.every((s) => s.hands.every((h) => isBlackjack(h.cards) || handValue(h.cards).total > 21));

    if (!anyLive || playerOnlyBlackjack) return;

    for (;;) {
      const { total, soft } = handValue(this.dealer.cards);
      const mustHit = total < 17 || (total === 17 && soft && RULES.hitSoft17);
      if (!mustHit) break;
      this.dealer.cards.push(this.shoe.draw());
      this.emit('deal');
      await this.wait(420);
    }
  }

  // ---- settlement --------------------------------------------------

  settle() {
    this.dealer.holeDown = false;
    // Held so the UI can show the old balance until the chips land.
    this.preSettleBankroll = this.stats.bankroll;
    const dealer = handValue(this.dealer.cards);
    const dealerBJ = isBlackjack(this.dealer.cards);
    const dealerBust = dealer.total > 21;

    let net = 0;
    const results = [];

    for (const seat of this.seats) {
      for (const hand of seat.hands) {
        const hv = handValue(hand.cards);
        const playerBJ = isBlackjack(hand.cards) && !hand.fromSplit;
        let outcome;
        let payout = 0;

        if (playerBJ && dealerBJ) {
          outcome = 'push';
          payout = hand.bet;
        } else if (playerBJ) {
          outcome = 'blackjack';
          payout = hand.bet + hand.bet * RULES.blackjackPays;
        } else if (dealerBJ) {
          outcome = 'lose';
        } else if (hv.total > 21) {
          outcome = 'bust';
        } else if (dealerBust || hv.total > dealer.total) {
          outcome = 'win';
          payout = hand.bet * 2;
        } else if (hv.total === dealer.total) {
          outcome = 'push';
          payout = hand.bet;
        } else {
          outcome = 'lose';
        }

        hand.result = outcome;
        hand.payout = payout;

        if (seat.kind === 'player') {
          this.bankroll += payout;
          net += payout - hand.bet;
          results.push({ outcome, bet: hand.bet, payout });
          this.stats.handsPlayed += 1;
          if (outcome === 'win' || outcome === 'blackjack') this.stats.handsWon += 1;
          else if (outcome === 'push') this.stats.handsPushed += 1;
          else this.stats.handsLost += 1;
        }
      }
    }

    if (this.insurance.taken) {
      const ins = this.insurance.amount;
      if (dealerBJ) {
        this.bankroll += ins * 3;
        net += ins * 2;
      } else {
        net -= ins;
      }
      this.insurance.resolved = true;
    }

    this.stats.net += net;
    if (net > this.stats.biggestWin) this.stats.biggestWin = net;
    if (net > 0) {
      this.stats.streak = this.stats.streak > 0 ? this.stats.streak + 1 : 1;
    } else if (net < 0) {
      this.stats.streak = this.stats.streak < 0 ? this.stats.streak - 1 : -1;
    }
    if (this.stats.streak > this.stats.bestStreak) this.stats.bestStreak = this.stats.streak;

    this.roundResults = results;
    this.lastNet = net;
    this.phase = 'settle';
    this.activeSeat = -1;
    this.activeHand = -1;
    this.emit('settle');
  }

  nextRound() {
    this.phase = 'bet';
    this.preSettleBankroll = null;
    this.dealer = { cards: [], holeDown: true };
    for (const seat of this.seats) seat.hands = [];
    this.lastGrade = null;
    this.emit('update');
  }

  // ---- coaching ----------------------------------------------------

  gradeMove(action, chart, revealed) {
    this.stats.decisions += 1;
    if (revealed) {
      this.stats.revealed += 1;
      this.lastGrade = null;
      return;
    }
    this.stats.graded += 1;
    if (action === chart.action) {
      this.stats.correct += 1;
      this.lastGrade = { correct: true, chart };
    } else {
      this.lastGrade = { correct: false, chart, played: action };
    }
    this.emit('grade');
  }

  gradeInsurance(action, revealed) {
    this.stats.decisions += 1;
    if (revealed) {
      this.stats.revealed += 1;
      return;
    }
    this.stats.graded += 1;
    if (action === 'decline') {
      this.stats.correct += 1;
      this.lastGrade = { correct: true, chart: { label: 'Decline', chartLabel: 'Insurance or even money: don’t take' } };
    } else {
      this.lastGrade = {
        correct: false,
        played: 'insurance',
        chart: { label: 'Decline', chartLabel: 'Insurance or even money: don’t take' },
      };
    }
    this.emit('grade');
  }
}
