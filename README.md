# Token Radar — pre-token protocols ranked by implied value

A token launch radar for make.fun's `token-radar-01` bounty. It reads a sealed DefiLlama
snapshot of 758 protocols and ranks the ones that record no token by an implied value: what a
token would be worth if the protocol's record stayed as it is. It never predicts whether or
when a token is issued, and it never special-cases a protocol by name.

## The value model (radar-2)

Every row is scored by one function of the snapshot's own figures:

```
implied = round( tvl_usd
  x category_multiple
  x (1 + clamp(change_7d, -50, +100) / 100 x 0.6)
  x (0.70 + min(age_days, 730) / 730 x 0.30) )
```

- **category_multiple** — the launch multiple, priced off the market itself. For each category
  with at least 3 live-token protocols reporting both a market cap and a TVL, the median
  market-cap-to-TVL ratio of those protocols; otherwise the global median across all
  live-token protocols. Multiples are clamped to x0.05–x1.50, so no outlier category sets the
  price. The medians are computed from the snapshot at run time, so a future snapshot gives
  different multiples.
- **growth** — the protocol's seven-day TVL change, clamped to -50%…+100%, weighted 0.6.
- **maturity** — age since DefiLlama first listed the protocol, the best record of how long it
  has run with no token; an unlisted age uses 180 days.

Protocols whose token already trades are set aside in a separate Live view with their market
caps shown — the market's own values, never mixed into the ranking. The board covers all 40
watchlist protocols plus the 160 highest-TVL rankable pre-token protocols below the $50M floor
(200 rows), where rankable means: records no token, not an exchange, not a versioned pool, and
not a wrapped or staked product of a token that trades.

## The farm plan

Each row carries 7 steps derived from the protocol's own record — its category, chains, TVL
and age — with a cost and a time for each: a fresh wallet, the category's main action, a second
qualifying action, a weekly cadence, a hold of 45–90 days, a check of the protocol's own points
page, and a farm log with a planned exit. The dashboard shows the board's own `farm_steps`, so
the page and `board.json` always agree.

## How to run

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input <snapshot.json>
```

Node 22 or later, standard library only, no install. The program writes `out/board.json`,
`out/data.js`, `out/dashboard/`, `out/screenshots/` and `out/dossier.json`. It is deterministic:
the same snapshot bytes always write the same output bytes. Open `out/dashboard/index.html` in
a browser — the page renders with no network.

## The dashboard

A dark console page: the ranked board with sortable columns, text search, category / chain /
minimum-TVL filters and a watchlist-only toggle, a top-5 signals strip, a detail panel for
every protocol (model breakdown line by line, recomputed in the page, plus its farm plan), a
live-token view, and a plain-language explainer of the model. The page says "records no token",
never that a protocol has none: the snapshot is a record, not proof.

## Files

- `main.ts` — entrypoint: reads the snapshot, writes the board, data, dashboard, screenshots, dossier
- `lib/model.ts` — the value model, the board builder and the farm-plan generator
- `vendor/makefun-board.ts` — make.fun's dossier library, copied from the kit unchanged
- `dashboard/` — `index.html`, `radar.css`, `radar.js`
- `screenshots/` — board, detail and filtered views, rendered from this dashboard
- `.makefun/owner.json` — the payout wallet claim
