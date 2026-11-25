// SUB-AGENT 2 — ANALYST
// Rates every breakout the Screener flags (0–100, graded A+ … D) using trend, relative strength,
// contraction quality, volume dry-up, base structure, industry strength, risk and breakout volume.
// Applies the market filter, then hands the best setups, in order, to the Executor.

import { scoreSetup, explain } from '../engine/scoring.js';
import { ist } from '../core/time.js';
import { round } from '../engine/vcp.js';

const NAME = 'Analyst';

export class Analyst {
  constructor(ctx) {
    this.ctx = ctx;
    this.status = { state: 'idle', lastRank: null, ranked: 0 };
  }

  log(msg, level, data) {
    this.ctx.bus.log(NAME, msg, { level, data });
  }

  rank(signals) {
    if (!signals.length) return [];
    const { settings, db, clock } = this.ctx;
    const rules = settings.rules;
    const regime = this.ctx.market?.regime || 'unknown';
    const t = ist(clock.now());
    const out = [];
    for (const s of signals) {
      const a = s.type === 'reentry' ? { ...s.a, vcp: { ...s.a.vcp, valid: true, pivot: s.pivot } } : s.a;
      const sc = scoreSetup(a, { price: s.price, volPace: s.volPace });
      const ex = explain(a, sc);
      let minScore = rules.minScore;
      if (regime === 'pressure') minScore += rules.pressureExtraScore;
      let status = 'ranked';
      let reason = '';
      if (regime === 'downtrend' && settings.marketFilter === 'pause') {
        status = 'skipped_regime';
        reason = 'Market is in a correction — new buys paused';
      } else if (sc.score < minScore) {
        status = 'skipped_score';
        reason = `Score ${sc.score} is below your minimum ${minScore}${regime === 'pressure' ? ' (raised: market under pressure)' : ''}`;
      }
      const sig = {
        ...s,
        score: sc.score,
        grade: sc.grade,
        parts: sc.parts,
        good: ex.good,
        bad: ex.bad,
        status,
        reason,
        half: regime === 'downtrend' && settings.marketFilter === 'half',
      };
      sig.id = db.insert('signals', {
        ts: clock.now().toISOString(),
        date: t.date,
        symbol: s.symbol,
        type: s.type,
        price: s.price,
        pivot: s.pivot,
        score: sc.score,
        grade: sc.grade,
        vol_pace: round(s.volPace, 2),
        status,
        reason,
        data: JSON.stringify({ parts: sc.parts, good: ex.good, bad: ex.bad, industry: a.industry, rs: a.rsRating }),
      });
      this.log(
        `${s.symbol} rated ${sc.score}/100 (${sc.grade})${status === 'ranked' ? '' : ' — ' + reason}. ${ex.good.slice(0, 2).join('; ')}`,
        status === 'ranked' ? 'info' : 'warn',
      );
      out.push(sig);
    }
    out.sort((x, y) => y.score - x.score);
    this.status.lastRank = clock.now().toISOString();
    this.status.lastRankReal = Date.now();
    this.status.ranked += out.length;
    return out;
  }

  /** Best current setups for the dashboard (not yet broken out). */
  topSetups(n = 12) {
    const list = [...(this.ctx.analysis?.values() || [])].filter((a) => a.trend?.pass && a.vcp?.valid && ['near', 'forming', 'breakout'].includes(a.stage));
    return list
      .map((a) => ({ ...a, live: this.ctx.live?.get(a.symbol) }))
      .sort((x, y) => y.score - x.score)
      .slice(0, n);
  }
}
