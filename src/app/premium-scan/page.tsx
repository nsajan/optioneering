"use client";

import { useState } from "react";
import Link from "next/link";

interface PremiumPoint {
  weekEnd: string;
  nextExp: string;
  strike: number;
  optionClose: number;
  stockPrice: number;
  bps: number;
}

interface PremiumSignal {
  type: "call" | "put";
  otmPercent: number;
  strike: number;
  ticker: string;
  currentPrice: number;
  currentBps: number;
  priorWeekBps: number;
  avgBps: number;
  wowMultiplier: number;
  avgMultiplier: number;
  bestMultiplier: number;
  comparisonType: string;
  severity: "medium" | "high" | "extreme";
  nextExpiration: string;
  weeks: PremiumPoint[];
}

interface TickerResult {
  ticker: string;
  stockPrice: number;
  nextExpiration: string;
  signalCount: number;
  topSeverity: string;
  maxMultiplier: number;
  signals: PremiumSignal[];
  error?: string;
}

interface ScanResult {
  scannedAt: string;
  asOf?: string;
  totalTickers: number;
  flaggedCount: number;
  cleanCount: number;
  errorCount: number;
  flagged: TickerResult[];
  clean: { ticker: string; stockPrice: number }[];
  errors: { ticker: string; error: string }[];
}

const DEFAULT_TICKERS = [
  "NVDA", "TSLA", "AAPL", "AMZN", "MSFT", "GOOGL", "META", "AMD",
  "SMCI", "PLTR", "ENPH", "COIN", "MSTR", "ARM", "NFLX", "CRM",
  "SNOW", "SQ", "SHOP", "UBER", "ABNB", "ROKU", "NET", "DDOG",
  "SPY", "QQQ", "IWM", "XLF", "XLE", "GLD",
];

