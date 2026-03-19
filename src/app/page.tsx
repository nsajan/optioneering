"use client";

import { useState, useCallback } from "react";

interface Bar {
  v: number;
  vw: number;
  o: number;
  c: number;
  h: number;
  l: number;
  t: number;
  n: number;
}

interface TickerDetails {
  ticker: string;
  name: string;
  market_cap?: number;
  description?: string;
  sic_description?: string;
  homepage_url?: string;
  branding?: { logo_url?: string; icon_url?: string };
}

interface StockData {
  details: TickerDetails;
  previousDay: Bar | null;
  bars: Bar[];
}

interface OptionContract {
  ticker: string;
  contract_type: "call" | "put";
  strike_price: number;
  expiration_date: string;
}

const POPULAR = ["AAPL", "TSLA", "NVDA", "AMZN", "MSFT", "GOOGL", "META", "SPY"];
const RANGES = ["1w", "1m", "3m", "6m", "1y"] as const;

export default function Home() {
  const [symbol, setSymbol] = useState("");
  const [stockData, setStockData] = useState<StockData | null>(null);
  const [options, setOptions] = useState<OptionContract[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [range, setRange] = useState<string>("3m");
  const [activeTab, setActiveTab] = useState<"chart" | "options">("chart");
  const [hoveredBar, setHoveredBar] = useState<Bar | null>(null);

  const fetchStock = useCallback(
    async (ticker?: string) => {
      const t = (ticker || symbol).trim().toUpperCase();
      if (!t) return;
      setSymbol(t);
      setLoading(true);
      setError("");
      setOptions([]);
      setActiveTab("chart");
      setHoveredBar(null);

      try {
        const res = await fetch(`/api/stocks/${t}?range=${range}`);
        const data = await res.json();
        if (data.error) throw new Error(data.error);
        setStockData(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to fetch");
        setStockData(null);
      }
      setLoading(false);
    },
    [symbol, range]
  );

  const fetchOptions = async () => {
    if (!stockData) return;
    setActiveTab("options");
    if (options.length > 0) return;
    try {
      const res = await fetch(`/api/options/${stockData.details.ticker}`);
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setOptions(data.data || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch options");
    }
  };

  const refetchWithRange = async (r: string) => {
    setRange(r);
    if (!stockData) return;
    const t = stockData.details.ticker;
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/stocks/${t}?range=${r}`);
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setStockData(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch");
    }
    setLoading(false);
  };

  const fmt = (n: number) => `$${n.toFixed(2)}`;
  const fmtCap = (n: number) => {
    if (n >= 1e12) return `$${(n / 1e12).toFixed(2)}T`;
    if (n >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
    if (n >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
    return `$${n.toFixed(0)}`;
  };
  const fmtVol = (n: number) => {
    if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
    if (n >= 1e3) return `${(n / 1e3).toFixed(1)}K`;
    return String(n);
  };

  const bars = stockData?.bars || [];
  const minPrice = bars.length ? Math.min(...bars.map((b) => b.l)) * 0.998 : 0;
  const maxPrice = bars.length ? Math.max(...bars.map((b) => b.h)) * 1.002 : 0;
  const priceRange = maxPrice - minPrice || 1;

  const prevDay = stockData?.previousDay;
  const firstBar = bars[0];
  const changeAmt = prevDay && firstBar ? prevDay.c - firstBar.o : null;
  const changePct = prevDay && firstBar ? ((prevDay.c - firstBar.o) / firstBar.o) * 100 : null;
  const isUp = (changePct ?? 0) >= 0;

  const displayBar = hoveredBar || prevDay;

  return (
    <div className="min-h-screen bg-[#0a0a0f] text-zinc-100">
      {/* Nav */}
      <nav className="border-b border-zinc-800/50 bg-[#0a0a0f]/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-sm font-bold">
              O
            </div>
            <span className="text-lg font-semibold tracking-tight">Optioneering</span>
          </div>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              fetchStock();
            }}
            className="flex gap-2"
          >
            <div className="relative">
              <input
                type="text"
                value={symbol}
                onChange={(e) => setSymbol(e.target.value.toUpperCase())}
                placeholder="Search ticker..."
                className="w-48 sm:w-64 bg-zinc-900/80 border border-zinc-700/50 rounded-lg px-4 py-2 text-sm text-zinc-100 placeholder-zinc-600 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/50 transition-all"
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="bg-blue-600 hover:bg-blue-500 disabled:opacity-50 px-4 py-2 rounded-lg text-sm font-medium transition-colors"
            >
              {loading ? (
                <span className="flex items-center gap-2">
                  <span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Loading
                </span>
              ) : (
                "Pull"
              )}
            </button>
          </form>
        </div>
      </nav>

      <main className="max-w-6xl mx-auto px-6 py-6">
        {/* Quick tickers */}
        {!stockData && !loading && (
          <div className="mb-8">
            <p className="text-zinc-500 text-sm mb-3">Popular tickers</p>
            <div className="flex flex-wrap gap-2">
              {POPULAR.map((t) => (
                <button
                  key={t}
                  onClick={() => fetchStock(t)}
                  className="px-4 py-2 bg-zinc-900 border border-zinc-800 rounded-lg text-sm font-mono hover:bg-zinc-800 hover:border-zinc-700 transition-colors"
                >
                  {t}
                </button>
              ))}
            </div>
          </div>
        )}

        {error && (
          <div className="bg-red-900/20 border border-red-800/50 rounded-lg p-4 mb-6 text-red-300 text-sm">
            {error}
          </div>
        )}

        {loading && !stockData && (
          <div className="flex flex-col items-center justify-center py-32 gap-4">
            <div className="w-10 h-10 border-3 border-zinc-700 border-t-blue-500 rounded-full animate-spin" />
            <p className="text-zinc-500 text-sm">Fetching market data...</p>
          </div>
        )}

        {stockData && (
          <div className="space-y-5">
            {/* Ticker header */}
            <div className="flex flex-col sm:flex-row sm:items-end gap-3">
              <div className="flex-1">
                <div className="flex items-center gap-3">
                  <h2 className="text-3xl font-bold">{stockData.details.ticker}</h2>
                  <span className="text-zinc-500 text-lg">{stockData.details.name}</span>
                </div>
                {prevDay && (
                  <div className="flex items-baseline gap-3 mt-1">
                    <span className="text-4xl font-mono font-semibold">
                      {fmt(displayBar?.c ?? prevDay.c)}
                    </span>
                    {changePct !== null && changeAmt !== null && (
                      <span
                        className={`text-lg font-mono ${isUp ? "text-emerald-400" : "text-red-400"}`}
                      >
                        {isUp ? "+" : ""}
                        {changeAmt.toFixed(2)} ({isUp ? "+" : ""}
                        {changePct.toFixed(2)}%)
                      </span>
                    )}
                  </div>
                )}
                {hoveredBar && (
                  <p className="text-xs text-zinc-500 mt-1">
                    {new Date(hoveredBar.t).toLocaleDateString("en-US", {
                      weekday: "short",
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                    })}
                  </p>
                )}
              </div>
              <div className="flex gap-1">
                {RANGES.map((r) => (
                  <button
                    key={r}
                    onClick={() => refetchWithRange(r)}
                    className={`px-3 py-1.5 rounded-md text-xs font-medium uppercase transition-colors ${
                      range === r
                        ? "bg-blue-600 text-white"
                        : "bg-zinc-900 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
                    }`}
                  >
                    {r}
                  </button>
                ))}
              </div>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
              {prevDay && (
                <>
                  <Stat label="Open" value={fmt(prevDay.o)} />
                  <Stat label="High" value={fmt(prevDay.h)} up />
                  <Stat label="Low" value={fmt(prevDay.l)} down />
                  <Stat label="Close" value={fmt(prevDay.c)} />
                  <Stat label="Volume" value={fmtVol(prevDay.v)} />
                  <Stat label="VWAP" value={fmt(prevDay.vw)} />
                </>
              )}
            </div>

            {stockData.details.market_cap && (
              <div className="flex flex-wrap gap-3">
                <Tag label="Market Cap" value={fmtCap(stockData.details.market_cap)} />
                {stockData.details.sic_description && (
                  <Tag label="Sector" value={stockData.details.sic_description} />
                )}
              </div>
            )}

            {/* Tabs */}
            <div className="flex gap-1 border-b border-zinc-800/50">
              <TabBtn
                active={activeTab === "chart"}
                onClick={() => setActiveTab("chart")}
                label="Price Chart"
              />
              <TabBtn active={activeTab === "options"} onClick={fetchOptions} label="Options Chain" />
            </div>

            {/* Chart */}
            {activeTab === "chart" && bars.length > 0 && (
              <div className="bg-zinc-900/50 border border-zinc-800/50 rounded-xl p-5">
                <div className="flex justify-between text-[10px] text-zinc-600 mb-1 font-mono">
                  <span>{fmt(maxPrice)}</span>
                </div>
                <div
                  className="relative h-72 flex items-end gap-[1px]"
                  onMouseLeave={() => setHoveredBar(null)}
                >
                  {bars.map((bar, i) => {
                    const bodyTop = Math.max(bar.o, bar.c);
                    const bodyBot = Math.min(bar.o, bar.c);
                    const wickH = ((bar.h - minPrice) / priceRange) * 100;
                    const wickL = ((bar.l - minPrice) / priceRange) * 100;
                    const bodyH = ((bodyTop - minPrice) / priceRange) * 100;
                    const bodyL = ((bodyBot - minPrice) / priceRange) * 100;
                    const up = bar.c >= bar.o;
                    return (
                      <div
                        key={i}
                        className="flex-1 min-w-0 relative cursor-crosshair"
                        onMouseEnter={() => setHoveredBar(bar)}
                      >
                        {/* Wick */}
                        <div
                          className="absolute left-1/2 -translate-x-1/2 w-[1px]"
                          style={{
                            bottom: `${wickL}%`,
                            height: `${wickH - wickL}%`,
                            backgroundColor: up ? "rgb(52,211,153)" : "rgb(248,113,113)",
                            opacity: 0.5,
                          }}
                        />
                        {/* Body */}
                        <div
                          className="absolute left-[15%] right-[15%] rounded-[1px] transition-opacity"
                          style={{
                            bottom: `${bodyL}%`,
                            height: `${Math.max(bodyH - bodyL, 0.3)}%`,
                            backgroundColor: up ? "rgb(52,211,153)" : "rgb(248,113,113)",
                            opacity: hoveredBar === bar ? 1 : 0.8,
                          }}
                        />
                      </div>
                    );
                  })}
                </div>
                <div className="flex justify-between text-[10px] text-zinc-600 mt-1 font-mono">
                  <span>{fmt(minPrice)}</span>
                  <span>{new Date(bars[0].t).toLocaleDateString()}</span>
                  <span>{new Date(bars[bars.length - 1].t).toLocaleDateString()}</span>
                </div>
              </div>
            )}

            {/* Volume bars under chart */}
            {activeTab === "chart" && bars.length > 0 && (
              <div className="bg-zinc-900/50 border border-zinc-800/50 rounded-xl p-5">
                <p className="text-xs text-zinc-500 mb-2">Volume</p>
                <div className="h-20 flex items-end gap-[1px]">
                  {(() => {
                    const maxV = Math.max(...bars.map((b) => b.v));
                    return bars.map((bar, i) => (
                      <div key={i} className="flex-1 min-w-0">
                        <div
                          className={`w-full rounded-t-sm ${
                            bar.c >= bar.o ? "bg-emerald-500/40" : "bg-red-500/40"
                          }`}
                          style={{ height: `${(bar.v / maxV) * 100}%` }}
                        />
                      </div>
                    ));
                  })()}
                </div>
              </div>
            )}

            {/* Options table */}
            {activeTab === "options" && (
              <div className="bg-zinc-900/50 border border-zinc-800/50 rounded-xl overflow-hidden">
                {options.length === 0 ? (
                  <div className="p-12 text-center">
                    <div className="w-8 h-8 border-2 border-zinc-700 border-t-blue-500 rounded-full animate-spin mx-auto mb-3" />
                    <p className="text-zinc-500 text-sm">Loading options contracts...</p>
                  </div>
                ) : (
                  <>
                    <div className="px-4 py-3 bg-zinc-800/30 border-b border-zinc-800/50 flex items-center justify-between">
                      <p className="text-xs text-zinc-400">
                        {options.length} contracts found
                      </p>
                    </div>
                    <div className="overflow-x-auto max-h-96 overflow-y-auto">
                      <table className="w-full text-sm">
                        <thead className="bg-zinc-800/30 sticky top-0">
                          <tr>
                            <th className="px-4 py-2.5 text-left text-xs text-zinc-500 font-medium">
                              Contract
                            </th>
                            <th className="px-4 py-2.5 text-left text-xs text-zinc-500 font-medium">
                              Type
                            </th>
                            <th className="px-4 py-2.5 text-right text-xs text-zinc-500 font-medium">
                              Strike
                            </th>
                            <th className="px-4 py-2.5 text-right text-xs text-zinc-500 font-medium">
                              Expiration
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {options.map((opt) => (
                            <tr
                              key={opt.ticker}
                              className="border-t border-zinc-800/30 hover:bg-zinc-800/20 transition-colors"
                            >
                              <td className="px-4 py-2 font-mono text-xs text-zinc-300">
                                {opt.ticker}
                              </td>
                              <td className="px-4 py-2">
                                <span
                                  className={`inline-flex px-2 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider ${
                                    opt.contract_type === "call"
                                      ? "bg-emerald-500/15 text-emerald-400 ring-1 ring-emerald-500/20"
                                      : "bg-red-500/15 text-red-400 ring-1 ring-red-500/20"
                                  }`}
                                >
                                  {opt.contract_type}
                                </span>
                              </td>
                              <td className="px-4 py-2 text-right font-mono text-zinc-200">
                                ${opt.strike_price.toFixed(2)}
                              </td>
                              <td className="px-4 py-2 text-right text-zinc-400">
                                {opt.expiration_date}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </>
                )}
              </div>
            )}

            {/* About */}
            {stockData.details.description && (
              <details className="bg-zinc-900/50 border border-zinc-800/50 rounded-xl">
                <summary className="px-5 py-3 text-sm text-zinc-400 cursor-pointer hover:text-zinc-200 transition-colors">
                  About {stockData.details.name}
                </summary>
                <p className="px-5 pb-4 text-sm text-zinc-400 leading-relaxed">
                  {stockData.details.description}
                </p>
              </details>
            )}
          </div>
        )}

        {!stockData && !loading && !error && (
          <div className="text-center py-32">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-500/20 to-purple-600/20 border border-blue-500/10 flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-blue-400/60" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18L9 11.25l4.306 4.307a11.95 11.95 0 015.814-5.519l2.74-1.22m0 0l-5.94-2.28m5.94 2.28l-2.28 5.941" />
              </svg>
            </div>
            <p className="text-zinc-500">Search a ticker or pick one above to get started</p>
          </div>
        )}
      </main>
    </div>
  );
}

function Stat({ label, value, up, down }: { label: string; value: string; up?: boolean; down?: boolean }) {
  return (
    <div className="bg-zinc-900/50 border border-zinc-800/40 rounded-lg px-3 py-2">
      <div className="text-[10px] text-zinc-600 uppercase tracking-wider">{label}</div>
      <div
        className={`text-sm font-mono mt-0.5 ${
          up ? "text-emerald-400" : down ? "text-red-400" : "text-zinc-200"
        }`}
      >
        {value}
      </div>
    </div>
  );
}

function Tag({ label, value }: { label: string; value: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs bg-zinc-900/50 border border-zinc-800/40 px-3 py-1.5 rounded-full">
      <span className="text-zinc-500">{label}</span>
      <span className="text-zinc-300">{value}</span>
    </span>
  );
}

function TabBtn({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button
      onClick={onClick}
      className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
        active
          ? "border-blue-500 text-blue-400"
          : "border-transparent text-zinc-500 hover:text-zinc-300"
      }`}
    >
      {label}
    </button>
  );
}
