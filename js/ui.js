// All DOM work. Hands are synced card by card so freshly dealt cards
// animate once instead of the whole table flashing on every update.

import { handValue, isBlackjack, rankLabel, suitGlyph, isRed } from './cards.js';
import {
  DEALER_COLS, HARD, SOFT, PAIRS, PAIR_ROWS, SOFT_ROWS, HARD_ROWS,
  CODE_LABEL, rowLabel, advise,
} from './strategy.js';
import { RULES, TABLE_MIN, TABLE_MAX } from './engine.js';

const $ = (sel, root = document) => root.querySelector(sel);
const fmt = (n) => Math.round(n).toLocaleString('en-US');

// Corner index top-left and bottom-right plus a centre pip, the way a
// real card reads when the hand is fanned.
function cardHtml(card) {
  const r = rankLabel(card.rank);
  const s = suitGlyph(card.suit);
  const index = `<b>${r}</b><i>${s}</i>`;
  return `<span class="idx">${index}</span><span class="pip">${s}</span><span class="idx bot">${index}</span>`;
}

function setCard(node, card, faceDown) {
  if (faceDown) {
    if (!node.classList.contains('back')) {
      node.classList.add('back');
      node.innerHTML = '';
    }
    return;
  }
  if (node.classList.contains('back')) {
    node.classList.remove('back');
    node.classList.add('flip');
  }
  node.classList.toggle('red', isRed(card.suit));
  node.innerHTML = cardHtml(card);
}

// Chips follow casino colours, so the bet badge shows the right one.
function chipClass(amount) {
  if (amount >= 1000) return 'c1000';
  if (amount >= 500) return 'c500';
  if (amount >= 100) return 'c100';
  return 'c25';
}

function syncHand(el, cards, holeIndex = -1) {
  if (el.childElementCount > cards.length) el.innerHTML = '';
  cards.forEach((card, i) => {
    let node = el.children[i];
    if (!node) {
      node = document.createElement('div');
      node.className = 'card';
      node.style.setProperty('--i', i);
      node.classList.add('enter');
      el.appendChild(node);
    }
    setCard(node, card, i === holeIndex);
  });
}

function totalText(cards, hideHole) {
  const visible = hideHole ? cards.slice(0, 1) : cards;
  if (!visible.length) return '';
  const { total, soft } = handValue(visible);
  if (!hideHole && isBlackjack(cards)) return 'BJ';
  if (hideHole) return `${total}`;
  if (total > 21) return `${total}`;
  if (soft && total - 10 > 0 && total < 21) return `${total - 10}/${total}`;
  return `${total}`;
}

const RESULT_TEXT = {
  win: 'Win',
  blackjack: 'Blackjack',
  lose: 'Lose',
  bust: 'Bust',
  push: 'Push',
};

export class UI {
  constructor(handlers) {
    this.h = handlers;
    this.revealed = false;
    this.gradeTimer = null;
    this.cacheNodes();
    this.bindStatic();
  }

  cacheNodes() {
    this.n = {
      bankroll: $('#bankroll'),
      netFlash: $('#netFlash'),
      shoeFill: $('#shoeFill'),
      countBadge: $('#countBadge'),
      dealerHand: $('#dealerHand'),
      dealerTotal: $('#dealerTotal'),
      aiRow: $('#aiRow'),
      playerHands: $('#playerHands'),
      tableMsg: $('#tableMsg'),
      coach: $('#coach'),
      grade: $('#grade'),
      betBar: $('#betBar'),
      actionBar: $('#actionBar'),
      betAmount: $('#betAmount'),
      dealBtn: $('#dealBtn'),
      rebetBtn: $('#rebetBtn'),
      clearBtn: $('#clearBtn'),
      chipRow: $('#chipRow'),
      insuranceBar: $('#insuranceBar'),
      modalRoot: $('#modalRoot'),
    };
  }

