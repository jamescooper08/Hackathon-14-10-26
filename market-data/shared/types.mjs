// The provider contract. Documentation only (JSDoc typedefs); nothing here runs.
//
// A MarketDataProvider is anything with this shape. The Yahoo and Twelve Data providers
// live on the server, and the browser uses an HTTP provider that talks to them through
// /api/market/*. Swapping data vendors never touches UI code.

/**
 * @typedef {Object} Bar
 * @property {number} time    Candle open time, UTC seconds since epoch.
 * @property {number} open
 * @property {number} high
 * @property {number} low
 * @property {number} close
 * @property {number|null} volume
 */

/**
 * @typedef {Object} SourceInfo
 * @property {string}  id         e.g. 'yahoo', 'twelvedata'
 * @property {string}  name       Human-readable provider name.
 * @property {boolean} realtime   True ONLY if the provider guarantees real-time prices. Today always false.
 * @property {number|null} delayMinutes  Known delay in minutes, or null when the provider does not say.
 * @property {string}  note       One sentence for UI: "Delayed, unofficial data (Yahoo Finance)."
 */

/**
 * @typedef {Object} CandleSeries
 * @property {string} symbol
 * @property {string} interval   One of INTERVAL_IDS.
 * @property {string} currency
 * @property {string} timezone   IANA exchange timezone, e.g. 'America/New_York'.
 * @property {Bar[]}  bars       Ascending by time, validated (high >= open/close/low >= low).
 * @property {SourceInfo} source
 * @property {number} fetchedAt  ms epoch when the server fetched it.
 */

/**
 * @typedef {'open'|'pre'|'post'|'closed'|'unknown'} MarketStatus
 */

/**
 * @typedef {Object} Quote
 * @property {string} symbol
 * @property {string} name
 * @property {string} exchange
 * @property {string} currency
 * @property {number} price                Latest price the provider returned.
 * @property {number|null} previousClose
 * @property {number|null} change          price - previousClose
 * @property {number|null} changePercent   Percent, e.g. -2.75 for -2.75%.
 * @property {number|null} dayHigh
 * @property {number|null} dayLow
 * @property {number|null} volume
 * @property {number} asOf                 Timestamp of `price` in UTC seconds. Compare to Date.now() to show staleness.
 * @property {MarketStatus} marketStatus
 * @property {SourceInfo} source
 * @property {number} fetchedAt            ms epoch.
 */

/**
 * @typedef {Object} MarketDataProvider
 * @property {string} id
 * @property {string[]} supportedIntervals  Subset of INTERVAL_IDS.
 * @property {(args:{symbol:string, interval:string}) => Promise<CandleSeries>} getCandles
 * @property {(args:{symbol:string}) => Promise<Quote>} getQuote
 */

/**
 * Errors thrown by providers carry a machine-readable `code`:
 * 'bad_request' | 'unsupported_interval' | 'no_data' | 'rate_limited' | 'unauthorized' | 'upstream' | 'timeout'
 * @typedef {Error & {code:string, status?:number}} MarketDataError
 */

export class MarketDataError extends Error {
  constructor(code, message, status) {
    super(message);
    this.name = 'MarketDataError';
    this.code = code;
    this.status = status;
  }
}
