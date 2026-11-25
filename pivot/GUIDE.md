# Pivot — your setup guide (no coding needed)

Pivot is your own private trading web app. Four agents work for you every trading day:

| Agent | What it does |
|---|---|
| **Parent** | Runs the day on a schedule and keeps the other three in sync. Sends you the morning brief and evening report. |
| **Screener** | Every morning it studies all **Nifty 500** stocks: Minervini trend template, relative strength (RS) rating and **VCP bases** (pivot + stop). During market hours it checks **all 500 prices every minute** against their pivots. |
| **Analyst** | Rates every breakout from 0–100 (grade A+ … D) and picks the best one first. Skips everything when the market is in a correction. |
| **Executor** | Sizes each trade at **10% of your capital**, sets the stop (under the last contraction, **never more than 6%**), asks for your **Approve** tap, places the order and a **backup stop at Zerodha (GTT)**. Then it manages the trade on its own: stop-loss, **sells ⅓ at +10%**, moves the stop to **breakeven**, and exits the rest when a day closes **below the 21-day EMA**. It also proposes a **re-entry** if a stopped-out stock reclaims its pivot within 10 days. |

When there is no free capital, the signal is still recorded as a **shadow trade** and the setup stays on the **watchlist**, so nothing is lost for the coming days.

> **Important:** no software can guarantee profits. Pivot applies your rules strictly and without emotion, but losing trades are a normal part of VCP trading. Start with **paper trading** (pretend money on live prices) for 3–4 weeks and check the Dashboard before you switch to real money.

---

## What you need (one-time)

| Item | Cost | Why |
|---|---|---|
| A small cloud server in Mumbai | about ₹450–700 / month | Runs Pivot all day, even when your laptop is off. Comes with the **fixed IP address** that Zerodha now requires for orders placed through an API. |
| Kite Connect (Zerodha developer app) | ₹500 / month | Live prices, historical data and orders |
| Telegram (free app on your phone) | free | Approve / Reject buttons and alerts |

---

## Step 1 — Create the server (about 10 minutes)

These steps use **Amazon Lightsail**. It's the simplest option and the fixed IP is free while it's attached to your server.

1. Go to **lightsail.aws.amazon.com** and sign in (create an AWS account if needed).
2. Click **Create instance**.
   - Region: **Mumbai (ap-south-1)**
   - Platform: **Linux/Unix** → Blueprint: **OS Only → Ubuntu 24.04 LTS**
   - Plan: the **1 GB RAM** plan
   - Name: `pivot` → **Create instance**
3. Open the instance → **Networking** tab:
   - **Attach static IP** → create one → attach it to `pivot`. Write this IP down; Zerodha will need it.
   - Under **IPv4 Firewall**, add a rule for **HTTPS (443)**. HTTP (80) and SSH (22) are already there.
4. Go back to the instance and click **Connect using SSH**. A black terminal window opens in your browser.

## Step 2 — Install Pivot (one paste, about 5 minutes)

In that terminal window, paste this and press Enter:

```bash
sudo apt-get update && sudo apt-get install -y git && git clone https://github.com/ssri1298/Claude.git && sudo bash Claude/pivot/deploy/install.sh
```

> If your GitHub repository is **private**, GitHub will ask for a username and password. Enter your GitHub username, and as the password use a **token**: GitHub → Settings → Developer settings → Fine-grained tokens → *Generate*, with access to this repository and **Contents: Read-only**.

At the end you'll see something like:

```
Open your app:          https://13-233-10-20.sslip.io
Server's fixed IP:      13.233.10.20
Kite redirect URL:      https://13-233-10-20.sslip.io/api/kite/callback
```

Open the app address on your phone and computer, then **choose a password**.

**Add it to your phone's home screen.** It then opens full-screen like a normal app:
- iPhone (Safari): Share → *Add to Home Screen*
- Android (Chrome): ⋮ menu → *Add to Home screen*

## Step 3 — Connect Zerodha (about 10 minutes)

1. Go to **developers.kite.trade** and log in with your Zerodha ID.
2. **Create new app** → type **Connect** (₹500/month, includes live and historical data).
   - App name: `Pivot`
   - Redirect URL: paste the **Kite redirect URL** from Step 2
   - Postback URL: leave empty
3. In the app's **IP whitelist**, add your server's **fixed IP** from Step 2. Exchange rules allow only one change per week, so double-check it.
4. Copy the **API key** and **API secret**.
5. In Pivot: **Settings → Zerodha** → paste both → **Save keys** → **Log in**.

**Every morning:** Zerodha (SEBI rule) requires one login a day. At **8:00 am** Pivot sends you a Telegram message with a **Log in to Kite** button. Tap it, enter your Zerodha password and code, and the agents work by themselves for the rest of the day.

## Step 4 — Connect Telegram (about 3 minutes)

1. In Telegram, search for **@BotFather** → send `/newbot` → give it a name (e.g. *My Pivot*) and a username ending in `bot`.
2. BotFather replies with a **token**. Copy it.
3. In Pivot: **Settings → Notifications → Telegram** → paste the token → **Save token** → **Pair**.
4. Pivot shows a message like `/start 482913`. Send exactly that to your new bot in Telegram.
5. Tap **Test** in Pivot and you should receive a message.

