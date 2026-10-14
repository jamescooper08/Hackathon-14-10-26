import { useEffect, useState, type ReactNode } from "react";

/** Shared quote contract: populate from the chart team's existing data source. */
export type NvdaQuote = {
	companyName: string;
	ticker: string;
	price: number | null;
	currency: string;
	marketStatus: "open" | "closed" | "pre-market" | "after-hours" | "unknown";
	dailyChange?: number | null;
	dailyChangePercent?: number | null;
	isDelayed?: boolean;
	asOf?: string;
};

export type ChartInterval = { id: string; label: string };

type StockOverviewProps = {
	quote: NvdaQuote;
	intervals: ChartInterval[];
	renderChart: (intervalId: string) => ReactNode;
};

const statusLabels: Record<NvdaQuote["marketStatus"], string> = {
	open: "Market open",
	closed: "Market closed",
	"pre-market": "Pre-market",
	"after-hours": "After-hours",
	unknown: "Market status unavailable",
};

export default function StockOverview({ quote, intervals, renderChart }: StockOverviewProps) {
	const defaultInterval = intervals.find(({ id }) => id === "1d")?.id ?? intervals[0]?.id ?? "1d";
	const [selectedInterval, setSelectedInterval] = useState(defaultInterval);

	useEffect(() => {
		if (!intervals.some(({ id }) => id === selectedInterval)) setSelectedInterval(defaultInterval);
	}, [intervals, selectedInterval, defaultInterval]);

	const price = quote.price === null
		? "—"
		: new Intl.NumberFormat(undefined, {
				style: "currency",
				currency: quote.currency,
				maximumFractionDigits: 2,
			}).format(quote.price);
	const hasChange = quote.dailyChange != null || quote.dailyChangePercent != null;
	const changeIsNegative = (quote.dailyChange ?? quote.dailyChangePercent ?? 0) < 0;
	const changeText = [
		quote.dailyChange == null
			? null
			: new Intl.NumberFormat(undefined, {
					style: "currency",
					currency: quote.currency,
					signDisplay: "always",
					maximumFractionDigits: 2,
				}).format(quote.dailyChange),
		quote.dailyChangePercent == null
			? null
			: `${quote.dailyChangePercent > 0 ? "+" : ""}${quote.dailyChangePercent.toFixed(2)}%`,
	].filter(Boolean).join(" (") + (quote.dailyChange != null && quote.dailyChangePercent != null ? ")" : "");

	return (
		<section className="nvda-overview" aria-label={`${quote.companyName} stock overview`}>
			<style>{`
				.nvda-overview{box-sizing:border-box;background:#071a33;color:#f4f8ff;padding:clamp(20px,4vw,36px);border-radius:18px;font-family:inherit}
				.nvda-overview *{box-sizing:border-box}.nvda-heading{display:flex;justify-content:space-between;align-items:flex-start;gap:20px}
				.nvda-name{margin:0;font-size:clamp(22px,3vw,30px);letter-spacing:-.025em}.nvda-ticker{margin:6px 0 0;color:#a9bdd8;font-size:14px}
				.nvda-status{display:inline-flex;align-items:center;gap:8px;border:1px solid #294362;border-radius:999px;padding:8px 12px;color:#d7e5f8;font-size:13px;white-space:nowrap}
				.nvda-dot{width:8px;height:8px;border-radius:50%;background:#58c99a}.nvda-dot.closed{background:#8da2bd}
				.nvda-price-row{display:flex;align-items:baseline;flex-wrap:wrap;gap:12px;margin-top:28px}.nvda-price{font-size:clamp(32px,6vw,44px);font-weight:700;letter-spacing:-.04em}
				.nvda-change{font-size:15px;font-weight:600}.nvda-change.up{color:#64d6a2}.nvda-change.down{color:#ff8b91}.nvda-muted{color:#9bb0ca;font-size:13px;margin:8px 0 0}
				.nvda-chart-head{display:flex;align-items:center;justify-content:space-between;gap:14px;margin-top:30px}.nvda-intervals{display:flex;gap:6px;overflow-x:auto;padding:3px;max-width:100%}
				.nvda-interval{border:0;background:transparent;color:#afc2dc;padding:8px 11px;border-radius:8px;font:inherit;font-size:13px;cursor:pointer;white-space:nowrap}
				.nvda-interval:hover{background:#122b49;color:#fff}.nvda-interval[aria-pressed="true"]{background:#173b64;color:#fff}
				.nvda-chart{margin-top:14px;min-height:240px}.nvda-empty{display:grid;place-items:center;min-height:240px;border:1px dashed #294362;border-radius:12px;color:#9bb0ca}
				@media(max-width:560px){.nvda-heading{flex-direction:column;gap:14px}.nvda-chart-head{align-items:flex-start;flex-direction:column}.nvda-price-row{margin-top:22px}.nvda-chart{min-height:200px}}
			`}</style>

			<header className="nvda-heading">
				<div>
					<h1 className="nvda-name">{quote.companyName}</h1>
					<p className="nvda-ticker">NASDAQ: {quote.ticker}</p>
				</div>
				<div className="nvda-status" aria-label={statusLabels[quote.marketStatus]}>
					<span className={`nvda-dot${quote.marketStatus === "closed" ? " closed" : ""}`} />
					{statusLabels[quote.marketStatus]}
				</div>
			</header>

			<div className="nvda-price-row">
				<div className="nvda-price" aria-label={quote.price === null ? "Price unavailable" : `Latest price ${price}`}>
					{price}
				</div>
				{hasChange && (
					<div className={`nvda-change ${changeIsNegative ? "down" : "up"}`}>
						{changeText}
						<span className="nvda-muted"> today</span>
					</div>
				)}
			</div>
			<p className="nvda-muted">
				{quote.isDelayed ? "Delayed price" : "Latest available price"}
				{quote.asOf ? ` · As of ${quote.asOf}` : ""}
			</p>

			<div className="nvda-chart-head">
				<strong>Price chart</strong>
				<nav className="nvda-intervals" aria-label="Chart interval">
					{intervals.map(({ id, label }) => (
						<button
							className="nvda-interval"
							key={id}
							type="button"
							aria-pressed={selectedInterval === id}
							onClick={() => setSelectedInterval(id)}
						>
							{label}
						</button>
					))}
				</nav>
			</div>
			<div className="nvda-chart">
				{intervals.length ? renderChart(selectedInterval) : <div className="nvda-empty">Chart intervals unavailable</div>}
			</div>
		</section>
	);
}

// Integration note: requires the shared quote fields above, supported interval
// IDs/labels (include { id: "1d", label: "1D" } for the default), and the chart
// owner's renderChart(intervalId) adapter. No independent market-data request is made.
