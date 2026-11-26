import { useEffect, useRef, useState } from 'react';
import { createChart, CandlestickSeries, LineSeries, HistogramSeries, createSeriesMarkers, LineStyle } from 'lightweight-charts';
import { useIsDark } from '../lib.js';
import { paletteFor, chartOptions, candleOptions, addWatermark, volumeData } from './chartTheme.js';

const sma = (vals, n) => vals.map((_, i) => (i < n - 1 ? null : vals.slice(i - n + 1, i + 1).reduce((a, b) => a + b, 0) / n));
const ema = (vals, n) => {
  const k = 2 / (n + 1);
  const out = [];
  let prev = null;
  vals.forEach((v, i) => {
    if (i < n - 1) return out.push(null);
    if (prev == null) prev = vals.slice(0, n).reduce((a, b) => a + b, 0) / n;
    else prev = v * k + prev * (1 - k);
    out.push(prev);
  });
  return out;
};

// Moving averages: thin so the candles stay the star; the 50-day is a little bolder (the key trend line)
const LINES = [
  { key: 'ema21', label: '21 EMA', width: 1, fn: (c) => ema(c, 21) },
  { key: 'sma50', label: '50 DMA', width: 2, fn: (c) => sma(c, 50) },
  { key: 'sma150', label: '150 DMA', width: 1, fn: (c) => sma(c, 150) },
  { key: 'sma200', label: '200 DMA', width: 2, fn: (c) => sma(c, 200) },
];

export default function PriceChart({ candles, vcp, positions = [], height: heightProp, buyZonePct = 0, symbol = '' }) {
  const ref = useRef(null);
  const dark = useIsDark();
  const compact = typeof window !== 'undefined' && window.innerWidth < 640;
  const height = heightProp || (compact ? 330 : 420);
  const [range, setRange] = useState(compact ? 42 : 130);
  const [hover, setHover] = useState(null);

  useEffect(() => {
    if (!ref.current || !candles?.length) return;
    const C = paletteFor(dark);
    const gain = C.gain;
    const loss = C.loss;
    const chart = createChart(ref.current, { ...chartOptions(C, { height, compact }), handleScroll: true, handleScale: true });
    addWatermark(chart, C, symbol, compact);
    const closes = candles.map((c) => c.close);
    const candle = chart.addSeries(CandlestickSeries, candleOptions(C));
    candle.setData(candles.map((c) => ({ time: c.date, open: c.open, high: c.high, low: c.low, close: c.close })));
    for (const l of LINES) {
      const s = chart.addSeries(LineSeries, { color: C.lines[l.key], lineWidth: l.width, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false, autoscaleInfoProvider: () => null });
      const v = l.fn(closes);
      s.setData(candles.map((c, i) => (v[i] == null ? { time: c.date } : { time: c.date, value: v[i] })));
    }
    const vol = chart.addSeries(HistogramSeries, { priceScaleId: 'vol', priceFormat: { type: 'volume' }, lastValueVisible: false, priceLineVisible: false });
    chart.priceScale('vol').applyOptions({ scaleMargins: { top: 0.82, bottom: 0 } });
    const vd = volumeData(candles, C, (c) => c.date);
    vol.setData(vd.bars);
    const avgVol = chart.addSeries(LineSeries, { priceScaleId: 'vol', color: C.lines.avgVol + '99', lineWidth: 1, lineStyle: LineStyle.Dotted, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false });
    avgVol.setData(vd.avg);

    const lav = C.pivot;
    if (vcp?.pivot) {
      candle.createPriceLine({ price: vcp.pivot, color: lav, lineWidth: 2, lineStyle: LineStyle.Dashed, axisLabelVisible: true, title: 'Pivot' });
      if (buyZonePct) candle.createPriceLine({ price: vcp.pivot * (1 + buyZonePct / 100), color: lav + 'aa', lineWidth: 1, lineStyle: LineStyle.SparseDotted, axisLabelVisible: false, title: compact ? '' : `Buy zone +${buyZonePct}%` });
      if (vcp.stop) candle.createPriceLine({ price: vcp.stop, color: C.stop, lineWidth: 2, lineStyle: LineStyle.Dotted, axisLabelVisible: true, title: 'Stop' });
    }
    const dates = new Set(candles.map((c) => c.date));
    const markers = [];
    // The contractions drawn as a zig-zag: each swing high → its low, getting smaller to the right
    const zig = [];
    (vcp?.contractions || []).forEach((k, i) => {
      if (dates.has(k.highDate)) markers.push({ time: k.highDate, position: 'aboveBar', color: lav, shape: 'arrowDown', text: compact ? `C${i + 1}` : `C${i + 1} −${Math.round(k.depthPct)}%` });
      if (dates.has(k.highDate) && k.high) zig.push({ time: k.highDate, value: k.high });
      if (dates.has(k.lowDate) && k.low) zig.push({ time: k.lowDate, value: k.low });
    });
    if (zig.length >= 2) {
      const z = chart.addSeries(LineSeries, { color: lav + 'b3', lineWidth: 2, lineStyle: LineStyle.Solid, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false, pointMarkersVisible: true });
      z.setData(zig.sort((x, y) => (x.time < y.time ? -1 : 1)).filter((p, i, arr) => i === 0 || p.time !== arr[i - 1].time));
    }
    for (const p of positions) {
      if (dates.has(p.entryDate)) markers.push({ time: p.entryDate, position: 'belowBar', color: gain, shape: 'arrowUp', text: `Buy ${p.entryPrice}` });
      for (const f of p.fills || []) {
        const d = f.ts.slice(0, 10);
        if (f.side === 'SELL' && dates.has(d)) markers.push({ time: d, position: 'aboveBar', color: loss, shape: 'arrowDown', text: 'Sell' });
      }
    }
    markers.sort((a, b) => (a.time < b.time ? -1 : 1));
    if (markers.length) createSeriesMarkers(candle, markers);

    const n = candles.length;
    chart.timeScale().setVisibleLogicalRange({ from: Math.max(0, n - range), to: n + 3 });
    chart.subscribeCrosshairMove((p) => {
      if (!p.time) return setHover(null);
      const c = candles.find((x) => x.date === p.time);
      setHover(c || null);
    });
    const ro = new ResizeObserver(() => chart.applyOptions({ width: ref.current.clientWidth }));
    ro.observe(ref.current);
    return () => {
      ro.disconnect();
      chart.remove();
    };
  }, [candles, vcp, dark, range, height, positions, compact, buyZonePct, symbol]);

  const last = hover || candles?.[candles.length - 1];
  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
        <div className="flex flex-wrap gap-x-3 sm:gap-x-4 gap-y-1 text-[12px] sm:text-[13px] text-ink2">
          {LINES.map((l) => (
            <span key={l.key} className="flex items-center gap-1.5">
              <span className="h-[3px] w-4 rounded-full" style={{ background: paletteFor(dark).lines[l.key] }} />
              {l.label}
            </span>
          ))}
          <span className="flex items-center gap-1.5">
            <span className="h-0 w-4 border-t-2 border-dashed" style={{ borderColor: paletteFor(dark).pivot }} />
            Pivot
          </span>
          {vcp?.contractions?.length > 0 && (
            <span className="flex items-center gap-1.5">
              <span className="text-[13px] leading-none" style={{ color: paletteFor(dark).pivot }}>
                ╲╱
              </span>
              Contractions
            </span>
          )}
        </div>
        <div className="flex gap-1">
          {[
            [42, '2M'],
            [65, '3M'],
            [130, '6M'],
            [260, '1Y'],
          ].map(([n, l]) => (
            <button key={l} onClick={() => setRange(n)} className={`px-2.5 py-1 rounded-lg text-[13px] font-semibold ${range === n ? 'bg-card2 text-ink' : 'text-ink3'}`}>
              {l}
            </button>
          ))}
        </div>
      </div>
      <OhlcBar bar={last} prev={prevOf(candles, last)} dark={dark} label={last?.date} />
      <div className="rounded-2xl overflow-hidden ring-1 ring-black/5 dark:ring-white/10 shadow-soft">
        <div ref={ref} className="w-full" style={{ height }} />
      </div>
    </div>
  );
}