Telegram commands you can send to your bot: `/status` `/positions` `/picks` `/pause` `/resume`

## Step 4b — Pivot app notifications (instead of, or as well as, Telegram)

Pivot can notify your phone directly, without Telegram.

**iPhone** (iOS 16.4 or newer):
1. Open your Pivot address in **Safari** → **Share** → **Add to Home Screen** → **Add**.
2. Open Pivot **from the new home-screen icon**.
3. Go to **Settings → Notifications → Pivot app notifications → Turn on**, then tap **Allow**.
4. A test notification arrives. Buy signals open Pivot's approval card when tapped, where you choose **Approve** or **Reject**.

**Android:** open Pivot in Chrome → **Settings → Notifications → Pivot app notifications → Turn on**. Buy signals have **Approve / Reject** buttons right in the notification.

You get the 8:00 am Kite login reminder, buy signals, fills, stops, partial profits, and the morning and evening reports. Choose which ones under **Settings → Notifications → What to notify me about**.

---

## Your daily routine

| Time (IST) | What happens | What you do |
|---|---|---|
| 08:00 | Login reminder | Tap **Log in to Kite** |
| 08:30 | Screener studies the Nifty 500. **Morning brief** on Telegram | Read it (optional) |
| 09:15 – 15:30 | Scans every minute. On a strong breakout you get **BUY SIGNAL** with Approve / Reject | Tap **Approve** or **Reject** within 15 minutes |
| any time | Stops, ⅓ profit at +10%, breakeven and trailing run **automatically** | Nothing |
| 15:20 | Trailing exits for stocks closing below the 21-day EMA | Nothing |
| 15:40 | Analysis for tomorrow, **evening report** | Read it (optional) |

## The rules Pivot follows (you can change all of them in Settings)

- **Entry**: the stock passes all 8 trend-template points, has a valid VCP (2–6 shrinking contractions, last one tight, volume drying up), and price crosses the **pivot** with projected volume **≥ 1.5×** its 50-day average. It never buys more than **5% above the pivot**, and needs a score of **65+ (grade B)**.
- **Confirmation (avoids false alarms)**: the first tick above the pivot only *arms* a stock. Pivot buys once a **15-minute candle closes above the pivot** (by at least 0.3%), price is **above VWAP** and in the **top third of the day's range**. If the stock gapped up above the pivot, it waits for the **30-minute high** to break.
- **Two-stage buy**: half the position at the confirmed breakout, and the other half at **3:15 pm** only if the stock is still above the pivot with good volume.
- **Failed breakout exit**: if a new buy **closes back below its pivot** within 2 days, it's sold at the close. That's usually a 1–3% loss instead of the full stop.
- **Time exit**: if a trade hits neither the stop nor the +10% target within **7 trading days**, it's sold at the close to free up the money. You can change the days or switch it off in Settings.
- **Measuring**: every breakout is also tracked from its first tick. **Dashboard → Breakout checks** shows which checks actually picked the winners.
- **Market filter**: when Nifty is in a correction, new buys pause. Setups are still watched. When the market is "under pressure", only setups scoring 75+ are bought.
- **Size**: 10% of capital per stock, at most 10 stocks and at most 3 from one industry.
- **Stop**: just below the last contraction's low, at most 6% below your buy price (setups that would need a wider stop are skipped), and at least 3%. A backup GTT stop sits at Zerodha.
- **Profit**: sell one third at +10%, move the stop to your buy price, then exit when a day closes below the 21-day EMA. You can sell or move the stop yourself at any time from **Trades**.
- **Re-entry**: if you were stopped out and the stock reclaims its pivot on strong volume within 10 trading days, Pivot proposes buying it again (at most 2 times per setup).

## Morning and evening reports (More → Reports)

