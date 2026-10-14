# NVDA chart & market data (Prompt 1)

Owner of everything under `market-data/`. No file outside this folder was created or edited.

## Run it

```
node market-data/demo/serve.mjs          # http://localhost:3000/market-data/demo/
node --test market-data/test/market-data.test.mjs
```

Needs Node 20+ and no `npm install` (the chart library, TradingView Lightweight Charts 4.2.0, loads from unpkg). Optional env: `PORT`, `MARKET_DATA_PROVIDER=yahoo|twelvedata`, `TWELVE_DATA_API_KEY`.

## Data source note

| | |
|---|---|
| **Requested source** | NYSE NVDA quote page. **Not usable.** The README names it but gives no URL. NVDA is listed on Nasdaq, not NYSE, and `nyse.com/quote/XNAS:NVDA` returns only a JavaScript shell with no quote, chart data, or API. NYSE market data is a licensed product. Scraping it is not viable. |
| **Source in use** | Yahoo Finance's public chart endpoint (`query1.finance.yahoo.com/v8/finance/chart`), called server-side. **Unofficial**: no SLA, no published API terms, can change or block without notice, not licensed for redistribution. OK for a demo; not for production. |
| **Licensed fallback** | `server/twelvedata-provider.mjs`: documented API, needs a key (`MARKET_DATA_PROVIDER=twelvedata`). Free plans are rate-limited and may exclude real-time US or intraday data; check the plan. **Untested here: no key was available.** |
| **Real-time?** | **No.** Every response carries `source.realtime = false` and a note shown under the chart. Yahoo does not state its delay (`delayMinutes: null`), so the UI says "delayed", not a number. |

**Needs team agreement:** the NYSE page can't be used, so Yahoo is the working default. If the team wants a licensed source, switch to Twelve Data or another vendor behind the same interface.

## Intervals

`1m, 5m, 15m, 1h, 1D (default), 1W`. History per interval is set in `shared/intervals.mjs`: 5 days of 1m, 1 month of 5m and 15m, 3 months of 1h, 1 year of daily, 5 years of weekly. Intervals are Yahoo-limited (1m about 7 days). Pre- and post-market candles are excluded. The most recent candle is in progress and changes until it closes. The zero-volume placeholder candle Yahoo appends to intraday series is dropped.

## Refresh behavior

The store polls: 60s for 1m/5m/15m, 120s for 1h, 5 min for daily, 10 min for weekly. The server also caches each request for 15s. That is polling of delayed data, **not streaming**. If a refresh fails, the chart keeps the last good data and sets `stale: true`.

## The shared interface (what other sections use)

One `MarketStore` per page. Others **read from it and never fetch prices themselves**.

```js
import { createMarketStore } from './market-data/client/store.mjs';
import { createHttpProvider } from './market-data/client/http-provider.mjs';
import { mountCandleChart } from './market-data/chart/nvda-chart.mjs';

const store = createMarketStore({ provider: createHttpProvider(), symbol: 'NVDA' });
mountCandleChart(document.getElementById('chart'), store);   // + <link rel="stylesheet" href="market-data/chart/chart.css">
const off = store.subscribe(state => { /* header, controls, bubble */ });
store.setInterval('15m');   // interval buttons call this
store.start();              // begin polling; store.stop() to end
```

**State** (`store.getState()`):

| Field | Meaning |
|---|---|
| `symbol`, `interval` | Current selection. Interval is one of `1m 5m 15m 1h 1D 1W`. |
| `supportedIntervals` | Interval buttons should render exactly this list. |
| `quote` | `{ price, change, changePercent, previousClose, dayHigh, dayLow, volume, name, exchange, currency, asOf, marketStatus, source }` or `null`. `marketStatus` is `open\|pre\|post\|closed\|unknown`. `asOf` is UTC seconds of the price, so compare it to now to show staleness. |
| `candles` | `{ bars:[{time,open,high,low,close,volume}], currency, timezone, source, fetchedAt }` or `null`. `time` is UTC seconds. |
| `status` | `idle\|loading\|ready\|error`. |
| `error`, `stale`, `lastUpdated` | Failure info. `stale` is true while old data is shown after a failed refresh. |

**Server routes** (mount `createMarketRoutes()` from `server/routes.mjs` in whatever server the team uses; `if (await market(req, res)) return;`):
`GET /api/market/candles?symbol=NVDA&interval=1D`, `/api/market/quote?symbol=NVDA`, `/api/market/meta`. Errors are `{error, message}` with codes `bad_request, unsupported_interval, no_data, rate_limited, unauthorized, upstream, timeout`.

**Swapping vendors:** implement `{ id, supportedIntervals, getCandles, getQuote }` (typedefs in `shared/types.mjs`) and return it from `pickProvider()`. No UI code changes.

**Theming:** the chart reads `--mc-bg, --mc-text, --mc-muted, --mc-grid, --mc-up, --mc-down, --mc-accent` from any ancestor, with navy defaults. Integration owner: set these to match the site theme.

## Files

```
shared/intervals.mjs, types.mjs      interval table, provider contract
server/yahoo-provider.mjs            default source (unofficial)
server/twelvedata-provider.mjs       licensed, keyed fallback
server/routes.mjs, normalize.mjs     HTTP routes + 15s cache; validation helpers
client/http-provider.mjs, store.mjs  browser provider + shared store
chart/nvda-chart.mjs, chart.css      candlestick + volume component
demo/                                standalone page and dev server (not the real app page)
test/market-data.test.mjs            unit tests (node:test)
```

## Limitations

- Yahoo is unofficial and may break, rate-limit or block (the server returns `rate_limited` / `upstream`). It is not licensed for production use. Prices are delayed and unverified, so nothing here is for trading decisions.
- NVDA only has been tested. The code accepts other US-style tickers.
- Candles are not adjusted for splits or dividends beyond what Yahoo returns.
- Weekly candles: the in-progress week's candle is stamped with the latest trade time, not Monday.
- Market status for Yahoo is derived from Yahoo's trading-period windows and does not know about early closes or holidays beyond what Yahoo reports.
- No charting-library fallback if unpkg is unreachable; the chart shows an error message.
- Mobile layout uses responsive CSS and `autoSize`, but I did not verify it on a real narrow viewport. The browser tool's resize did not produce a true phone-width screenshot.
- Coordination: no other contributors or framework exist in the repo yet (it holds only the README), so nothing could be agreed. I chose a framework-free, no-build-step layout and one owned folder so it fits any framework. The team should confirm that and the interface above.
