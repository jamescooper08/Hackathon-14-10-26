// Candlestick chart component. Renders whatever the MarketStore holds; it does not fetch.
//
//   import { mountCandleChart } from './market-data/chart/nvda-chart.mjs';
//   const chart = mountCandleChart(document.getElementById('chart'), store);
//   // later: chart.destroy();
//
// Styling hooks (set on any ancestor to match the site theme; navy defaults are built in):
//   --mc-bg, --mc-surface, --mc-text, --mc-muted, --mc-grid, --mc-up, --mc-down, --mc-accent
// The component only reads these variables; it never edits global styles.

import { INTERVALS } from '../shared/intervals.mjs';

const LIB_URL = 'https://unpkg.com/lightweight-charts@4.2.0/dist/lightweight-charts.standalone.production.mjs';

const css = (el, name, fallback) => getComputedStyle(el).getPropertyValue(name).trim() || fallback;

function palette(el) {
  return {
    bg: css(el, '--mc-bg', '#0b1730'),
    text: css(el, '--mc-muted', '#9fb2d3'),
    grid: css(el, '--mc-grid', '#1b2c52'),
    up: css(el, '--mc-up', '#2ebd85'),
    down: css(el, '--mc-down', '#f6465d'),
    accent: css(el, '--mc-accent', '#5b8def'),
  };
}

const fmtPrice = new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtVol = new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 2 });

export function mountCandleChart(container, store, { lib } = {}) {
  container.classList.add('mc-chart');
  container.innerHTML = `
    <div class="mc-chart__meta" aria-live="polite">
      <span class="mc-chart__badge" data-role="interval"></span>
      <span class="mc-chart__hover" data-role="hover" aria-hidden="true"></span>
    </div>
    <div class="mc-chart__plot" data-role="plot" role="img" aria-label="NVDA candlestick chart"></div>
    <div class="mc-chart__overlay" data-role="overlay" role="status"></div>
    <p class="mc-chart__source" data-role="source"></p>`;
  const $ = role => container.querySelector(`[data-role="${role}"]`);
  const plot = $('plot'), overlay = $('overlay'), badge = $('interval'), hover = $('hover'), source = $('source');

  let chart = null, candles = null, volume = null, tz = 'America/New_York', shownKey = null, destroyed = false;
  let lastState = store.getState();

  const timeFmt = (sec, withTime) => new Date(sec * 1000).toLocaleString('en-US', {
    timeZone: tz, month: 'short', day: 'numeric', ...(withTime ? { hour: 'numeric', minute: '2-digit' } : { year: 'numeric' }),
  });

  async function init() {
    const L = lib ?? await import(LIB_URL);
    if (destroyed) return;
    const p = palette(container);
    chart = L.createChart(plot, {
      autoSize: true, // follows container size, so it is responsive on resize / rotate
      layout: { background: { type: 'solid', color: p.bg }, textColor: p.text, fontFamily: 'inherit', fontSize: 12 },
      grid: { vertLines: { color: p.grid }, horzLines: { color: p.grid } },
      rightPriceScale: { borderColor: p.grid, scaleMargins: { top: 0.08, bottom: 0.25 } },
      timeScale: {
        borderColor: p.grid, rightOffset: 4, timeVisible: true, secondsVisible: false,
        tickMarkFormatter: t => {
          const intraday = INTERVALS[lastState.interval]?.intraday;
          return new Date(t * 1000).toLocaleString('en-US', intraday
            ? { timeZone: tz, hour: 'numeric', minute: '2-digit' }
            : { timeZone: tz, month: 'short', day: 'numeric' });
        },
      },
      localization: { timeFormatter: t => timeFmt(t, INTERVALS[lastState.interval]?.intraday) },
      crosshair: { mode: 0 },
      handleScale: { axisPressedMouseMove: true },
    });
    candles = chart.addCandlestickSeries({
      upColor: p.up, downColor: p.down, borderUpColor: p.up, borderDownColor: p.down, wickUpColor: p.up, wickDownColor: p.down,
    });
    volume = chart.addHistogramSeries({ priceFormat: { type: 'volume' }, priceScaleId: 'vol', lastValueVisible: false, priceLineVisible: false });
    chart.priceScale('vol').applyOptions({ scaleMargins: { top: 0.8, bottom: 0 } });

    chart.subscribeCrosshairMove(param => {
      const bar = param.seriesData?.get(candles);
      if (!bar || !param.time) { hover.textContent = ''; return; }
      const v = param.seriesData.get(volume);
      hover.textContent = `${timeFmt(param.time, INTERVALS[lastState.interval]?.intraday)}  O ${fmtPrice.format(bar.open)}  H ${fmtPrice.format(bar.high)}  L ${fmtPrice.format(bar.low)}  C ${fmtPrice.format(bar.close)}` +
        (v ? `  Vol ${fmtVol.format(v.value)}` : '');
    });
    render(lastState);
  }

  function render(state) {
    lastState = state;
    badge.textContent = `${INTERVALS[state.interval]?.label ?? state.interval} candles`;
    const c = state.candles;
    source.textContent = c ? `${c.source.note}${state.stale ? ' Showing the last successful update; the latest refresh failed.' : ''}` : '';

    if (state.status === 'error' && !c) { overlay.hidden = false; overlay.dataset.kind = 'error'; overlay.textContent = `Chart data unavailable: ${state.error?.message ?? 'unknown error'}`; return; }
    if (!c || c.interval !== state.interval) { overlay.hidden = false; overlay.dataset.kind = 'loading'; overlay.textContent = 'Loading chart…'; return; }
    overlay.hidden = true;
    if (!chart) return; // init() will call render again

    tz = c.timezone;
    const key = `${c.symbol}:${c.interval}`;
    const p = palette(container);
    candles.setData(c.bars.map(({ time, open, high, low, close }) => ({ time, open, high, low, close })));
    volume.setData(c.bars.filter(b => b.volume != null).map(b => ({
      time: b.time, value: b.volume, color: (b.close >= b.open ? p.up : p.down) + '66',
    })));
    if (key !== shownKey) { // new symbol/interval: frame the most recent candles; keep user's zoom across refreshes
      shownKey = key;
      const visible = INTERVALS[c.interval].intraday ? 120 : c.interval === '1W' ? 120 : 90;
      const from = Math.max(0, c.bars.length - visible);
      chart.timeScale().setVisibleLogicalRange({ from, to: c.bars.length + 4 });
    }
  }

  const unsubscribe = store.subscribe(render);
  init().catch(err => {
    overlay.hidden = false; overlay.dataset.kind = 'error';
    overlay.textContent = `Could not load the charting library: ${err.message}`;
  });

  return {
    destroy() { destroyed = true; unsubscribe(); chart?.remove(); container.innerHTML = ''; container.classList.remove('mc-chart'); },
  };
}
