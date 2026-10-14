# CandleView

A stock candlestick tracker with company/ticker search, 1m / 5m / 15m / 1h / 1D / 1W intervals, and volume bars. Node.js serves the frontend and proxies requests to Twelve Data so the API key never appears in browser code.

## Run locally

1. Install Node.js 20 or newer.
2. Create a Twelve Data account and get an API key.
3. Put `server.js` and `index.html` in the same directory.
4. In that directory run:

```bash
# macOS / Linux
TWELVE_DATA_API_KEY=your_api_key node server.js
```

```powershell
# Windows PowerShell
$env:TWELVE_DATA_API_KEY='your_api_key'
node server.js
```

5. Visit `http://localhost:3000`.

No npm install is needed. The chart library loads from a CDN, so the browser needs internet access. Avoid committing or publishing your API key.

## Notes

- This app displays historical or most recently available OHLCV bars; it does **not** stream tick-by-tick prices. Re-select a timeframe or click **Show chart** to refresh. Twelve Data may delay data and limit supported intervals, symbols, or request counts depending on your subscription.
- Volume is hidden for bars without volume data.
- Intraday candles are requested in UTC; daily and weekly candle dates are exchange-local trading dates. Daily and weekly prices use the provider's default split adjustment.
- The in-memory server cache lasts 60 seconds for intraday and 5 minutes for daily/weekly candles. Restarting clears it.
- `1m`, `5m`, `15m`, `1h`, `1D`, and `1W` represent candle durations, not total chart ranges. The chart requests up to 160 recent candles per selection.

Data source and interval reference: https://twelvedata.com/docs
