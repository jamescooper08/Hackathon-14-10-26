// Candle intervals the market-data layer understands. Shared by server and browser code.
// `range` is how much history is requested; `refreshMs` is how often the store re-polls.
// Which intervals a provider can really serve is reported by provider.supportedIntervals.

export const DEFAULT_INTERVAL = '1D';

/** @type {Record<string, {id:string,label:string,seconds:number,range:string,refreshMs:number,intraday:boolean}>} */
export const INTERVALS = {
  '1m':  { id: '1m',  label: '1 min',  seconds: 60,     range: '5d',  refreshMs: 60_000,  intraday: true },
  '5m':  { id: '5m',  label: '5 min',  seconds: 300,    range: '1mo', refreshMs: 60_000,  intraday: true },
  '15m': { id: '15m', label: '15 min', seconds: 900,    range: '1mo', refreshMs: 60_000,  intraday: true },
  '1h':  { id: '1h',  label: '1 hour', seconds: 3600,   range: '3mo', refreshMs: 120_000, intraday: true },
  '1D':  { id: '1D',  label: 'Daily',  seconds: 86400,  range: '1y',  refreshMs: 300_000, intraday: false },
  '1W':  { id: '1W',  label: 'Weekly', seconds: 604800, range: '5y',  refreshMs: 600_000, intraday: false },
};

export const INTERVAL_IDS = Object.keys(INTERVALS);

export function isInterval(id) {
  return Object.hasOwn(INTERVALS, id);
}
