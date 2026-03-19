"use client";

import { useState } from "react";

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

export default function Home() {
  const [symbol, setSymbol] = useState("");
  const [stockData, setStockData] = useState<StockData | null>(null);
  const [options, setOptions] = useState<OptionContract[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [range, setRange] = useState("3m");
  const [activeTab, setActiveTab] = useState<"chart" | "options">("chart");

  const fetchStock = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!symbol.trim()) return;
    setLoading(true);
    setError("");
    setStockData(null);
    setOptions([]);

    try {
      const res = await fetch(`/api/stocks/${symbol.toUpperCase()}?range=${range}`);
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setStockData(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch");
    }
    setLoading(false);
  };

  const fetchOptions = async () => {
    if (!stockData) return;
    setActiveTab("options");
    try {
      const res = await fetch(`/api/options/${stockData.details.ticker}`);
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setOptions(data.data || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch options");
    }
  };

  const formatPrice = (n: number) => `$${n.toFixed(2)}`;
  const formatMarketCap = (n: number) => {
    if (n >= 1e12) return `$${(n / 1e12).toFixed(2)}T`;
    if (n >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
    if (n >= 1e6) return `$${(n / 1e6).toFixed(2)}M`;
    return `$${n.toFixed(0)}`;
  };

  const bars = stockData?.bars || [];
  const minPrice = bars.length ? Math.min(...bars.map((b) => b.l)) : 0;
  const maxPrice = bars.length ? Math.max(...bars.map((b) => b.h)) : 0;
  const priceRange = maxPrice - minPrice || 1;

  const prevDay = stockData?.previousDay;
  const changePercent =
    prevDay && bars.length > 1
      ? ((prevDay.c - bars[0].o) / bars[0].o) * 100
      : null;

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 p-6">
      <header className="max-w-5xl mx-auto mb-8">
        <h1 className="text-3xl font-bold tracking-tight">Optioneering</h1>
        <p className="text-zinc-500 text-sm mt-1">Stock & options research</p>
      </header>

      <main className="max-w-5xl mx-auto">
        <form onSubmit={fetchStock} className="flex gap-3 mb-6">
          <input
            type="text"
            value={symbol}
            onChange={(e) => setSymbol(e.target.value)}
            placeholder="Ticker symbol (e.g. AAPL, TSLA, NVDA)"
            className="flex-1 bg-zinc-900 border border-zinc-800 rounded-lg px-4 py-3 text-zinc-100 placeholder-zinc-600 focus:outline-none focus:ring-2 focus:ring-blue-600"
          />
          <select
            value={range}
            onChange={(e) => setRange(e.target.value)}
            className="bg-zinc-900 border border-zinc-800 rounded-lg px-3 text-zinc-300"
          >
            <option value="1w">1W</option>
            <option value="1m">1M</option>
            <option value="3m">3M</option>
            <option value="6m">6M</option>
            <option value="1y">1Y</option>
          </select>
          <button
            type="submit"
            disabled={loading}
            className="bg-blue-600 hover:bg-blue-500 disabled:opacity-50 px-6 py-3 rounded-lg font-medium transition-colors"
          >
            {loading ? "Loading..." : "Search"}
          </button>
        </form>

        {error && (
          <div className="bg-red-900/30 border border-red-800 rounded-lg p-4 mb-6 text-red-300">
            {error}
          </div>
        )}

        {stockData && (
          <div className="space-y-6">
            {/* Header */}
            <div className="flex items-baseline gap-4">
              <h2 className="text-2xl font-bold">{stockData.details.ticker}</h2>
              <span className="text-zinc-400">{stockData.details.name}</span>
              {prevDay && (
                <span className="text-2xl font-mono">
                  {formatPrice(prevDay.c)}
                </span>
              )}
              {changePercent !== null && (
                <span
                  className={`text-sm font-mono ${
                    changePercent >= 0 ? "text-green-400" : "text-red-400"
                  }`}
                >
                  {changePercent >= 0 ? "+" : ""}
                  {changePercent.toFixed(2)}%
                </span>
              )}
            </div>

            {/* Stats row */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              {prevDay && (
                <>
                  <Stat label="Open" value={formatPrice(prevDay.o)} />
                  <Stat label="High" value={formatPrice(prevDay.h)} />
                  <Stat label="Low" value={formatPrice(prevDay.l)} />
                  <Stat label="Volume" value={prevDay.v.toLocaleString()} />
                </>
              )}
              {stockData.details.market_cap && (
                <Stat
                  label="Market Cap"
                  value={formatMarketCap(stockData.details.market_cap)}
                />
              )}
              {stockData.details.sic_description && (
                <Stat label="Sector" value={stockData.details.sic_description} />
              )}
            </div>

            {/* Tabs */}
            <div className="flex gap-1 border-b border-zinc-800">
              <button
                onClick={() => setActiveTab("chart")}
                className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === "chart"
                    ? "border-blue-500 text-blue-400"
                    : "border-transparent text-zinc-500 hover:text-zinc-300"
                }`}
              >
                Price Chart
              </button>
              <button
                onClick={fetchOptions}
                className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === "options"
                    ? "border-blue-500 text-blue-400"
                    : "border-transparent text-zinc-500 hover:text-zinc-300"
                }`}
              >
                Options Chain
              </button>
            </div>

            {/* Chart */}
            {activeTab === "chart" && bars.length > 0 && (
              <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
                <div className="flex justify-between text-xs text-zinc-500 mb-2">
                  <span>{formatPrice(maxPrice)}</span>
                </div>
                <div className="relative h-64 flex items-end gap-px">
                  {bars.map((bar, i) => {
                    const height =
                      ((bar.c - minPrice) / priceRange) * 100;
                    const isUp = bar.c >= bar.o;
                    return (
                      <div
                        key={i}
                        className="flex-1 min-w-0 group relative"
                        title={`${new Date(bar.t).toLocaleDateString()}\nO: ${formatPrice(bar.o)} H: ${formatPrice(bar.h)}\nL: ${formatPrice(bar.l)} C: ${formatPrice(bar.c)}\nVol: ${bar.v.toLocaleString()}`}
                      >
                        <div
                          className={`w-full rounded-t-sm transition-colors ${
                            isUp
                              ? "bg-green-500/70 hover:bg-green-400"
                              : "bg-red-500/70 hover:bg-red-400"
                          }`}
                          style={{ height: `${Math.max(height, 1)}%` }}
                        />
                      </div>
                    );
                  })}
                </div>
                <div className="flex justify-between text-xs text-zinc-500 mt-2">
                  <span>{formatPrice(minPrice)}</span>
                  <span>
                    {bars.length > 0 &&
                      new Date(bars[0].t).toLocaleDateString()}
                  </span>
                  <span>
                    {bars.length > 0 &&
                      new Date(bars[bars.length - 1].t).toLocaleDateString()}
                  </span>
                </div>
              </div>
            )}

            {/* Options */}
            {activeTab === "options" && (
              <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
                {options.length === 0 ? (
                  <div className="p-8 text-center text-zinc-500">
                    Loading options data...
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-zinc-800/50">
                        <tr>
                          <th className="px-4 py-3 text-left text-zinc-400 font-medium">Contract</th>
                          <th className="px-4 py-3 text-left text-zinc-400 font-medium">Type</th>
                          <th className="px-4 py-3 text-right text-zinc-400 font-medium">Strike</th>
                          <th className="px-4 py-3 text-right text-zinc-400 font-medium">Expiration</th>
                        </tr>
                      </thead>
                      <tbody>
                        {options.map((opt) => (
                          <tr
                            key={opt.ticker}
                            className="border-t border-zinc-800 hover:bg-zinc-800/30"
                          >
                            <td className="px-4 py-2 font-mono text-xs">
                              {opt.ticker}
                            </td>
                            <td className="px-4 py-2">
                              <span
                                className={`px-2 py-0.5 rounded text-xs font-medium ${
                                  opt.contract_type === "call"
                                    ? "bg-green-900/50 text-green-300"
                                    : "bg-red-900/50 text-red-300"
                                }`}
                              >
                                {opt.contract_type.toUpperCase()}
                              </span>
                            </td>
                            <td className="px-4 py-2 text-right font-mono">
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
                )}
              </div>
            )}

            {/* Description */}
            {stockData.details.description && (
              <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
                <h3 className="text-sm font-medium text-zinc-400 mb-2">About</h3>
                <p className="text-sm text-zinc-300 leading-relaxed">
                  {stockData.details.description}
                </p>
              </div>
            )}
          </div>
        )}

        {!stockData && !loading && !error && (
          <div className="text-center py-24 text-zinc-600">
            <p className="text-lg">Search for a stock to get started</p>
          </div>
        )}
      </main>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-3">
      <div className="text-xs text-zinc-500">{label}</div>
      <div className="text-sm font-medium mt-0.5">{value}</div>
    </div>
  );
}
