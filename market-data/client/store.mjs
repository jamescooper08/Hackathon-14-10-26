// MarketStore: the single shared source of market state for the page.
// Chart, header/summary, interval controls and the context bubble all read from ONE store
// instance and never fetch prices themselves.
//
//   const store = createMarketStore({ provider: createHttpProvider(), symbol: 'NVDA' });
//   const off = store.subscribe(state => render(state));   // called immediately and on every change
//   store.setInterval('15m');                              // controls call this
//   store.start(); ... store.stop();                       // begins / ends polling
//
// State shape (all fields always present):
//   symbol, interval, supportedIntervals: string[],
//   candles: CandleSeries|null, quote: Quote|null,
//   status: 'idle'|'loading'|'ready'|'error',  // 'ready' keeps old data while a refresh is in flight
//   error: {code,message}|null,                // set with status 'error', or alongside stale data
//   stale: boolean,                            // true when last refresh failed but old data is shown
//   lastUpdated: number|null                   // ms epoch of the last successful candle fetch

import { DEFAULT_INTERVAL, INTERVALS, INTERVAL_IDS, isInterval } from '../shared/intervals.mjs';

export function createMarketStore({ provider, symbol = 'NVDA', interval = DEFAULT_INTERVAL } = {}) {
  let state = {
    symbol, interval,
    supportedIntervals: provider.supportedIntervals ?? INTERVAL_IDS,
    candles: null, quote: null,
    status: 'idle', error: null, stale: false, lastUpdated: null,
  };
  const listeners = new Set();
  let timer = null;
  let requestId = 0; // guards against out-of-order responses when the interval changes quickly

  const set = patch => {
    state = { ...state, ...patch };
    for (const fn of listeners) fn(state);
  };

  async function refresh() {
    const id = ++requestId;
    const { symbol: sym, interval: itv } = state;
    set({ status: state.candles && state.candles.interval === itv ? 'ready' : 'loading' });
    const [candles, quote] = await Promise.allSettled([
      provider.getCandles({ symbol: sym, interval: itv }),
      provider.getQuote({ symbol: sym }),
    ]);
    if (id !== requestId) return; // superseded
    if (candles.status === 'rejected') {
      const hasOld = state.candles && state.candles.interval === itv;
      set({
        status: hasOld ? 'ready' : 'error', stale: !!hasOld,
        error: { code: candles.reason.code || 'upstream', message: candles.reason.message },
        quote: quote.status === 'fulfilled' ? quote.value : state.quote,
      });
      return;
    }
    set({
      status: 'ready', stale: false, error: null,
      candles: candles.value,
      quote: quote.status === 'fulfilled' ? quote.value : state.quote, // chart still works if quote alone fails
      lastUpdated: Date.now(),
    });
  }

  function schedule() {
    clearTimeout(timer);
    timer = setTimeout(async () => { await refresh(); if (timer !== null) schedule(); }, INTERVALS[state.interval].refreshMs);
  }

  return {
    getState: () => state,
    subscribe(fn) { listeners.add(fn); fn(state); return () => listeners.delete(fn); },
    setInterval(next) {
      if (!isInterval(next) || !state.supportedIntervals.includes(next) || next === state.interval) return;
      set({ interval: next, error: null, stale: false });
      refresh();
      if (timer !== null) schedule();
    },
    refresh,
    async start() {
      if (provider.getMeta && !provider.supportedIntervals) {
        try { set({ supportedIntervals: (await provider.getMeta()).supportedIntervals }); } catch { /* keep defaults */ }
      }
      await refresh();
      schedule();
    },
    stop() { clearTimeout(timer); timer = null; requestId++; },
  };
}
