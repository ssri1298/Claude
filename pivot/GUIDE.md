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
3. In Pivot: **Settings → Telegram** → paste the token → **Save token** → **Pair**.
4. Pivot shows a message like `/start 482913`. Send exactly that to your new bot in Telegram.
5. Tap **Test** in Pivot and you should receive a message.

Telegram commands you can send to your bot: `/status` `/positions` `/picks` `/pause` `/resume`

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
- **Market filter**: when Nifty is in a correction, new buys pause. Setups are still watched. When the market is "under pressure", only setups scoring 75+ are bought.
- **Size**: 10% of capital per stock, at most 10 stocks and at most 3 from one industry.
- **Stop**: just below the last contraction's low, at most 6% below your buy price (setups that would need a wider stop are skipped), and at least 3%. A backup GTT stop sits at Zerodha.
- **Profit**: sell one third at +10%, move the stop to your buy price, then exit when a day closes below the 21-day EMA. You can sell or move the stop yourself at any time from **Trades**.
- **Re-entry**: if you were stopped out and the stock reclaims its pivot on strong volume within 10 trading days, Pivot proposes buying it again (at most 2 times per setup).

## Going live (when you're ready)

1. Paper-trade for at least 3–4 weeks. On the **Dashboard**, check the win rate, average win vs average loss, and whether grade A/A+ trades beat grade B.
2. Run a **Backtest**: first tap **Get 5 years of data**, wait a few minutes, then **Run backtest**.
3. **Settings → Trading mode → Live.** Keep **Ask me before every buy** on. Later, if you want fully automatic trading, switch that off.

## If something goes wrong

- **The app won't open:** Lightsail → your instance → *Reboot*. Pivot restarts by itself.
- **"Waiting for your daily Kite login":** tap the Telegram button, or Settings → Zerodha → Log in.
- **Orders are rejected:** check the IP whitelist in the Kite developer console matches your server's fixed IP.
- **Market holiday:** add NSE holidays in Settings → Market holidays so the agents rest.
- **See what's happening:** the **Agents** page shows every action each agent took, with the time.

To install a newer version later, open the SSH terminal and run:

```bash
cd ~/Claude && git pull && sudo bash pivot/deploy/install.sh
```

Your trades and settings are kept.

## Want to look around first? Demo mode

You can run a second copy with a **simulated market**: fictional stocks and fake money, so you can watch the agents trade at high speed:

```bash
sudo DEMO=1 bash ~/Claude/pivot/deploy/install.sh
```

It gets its own address, starting with `demo-`.
