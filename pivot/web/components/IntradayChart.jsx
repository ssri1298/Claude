// 15-minute candles for one day (today live, or any breakout day), with the pivot and stop.
import { useEffect, useRef, useState } from 'react';
import { createChart, CandlestickSeries, HistogramSeries, LineStyle } from 'lightweight-charts';
import { useApi, useIsDark, cssVar, niceDate } from '../lib.js';
import { Spinner } from './ui.jsx';

// Show IST clock times: shift each candle so the chart's UTC axis reads as IST
const toTime = (date, hhmm) => Math.floor(Date.parse(`${date}T${hhmm}:00Z`) / 1000);

export default function IntradayChart({ symbol }) {
  const [date, setDate] = useState(null);
  const { data, error } = useApi(`/stock/${symbol}/intraday${date ? `?date=${date}` : ''}`, { interval: 30000 });
  const ref = useRef(null);
  const dark = useIsDark();
  const compact = typeof window !== 'undefined' && window.innerWidth < 640;
  useEffect(() => {
    if (!ref.current || !data?.bars?.length) return;
    const ink2 = `rgb(${cssVar('--ink2')})`;
    const line = `rgb(${cssVar('--line')} / 0.08)`;
    const gain = `rgb(${cssVar('--mint')})`;
    const loss = `rgb(${cssVar('--coral')})`;
    const chart = createChart(ref.current, {
      height: compact ? 280 : 340,
      layout: { background: { color: 'transparent' }, textColor: ink2, fontFamily: '-apple-system, BlinkMacSystemFont, Inter, sans-serif', fontSize: 12, attributionLogo: false },
      grid: { vertLines: { color: line }, horzLines: { color: line } },
      rightPriceScale: { borderVisible: false },
      timeScale: { borderVisible: false, timeVisible: true, secondsVisible: false },
      crosshair: { mode: 0 },
    });
    const c = chart.addSeries(CandlestickSeries, { upColor: gain, downColor: loss, borderUpColor: gain, borderDownColor: loss, wickUpColor: gain, wickDownColor: loss, priceLineVisible: false });
    c.setData(data.bars.map((b) => ({ time: toTime(data.date, b.time), open: b.open, high: b.high, low: b.low, close: b.close })));
    if (data.bars.some((b) => b.volume)) {
      const v = chart.addSeries(HistogramSeries, { priceScaleId: 'vol', priceFormat: { type: 'volume' }, lastValueVisible: false, priceLineVisible: false });
      chart.priceScale('vol').applyOptions({ scaleMargins: { top: 0.82, bottom: 0 } });
      v.setData(data.bars.map((b) => ({ time: toTime(data.date, b.time), value: b.volume, color: b.close >= b.open ? gain + '66' : loss + '66' })));
    }
    const lav = dark ? '#9085e9' : '#6250d6';
    if (data.pivot) c.createPriceLine({ price: data.pivot, color: lav, lineWidth: 2, lineStyle: LineStyle.Dashed, axisLabelVisible: true, title: 'Pivot' });
    if (data.stop) c.createPriceLine({ price: data.stop, color: loss, lineWidth: 1, lineStyle: LineStyle.Dotted, axisLabelVisible: true, title: 'Stop' });
    if (data.vwap) c.createPriceLine({ price: data.vwap, color: ink2, lineWidth: 1, lineStyle: LineStyle.SparseDotted, axisLabelVisible: true, title: 'VWAP' });
    chart.timeScale().fitContent();
    const ro = new ResizeObserver(() => chart.applyOptions({ width: ref.current.clientWidth }));
    ro.observe(ref.current);
    return () => {
      ro.disconnect();
      chart.remove();
    };
  }, [data, dark]);

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
        <div ref={ref} className="w-full" />
      ) : (
        <p className="text-ink2 py-10 text-center">
          No 15-minute candles for {data.date === data.today ? 'today yet' : niceDate(data.date)}.
          {String(data.source).startsWith('unavailable') ? ' They download from Zerodha after your daily login.' : ''}
        </p>
      )}
      <div className="text-ink3 text-[12px] mt-1">
        {data.source === 'live' ? 'Live 15-minute candles built from today’s ticks' : '15-minute candles from Zerodha'} · times in IST · ⚡ = breakout or buy day
      </div>
    </div>
  );
}
