// 15-minute candles for one day (today live, or any breakout day), with the pivot and stop.
import { useEffect, useRef, useState } from 'react';
import { createChart, CandlestickSeries, HistogramSeries, LineSeries, LineStyle } from 'lightweight-charts';
import { useApi, useIsDark, niceDate } from '../lib.js';
import { paletteFor, chartOptions, candleOptions, addWatermark, volumeData } from './chartTheme.js';
import { OhlcBar } from './PriceChart.jsx';
import { Spinner } from './ui.jsx';

// Show IST clock times: shift each candle so the chart's UTC axis reads as IST
const toTime = (date, hhmm) => Math.floor(Date.parse(`${date}T${hhmm}:00Z`) / 1000);

export default function IntradayChart({ symbol }) {
  const [date, setDate] = useState(null);
  const [hover, setHover] = useState(null);
  const { data, error } = useApi(`/stock/${symbol}/intraday${date ? `?date=${date}` : ''}`, { interval: 30000 });
  const ref = useRef(null);
  const dark = useIsDark();
  const compact = typeof window !== 'undefined' && window.innerWidth < 640;
  useEffect(() => {
    if (!ref.current || !data?.bars?.length) return;
    const C = paletteFor(dark);
    const chart = createChart(ref.current, chartOptions(C, { height: compact ? 300 : 360, compact, time: true }));
    addWatermark(chart, C, `${symbol} · 15m`, compact);
    const tOf = (b) => toTime(data.date, b.time);
    const c = chart.addSeries(CandlestickSeries, candleOptions(C));
    c.setData(data.bars.map((b) => ({ time: tOf(b), open: b.open, high: b.high, low: b.low, close: b.close })));
    if (data.bars.some((b) => b.volume)) {
      const v = chart.addSeries(HistogramSeries, { priceScaleId: 'vol', priceFormat: { type: 'volume' }, lastValueVisible: false, priceLineVisible: false });
      chart.priceScale('vol').applyOptions({ scaleMargins: { top: 0.8, bottom: 0 } });
      v.setData(volumeData(data.bars, C, tOf).bars);
    }
    // Running VWAP as a line (the average price paid today), so you can see price above or below it
    let pv = 0;
    let vv = 0;
    const vwapLine = data.bars.map((b) => {
      const vol = b.volume || 0;
      pv += ((b.high + b.low + b.close) / 3) * vol;
      vv += vol;
      return vv ? { time: tOf(b), value: pv / vv } : { time: tOf(b) };
    });
    if (vv) {
      const w = chart.addSeries(LineSeries, { color: C.lines.vwap + 'cc', lineWidth: 2, lineStyle: LineStyle.Dashed, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false });
      w.setData(vwapLine);
    }
    if (data.pivot) c.createPriceLine({ price: data.pivot, color: C.pivot, lineWidth: 2, lineStyle: LineStyle.Dashed, axisLabelVisible: true, title: 'Pivot' });
    if (data.stop) c.createPriceLine({ price: data.stop, color: C.stop, lineWidth: 2, lineStyle: LineStyle.Dotted, axisLabelVisible: true, title: 'Stop' });
    chart.subscribeCrosshairMove((p) => setHover(p.time ? data.bars.find((b) => tOf(b) === p.time) || null : null));
    chart.timeScale().fitContent();
    const ro = new ResizeObserver(() => chart.applyOptions({ width: ref.current.clientWidth }));
    ro.observe(ref.current);
    return () => {
      ro.disconnect();
      chart.remove();
    };
  }, [data, dark, symbol]);

  if (error) return <p className="text-ink2">{error}</p>;
  if (!data) return <Spinner />;
  const choices = [...new Set([data.today, data.lastDaily, ...(data.breakoutDays || [])].filter(Boolean))].slice(0, 6);
  return (
    <div>
      <div className="flex gap-1.5 overflow-x-auto no-scrollbar mb-2">
        {choices.map((d) => (
          <button key={d} onClick={() => setDate(d)} className={`shrink-0 px-2.5 py-1 rounded-lg text-[13px] font-semibold ${d === data.date ? 'bg-card2 text-ink' : 'text-ink3'}`}>
            {d === data.today ? 'Today' : niceDate(d)}
            {data.breakoutDays?.includes(d) ? ' ⚡' : ''}
          </button>
        ))}
      </div>
      {data.bars.length ? (
        <>
          <OhlcBar bar={hover || data.bars[data.bars.length - 1]} prev={null} dark={dark} label={`${data.date === data.today ? 'Today' : niceDate(data.date)} ${(hover || data.bars[data.bars.length - 1]).time}`} />
          <div className="rounded-2xl overflow-hidden ring-1 ring-black/5 dark:ring-white/10 shadow-soft">
            <div ref={ref} className="w-full" />
          </div>
        </>
      ) : (
        <p className="text-ink2 py-10 text-center">
          No 15-minute candles for {data.date === data.today ? 'today yet' : niceDate(data.date)}.
          {String(data.source).startsWith('unavailable') ? ' They download from Zerodha after your daily login.' : ''}
        </p>
      )}
      <div className="text-ink3 text-[12px] mt-1">
        {data.source === 'live' ? 'Live 15-minute candles built from today’s ticks' : '15-minute candles from Zerodha'} · dashed line = VWAP · times in IST · ⚡ = breakout or buy day
      </div>
    </div>
  );
}
