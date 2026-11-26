// One look for every candle chart: a deep, high-contrast "trading screen" panel with bright,
// solid candles, a coloured last-price tag, a labelled crosshair and the symbol as a faint watermark.
import { ColorType, CrosshairMode, LineStyle, createTextWatermark } from 'lightweight-charts';

export const PALETTE = {
  dark: {
    top: '#0e1424',
    bottom: '#060910',
    text: '#c9d1e3',
    grid: 'rgba(148, 163, 196, 0.09)',
    gain: '#16e08c',
    loss: '#ff4d6a',
    pivot: '#b9a6ff',
    stop: '#ff4d6a',
    cross: '#8f9bb8',
    crossLabel: '#2a3450',
    watermark: 'rgba(201, 209, 227, 0.06)',
    volAlpha: '73',
    lines: { ema21: '#ff7ac6', sma50: '#4db4ff', sma150: '#ffd166', sma200: '#ff8f3d', vwap: '#e6e9f2', avgVol: '#c9d1e3' },
  },
  light: {
    top: '#ffffff',
    bottom: '#f2f5fb',
    text: '#3a4256',
    grid: 'rgba(40, 52, 82, 0.08)',
    gain: '#05a35f',
    loss: '#e5243f',
    pivot: '#5b3fd9',
    stop: '#e5243f',
    cross: '#6b7591',
    crossLabel: '#283452',
    watermark: 'rgba(40, 52, 82, 0.06)',
    volAlpha: '80',
    lines: { ema21: '#d6338f', sma50: '#1d6fe0', sma150: '#c98a00', sma200: '#e2601b', vwap: '#283452', avgVol: '#3a4256' },
  },
};

export const paletteFor = (dark) => (dark ? PALETTE.dark : PALETTE.light);

/** Chart options shared by the daily and 15-minute charts. */
export function chartOptions(c, { height, compact, time = false }) {
  return {
    height,
    layout: {
      background: { type: ColorType.VerticalGradient, topColor: c.top, bottomColor: c.bottom },
      textColor: c.text,
      fontFamily: '-apple-system, BlinkMacSystemFont, Inter, sans-serif',
      fontSize: compact ? 12 : 13,
      attributionLogo: false,
    },
    grid: { vertLines: { color: c.grid, style: LineStyle.Dotted }, horzLines: { color: c.grid, style: LineStyle.Dotted } },
    rightPriceScale: { borderVisible: false, scaleMargins: { top: 0.08, bottom: 0.24 }, entireTextOnly: true },
    timeScale: { borderVisible: false, rightOffset: compact ? 3 : 5, barSpacing: compact ? 8 : 10, minBarSpacing: 3, timeVisible: time, secondsVisible: false },
    crosshair: {
      mode: CrosshairMode.Magnet,
      vertLine: { color: c.cross, width: 1, style: LineStyle.Dashed, labelBackgroundColor: c.crossLabel },
      horzLine: { color: c.cross, width: 1, style: LineStyle.Dashed, labelBackgroundColor: c.crossLabel },
    },
    localization: { priceFormatter: (p) => (p >= 1000 ? Math.round(p).toLocaleString('en-IN') : p.toFixed(2)) },
  };
}

/** Solid, bright candles with matching borders and wicks so every body is easy to see. */
export function candleOptions(c) {
  return {
    upColor: c.gain,
    downColor: c.loss,
    borderUpColor: c.gain,
    borderDownColor: c.loss,
    wickUpColor: c.gain,
    wickDownColor: c.loss,
    borderVisible: true,
    priceLineVisible: true,
    priceLineWidth: 1,
    priceLineStyle: LineStyle.Dashed,
    lastValueVisible: true,
  };
}

/** Big faint symbol name in the middle of the chart. */
export function addWatermark(chart, c, text, compact) {
  if (!text) return;
  try {
    createTextWatermark(chart.panes()[0], {
      horzAlign: 'center',
      vertAlign: 'center',
      lines: [{ text, color: c.watermark, fontSize: compact ? 44 : 72, fontStyle: 'bold' }],
    });
  } catch {}
}

/** Volume bars coloured by candle direction, plus a 20-bar average line for spotting heavy days. */
export function volumeData(bars, c, timeOf) {
  const vols = bars.map((b) => b.volume || 0);
  const avg = vols.map((_, i) => (i < 19 ? null : vols.slice(i - 19, i + 1).reduce((a, b) => a + b, 0) / 20));
  return {
    bars: bars.map((b, i) => {
      const heavy = avg[i] && vols[i] > avg[i] * 1.5;
      const col = b.close >= b.open ? c.gain : c.loss;
      return { time: timeOf(b), value: vols[i], color: heavy ? col : col + c.volAlpha };
    }),
    avg: bars.map((b, i) => (avg[i] == null ? { time: timeOf(b) } : { time: timeOf(b), value: avg[i] })),
  };
}
