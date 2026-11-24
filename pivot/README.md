# ◆ Pivot — autonomous VCP swing-trading agents for Zerodha Kite

A self-hosted web app (mobile-first PWA, light/dark) that runs Mark Minervini–style **Volatility Contraction Pattern** swing trading on the **Nifty 500** through **Kite Connect**, with a parent agent coordinating three sub-agents.

**Non-technical setup guide → [GUIDE.md](GUIDE.md)**

## Agents

```
                 ┌─────────────── Parent (scheduler / orchestrator) ───────────────┐
 08:00 login ─▶  │ 08:30 prep → 09:15–15:30 minute cycle → 15:20 close check → 15:40 post │
                 └───────┬───────────────────────┬──────────────────────┬─────────┘
                         ▼                       ▼                      ▼
                  Screener                 Analyst                 Executor
           daily: RS rank, trend      score 0–100 (9 factors),   sizing 10% · stop ≤6% ·
           template, VCP detect,      market filter, min score,  approval (Telegram/app) ·
           watchlist · minute: all    rank best first            orders + GTT backup ·
           500 vs pivot, volume pace,                            stop / ⅓ at +10% / breakeven /
           failures, re-entry watch                              21-EMA trail · shadow trades
```

| Path | Purpose |
|---|---|
| `server/engine/` | Pure strategy code: indicators, `vcp.js` (trend template, VCP detector, RS), `scoring.js`, `rules.js` (sizing, stops, exits, charges), `market.js` (regime, volume pace), `stats.js`, `backtest.js` |
| `server/agents/` | `parent.js`, `screener.js`, `analyst.js`, `executor.js` |
| `server/broker/` | `kite.js` (REST + binary WebSocket ticker), `feeds.js` (Nifty 500 + Kite data), `live.js` (order execution with fill tracking, GTT) |
| `server/demo/` | Synthetic market + minute-by-minute demo feed on a simulated clock |
| `server/notify/telegram.js` | Bot with inline Approve/Reject buttons (long polling) |
| `server/api.js`, `auth.js`, `index.js` | Express API, SSE live stream, password-protected session |
| `web/` | React + Tailwind UI (Today, Scanner, Stock, Trades, Dashboard, Backtest, Agents, Settings) |
| `deploy/` | `install.sh` (Ubuntu + Node 22 + Caddy HTTPS + systemd), `update.sh` |

The backtester replays the **same** engine functions the live agents use, so a backtest measures the live strategy.

### VCP detection (short version)
Base start = highest high in the last ~250 days (cup-with-handle aware). A swing scan splits the base into contractions: after each low, a rally that recovers ≥50% and is followed by a ≥3% pullback starts the next contraction. Lower lows merge into the left side. Valid when there are 2–6 contractions, each ≤1.15× the previous one, the last one ≤12%, base ≤40% deep, lows rising, and a prior advance of ≥25%. **Pivot** = high of the last contraction. **Stop** = its low −0.5%.

### Breakout (live)
LTP > pivot, ≤ pivot × 1.05, ≥10 min after the open, **projected** volume (cumulative ÷ NSE intraday U-curve fraction) ≥ 1.5× the 50-day average.

## Run locally

Requires **Node.js ≥ 22.13** (uses the built-in `node:sqlite`).

```bash
npm install
npm run build
npm run demo        # simulated market → http://localhost:8080
npm start           # real mode (configure Kite in Settings)
npm run dev         # API on :8080 + Vite on :5173 (set PIVOT_DEMO=1 for demo data)
npm test            # engine + agent-flow tests
```

Environment: `PIVOT_DEMO=1`, `PIVOT_DATA` (database folder), `PIVOT_PUBLIC_URL` (for Telegram links), `PORT`, `HOST`.

## Safety notes
- Paper mode is the default. Live mode needs an explicit switch with a confirmation sheet.
- Stops are checked on every heartbeat (≈1 s), and a backup GTT stop is kept at Zerodha. If our records and Zerodha's holdings disagree, the app reconciles every 10 minutes.
- Order tasks run in the background, so stop management never waits on a slow order or a data download.
- Kite tokens expire daily (SEBI). Pivot detects this and sends a login button at 08:00, 08:45 and 09:05.
- Orders through the API need a static IP registered with Zerodha (from April 2026). The cloud server provides it.
