"use client";

import { useState } from "react";
import Link from "next/link";

interface Signal {
  id: string;
  signalType: "weekly_volume" | "daily_spike" | "block_trade" | "price_divergence" | "put_call_ratio" | "iv_skew" | "oi_surge" | "term_structure";
  type: "call" | "put";
  otmPercent: number;
  strike: number;
  ticker: string;
  severity: "low" | "medium" | "high" | "extreme";
  multiplier: number;
  title: string;
  description: string;
  evidence: Record<string, unknown>;
  weeklyBreakdown: {
    expiration: string;
    strike: number;
    totalVolume: number;
    dailyAvgVolume: number;
  }[];
}

interface DailyBar {
  date: string;
  volume: number;
  trades: number;
  open: number;
  close: number;
  high: number;
  low: number;
  avgSize: number;
}

interface StrikeData {
  otmPercent: number;
  strike: number;
  ticker: string;
  totalVolume: number;
  totalTrades: number;
  dailyAvgVolume: number;
  dailyBars: DailyBar[];
}

interface WeekData {
  expiration: string;
  stockPrice: number;
  daysTraded: number;
  calls: StrikeData[];
  puts: StrikeData[];
  stockBars: DailyBar[];
}

interface AnalysisResult {
  ticker: string;
  currentPrice: number;
  asOf?: string;
  backtestMode?: boolean;
  currentExpiration: string;
  analyzedExpirations: string[];
  hasAnomaly: boolean;
  signalCount: number;
  signals: Signal[];
  normalSignals: Signal[];
  weeklyData: WeekData[];
}

const POPULAR = ["NBIS", "HIMS", "TSLA", "NVDA", "AAPL", "AMD", "PLTR", "SMCI"];

const SIGNAL_TYPE_LABELS: Record<string, { label: string; icon: string; color: string }> = {
  weekly_volume: { label: "Weekly Volume", icon: "V", color: "blue" },
  daily_spike: { label: "Daily Spike", icon: "D", color: "purple" },
  block_trade: { label: "Block Trade", icon: "B", color: "amber" },
  price_divergence: { label: "Price Divergence", icon: "P", color: "rose" },
  put_call_ratio: { label: "Put/Call Ratio", icon: "R", color: "rose" },
  iv_skew: { label: "IV Skew", icon: "S", color: "purple" },
  oi_surge: { label: "OI Surge", icon: "O", color: "blue" },
  term_structure: { label: "Term Structure", icon: "T", color: "amber" },
};

