import { useEffect, useRef, useState } from 'react';
import { createChart, CandlestickSeries, LineSeries, HistogramSeries, createSeriesMarkers, LineStyle } from 'lightweight-charts';
import { useIsDark, cssVar } from '../lib.js';

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

// Series colours: validated categorical slots (blue, orange, violet, magenta)
const LINES = [
  { key: 'ema21', label: '21 EMA', light: '#e87ba4', dark: '#d55181', fn: (c) => ema(c, 21) },
  { key: 'sma50', label: '50 DMA', light: '#2a78d6', dark: '#3987e5', fn: (c) => sma(c, 50) },
  { key: 'sma150', label: '150 DMA', light: '#6250d6', dark: '#9085e9', fn: (c) => sma(c, 150) },
  { key: 'sma200', label: '200 DMA', light: '#eb6834', dark: '#d95926', fn: (c) => sma(c, 200) },
];

export default function PriceChart({ candles, vcp, positions = [], height: heightProp }) {
  const ref = useRef(null);
  const dark = useIsDark();
  const compact = typeof window !== 'undefined' && window.innerWidth < 640;
  const height = heightProp || (compact ? 330 : 420);
  const [range, setRange] = useState(compact ? 65 : 130);
  const [hover, setHover] = useState(null);

  useEffect(() => {
    if (!ref.current || !candles?.length) return;
    const ink2 = `rgb(${cssVar('--ink2')})`;
    const grid = cssVar('--chart-grid');
    const gain = cssVar('--chart-gain');
    const loss = cssVar('--chart-loss');
    const chart = createChart(ref.current, {
      height,
      layout: { background: { color: 'transparent' }, textColor: ink2, fontFamily: '-apple-system, BlinkMacSystemFont, Inter, sans-serif', fontSize: 13, attributionLogo: false },
      grid: { vertLines: { visible: false }, horzLines: { color: grid } },
      rightPriceScale: { borderVisible: false, scaleMargins: { top: 0.08, bottom: 0.22 } },
      timeScale: { borderVisible: false, rightOffset: compact ? 2 : 4, barSpacing: 7 },
      localization: { priceFormatter: (p) => (p >= 1000 ? Math.round(p).toLocaleString('en-IN') : p.toFixed(2)) },
      crosshair: { mode: 0 },
      handleScroll: true,
      handleScale: true,
    });
    const closes = candles.map((c) => c.close);
    const candle = chart.addSeries(CandlestickSeries, {
      upColor: gain,
      downColor: loss,
      wickUpColor: gain,
      wickDownColor: loss,
      borderVisible: false,
      priceLineVisible: false,
    });
    candle.setData(candles.map((c) => ({ time: c.date, open: c.open, high: c.high, low: c.low, close: c.close })));
    for (const l of LINES) {
      const s = chart.addSeries(LineSeries, { color: dark ? l.dark : l.light, lineWidth: 2, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false });
      const v = l.fn(closes);
      s.setData(candles.map((c, i) => (v[i] == null ? { time: c.date } : { time: c.date, value: v[i] })));
    }
    const vol = chart.addSeries(HistogramSeries, { priceScaleId: 'vol', priceFormat: { type: 'volume' }, lastValueVisible: false, priceLineVisible: false });
    chart.priceScale('vol').applyOptions({ scaleMargins: { top: 0.82, bottom: 0 } });
    vol.setData(candles.map((c) => ({ time: c.date, value: c.volume, color: c.close >= c.open ? gain + '66' : loss + '66' })));

    if (vcp?.pivot) {
      candle.createPriceLine({ price: vcp.pivot, color: dark ? '#9085e9' : '#6250d6', lineWidth: 2, lineStyle: LineStyle.Dashed, axisLabelVisible: true, title: 'Pivot' });
      if (vcp.stop) candle.createPriceLine({ price: vcp.stop, color: loss, lineWidth: 1, lineStyle: LineStyle.Dotted, axisLabelVisible: true, title: 'Stop' });
    }
    const dates = new Set(candles.map((c) => c.date));
    const markers = [];
    (vcp?.contractions || []).forEach((k, i) => {
      if (dates.has(k.highDate)) markers.push({ time: k.highDate, position: 'aboveBar', color: dark ? '#9085e9' : '#6250d6', shape: 'arrowDown', text: compact ? `C${i + 1}` : `C${i + 1} −${Math.round(k.depthPct)}%` });
    });
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
  }, [candles, vcp, dark, range, height, positions, compact]);

  const last = hover || candles?.[candles.length - 1];
  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
        <div className="flex flex-wrap gap-x-3 sm:gap-x-4 gap-y-1 text-[12px] sm:text-[13px] text-ink2">
          {LINES.map((l) => (
            <span key={l.key} className="flex items-center gap-1.5">
              <span className="h-[3px] w-4 rounded-full" style={{ background: dark ? l.dark : l.light }} />
              {l.label}
            </span>
          ))}
          <span className="flex items-center gap-1.5">
            <span className="h-0 w-4 border-t-2 border-dashed" style={{ borderColor: dark ? '#9085e9' : '#6250d6' }} />
            Pivot
          </span>
        </div>
        <div className="flex gap-1">
          {[
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
      {last && (
        <div className="text-[13px] text-ink2 num mb-1 h-5">
          {last.date} · O {last.open} · H {last.high} · L {last.low} · C <b className="text-ink">{last.close}</b> · Vol {Number(last.volume).toLocaleString('en-IN')}
        </div>
      )}
      <div ref={ref} className="w-full" style={{ height }} />
    </div>
  );
}
