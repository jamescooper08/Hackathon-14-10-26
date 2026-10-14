// Node.js 20+; run with TWELVE_DATA_API_KEY=... node server.js
const http = require('node:http');
const fs = require('node:fs/promises');
const path = require('node:path');

const PORT = Number(process.env.PORT || 3000);
const API_KEY = process.env.TWELVE_DATA_API_KEY;
const NEWS_API_KEY = process.env.NEWS_API_KEY || '';
const INTERVALS = { '1m': '1min', '5m': '5min', '15m': '15min', '1h': '1h', '1D': '1day', '1W': '1week' };
const cache = new Map();

function contextEnvelope(symbol, status, source, items, message) {
  return {
    symbol: (symbol || '').trim().toUpperCase(),
    status,
    source,
    updatedAt: new Date().toISOString(),
    items,
    message: message || ''
  };
}

function json(res, status, data) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(data));
}

async function twelveData(endpoint, params, ttl) {
  const url = new URL(`https://api.twelvedata.com/${endpoint}`);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  const cacheKey = url.toString();
  const cached = cache.get(cacheKey);
  if (cached && cached.expires > Date.now()) return cached.data;
  const response = await fetch(url, {
    headers: { Authorization: `apikey ${API_KEY}` },
    signal: AbortSignal.timeout(10000)
  });
  const data = await response.json();
  if (!response.ok || data.status === 'error') {
    const error = new Error(data.message || `Data provider returned HTTP ${response.status}`);
    error.status = data.code === 429 || response.status === 429 ? 429 : 502;
    throw error;
  }
  cache.set(cacheKey, { data, expires: Date.now() + ttl });
  return data;
}

const server = http.createServer(async (req, res) => {
  try {
    if (req.method !== 'GET') return json(res, 405, { error: 'Method not allowed' });
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    if (url.pathname === '/') {
      const html = await fs.readFile(path.join(__dirname, 'index.html'));
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
      return res.end(html);
    }
    if (!url.pathname.startsWith('/api/')) return json(res, 404, { error: 'Not found' });
    if (url.pathname === '/api/context') {
      const symbol = (url.searchParams.get('symbol') || '').trim().toUpperCase();
      if (!symbol) return json(res, 400, { error: 'A ticker symbol is required for market context.' });
      if (!NEWS_API_KEY) {
        return json(res, 200, contextEnvelope(symbol, 'unavailable', 'Not configured', [], 'Live market context is unavailable because no trusted news source is configured in this build.'));
      }
      return json(res, 200, contextEnvelope(symbol, 'unavailable', 'Provider unavailable', [], 'A live news source is configured but not yet wired into this project.'));
    }
    if (!API_KEY) return json(res, 500, { error: 'Set TWELVE_DATA_API_KEY before starting the server.' });
    if (url.pathname === '/api/search') {
      const q = (url.searchParams.get('q') || '').trim();
      if (q.length < 1 || q.length > 60) return json(res, 400, { error: 'Enter a company name or ticker (up to 60 characters).' });
      const data = await twelveData('symbol_search', { symbol: q, outputsize: '15' }, 600000);
      return json(res, 200, { results: (data.data || [])
        .filter(item => item.instrument_type === 'Common Stock' && /^[A-Z0-9][A-Z0-9.:-]{0,19}$/i.test(item.symbol))
        .slice(0, 10).map(item => ({ symbol: item.symbol, name: item.instrument_name, exchange: item.exchange })) });
    }
    if (url.pathname === '/api/candles') {
      const symbol = (url.searchParams.get('symbol') || '').trim().toUpperCase();
      const interval = url.searchParams.get('interval') || '1D';
      if (!/^[A-Z0-9][A-Z0-9.:-]{0,19}$/.test(symbol)) return json(res, 400, { error: 'Invalid ticker symbol.' });
      if (!Object.hasOwn(INTERVALS, interval)) return json(res, 400, { error: 'Unsupported interval.' });
      const data = await twelveData('time_series', {
        symbol, interval: INTERVALS[interval], outputsize: '160',
        order: 'asc', ...(interval.endsWith('m') || interval === '1h' ? { timezone: 'UTC' } : {})
      }, interval === '1D' || interval === '1W' ? 300000 : 60000);
      const bars = (data.values || []).map(value => ({
        time: interval === '1D' || interval === '1W'
          ? value.datetime.slice(0, 10)
          : Math.floor(Date.parse(value.datetime.replace(' ', 'T') + 'Z') / 1000),
        open: Number(value.open), high: Number(value.high),
        low: Number(value.low), close: Number(value.close),
        volume: value.volume == null ? null : Number(value.volume)
      })).filter(bar => bar.time && [bar.open, bar.high, bar.low, bar.close].every(Number.isFinite)
        && bar.high >= Math.max(bar.open, bar.close, bar.low)
        && bar.low <= Math.min(bar.open, bar.close, bar.high));
      if (!bars.length) return json(res, 502, { error: 'No candle data was returned for this stock and interval.' });
      return json(res, 200, {
        symbol: data.meta?.symbol || symbol,
        currency: data.meta?.currency || '',
        exchange: data.meta?.exchange || '',
        timezone: interval === '1D' || interval === '1W' ? data.meta?.exchange_timezone || 'Exchange' : 'UTC',
        bars
      });
    }
    return json(res, 404, { error: 'Not found' });
  } catch (error) {
    console.error(error);
    json(res, error.status || 502, { error: error.name === 'TimeoutError' ? 'Market data request timed out.' : error.message });
  }
});
server.listen(PORT, () => console.log(`CandleView running at http://localhost:${PORT}`));