Every trading day Pivot writes a **morning brief** (08:30: market health, best setups, your positions and what could happen to them today) and an **evening report** (15:40: account value and today's change, every buy and sell, closed trades, which breakouts were bought or skipped and why, setups for tomorrow). They are kept on the **Reports** page — pick a day at the top. Tap **Refresh now** to rebuild today's report with the latest prices. The notification links straight to the full report.

## Settings

Settings is grouped by topic: **Trading**, **Capital & position size**, **Buying rules**, **Selling rules**, **Zerodha**, **Notifications**, **Market holidays** and **App & data**. Each row shows your current choices, so you can see your setup at a glance.

## Overruling the agents (More → Overrule)

You always have the final say. On the **Overrule** page you can:

- **Buy what the agents passed on** — today's breakouts they skipped (score too low, market correction, no capital, stop too wide, or one you rejected). Tap **Buy anyway**. It is still sized at 10% and gets a stop (the chart stop, or your maximum % if that is wider).
- **Buy any Nifty 500 stock now**, even one the agents haven't picked.
- **Keep a position longer** — switch off the failed-breakout exit, the time exit, the ⅓ sale at +10% or the trailing exit for one stock.
- **Buy today even in a correction**, or **pause all new buys**.
- **Block stocks** the agents must never buy (results coming, bad news…).

The **stop-loss can never be switched off** — you can only move it. Everything you change is logged under "Your overrules".

## Extra safety and learning tools

**Stock filters** (Settings → Buying rules → Stock filters). No new buys:
- within 5 days before quarterly results;
- in stocks on NSE's ASM/GSM surveillance lists;
- in non-F&O stocks with a 5% or 10% circuit band;
- in stocks trading under ₹10 crore a day.

Badges on the Scanner and stock pages show these, and the stock page says when a filter blocks a buy. The lists refresh every morning and evening; results dates and surveillance lists come from NSE, circuit bands from Zerodha. You can also choose **Only buy in leading sectors**. See **Scanner → Sectors**.

**Position sizing** (Settings → Capital). *Same % of capital*, or *By risk*: each trade risks the same share of your capital (for example 0.75%), so tight setups get bigger positions, up to a maximum.

**Big winners** (Settings → Selling rules → Big winners):
- *8-week hold*: a stock up 20% within 3 weeks of buying is kept for 8 weeks without the trailing exit.
- *Climax sale*: sells half of what's left after a vertical +25% run.

**Market health** now counts real *distribution days*: days the Nifty falls on heavier volume.

**Rule report card** (Dashboard). Your closed trades are grouped by score, market, sector, stop size, volume and base depth, with suggestions where a group loses money.

**Backtest.** Switch compounding on or off, choose how trades are sized, and read the *Luck check* (Monte Carlo) and *Results by period*. Plan for the "bad drawdown" figure.

**Watchdog and backups** (Settings → App & data):
1. Create a free check at healthchecks.io (period 1 minute, grace 3 minutes).
2. Paste its ping URL into Pivot. If the server stops, healthchecks.io alerts you.
3. Backups are made every evening. Turn on *Send it to my Telegram* to keep a copy off the server.

**Reports.** Weekly and Monthly tabs. The **Tax statement** gives a capital-gains CSV per financial year. Check it against Zerodha Console before filing.

**Journal.** Trades → **Journal**: add notes and tags to any trade. They appear in the weekly report.

**Stock page:**
- Contractions drawn on the chart, plus a buy-zone line.
- A **15-minute** chart for today or past breakout days.
- **Why didn't Pivot buy this?** checks every rule for that stock.
- **Price alerts**: all of them are listed under More → Alerts.

**Buy requests** also offer **Buy half** and **Remind me in 15 min**, in the app and on Telegram.

## Starting paper trading again

**Settings → App & data → Erase paper-trading data** deletes every paper trade, the paper equity curve and the Dashboard statistics, and starts the paper account again at your paper capital. You can also erase the shadow trades (signals the agents tracked but did not take). Live (real-money) trades, settings, the watchlist and scores are never touched.

## Going live (when you're ready)

1. Paper-trade for at least 3–4 weeks. On the **Dashboard**, check the win rate, average win vs average loss, and whether grade A/A+ trades beat grade B.
2. Run a **Backtest**: first tap **Get 5 years of data** and wait a few minutes. Then choose **15-minute candles** and tap **Run backtest**. The first run downloads 15-minute candles from Zerodha for every breakout, which takes a few minutes per year tested. Later runs reuse them and are quick. The 15-minute replay checks every candle, so it knows whether the stop or the +10% target came first in a day.
3. **Settings → Trading → Trading mode → Live.** Keep **Ask me before every buy** on. Later, if you want fully automatic trading, switch that off.

## If something goes wrong

- **The app won't open:** Lightsail → your instance → *Reboot*. Pivot restarts by itself.
- **"Waiting for your daily Kite login":** tap the Telegram button, or Settings → Zerodha → Log in.
- **Orders are rejected:** check the IP whitelist in the Kite developer console matches your server's fixed IP.
- **Market holiday:** add NSE holidays in Settings → Market holidays so the agents rest.
- **See what's happening:** the **Agents** page shows every action each agent took, with the time.

### Updating Pivot

From the app: **Settings → App & data → App updates → Check for updates → Update now**. Pivot also checks every day and shows **"A new version of Pivot is ready"** on the Today page. An update takes 2–5 minutes, and the page reloads by itself when Pivot is back. Your trades and settings are kept.

If your GitHub repository is private, the first check asks for a **read-only GitHub token**. Create one at GitHub → Settings → Developer settings → Fine-grained tokens, for this repository with **Contents: Read-only**, and paste it into the box.

You can still update from the SSH terminal if you prefer:

```bash
cd ~/Claude && git pull && sudo bash pivot/deploy/install.sh
```

## Want to look around first? Demo mode

You can run a second copy with a **simulated market**: fictional stocks and fake money, so you can watch the agents trade at high speed:

```bash
sudo DEMO=1 bash ~/Claude/pivot/deploy/install.sh
```

It gets its own address, starting with `demo-`.
