// Exam countdown for the header: months when the exam is more than 90 days away, days after that.
const parse = (iso) => {
  const [y, m, d] = String(iso).split('-').map(Number);
  return { y, m, d, t: Date.UTC(y, m - 1, d) };
};

export function examCountdown(today, examDate) {
  if (!today || !examDate) return null;
  const a = parse(today), b = parse(examDate);
  const days = Math.round((b.t - a.t) / 86400000);
  if (days < 0) return { value: null, unit: null, label: 'Exam date passed', days };
  if (days === 0) return { value: null, unit: null, label: 'Exam day', days };
  if (days > 90) {
    // Whole calendar months: 31 Jan → 30 Apr is 2 months (30 Apr hasn't reached the 31st).
    let months = (b.y - a.y) * 12 + (b.m - a.m);
    if (b.d < a.d) months--;
    months = Math.max(3, months);
    return { value: months, unit: months === 1 ? 'month' : 'months', label: `${months} month${months === 1 ? '' : 's'} to exam`, days };
  }
  return { value: days, unit: days === 1 ? 'day' : 'days', label: `${days} day${days === 1 ? '' : 's'} to exam`, days };
}
