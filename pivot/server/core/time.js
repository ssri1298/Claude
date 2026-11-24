// India Standard Time helpers and clocks (real and simulated).

const IST_OFFSET_MIN = 330;

/** Break a Date into IST calendar parts. */
export function ist(d = new Date()) {
  const t = new Date(d.getTime() + IST_OFFSET_MIN * 60000);
  const y = t.getUTCFullYear();
  const mo = t.getUTCMonth() + 1;
  const da = t.getUTCDate();
  const date = `${y}-${String(mo).padStart(2, '0')}-${String(da).padStart(2, '0')}`;
  const minutes = t.getUTCHours() * 60 + t.getUTCMinutes();
  return { date, minutes, seconds: t.getUTCSeconds(), weekday: t.getUTCDay(), hhmm: hhmm(minutes) };
}

export function hhmm(minutes) {
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
}

export function toMinutes(s) {
  const [h, m] = s.split(':').map(Number);
  return h * 60 + m;
}

/** Date object for an IST date + minute-of-day. */
export function istDate(date, minutes = 0) {
  const [y, mo, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, mo - 1, d, 0, minutes) - IST_OFFSET_MIN * 60000);
}

export function addDays(date, n) {
  const d = istDate(date, 720);
  return ist(new Date(d.getTime() + n * 86400000)).date;
}

export const MARKET = {
  open: toMinutes('09:15'),
  close: toMinutes('15:30'),
};

export function isWeekend(date) {
  const wd = istDate(date, 720).getUTCDay();
  return wd === 0 || wd === 6;
}

export function isTradingDay(date, holidays = []) {
  return !isWeekend(date) && !holidays.includes(date);
}

export function nextTradingDay(date, holidays = []) {
  let d = addDays(date, 1);
  while (!isTradingDay(d, holidays)) d = addDays(d, 1);
  return d;
}

export function prevTradingDay(date, holidays = []) {
  let d = addDays(date, -1);
  while (!isTradingDay(d, holidays)) d = addDays(d, -1);
  return d;
}

/** Count trading days strictly after `from` up to and including `to`. */
export function tradingDaysBetween(from, to, holidays = []) {
  let n = 0;
  let d = from;
  while (d < to) {
    d = addDays(d, 1);
    if (isTradingDay(d, holidays)) n++;
  }
  return n;
}

export class RealClock {
  constructor() {
    this.kind = 'real';
  }
  now() {
    return new Date();
  }
}

/** Simulated clock for demo mode: time only moves when the orchestrator advances it. */
export class SimClock {
  constructor(start) {
    this.kind = 'sim';
    this.t = start.getTime();
  }
  now() {
    return new Date(this.t);
  }
  advanceMinutes(n = 1) {
    this.t += n * 60000;
  }
  set(date) {
    this.t = date.getTime();
  }
}
