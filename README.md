# 21 Academy

Blackjack for the phone, with a basic strategy coach that grades every move you make.

Play it here: **https://alicanbek.github.io/21academy/**

Add it to your homescreen (Share → Add to Home Screen on iOS) and it opens fullscreen like a native app, works offline, and keeps your bankroll between sessions.

## The coach

The chart is hidden by default. On every decision you get one button:

- **Hint** shows what the chart says for your exact spot, plus the cell it came from (`8,8 vs 6`). Revealed decisions are logged but not graded.
- Play without tapping Hint and the move is **graded**. If it disagrees with the chart you get told what you should have done and why.
- **Chart** in the top bar opens the whole chart, with your current spot outlined.

Chart accuracy is tracked separately from money, because they are different skills.

## Table rules

Fixed, so the chart is never subtly wrong for the game being dealt.

| | |
|---|---|
| Decks | 6, cut card at ~75% |
| Dealer | Hits soft 17, peeks for blackjack |
| Blackjack | Pays 3:2 |
| Doubling | Any two cards, allowed after a split |
| Splitting | Up to 4 hands; aces get one card and cannot be resplit |
| Insurance | Offered (the chart always says decline) |
| Surrender | Not offered |
| Limits | 25 to 2,000 |

House edge under perfect basic strategy is about 0.6%.

## Chips

Start with 5,000. A refill of 5,000 sits in Settings and unlocks **only** when you cannot cover the 25 minimum bet. Refills are counted separately from net chips so the lifetime number stays honest.

## Settings

- Bots at the table, 0 to 5. Defaults to 0, so it's you against the dealer
- Fast play, for shorter deal animations
- Running count display (Hi-Lo), for when the count trainer lands

## Running it locally

No build step, no dependencies. Serve the folder:

```bash
python3 -m http.server 5190
```

Then open http://localhost:5190.

## Layout

| File | What it holds |
|---|---|
| `js/strategy.js` | The chart as data, plus the lookup. Coach, grader and chart view all read this, so they can never disagree |
| `js/engine.js` | Round flow, rules, payouts, stats |
| `js/cards.js` | Cards, hand values, the shoe (and a Hi-Lo running count) |
| `js/ui.js` | Rendering and modals |
| `js/app.js` | Wiring and persistence |
| `sw.js` | Offline caching, network first |

`window.__game` is exposed in the console for poking at a live round.

## Credit

Basic strategy chart: [Blackjack Apprenticeship](https://www.blackjackapprenticeship.com/), 4-8 decks, dealer hits soft 17. Redrawn from the data, not reproduced.