export default function PremiumScanPage() {
  const [tickers, setTickers] = useState(DEFAULT_TICKERS.join(", "));
  const [asOf, setAsOf] = useState("");
  const [data, setData] = useState<ScanResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [expandedTicker, setExpandedTicker] = useState<string | null>(null);
  const [filterType, setFilterType] = useState<"all" | "put" | "call">("all");

  const scan = async () => {
    const tickerList = tickers.split(/[,\s]+/).map((t) => t.trim().toUpperCase()).filter(Boolean);
    if (tickerList.length === 0) return;
    setLoading(true);
    setError("");
    setData(null);

    try {
      const res = await fetch("/api/premium-scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tickers: tickerList, ...(asOf ? { asOf } : {}) }),
      });
      const json = await res.json();
      if (json.error) throw new Error(json.error);
      setData(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Scan failed");
    }
    setLoading(false);
  };

  const severityStyle = (s: string) => {
    switch (s) {
      case "extreme": return { badge: "text-red-300 bg-red-500/20 ring-red-500/40", row: "border-l-red-500 bg-red-500/5" };
      case "high": return { badge: "text-orange-300 bg-orange-500/20 ring-orange-500/40", row: "border-l-orange-500 bg-orange-500/5" };
      case "medium": return { badge: "text-yellow-300 bg-yellow-500/20 ring-yellow-500/40", row: "border-l-yellow-500 bg-yellow-500/5" };
      default: return { badge: "text-zinc-500 bg-zinc-500/10 ring-zinc-500/20", row: "border-l-zinc-700 bg-zinc-900/50" };
    }
  };

  const filteredFlagged = data?.flagged.map((t) => ({
    ...t,
    signals: t.signals.filter((s) => filterType === "all" || s.type === filterType),
  })).filter((t) => t.signals.length > 0) || [];

  return (
    <div className="min-h-screen bg-[#0a0a0f] text-zinc-100">
      <nav className="border-b border-zinc-800/50 bg-[#0a0a0f]/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href="/" className="flex items-center gap-2 hover:opacity-80 transition-opacity">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-red-500 to-orange-600 flex items-center justify-center text-sm font-bold">$</div>
              <span className="text-lg font-semibold tracking-tight">Optioneering</span>
            </Link>
            <span className="text-zinc-600">|</span>
            <span className="text-sm text-zinc-400">Premium Scanner</span>
          </div>
          <div className="flex gap-2 items-center">
            <Link href="/analyze" className="text-xs text-zinc-500 hover:text-zinc-300 px-2 py-1 rounded border border-zinc-800 hover:border-zinc-600 transition-colors">
              Anomaly Scanner
            </Link>
          </div>
        </div>
      </nav>

      <main className="max-w-6xl mx-auto px-6 py-6">
        {/* Input */}
        <div className="bg-zinc-900/50 border border-zinc-800/50 rounded-xl p-6 mb-6">
          <div className="flex flex-col gap-4">
            <div>
              <label className="text-xs text-zinc-500 uppercase tracking-wider mb-2 block">Tickers (comma or space separated)</label>
              <textarea
                value={tickers}
                onChange={(e) => setTickers(e.target.value.toUpperCase())}
                rows={2}
                className="w-full bg-zinc-900/80 border border-zinc-700/50 rounded-lg px-4 py-3 text-sm text-zinc-100 placeholder-zinc-600 focus:outline-none focus:ring-2 focus:ring-red-500/50 font-mono transition-all"
                placeholder="NVDA, TSLA, AAPL..."
              />
            </div>
            <div className="flex gap-3 items-end">
              <div>
                <label className="text-xs text-zinc-500 uppercase tracking-wider mb-2 block">Backtest Date</label>
                <div className="flex gap-2 items-center">
                  <input
                    type="date"
                    value={asOf}
                    onChange={(e) => setAsOf(e.target.value)}
                    className="bg-zinc-900/80 border border-zinc-700/50 rounded-lg px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:ring-2 focus:ring-red-500/50 [color-scheme:dark] transition-all"
                  />
                  {asOf && (
                    <button onClick={() => setAsOf("")} className="text-xs text-zinc-500 hover:text-zinc-300">Clear</button>
                  )}
                </div>
              </div>
              <button
                onClick={scan}
                disabled={loading}
                className="bg-red-600 hover:bg-red-500 disabled:opacity-50 px-6 py-2 rounded-lg text-sm font-medium transition-colors h-[38px]"
              >
                {loading ? (
                  <span className="flex items-center gap-2">
                    <span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Scanning...
                  </span>
                ) : "Scan Premiums"}
              </button>
            </div>
          </div>
        </div>

        {error && (
          <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4 mb-6 text-red-300 text-sm">{error}</div>
        )}

        {loading && (
          <div className="text-center py-20">
            <div className="w-8 h-8 border-2 border-zinc-700 border-t-red-500 rounded-full animate-spin mx-auto mb-4" />
            <p className="text-zinc-500 text-sm">Scanning {tickers.split(/[,\s]+/).filter(Boolean).length} tickers for premium anomalies...</p>
            <p className="text-zinc-600 text-xs mt-1">This may take a minute</p>
          </div>
        )}

        {data && (
          <>
            {/* Summary bar */}
            <div className="grid grid-cols-4 gap-4 mb-6">
              <div className="bg-zinc-900/50 border border-zinc-800/50 rounded-xl p-4 text-center">
                <div className="text-2xl font-bold">{data.totalTickers}</div>
                <div className="text-xs text-zinc-500 mt-1">Scanned</div>
              </div>
              <div className="bg-red-500/5 border border-red-500/30 rounded-xl p-4 text-center">
                <div className="text-2xl font-bold text-red-400">{data.flaggedCount}</div>
                <div className="text-xs text-zinc-500 mt-1">Flagged</div>
              </div>
              <div className="bg-emerald-500/5 border border-emerald-500/30 rounded-xl p-4 text-center">
                <div className="text-2xl font-bold text-emerald-400">{data.cleanCount}</div>
                <div className="text-xs text-zinc-500 mt-1">Clean</div>
              </div>
              <div className="bg-zinc-900/50 border border-zinc-800/50 rounded-xl p-4 text-center">
                <div className="text-2xl font-bold text-zinc-400">{data.errorCount}</div>
                <div className="text-xs text-zinc-500 mt-1">Errors</div>
              </div>
            </div>

            {data.asOf && (
              <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg px-4 py-2 mb-6 text-amber-300 text-xs">
                Backtest mode: as of {data.asOf}
              </div>
            )}

            {/* Filter */}
            <div className="flex gap-2 mb-4">
              {(["all", "put", "call"] as const).map((f) => (
                <button
                  key={f}
                  onClick={() => setFilterType(f)}
                  className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                    filterType === f
                      ? "bg-red-500/20 text-red-300 ring-1 ring-red-500/40"
                      : "bg-zinc-800/50 text-zinc-500 hover:text-zinc-300"
                  }`}
                >
                  {f === "all" ? "All" : f === "put" ? "Puts Only" : "Calls Only"}
                </button>
              ))}
            </div>

            {/* Flagged tickers */}
            {filteredFlagged.length === 0 && (
              <div className="text-center py-12 text-zinc-500">
                No premium anomalies detected across {data.totalTickers} tickers.
              </div>
            )}

            <div className="space-y-3">
              {filteredFlagged.map((result) => {
                const isExpanded = expandedTicker === result.ticker;
                const topStyle = severityStyle(result.topSeverity);

                return (
                  <div key={result.ticker} className={`border border-zinc-800/50 rounded-xl overflow-hidden ${topStyle.row} border-l-4`}>
                    {/* Ticker header */}
                    <button
                      onClick={() => setExpandedTicker(isExpanded ? null : result.ticker)}
                      className="w-full px-5 py-4 flex items-center justify-between hover:bg-white/[0.02] transition-colors"
                    >
                      <div className="flex items-center gap-4">
                        <div className="text-left">
                          <span className="text-lg font-bold">{result.ticker}</span>
                          <span className="text-zinc-500 text-sm ml-3">${result.stockPrice.toFixed(2)}</span>
                        </div>
                        <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ring-1 ${topStyle.badge}`}>
                          {result.topSeverity}
                        </span>
                      </div>
                      <div className="flex items-center gap-6 text-sm">
                        <div className="text-right">
                          <span className="text-zinc-400">{result.signalCount} signal{result.signalCount !== 1 ? "s" : ""}</span>
                          <span className="text-zinc-600 mx-2">|</span>
                          <span className="text-red-400 font-medium">{result.maxMultiplier}x</span>
                        </div>
                        <span className={`text-zinc-500 transition-transform ${isExpanded ? "rotate-180" : ""}`}>
                          &#9660;
                        </span>
                      </div>
                    </button>

                    {/* Expanded signals */}
                    {isExpanded && (
                      <div className="border-t border-zinc-800/50 px-5 py-4 space-y-4">
                        {result.signals.map((sig, si) => {
                          const ss = severityStyle(sig.severity);
                          return (
                            <div key={si} className="bg-zinc-900/60 rounded-lg p-4">
                              <div className="flex items-center gap-3 mb-3">
                                <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ring-1 ${ss.badge}`}>
                                  {sig.severity}
                                </span>
                                <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${sig.type === "put" ? "bg-red-500/15 text-red-400" : "bg-emerald-500/15 text-emerald-400"}`}>
                                  {sig.type.toUpperCase()}
                                </span>
                                <span className="text-xs text-zinc-500">{sig.otmPercent}% OTM</span>
                                <span className="text-sm font-medium">${sig.strike}</span>
                                <span className="text-xs text-zinc-600">exp {sig.nextExpiration}</span>
                              </div>

                              <div className="grid grid-cols-3 gap-4 mb-3">
                                <div className="bg-zinc-800/40 rounded-lg p-3 text-center">
                                  <div className="text-lg font-bold text-red-400">{sig.bestMultiplier}x</div>
                                  <div className="text-[10px] text-zinc-500 uppercase">{sig.comparisonType}</div>
                                </div>
                                <div className="bg-zinc-800/40 rounded-lg p-3 text-center">
                                  <div className="text-lg font-bold">${sig.currentPrice.toFixed(2)}</div>
                                  <div className="text-[10px] text-zinc-500 uppercase">{sig.currentBps} bps</div>
                                </div>
                                <div className="bg-zinc-800/40 rounded-lg p-3 text-center">
                                  <div className="text-sm font-medium text-zinc-400">
                                    WoW {sig.wowMultiplier}x | Avg {sig.avgMultiplier}x
                                  </div>
                                  <div className="text-[10px] text-zinc-500 uppercase">prior {sig.priorWeekBps} bps | avg {sig.avgBps} bps</div>
                                </div>
                              </div>

                              {/* Weekly premium bars */}
                              <div className="space-y-1">
                                <div className="text-[10px] text-zinc-500 uppercase tracking-wider mb-2">Premium History (bps of stock price)</div>
                                {sig.weeks.map((w, wi) => {
                                  const maxBps = Math.max(...sig.weeks.map((wk) => wk.bps));
                                  const pct = maxBps > 0 ? (w.bps / maxBps) * 100 : 0;
                                  return (
                                    <div key={wi} className="flex items-center gap-3 text-xs">
                                      <span className={`w-20 text-right font-mono ${wi === 0 ? "text-red-400 font-bold" : "text-zinc-500"}`}>
                                        {w.weekEnd}
                                      </span>
                                      <div className="flex-1 bg-zinc-800/40 rounded-full h-5 overflow-hidden">
                                        <div
                                          className={`h-full rounded-full flex items-center px-2 text-[10px] font-medium ${wi === 0 ? "bg-red-500/40 text-red-200" : "bg-zinc-700/60 text-zinc-400"}`}
                                          style={{ width: `${Math.max(pct, 8)}%` }}
                                        >
                                          {w.bps.toFixed(1)}
                                        </div>
                                      </div>
                                      <span className="w-16 text-right text-zinc-600 font-mono">${w.optionClose.toFixed(2)}</span>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          );
                        })}
                        <div className="text-center pt-2">
                          <Link
                            href={`/analyze?ticker=${result.ticker}${data.asOf ? `&asOf=${data.asOf}` : ""}`}
                            className="text-xs text-zinc-500 hover:text-red-400 transition-colors"
                          >
                            Full analysis &rarr;
                          </Link>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Clean tickers */}
            {data.clean.length > 0 && (
              <div className="mt-8 bg-zinc-900/30 border border-zinc-800/30 rounded-xl p-4">
                <h3 className="text-xs text-zinc-500 uppercase tracking-wider mb-3">Clean ({data.clean.length})</h3>
                <div className="flex flex-wrap gap-2">
                  {data.clean.map((c) => (
                    <span key={c.ticker} className="text-xs text-zinc-600 bg-zinc-800/30 px-2 py-1 rounded">
                      {c.ticker}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Errors */}
            {data.errors.length > 0 && (
              <div className="mt-4 bg-zinc-900/30 border border-zinc-800/30 rounded-xl p-4">
                <h3 className="text-xs text-zinc-500 uppercase tracking-wider mb-3">Errors ({data.errors.length})</h3>
                <div className="flex flex-wrap gap-2">
                  {data.errors.map((e) => (
                    <span key={e.ticker} className="text-xs text-red-500/60 bg-red-500/5 px-2 py-1 rounded" title={e.error}>
                      {e.ticker}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}
