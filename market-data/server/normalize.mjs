// Pure helpers shared by providers. Kept free of I/O so they are unit-testable.

/** Keep only well-formed candles, ascending and de-duplicated by time. */
export function cleanBars(bars) {
  const seen = new Set();
  return bars
    .filter(b =>
      Number.isFinite(b.time) &&
      [b.open, b.high, b.low, b.close].every(Number.isFinite) &&
      b.high >= Math.max(b.open, b.close, b.low) &&
      b.low <= Math.min(b.open, b.close, b.high))
    .sort((a, b) => a.time - b.time)
    .filter(b => (seen.has(b.time) ? false : seen.add(b.time)));
}

/**
 * Market status from trading-period windows (UTC seconds).
 * @param {number} nowSec
 * @param {{pre?:{start:number,end:number}, regular?:{start:number,end:number}, post?:{start:number,end:number}}} periods
 */
export function marketStatusFrom(nowSec, periods) {
  if (!periods?.regular) return 'unknown';
  const within = p => p && nowSec >= p.start && nowSec < p.end;
  if (within(periods.regular)) return 'open';
  if (within(periods.pre)) return 'pre';
  if (within(periods.post)) return 'post';
  return 'closed';
}

export function round(n, digits = 4) {
  return Number.isFinite(n) ? Number(n.toFixed(digits)) : null;
}