const prevOf = (bars, bar) => {
  const i = bars?.indexOf(bar) ?? -1;
  return i > 0 ? bars[i - 1] : null;
};

const fmt = (v) => (v == null ? '—' : v >= 1000 ? Number(v).toLocaleString('en-IN', { maximumFractionDigits: 1 }) : Number(v).toFixed(2));

/** Open / high / low / close of the bar under your finger (or the latest), with its change coloured. */
export function OhlcBar({ bar, prev, dark, label }) {
  if (!bar) return <div className="h-7 mb-1.5" />;
  const C = paletteFor(dark);
  const base = prev?.close ?? bar.open;
  const ch = base ? ((bar.close - base) / base) * 100 : 0;
  const col = bar.close >= base ? C.gain : C.loss;
  const item = (k, v) => (
    <span className="whitespace-nowrap">
      <span className="text-ink3">{k}</span> <span className="text-ink font-semibold">{fmt(v)}</span>
    </span>
  );
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] num mb-1.5 min-h-7">
      <span className="text-ink2 font-semibold">{label}</span>
      {item('O', bar.open)}
      {item('H', bar.high)}
      {item('L', bar.low)}
      <span className="whitespace-nowrap">
        <span className="text-ink3">C</span> <b style={{ color: col }}>{fmt(bar.close)}</b>
      </span>
      <span className="rounded-md px-1.5 py-0.5 font-bold text-[12px]" style={{ color: col, background: col + '22' }}>
        {ch >= 0 ? '+' : '−'}
        {Math.abs(ch).toFixed(2)}%
      </span>
      {bar.volume ? <span className="text-ink3 whitespace-nowrap">Vol {Number(bar.volume).toLocaleString('en-IN')}</span> : null}
    </div>
  );
}
