// Yahoo Finance chart provider.
//
// UNOFFICIAL: this uses the public endpoint behind finance.yahoo.com. It has no SLA or published
// terms for API use, can change or block without notice, and is not licensed for redistribution.
// Fine for a hackathon demo; use a licensed vendor (see twelvedata-provider.mjs) for production.
// Prices are delayed and unverified, never described as real-time.

import { INTERVALS, INTERVAL_IDS } from '../shared/intervals.mjs';
import { MarketDataError } from '../shared/types.mjs';
import { cleanBars, marketStatusFrom, round } from './normalize.mjs';

const BASE = 'https://query1.finance.yahoo.com/v8/finance/chart/';
const YAHOO_INTERVAL = { '1m': '1m', '5m': '5m', '15m': '15m', '1h': '60m', '1D': '1d', '1W': '1wk' };
const SYMBOL_RE = /^[A-Z][A-Z0-9.-]{0,9}$/;

const SOURCE = Object.freeze({
  id: 'yahoo',
  name: 'Yahoo Finance (unofficial)',
  realtime: false,
  delayMinutes: null,
  note: 'Delayed, unofficial data from Yahoo Finance. Not real-time; not for trading decisions.',
});

async function fetchChart(symbol, interval, range, fetchImpl) {
  const url = new URL(BASE + encodeURIComponent(symbol));
  url.searchParams.set('interval', interval);
  url.searchParams.set('range', range);
  url.searchParams.set('includePrePost', 'false');
  let res;
  try {
    res = await fetchImpl(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (stock-tracker hackathon)', Accept: 'application/json' },
      signal: AbortSignal.timeout(10_000),
    });
  } catch (e) {
    throw new MarketDataError(e.name === 'TimeoutError' ? 'timeout' : 'upstream', 'Yahoo Finance request failed.', 502);
  }
  if (res.status === 429) throw new MarketDataError('rate_limited', 'Yahoo Finance rate limit hit.', 429);
  if (!res.ok) throw new MarketDataError('upstream', `Yahoo Finance returned HTTP ${res.status}.`, 502);
  const body = await res.json();
  const result = body?.chart?.result?.[0];
  if (!result) throw new MarketDataError('no_data', body?.chart?.error?.description || 'No data returned.', 502);
  return result;
}

export function parseCandles(result, symbol, interval, fetchedAt = Date.now()) {
  const q = result.indicators?.quote?.[0] ?? {};
  const ts = result.timestamp ?? [];
  let bars = cleanBars(ts.map((time, i) => ({
    time,
    open: q.open?.[i], high: q.high?.[i], low: q.low?.[i], close: q.close?.[i],
    volume: Number.isFinite(q.volume?.[i]) ? q.volume[i] : null,
  })));
  // Yahoo appends a zero-volume o=h=l=c placeholder stamped "now" to intraday series; it is not a real candle.
  if (INTERVALS[interval]?.intraday && bars.length > 1 && bars.at(-1).volume === 0) bars = bars.slice(0, -1);
  if (!bars.length) throw new MarketDataError('no_data', `No candles returned for ${symbol} (${interval}).`, 502);
  return {
    symbol,
    interval,
    currency: result.meta?.currency ?? 'USD',
    timezone: result.meta?.exchangeTimezoneName ?? 'America/New_York',
    bars,
    source: SOURCE,
    fetchedAt,
  };
}

export function parseQuote(result, symbol, nowSec = Math.floor(Date.now() / 1000), fetchedAt = Date.now()) {
  const m = result.meta ?? {};
  const price = m.regularMarketPrice;
  if (!Number.isFinite(price)) throw new MarketDataError('no_data', `No quote returned for ${symbol}.`, 502);
  const prev = Number.isFinite(m.chartPreviousClose) ? m.chartPreviousClose : null;
  return {
    symbol,
    name: m.longName ?? m.shortName ?? symbol,
    exchange: m.fullExchangeName ?? m.exchangeName ?? '',
    currency: m.currency ?? 'USD',
    price,
    previousClose: prev,
    change: prev == null ? null : round(price - prev),
    changePercent: prev == null || prev === 0 ? null : round(((price - prev) / prev) * 100, 2),
    dayHigh: m.regularMarketDayHigh ?? null,
    dayLow: m.regularMarketDayLow ?? null,
    volume: m.regularMarketVolume ?? null,
    asOf: m.regularMarketTime ?? nowSec,
    marketStatus: marketStatusFrom(nowSec, m.currentTradingPeriod),
    source: SOURCE,
    fetchedAt,
  };
}

export function createYahooProvider({ fetchImpl = fetch } = {}) {
  return {
    id: SOURCE.id,
    supportedIntervals: INTERVAL_IDS,
    async getCandles({ symbol, interval }) {
      symbol = String(symbol).toUpperCase();
      if (!SYMBOL_RE.test(symbol)) throw new MarketDataError('bad_request', 'Invalid ticker symbol.', 400);
      if (!INTERVALS[interval]) throw new MarketDataError('unsupported_interval', `Unsupported interval: ${interval}`, 400);
      const result = await fetchChart(symbol, YAHOO_INTERVAL[interval], INTERVALS[interval].range, fetchImpl);
      return parseCandles(result, symbol, interval);
    },
    async getQuote({ symbol }) {
      symbol = String(symbol).toUpperCase();
      if (!SYMBOL_RE.test(symbol)) throw new MarketDataError('bad_request', 'Invalid ticker symbol.', 400);
      // range=1d so chartPreviousClose is yesterday's close (longer ranges return the close before the range)
      const result = await fetchChart(symbol, '1d', '1d', fetchImpl);
      return parseQuote(result, symbol);
    },
  };
}
