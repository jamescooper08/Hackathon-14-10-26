// HTTP routes for market data. Framework-agnostic: mount from any Node http server (or Express):
//
//   import { createMarketRoutes } from './market-data/server/routes.mjs';
//   const market = createMarketRoutes();
//   // inside the request handler: if (await market(req, res)) return;
//
// GET /api/market/candles?symbol=NVDA&interval=1D  -> CandleSeries
// GET /api/market/quote?symbol=NVDA                -> Quote
// GET /api/market/meta                             -> { provider, supportedIntervals, source }

import { INTERVAL_IDS } from '../shared/intervals.mjs';
import { MarketDataError } from '../shared/types.mjs';
import { createYahooProvider } from './yahoo-provider.mjs';
import { createTwelveDataProvider } from './twelvedata-provider.mjs';

const CACHE_TTL_MS = 15_000; // protects the upstream when several clients poll at once

export function pickProvider(name = process.env.MARKET_DATA_PROVIDER || 'yahoo') {
  if (name === 'twelvedata') return createTwelveDataProvider();
  if (name === 'yahoo') return createYahooProvider();
  throw new Error(`Unknown MARKET_DATA_PROVIDER "${name}" (use "yahoo" or "twelvedata").`);
}

export function createMarketRoutes({ provider = pickProvider(), defaultSymbol = 'NVDA' } = {}) {
  const cache = new Map();

  async function cached(key, load) {
    const hit = cache.get(key);
    if (hit && hit.expires > Date.now()) return hit.value;
    const value = await load();
    cache.set(key, { value, expires: Date.now() + CACHE_TTL_MS });
    return value;
  }

  function send(res, status, body) {
    res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify(body));
  }

  /** @returns {Promise<boolean>} true if the request was handled. */
  return async function handle(req, res) {
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    if (!url.pathname.startsWith('/api/market/')) return false;
    if (req.method !== 'GET') { send(res, 405, { error: 'method_not_allowed' }); return true; }
    const symbol = (url.searchParams.get('symbol') || defaultSymbol).toUpperCase();
    try {
      if (url.pathname === '/api/market/meta') {
        send(res, 200, { provider: provider.id, supportedIntervals: provider.supportedIntervals ?? INTERVAL_IDS });
      } else if (url.pathname === '/api/market/candles') {
        const interval = url.searchParams.get('interval') || '1D';
        send(res, 200, await cached(`c:${symbol}:${interval}`, () => provider.getCandles({ symbol, interval })));
      } else if (url.pathname === '/api/market/quote') {
        send(res, 200, await cached(`q:${symbol}`, () => provider.getQuote({ symbol })));
      } else {
        send(res, 404, { error: 'not_found' });
      }
    } catch (e) {
      const err = e instanceof MarketDataError ? e : new MarketDataError('upstream', 'Market data failed.', 502);
      if (!(e instanceof MarketDataError)) console.error(e);
      send(res, err.status || 502, { error: err.code, message: err.message });
    }
    return true;
  };
}
