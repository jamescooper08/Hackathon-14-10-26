// Run: node --test market-data/test
import test from 'node:test';
import assert from 'node:assert/strict';
import { cleanBars, marketStatusFrom } from '../server/normalize.mjs';
import { parseCandles, parseQuote } from '../server/yahoo-provider.mjs';
import { createMarketStore } from '../client/store.mjs';

test('cleanBars drops malformed, sorts, de-duplicates', () => {
  const out = cleanBars([
    { time: 2, open: 10, high: 12, low: 9, close: 11, volume: 1 },
    { time: 1, open: 10, high: 12, low: 9, close: 11, volume: 1 },
    { time: 1, open: 10, high: 12, low: 9, close: 11, volume: 1 },
    { time: 3, open: 10, high: 8, low: 9, close: 11, volume: 1 },     // high < low
    { time: 4, open: NaN, high: 12, low: 9, close: 11, volume: 1 },
  ]);
  assert.deepEqual(out.map(b => b.time), [1, 2]);
});

test('marketStatusFrom', () => {
  const p = { pre: { start: 0, end: 10 }, regular: { start: 10, end: 20 }, post: { start: 20, end: 30 } };
  assert.equal(marketStatusFrom(5, p), 'pre');
  assert.equal(marketStatusFrom(15, p), 'open');
  assert.equal(marketStatusFrom(25, p), 'post');
  assert.equal(marketStatusFrom(40, p), 'closed');
  assert.equal(marketStatusFrom(5, undefined), 'unknown');
});

const yahooResult = {
  meta: { currency: 'USD', exchangeTimezoneName: 'America/New_York', fullExchangeName: 'NasdaqGS', longName: 'NVIDIA Corporation',
    regularMarketPrice: 110, chartPreviousClose: 100, regularMarketTime: 1000,
    currentTradingPeriod: { regular: { start: 900, end: 2000 } } },
  timestamp: [1, 2, 3],
  indicators: { quote: [{ open: [1, null, 3], high: [2, null, 4], low: [0.5, null, 2], close: [1.5, null, 3.5], volume: [10, null, 30] }] },
};

test('parseCandles skips null rows (market holidays / gaps)', () => {
  const c = parseCandles(yahooResult, 'NVDA', '1D');
  assert.equal(c.bars.length, 2);
  assert.equal(c.source.realtime, false);
});

test('parseQuote computes change and status', () => {
  const q = parseQuote(yahooResult, 'NVDA', 1500);
  assert.equal(q.change, 10);
  assert.equal(q.changePercent, 10);
  assert.equal(q.marketStatus, 'open');
  assert.equal(q.name, 'NVIDIA Corporation');
});

test('store: loads, keeps stale data on failed refresh, ignores unsupported interval', async () => {
  let fail = false;
  const series = interval => ({ symbol: 'NVDA', interval, bars: [], source: { note: '' } });
  const provider = {
    supportedIntervals: ['1D', '5m'],
    getCandles: async ({ interval }) => { if (fail) throw Object.assign(new Error('boom'), { code: 'upstream' }); return series(interval); },
    getQuote: async () => ({ price: 1 }),
  };
  const store = createMarketStore({ provider });
  await store.refresh();
  assert.equal(store.getState().status, 'ready');
  fail = true;
  await store.refresh();
  assert.equal(store.getState().status, 'ready');
  assert.equal(store.getState().stale, true);
  store.setInterval('1m'); // not supported by this provider
  assert.equal(store.getState().interval, '1D');
  store.stop();
});

test('parseCandles drops the zero-volume intraday placeholder bar but keeps daily bars', () => {
  const r = { meta: {}, timestamp: [60, 120, 150],
    indicators: { quote: [{ open: [1, 2, 3], high: [2, 3, 3], low: [1, 2, 3], close: [2, 3, 3], volume: [10, 20, 0] }] } };
  assert.equal(parseCandles(r, 'NVDA', '1m').bars.length, 2);
  assert.equal(parseCandles(r, 'NVDA', '1D').bars.length, 3);
});
