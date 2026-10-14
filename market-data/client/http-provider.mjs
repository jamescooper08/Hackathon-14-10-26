// Browser-side MarketDataProvider that talks to the routes in server/routes.mjs.
// Replace this with any object of the same shape to change vendors without touching UI code.

export function createHttpProvider({ baseUrl = '/api/market' } = {}) {
  async function get(path, params) {
    const url = `${baseUrl}/${path}?${new URLSearchParams(params)}`;
    let res;
    try {
      res = await fetch(url, { headers: { Accept: 'application/json' } });
    } catch {
      throw Object.assign(new Error('Could not reach the market data server.'), { code: 'network' });
    }
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw Object.assign(new Error(body.message || `Market data error (HTTP ${res.status}).`), { code: body.error || 'upstream' });
    return body;
  }
  return {
    id: 'http',
    supportedIntervals: null, // filled by store from /meta
    getCandles: ({ symbol, interval }) => get('candles', { symbol, interval }),
    getQuote: ({ symbol }) => get('quote', { symbol }),
    getMeta: () => get('meta', {}),
  };
}
