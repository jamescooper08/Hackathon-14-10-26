// Twelve Data provider: documented, keyed API. Use as the licensed fallback when Yahoo is
// unavailable or when the team wants a source with published terms.
// Requires TWELVE_DATA_API_KEY. Free-tier plans are rate-limited and may not include
// real-time US prices or intraday history; check the plan before claiming either.

import { INTERVALS, INTERVAL_IDS } from '../shared/intervals.mjs';
import { MarketDataError } from '../shared/types.mjs';
import { cleanBars, round } from './normalize.mjs';

const TD_INTERVAL = { '1m': '1min', '5m': '5min', '15m': '15min', '1h': '1h', '1D': '1day', '1W': '1week' };
const SYMBOL_RE = /^[A-Z][A-Z0-9.-]{0,9}$/;

const SOURCE = Object.freeze({
  id: 'twelvedata',
  name: 'Twelve Data',
  realtime: false,
  delayMinutes: null,
  note: 'Data from Twelve Data. Freshness depends on the API plan; not guaranteed real-time.',
});

export function createTwelveDataProvider({ apiKey = process.env.TWELVE_DATA_API_KEY, fetchImpl = fetch } = {}) {
  async function call(endpoint, params) {
    if (!apiKey) throw new MarketDataError('unauthorized', 'Set TWELVE_DATA_API_KEY to use Twelve Data.', 500);
    const url = new URL(`https://api.twelvedata.com/${endpoint}`);
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
    let res;
    try {
      res = await fetchImpl(url, { headers: { Authorization: `apikey ${apiKey}` }, signal: AbortSignal.timeout(10_000) });
    } catch (e) {
      throw new MarketDataError(e.name === 'TimeoutError' ? 'timeout' : 'upstream', 'Twelve Data request failed.', 502);
    }
    const data = await res.json();
    if (res.status === 429 || data.code === 429) throw new MarketDataError('rate_limited', 'Twelve Data rate limit hit.', 429);
    if (!res.ok || data.status === 'error') throw new MarketDataError('upstream', data.message || `HTTP ${res.status}`, 502);
    return data;
  }

  return {
    id: SOURCE.id,
    supportedIntervals: INTERVAL_IDS,
    async getCandles({ symbol, interval }) {
      symbol = String(symbol).toUpperCase();
      if (!SYMBOL_RE.test(symbol)) throw new MarketDataError('bad_request', 'Invalid ticker symbol.', 400);
      if (!INTERVALS[interval]) throw new MarketDataError('unsupported_interval', `Unsupported interval: ${interval}`, 400);
      const data = await call('time_series', {
        symbol, interval: TD_INTERVAL[interval], outputsize: '300', order: 'asc', timezone: 'UTC',
      });
      const bars = cleanBars((data.values ?? []).map(v => ({
        time: Math.floor(Date.parse(v.datetime.replace(' ', 'T') + (v.datetime.length > 10 ? 'Z' : 'T00:00:00Z')) / 1000),
        open: Number(v.open), high: Number(v.high), low: Number(v.low), close: Number(v.close),
        volume: v.volume == null ? null : Number(v.volume),
      })));
      if (!bars.length) throw new MarketDataError('no_data', `No candles returned for ${symbol} (${interval}).`, 502);
      return {
        symbol, interval,
        currency: data.meta?.currency ?? 'USD',
        timezone: data.meta?.exchange_timezone ?? 'America/New_York',
        bars, source: SOURCE, fetchedAt: Date.now(),
      };
    },
    async getQuote({ symbol }) {
      symbol = String(symbol).toUpperCase();
      if (!SYMBOL_RE.test(symbol)) throw new MarketDataError('bad_request', 'Invalid ticker symbol.', 400);
      const q = await call('quote', { symbol });
      const price = Number(q.close);
      if (!Number.isFinite(price)) throw new MarketDataError('no_data', `No quote returned for ${symbol}.`, 502);
      const prev = Number(q.previous_close);
      const hasPrev = Number.isFinite(prev) && prev !== 0;
      return {
        symbol, name: q.name ?? symbol, exchange: q.exchange ?? '', currency: q.currency ?? 'USD',
        price,
        previousClose: hasPrev ? prev : null,
        change: hasPrev ? round(price - prev) : null,
        changePercent: hasPrev ? round(((price - prev) / prev) * 100, 2) : null,
        dayHigh: Number.isFinite(Number(q.high)) ? Number(q.high) : null,
        dayLow: Number.isFinite(Number(q.low)) ? Number(q.low) : null,
        volume: Number.isFinite(Number(q.volume)) ? Number(q.volume) : null,
        asOf: Number(q.last_quote_at) || Number(q.timestamp) || Math.floor(Date.now() / 1000),
        marketStatus: q.is_market_open === true ? 'open' : q.is_market_open === false ? 'closed' : 'unknown',
        source: SOURCE, fetchedAt: Date.now(),
      };
    },
  };
}