export default function AnalyzePage() {
  const [symbol, setSymbol] = useState("");
  const [data, setData] = useState<AnalysisResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [expandedSignal, setExpandedSignal] = useState<string | null>(null);
  const [filterType, setFilterType] = useState<string>("all");
  const [asOf, setAsOf] = useState("");

  const analyze = async (ticker?: string) => {
    const t = (ticker || symbol).trim().toUpperCase();
    if (!t) return;
    setSymbol(t);
    setLoading(true);
    setError("");
    setData(null);
    setExpandedSignal(null);

    try {
      const query = asOf ? `?asOf=${asOf}` : "";
      const res = await fetch(`/api/analyze/${t}${query}`);
      const json = await res.json();
      if (json.error) throw new Error(json.error);
      setData(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to analyze");
    }
    setLoading(false);
  };

  const severityStyle = (s: string) => {
    switch (s) {
      case "extreme": return { badge: "text-red-300 bg-red-500/20 ring-red-500/40", card: "border-red-500/40 bg-red-500/5" };
      case "high": return { badge: "text-orange-300 bg-orange-500/20 ring-orange-500/40", card: "border-orange-500/40 bg-orange-500/5" };
      case "medium": return { badge: "text-yellow-300 bg-yellow-500/20 ring-yellow-500/40", card: "border-yellow-500/40 bg-yellow-500/5" };
      default: return { badge: "text-zinc-500 bg-zinc-500/10 ring-zinc-500/20", card: "border-zinc-800/50 bg-zinc-900/50" };
    }
  };

  const signalTypeStyle = (st: string) => {
    const cfg = SIGNAL_TYPE_LABELS[st] || { label: st, icon: "?", color: "zinc" };
    const colors: Record<string, string> = {
      blue: "bg-blue-500/15 text-blue-400 ring-blue-500/30",
      purple: "bg-purple-500/15 text-purple-400 ring-purple-500/30",
      amber: "bg-amber-500/15 text-amber-400 ring-amber-500/30",
      rose: "bg-rose-500/15 text-rose-400 ring-rose-500/30",
      zinc: "bg-zinc-500/15 text-zinc-400 ring-zinc-500/30",
    };
    return { ...cfg, style: colors[cfg.color] || colors.zinc };
  };

  const filteredSignals = data?.signals.filter(
    (s) => filterType === "all" || s.signalType === filterType
  ) || [];

  const signalTypeCounts = data?.signals.reduce((acc, s) => {
    acc[s.signalType] = (acc[s.signalType] || 0) + 1;
    return acc;
  }, {} as Record<string, number>) || {};

  return (
    <div className="min-h-screen bg-[#0a0a0f] text-zinc-100">
      {/* Nav */}
      <nav className="border-b border-zinc-800/50 bg-[#0a0a0f]/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href="/" className="flex items-center gap-2 hover:opacity-80 transition-opacity">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-sm font-bold">O</div>
              <span className="text-lg font-semibold tracking-tight">Optioneering</span>
            </Link>
            <span className="text-zinc-600">|</span>
            <span className="text-sm text-zinc-400">Anomaly Scanner</span>
          </div>
          <form onSubmit={(e) => { e.preventDefault(); analyze(); }} className="flex gap-2 items-center">
            <input
              type="text"
              value={symbol}
              onChange={(e) => setSymbol(e.target.value.toUpperCase())}
              placeholder="Ticker..."
              className="w-28 sm:w-36 bg-zinc-900/80 border border-zinc-700/50 rounded-lg px-4 py-2 text-sm text-zinc-100 placeholder-zinc-600 focus:outline-none focus:ring-2 focus:ring-purple-500/50 transition-all"
            />
            <div className="relative">
              <input
                type="date"
                value={asOf}
                onChange={(e) => setAsOf(e.target.value)}
                className="bg-zinc-900/80 border border-zinc-700/50 rounded-lg px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:ring-2 focus:ring-purple-500/50 transition-all [color-scheme:dark]"
              />
              {!asOf && (
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-600 text-xs pointer-events-none">
                  Backtest date
                </span>
              )}
            </div>
            {asOf && (
              <button type="button" onClick={() => setAsOf("")} className="text-xs text-zinc-500 hover:text-zinc-300 px-1">
                Live
              </button>
            )}
            <button
              type="submit"
              disabled={loading}
              className="bg-purple-600 hover:bg-purple-500 disabled:opacity-50 px-4 py-2 rounded-lg text-sm font-medium transition-colors"
            >
              {loading ? (
                <span className="flex items-center gap-2">
                  <span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Scanning
                </span>
              ) : asOf ? "Backtest" : "Scan"}
            </button>
          </form>
        </div>
      </nav>

      <main className="max-w-6xl mx-auto px-6 py-6">
        {/* Quick tickers */}
        {!data && !loading && (
          <div className="mb-8">
            <p className="text-zinc-500 text-sm mb-3">Scan for unusual far-OTM options activity — detects volume spikes, block trades, and price divergence</p>
            <div className="flex flex-wrap gap-2">
              {POPULAR.map((t) => (
                <button key={t} onClick={() => analyze(t)}
                  className="px-4 py-2 bg-zinc-900 border border-zinc-800 rounded-lg text-sm font-mono hover:bg-zinc-800 hover:border-zinc-700 transition-colors">
                  {t}
                </button>
              ))}
            </div>
          </div>
        )}

        {error && (
          <div className="bg-red-900/20 border border-red-800/50 rounded-lg p-4 mb-6 text-red-300 text-sm">{error}</div>
        )}

        {loading && (
          <div className="flex flex-col items-center justify-center py-32 gap-4">
            <div className="w-12 h-12 border-3 border-zinc-700 border-t-purple-500 rounded-full animate-spin" />
            <p className="text-zinc-500 text-sm">Analyzing 4 weeks of options data...</p>
            <p className="text-zinc-600 text-xs">Checking volume spikes, block trades, and price divergence across 10-40% OTM</p>
          </div>
        )}

        {data && (
          <div className="space-y-6">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <div className="flex items-center gap-3">
                  <h2 className="text-3xl font-bold">{data.ticker}</h2>
                  <span className="text-2xl font-mono text-zinc-300">${data.currentPrice.toFixed(2)}</span>
                </div>
                <p className="text-zinc-500 text-sm mt-1">
                  {data.backtestMode && (
                    <span className="inline-block mr-2 px-2 py-0.5 rounded bg-amber-500/15 text-amber-400 text-[10px] font-bold uppercase tracking-wider ring-1 ring-amber-500/30">
                      Backtest {data.asOf}
                    </span>
                  )}
                  Expiry: {data.currentExpiration} &middot; vs {data.analyzedExpirations.slice(1).join(", ")}
                </p>
              </div>
              <div className={`px-5 py-3 rounded-xl text-center ${
                data.hasAnomaly ? "bg-red-500/10 border border-red-500/30" : "bg-emerald-500/10 border border-emerald-500/30"
              }`}>
                {data.hasAnomaly ? (
                  <>
                    <div className="text-3xl font-bold text-red-400">{data.signalCount}</div>
                    <div className="text-xs text-red-400/70 uppercase tracking-wider">Signals</div>
                  </>
                ) : (
                  <>
                    <div className="text-lg font-bold text-emerald-400">CLEAN</div>
                    <div className="text-xs text-emerald-400/70">No unusual activity</div>
                  </>
                )}
              </div>
            </div>

            {/* Signal type summary pills */}
            {data.signals.length > 0 && (
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => setFilterType("all")}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                    filterType === "all" ? "bg-zinc-700 text-zinc-100" : "bg-zinc-900 text-zinc-500 hover:text-zinc-300"
                  }`}
                >
                  All ({data.signals.length})
                </button>
                {Object.entries(signalTypeCounts).map(([st, count]) => {
                  const cfg = signalTypeStyle(st);
                  return (
                    <button
                      key={st}
                      onClick={() => setFilterType(filterType === st ? "all" : st)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ring-1 ${
                        filterType === st ? cfg.style : "bg-zinc-900 text-zinc-500 ring-zinc-800 hover:text-zinc-300"
                      }`}
                    >
                      {cfg.label} ({count})
                    </button>
                  );
                })}
              </div>
            )}

            {/* Signal cards */}
            {filteredSignals.length > 0 && (
              <div className="space-y-3">
                {filteredSignals.map((s) => {
                  const sStyle = severityStyle(s.severity);
                  const stStyle = signalTypeStyle(s.signalType);
                  const isExpanded = expandedSignal === s.id;

                  return (
                    <div key={s.id} className={`border rounded-xl overflow-hidden transition-all ${sStyle.card}`}>
                      <button
                        onClick={() => setExpandedSignal(isExpanded ? null : s.id)}
                        className="w-full px-5 py-4 flex flex-wrap items-center gap-3 text-left"
                      >
                        {/* Severity badge */}
                        <span className={`inline-flex px-2 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wider ring-1 ${sStyle.badge}`}>
                          {s.severity}
                        </span>
                        {/* Signal type */}
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold ring-1 ${stStyle.style}`}>
                          <span className="w-3.5 h-3.5 rounded-sm bg-current/20 flex items-center justify-center text-[9px]">{stStyle.icon}</span>
                          {stStyle.label}
                        </span>
                        {/* Call/Put */}
                        <span className={`px-2 py-0.5 rounded text-[10px] font-semibold uppercase ${
                          s.type === "call" ? "bg-emerald-500/15 text-emerald-400" : "bg-red-500/15 text-red-400"
                        }`}>
                          {s.type}
                        </span>
                        {/* Strike & OTM */}
                        <span className="font-mono text-sm">${s.strike}</span>
                        <span className="text-zinc-500 text-xs">{s.otmPercent}% OTM</span>
                        {/* Multiplier (for non-divergence signals) */}
                        {s.multiplier > 0 && (
                          <div className="ml-auto text-right">
                            <div className="text-xl font-bold font-mono">{s.multiplier}x</div>
                          </div>
                        )}
                        {s.signalType === "price_divergence" && (
                          <div className="ml-auto">
                            <svg className="w-5 h-5 text-rose-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 21L3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5" />
                            </svg>
                          </div>
                        )}
                        <svg className={`w-4 h-4 text-zinc-500 transition-transform ${isExpanded ? "rotate-180" : ""}`}
                          fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                        </svg>
                      </button>

                      {isExpanded && (
                        <div className="px-5 pb-5 border-t border-zinc-800/30 space-y-4">
                          {/* Description */}
                          <p className="text-sm text-zinc-300 pt-3">{s.description}</p>

                          {/* Evidence details */}
                          <div className="bg-zinc-900/50 rounded-lg p-4">
                            <h4 className="text-[10px] text-zinc-500 uppercase tracking-wider mb-2">Evidence</h4>
                            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                              {Object.entries(s.evidence).map(([key, val]) => {
                                if (Array.isArray(val)) return null;
                                const label = key.replace(/([A-Z])/g, " $1").replace(/^./, (c) => c.toUpperCase());
                                return (
                                  <div key={key}>
                                    <div className="text-[10px] text-zinc-600">{label}</div>
                                    <div className="text-sm font-mono text-zinc-200">
                                      {typeof val === "number" ? val.toLocaleString() : String(val)}
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                            {/* Daily bars if present in evidence */}
                            {Array.isArray(s.evidence.last2Days) && (
                              <div className="mt-3 pt-3 border-t border-zinc-800/30">
                                <div className="text-[10px] text-zinc-500 uppercase tracking-wider mb-1">Last 2 Days Detail</div>
                                {(s.evidence.last2Days as { date: string; volume: number; trades: number }[]).map((d) => (
                                  <div key={d.date} className="flex items-center gap-4 text-xs font-mono text-zinc-300">
                                    <span className="text-zinc-500">{d.date}</span>
                                    <span>vol: {d.volume.toLocaleString()}</span>
                                    <span>trades: {d.trades}</span>
                                    <span className="text-zinc-500">avg size: {d.trades > 0 ? Math.round(d.volume / d.trades) : 0}</span>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>

                          {/* Weekly breakdown table */}
                          <div>
                            <h4 className="text-[10px] text-zinc-500 uppercase tracking-wider mb-2">Weekly Comparison</h4>
                            <table className="w-full text-sm">
                              <thead>
                                <tr className="text-zinc-500 text-[10px] uppercase">
                                  <th className="text-left py-1.5 font-medium">Expiration</th>
                                  <th className="text-right py-1.5 font-medium">Strike</th>
                                  <th className="text-right py-1.5 font-medium">Total Vol</th>
                                  <th className="text-right py-1.5 font-medium">Daily Avg</th>
                                  <th className="text-right py-1.5 font-medium w-28"></th>
                                </tr>
                              </thead>
                              <tbody>
                                {s.weeklyBreakdown.map((w, wi) => {
                                  const isCurrent = wi === 0;
                                  const maxDailyAvg = Math.max(...s.weeklyBreakdown.map((x) => x.dailyAvgVolume), 1);
                                  const barW = (w.dailyAvgVolume / maxDailyAvg) * 100;
                                  return (
                                    <tr key={w.expiration} className={`border-t border-zinc-800/20 ${isCurrent ? "text-zinc-100" : "text-zinc-500"}`}>
                                      <td className="py-1.5 font-mono text-xs">
                                        {w.expiration}
                                        {isCurrent && <span className="ml-2 text-[10px] text-purple-400 font-sans uppercase">current</span>}
                                      </td>
                                      <td className="py-1.5 text-right font-mono">{w.strike > 0 ? `$${w.strike}` : "—"}</td>
                                      <td className="py-1.5 text-right font-mono">{w.totalVolume.toLocaleString()}</td>
                                      <td className="py-1.5 text-right font-mono">{w.dailyAvgVolume.toLocaleString()}</td>
                                      <td className="py-1.5 text-right">
                                        <div className="w-24 h-2 bg-zinc-800 rounded-full overflow-hidden ml-auto">
                                          <div className={`h-full rounded-full ${isCurrent ? "bg-purple-500" : "bg-zinc-600"}`}
                                            style={{ width: `${barW}%` }} />
                                        </div>
                                      </td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {/* Comparison grid */}
            <div className="space-y-3">
              <h3 className="text-sm font-medium text-zinc-400 uppercase tracking-wider">Full Volume Grid</h3>
              <div className="grid gap-4 lg:grid-cols-2">
                <ComparisonTable title="OTM Calls" color="emerald" data={data} side="calls" />
                <ComparisonTable title="OTM Puts" color="red" data={data} side="puts" />
              </div>
            </div>

            {/* Normal signals collapsed */}
            {data.normalSignals.length > 0 && (
              <details className="bg-zinc-900/30 border border-zinc-800/30 rounded-xl">
                <summary className="px-5 py-3 text-sm text-zinc-500 cursor-pointer hover:text-zinc-300 transition-colors">
                  {data.normalSignals.length} signals below threshold
                </summary>
                <div className="px-5 pb-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {data.normalSignals.map((s) => (
                    <div key={s.id} className="flex items-center gap-2 text-xs text-zinc-500 bg-zinc-900/50 rounded-lg px-3 py-2">
                      <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase ${
                        s.type === "call" ? "bg-emerald-500/10 text-emerald-500/60" : "bg-red-500/10 text-red-500/60"
                      }`}>{s.type}</span>
                      <span className="font-mono">{s.otmPercent}% ${s.strike}</span>
                      <span className="ml-auto font-mono">{s.multiplier}x</span>
                    </div>
                  ))}
                </div>
              </details>
            )}

            {/* Methodology */}
            <div className="text-xs text-zinc-600 border-t border-zinc-800/30 pt-4 space-y-1">
              <p><strong className="text-zinc-500">Weekly Volume:</strong> Compares daily avg volume this week vs avg of prior 3 weeks. 3x=medium, 5x=high, 10x=extreme.</p>
              <p><strong className="text-zinc-500">Daily Spike:</strong> Compares last 2 trading days vs the last 2 days of prior weekly expirations. Catches end-of-week surges.</p>
              <p><strong className="text-zinc-500">Block Trade:</strong> Flags days with abnormally large avg trade size (volume / # trades) — big players buying in bulk.</p>
              <p><strong className="text-zinc-500">Price Divergence:</strong> Flags when option price rises while stock moves against it — classic informed flow signal.</p>
            </div>
          </div>
        )}

        {!data && !loading && !error && (
          <div className="text-center py-32">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-purple-500/20 to-red-600/20 border border-purple-500/10 flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-purple-400/60" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
              </svg>
            </div>
            <p className="text-zinc-500">Enter a ticker to scan for abnormal options activity</p>
            <p className="text-zinc-600 text-sm mt-1">Detects volume spikes, block trades, and price divergence in far-OTM weeklies</p>
          </div>
        )}
      </main>
    </div>
  );
}