  bindStatic() {
    $('#btnChart').addEventListener('click', () => this.openChart());
    $('#btnStats').addEventListener('click', () => this.openStats());
    $('#btnSettings').addEventListener('click', () => this.openSettings());

    this.n.chipRow.addEventListener('click', (e) => {
      const chip = e.target.closest('[data-chip]');
      if (chip) this.h.addChip(Number(chip.dataset.chip));
    });
    this.n.clearBtn.addEventListener('click', () => this.h.clearBet());
    this.n.rebetBtn.addEventListener('click', () => this.h.rebet());
    this.n.dealBtn.addEventListener('click', () => this.h.deal());

    this.n.actionBar.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-action]');
      if (!btn || btn.disabled) return;
      this.h.act(btn.dataset.action, this.revealed);
    });

    this.n.insuranceBar.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-ins]');
      if (!btn) return;
      this.h.insurance(btn.dataset.ins, this.revealed);
    });

    this.n.coach.addEventListener('click', (e) => {
      if (e.target.closest('#revealBtn')) this.h.reveal();
      if (e.target.closest('#coachChartLink')) this.openChart();
    });
  }

  // ---- main render --------------------------------------------------

  render(game) {
    const { stats, settings } = game;
    this.n.bankroll.textContent = fmt(stats.bankroll);
    this.n.shoeFill.style.width = `${Math.min(100, game.shoe.penetrationPct)}%`;

    if (settings.showCount) {
      this.n.countBadge.hidden = false;
      const rc = game.shoe.runningCount;
      this.n.countBadge.textContent = `RC ${rc > 0 ? '+' : ''}${rc} · TC ${game.shoe.trueCount.toFixed(1)}`;
    } else {
      this.n.countBadge.hidden = true;
    }

    const hideHole = game.dealer.holeDown && game.dealer.cards.length > 1;
    syncHand(this.n.dealerHand, game.dealer.cards, hideHole ? 1 : -1);
    this.n.dealerTotal.textContent = totalText(game.dealer.cards, hideHole);
    this.n.dealerTotal.hidden = game.dealer.cards.length === 0;

    this.renderAiSeats(game);
    this.renderPlayerHands(game);
    this.renderControls(game);
    this.renderCoach(game);

    this.n.tableMsg.textContent = game.message || '';
    this.n.tableMsg.classList.toggle('show', !!game.message);
  }

  renderAiSeats(game) {
    const seats = game.seats.slice(1);
    const root = this.n.aiRow;
    root.hidden = seats.length === 0;
    if (root.childElementCount !== seats.length) {
      root.innerHTML = seats
        .map(
          (s) => `<div class="ai-seat" data-seat="${s.id}">
            <div class="ai-hands"></div>
            <div class="ai-name">${s.name}</div>
            <div class="ai-bet"></div>
          </div>`
        )
        .join('');
    }
    seats.forEach((seat, idx) => {
      const node = root.children[idx];
      const handsEl = $('.ai-hands', node);
      node.classList.toggle('acting', game.activeSeat === idx + 1);
      $('.ai-bet', node).textContent = seat.hands.length ? fmt(seat.bet) : '';
      if (handsEl.childElementCount !== seat.hands.length) handsEl.innerHTML = '';
      seat.hands.forEach((hand, hi) => {
        let h = handsEl.children[hi];
        if (!h) {
          h = document.createElement('div');
          h.className = 'mini-hand';
          h.innerHTML = '<div class="hand mini"></div><span class="mini-total"></span>';
          handsEl.appendChild(h);
        }
        syncHand($('.hand', h), hand.cards, -1);
        $('.mini-total', h).textContent = totalText(hand.cards, false);
        h.className = `mini-hand${hand.result ? ` r-${hand.result}` : ''}`;
      });
    });
  }

  renderPlayerHands(game) {
    const hands = game.playerHands;
    const root = this.n.playerHands;
    root.classList.toggle('multi', hands.length > 1);
    if (root.childElementCount !== hands.length) root.innerHTML = '';

    hands.forEach((hand, i) => {
      let node = root.children[i];
      if (!node) {
        node = document.createElement('div');
        node.className = 'player-hand';
        node.innerHTML = `
          <div class="hand"></div>
          <div class="hand-meta">
            <span class="total-badge"></span>
            <span class="bet-spot"><span class="hand-bet"></span></span>
          </div>
          <div class="hand-result"></div>`;
        root.appendChild(node);
      }
      syncHand($('.hand', node), hand.cards, -1);
      $('.total-badge', node).textContent = totalText(hand.cards, false);
      const betEl = $('.hand-bet', node);
      betEl.className = `hand-bet chip-badge ${chipClass(hand.bet)}${hand.doubled ? ' doubled' : ''}`;
      betEl.textContent = fmt(hand.bet);
      betEl.title = hand.doubled ? 'Doubled' : '';
      const resultEl = $('.hand-result', node);
      resultEl.textContent = hand.result ? RESULT_TEXT[hand.result] : '';
      node.className = `player-hand${
        game.activeSeat === 0 && game.activeHand === i && hands.length > 1 ? ' active' : ''
      }${hand.result ? ` r-${hand.result}` : ''}`;
    });
  }

  renderControls(game) {
    const betting = game.phase === 'bet' || game.phase === 'settle';
    const acting = game.phase === 'player' && !!game.currentHand;
    const insuring = game.phase === 'insurance';

    this.n.betBar.hidden = !betting;
    this.n.actionBar.hidden = !acting;
    this.n.insuranceBar.hidden = !insuring;

    if (betting) {
      const bet = this.h.getBet();
      this.n.betAmount.textContent = fmt(bet);
      this.n.betAmount.className = `bet-amount ${chipClass(bet)}`;
      const broke = game.stats.bankroll < TABLE_MIN;
      this.n.dealBtn.disabled = broke || bet < TABLE_MIN || bet > game.stats.bankroll;
      this.n.dealBtn.textContent = game.phase === 'settle' ? 'Next hand' : 'Deal';
      this.n.rebetBtn.hidden = false;
      [...this.n.chipRow.children].forEach((chip) => {
        const v = Number(chip.dataset.chip);
        chip.disabled = bet + v > Math.min(TABLE_MAX, game.stats.bankroll);
      });
      $('#brokeNote').hidden = !broke;
    }

    if (acting) {
      const opts = game.handOptions(0, game.activeHand);
      const map = { hit: true, stand: true, double: opts.canDouble, split: opts.canSplit };
      [...this.n.actionBar.querySelectorAll('[data-action]')].forEach((btn) => {
        btn.disabled = !map[btn.dataset.action];
      });
    }

    if (insuring) {
      const cost = Math.floor(game.playerHands[0].bet / 2);
      $('#insText').textContent = game.insurance.evenMoney
        ? 'Dealer shows an ace. Take even money?'
        : `Dealer shows an ace. Insurance costs ${fmt(cost)}.`;
      $('#insYes').textContent = game.insurance.evenMoney ? 'Even money' : `Insure ${fmt(cost)}`;
    }
  }

  renderCoach(game) {
    const acting = game.phase === 'player' && !!game.currentHand;
    const insuring = game.phase === 'insurance';
    const el = this.n.coach;

    if (!acting && !insuring) {
      const acc = game.stats.graded ? Math.round((game.stats.correct / game.stats.graded) * 100) : null;
      el.className = 'coach idle';
      el.innerHTML = `<span class="coach-idle">${
        acc === null
          ? 'Tap Hint during a hand to see the chart'
          : `Chart accuracy ${acc}% over ${fmt(game.stats.graded)} graded ${game.stats.graded === 1 ? 'move' : 'moves'}`
      }</span>`;
      return;
    }

    if (!this.revealed) {
      el.className = 'coach';
      el.innerHTML = `<button id="revealBtn" class="reveal-btn">Hint<span>see what the chart says</span></button>
        <span class="graded-note">Playing unaided, so this move gets graded</span>`;
      return;
    }

    let advice;
    let where = '';
    if (insuring) {
      advice = { label: 'Decline', chartLabel: 'Insurance or even money: don’t take' };
    } else {
      const hand = game.currentHand;
      const opts = game.handOptions(0, game.activeHand);
      advice = advise({
        cards: hand.cards,
        dealerUp: game.dealer.cards[0],
        canDouble: opts.canDouble,
        canSplit: opts.canSplit,
        das: RULES.das,
      });
      if (advice.rowKey !== null && advice.rowKey !== undefined) {
        where = `${rowLabel(advice.table, advice.rowKey)} vs ${DEALER_COLS[advice.col]}`;
      }
    }

    el.className = 'coach revealed';
    el.innerHTML = `
      <div class="advice">
        <span class="advice-action">${advice.label}</span>
        ${where ? `<span class="advice-where">${where}</span>` : ''}
      </div>
      ${advice.chartLabel && advice.chartLabel !== advice.label ? `<div class="advice-note">${advice.chartLabel}</div>` : ''}
      <button id="coachChartLink" class="chart-link">Full chart</button>`;
  }

  showGrade(grade) {
    const el = this.n.grade;
    clearTimeout(this.gradeTimer);
    if (!grade) {
      el.className = 'grade';
      return;
    }
    if (grade.correct) {
      el.className = 'grade good show';
      el.innerHTML = `<strong>Correct</strong><span>${grade.chart.label}</span>`;
    } else {
      const played = grade.played === 'insurance' ? 'took insurance' : `played ${grade.played}`;
      el.className = 'grade bad show';
      el.innerHTML = `<strong>Chart says ${grade.chart.label}</strong><span>You ${played}. ${grade.chart.chartLabel}</span>`;
    }
    this.gradeTimer = setTimeout(() => {
      el.className = 'grade';
    }, grade.correct ? 1400 : 3200);
  }

  setRevealed(v) {
    this.revealed = v;
  }

  showNet(net) {
    const el = this.n.netFlash;
    if (!el || !net) return;
    clearTimeout(this.netTimer);
    el.textContent = `${net > 0 ? '+' : '\u2212'}${fmt(Math.abs(net))}`;
    el.className = `net-flash show ${net > 0 ? 'good' : 'bad'}`;
    this.netTimer = setTimeout(() => { el.className = 'net-flash'; }, 1800);
  }

  // ---- modals --------------------------------------------------------

  openModal(title, bodyHtml, onMount) {
    const wrap = document.createElement('div');
    wrap.className = 'modal-wrap';
    wrap.innerHTML = `
      <div class="modal-scrim"></div>
      <div class="modal" role="dialog" aria-modal="true">
        <header class="modal-head">
          <h2>${title}</h2>
          <button class="modal-close" aria-label="Close">✕</button>
        </header>
        <div class="modal-body">${bodyHtml}</div>
      </div>`;
    const close = () => wrap.remove();
    $('.modal-scrim', wrap).addEventListener('click', close);
    $('.modal-close', wrap).addEventListener('click', close);
    this.n.modalRoot.appendChild(wrap);
    requestAnimationFrame(() => wrap.classList.add('open'));
    if (onMount) onMount(wrap, close);
    return { wrap, close };
  }

  chartTable(title, rows, table, data, highlight) {
    const head = DEALER_COLS.map((c) => `<th>${c}</th>`).join('');
    const body = rows
      .map((key) => {
        const cells = data[key]
          .map((code, col) => {
            const hit =
              highlight && highlight.table === table && String(highlight.rowKey) === String(key) && highlight.col === col;
            return `<td class="c-${code}${hit ? ' hl' : ''}">${code}</td>`;
          })
          .join('');
        return `<tr><th class="rowh">${rowLabel(table, key)}</th>${cells}</tr>`;
      })
      .join('');
    return `<h3 class="chart-title">${title}</h3>
      <div class="chart-scroll"><table class="chart">
        <thead><tr><th class="rowh"></th>${head}</tr></thead>
        <tbody>${body}</tbody>
      </table></div>`;
  }

  openChart(highlight) {
    const hl = highlight || this.h.currentSituation();
    const key = (codes) =>
      `<ul class="chart-key">${codes
        .map((c) => `<li><span class="c-${c}">${c}</span>${CODE_LABEL[c]}</li>`)
        .join('')}</ul>`;

    const html = `
      <p class="chart-intro">6 decks, dealer hits soft 17, double after split allowed, no surrender.
      ${hl ? 'Your current spot is outlined.' : ''}</p>
      ${this.chartTable('Pair splitting', PAIR_ROWS, 'pair', PAIRS, hl)}
      ${key(['Y', 'YN', 'N'])}
      ${this.chartTable('Soft totals', SOFT_ROWS, 'soft', SOFT, hl)}
      ${key(['H', 'S', 'D', 'Ds'])}
      ${this.chartTable('Hard totals', HARD_ROWS, 'hard', HARD, hl)}
      ${key(['H', 'S', 'D'])}
      <p class="chart-note">Hard 7 and under: always hit. Hard 18 and up: always stand.</p>
      <p class="chart-note strong">Insurance or even money: don’t take.</p>
      <p class="chart-credit">Chart: Blackjack Apprenticeship, 4-8 decks, dealer hits soft 17.</p>`;

    this.openModal('Basic strategy', html, (wrap) => {
      const cell = $('.hl', wrap);
      if (cell) cell.scrollIntoView({ block: 'center', inline: 'center' });
    });
  }

  openStats() {
    const s = this.h.getStats();
    const acc = s.graded ? Math.round((s.correct / s.graded) * 100) : 0;
    const winRate = s.handsPlayed ? Math.round((s.handsWon / s.handsPlayed) * 100) : 0;
    const row = (label, value, cls = '') =>
      `<div class="stat-row"><span>${label}</span><strong class="${cls}">${value}</strong></div>`;
    const signed = (n) => `${n > 0 ? '+' : ''}${fmt(n)}`;

    const html = `
      <div class="stat-hero">
        <div class="stat-hero-num ${acc >= 95 ? 'good' : acc >= 85 ? 'ok' : 'bad'}">${acc}%</div>
        <div class="stat-hero-label">chart accuracy over ${fmt(s.graded)} graded ${s.graded === 1 ? 'move' : 'moves'}</div>
      </div>
      ${row('Hands played', fmt(s.handsPlayed))}
      ${row('Won / pushed / lost', `${fmt(s.handsWon)} / ${fmt(s.handsPushed)} / ${fmt(s.handsLost)}`)}
      ${row('Win rate', `${winRate}%`)}
      ${row('Net chips', signed(s.net), s.net >= 0 ? 'good' : 'bad')}
      ${row('Best round', signed(s.biggestWin), 'good')}
      ${row('Best streak', `${s.bestStreak} ${Math.abs(s.bestStreak) === 1 ? 'hand' : 'hands'}`)}
      ${row('Peak bankroll', fmt(s.peakBankroll))}
      ${row('Hints used', fmt(s.revealed))}
      ${row('Refills taken', `${fmt(s.refills)} (${fmt(s.refills * 5000)} chips)`)}
      <p class="chart-note">Net chips counts only what the table paid you. Refills are tracked separately so the number stays honest.</p>
      <button class="danger-btn" id="resetStats">Reset all progress</button>`;

    this.openModal('Your numbers', html, (wrap, close) => {
      $('#resetStats', wrap).addEventListener('click', () => {
        if (confirm('Reset bankroll, stats and settings?')) {
          this.h.resetAll();
          close();
        }
      });
    });
  }

  openSettings() {
    const { settings, stats } = this.h.getAll();
    const broke = stats.bankroll < TABLE_MIN;
    const html = `
      <label class="set-row">
        <span>Players at the table<em>Bots beside you, playing basic strategy</em></span>
        <output id="setAiOut">${settings.aiPlayers}</output>
        <input type="range" id="setAi" min="0" max="5" step="1" value="${settings.aiPlayers}">
      </label>
      <label class="set-row toggle">
        <span>Fast play<em>Shorter deal and bot animations</em></span>
        <input type="checkbox" id="setFast" ${settings.fastPlay ? 'checked' : ''}>
      </label>
      <label class="set-row toggle">
        <span>Show running count<em>Hi-Lo, for when you start counting</em></span>
        <input type="checkbox" id="setCount" ${settings.showCount ? 'checked' : ''}>
      </label>
      <div class="set-block">
        <h3>Chips</h3>
        <p class="chart-note">Balance ${fmt(stats.bankroll)}. A refill unlocks only when you cannot cover the ${TABLE_MIN} minimum bet.</p>
        <button class="primary-btn" id="setRefill" ${broke ? '' : 'disabled'}>Add 5,000 chips</button>
        ${broke ? '' : '<p class="chart-note">Locked while you can still bet.</p>'}
      </div>
      <div class="set-block">
        <h3>Table rules</h3>
        <ul class="rules-list">
          <li>6 decks, cut card at 75%</li>
          <li>Dealer hits soft 17</li>
          <li>Blackjack pays 3:2</li>
          <li>Double on any two cards, double after split allowed</li>
          <li>Split up to 4 hands, aces get one card and cannot be resplit</li>
          <li>Insurance offered, no surrender</li>
          <li>Table limits ${fmt(TABLE_MIN)} to ${fmt(TABLE_MAX)}</li>
        </ul>
      </div>`;

    this.openModal('Settings', html, (wrap, close) => {
      const ai = $('#setAi', wrap);
      ai.addEventListener('input', () => {
        $('#setAiOut', wrap).textContent = ai.value;
        this.h.setSetting('aiPlayers', Number(ai.value));
      });
      $('#setFast', wrap).addEventListener('change', (e) =>
        this.h.setSetting('fastPlay', e.target.checked)
      );
      $('#setCount', wrap).addEventListener('change', (e) =>
        this.h.setSetting('showCount', e.target.checked)
      );
      $('#setRefill', wrap).addEventListener('click', () => {
        this.h.refill();
        close();
      });
    });
  }
}