function ComparisonTable({ title, color, data, side }: {
  title: string;
  color: "emerald" | "red";
  data: AnalysisResult;
  side: "calls" | "puts";
}) {
  const bgColor = color === "emerald" ? "bg-emerald-500/5" : "bg-red-500/5";
  const textColor = color === "emerald" ? "text-emerald-400" : "text-red-400";

  return (
    <div className="bg-zinc-900/50 border border-zinc-800/50 rounded-xl overflow-hidden">
      <div className={`px-4 py-3 ${bgColor} border-b border-zinc-800/30`}>
        <span className={`text-sm font-medium ${textColor}`}>{title}</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-zinc-500 text-[10px] uppercase">
              <th className="px-3 py-2 text-left font-medium">OTM%</th>
              {data.weeklyData.map((w, i) => (
                <th key={w.expiration} className="px-3 py-2 text-right font-medium">
                  {i === 0 ? <span className="text-purple-400">{w.expiration.slice(5)}</span> : w.expiration.slice(5)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {[10, 15, 20, 30, 40].map((pct) => (
              <tr key={pct} className="border-t border-zinc-800/20">
                <td className="px-3 py-2 text-zinc-400 font-mono text-xs">{pct}%</td>
                {data.weeklyData.map((w, i) => {
                  const contracts = w[side];
                  const strike = contracts.find((c) => c.otmPercent === pct);
                  return (
                    <td key={w.expiration} className={`px-3 py-2 text-right font-mono text-xs ${i === 0 ? "text-zinc-100" : "text-zinc-500"}`}>
                      <div>{strike ? strike.totalVolume.toLocaleString() : "—"}</div>
                      <div className="text-[10px] text-zinc-600">${strike?.strike || "—"}</div>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
