"use client";

import { useState } from "react";
import Link from "next/link";

interface WeekBreakdown {
  expiration: string;
  strike: number;
  totalVolume: number;
  dailyAvgVolume: number;
}

interface Anomaly {
  type: "call" | "put";
  otmPercent: number;
  currentStrike: number;
  currentTicker: string;
  currentVolume: number;
  currentDailyAvg: number;
  historicalAvgDailyVol: number;
  multiplier: number;
  severity: "low" | "medium" | "high" | "extreme";
  weeklyBreakdown: WeekBreakdown[];
}

interface StrikeData {
  otmPercent: number;
  strike: number;
  ticker: string;
  totalVolume: number;
  totalTrades: number;
  dailyAvgVolume: number;
  dailyBars: { date: string; volume: number; trades: number; close: number }[];
}

interface WeekData {
  expiration: string;
  stockPrice: number;
  daysTraded: number;
  calls: StrikeData[];
  puts: StrikeData[];
}

interface AnalysisResult {
  ticker: string;
  currentPrice: number;
  currentExpiration: string;
  analyzedExpirations: string[];
  hasAnomaly: boolean;
  anomalyCount: number;
  anomalies: Anomaly[];
  weeklyData: WeekData[];
}

const POPULAR = ["NBIS", "TSLA", "NVDA", "AAPL", "AMD", "PLTR", "SMCI", "MSTR"];

export default function AnalyzePage() {
  const [symbol, setSymbol] = useState("");
  const [data, setData] = useState<AnalysisResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [expandedAnomaly, setExpandedAnomaly] = useState<number | null>(null);

  const analyze = async (ticker?: string) => {
    const t = (ticker || symbol).trim().toUpperCase();
    if (!t) return;
    setSymbol(t);
    setLoading(true);
    setError("");
    setData(null);
    setExpandedAnomaly(null);

    try {
      const res = await fetch(`/api/analyze/${t}`);
      const json = await res.json();
      if (json.error) throw new Error(json.error);
      setData(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to analyze");
    }
    setLoading(false);
  };

  const severityColor = (s: string) => {
    switch (s) {
      case "extreme": return "text-red-400 bg-red-500/15 ring-red-500/30";
      case "high": return "text-orange-400 bg-orange-500/15 ring-orange-500/30";
      case "medium": return "text-yellow-400 bg-yellow-500/15 ring-yellow-500/30";
      default: return "text-zinc-500 bg-zinc-500/10 ring-zinc-500/20";
    }
  };

  const severityBg = (s: string) => {
    switch (s) {
      case "extreme": return "border-red-500/30 bg-red-500/5";
      case "high": return "border-orange-500/30 bg-orange-500/5";
      case "medium": return "border-yellow-500/30 bg-yellow-500/5";
      default: return "border-zinc-800/50 bg-zinc-900/50";
    }
  };

  const flaggedAnomalies = data?.anomalies.filter((a) => a.severity !== "low") || [];
  const lowAnomalies = data?.anomalies.filter((a) => a.severity === "low") || [];

  return (
    <div className="min-h-screen bg-[#0a0a0f] text-zinc-100">
      {/* Nav */}
      <nav className="border-b border-zinc-800/50 bg-[#0a0a0f]/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href="/" className="flex items-center gap-2 hover:opacity-80 transition-opacity">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-sm font-bold">
                O
              </div>
              <span className="text-lg font-semibold tracking-tight">Optioneering</span>
            </Link>
            <span className="text-zinc-600">|</span>
            <span className="text-sm text-zinc-400">Anomaly Scanner</span>
          </div>
          <form
            onSubmit={(e) => { e.preventDefault(); analyze(); }}
            className="flex gap-2"
          >
            <input
              type="text"
              value={symbol}
              onChange={(e) => setSymbol(e.target.value.toUpperCase())}
              placeholder="Ticker..."
              className="w-36 sm:w-48 bg-zinc-900/80 border border-zinc-700/50 rounded-lg px-4 py-2 text-sm text-zinc-100 placeholder-zinc-600 focus:outline-none focus:ring-2 focus:ring-purple-500/50 focus:border-purple-500/50 transition-all"
            />
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
              ) : (
                "Scan"
              )}
            </button>
          </form>
        </div>
      </nav>

      <main className="max-w-6xl mx-auto px-6 py-6">
        {/* Quick tickers */}
        {!data && !loading && (
          <div className="mb-8">
            <p className="text-zinc-500 text-sm mb-3">Scan a ticker for unusual far-OTM weekly options activity</p>
            <div className="flex flex-wrap gap-2">
              {POPULAR.map((t) => (
                <button
                  key={t}
                  onClick={() => analyze(t)}
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

        {loading && (
          <div className="flex flex-col items-center justify-center py-32 gap-4">
            <div className="w-12 h-12 border-3 border-zinc-700 border-t-purple-500 rounded-full animate-spin" />
            <p className="text-zinc-500 text-sm">Analyzing 4 weeks of options data...</p>
            <p className="text-zinc-600 text-xs">Checking 10%, 15%, 20% OTM calls & puts</p>
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
                  Nearest expiry: {data.currentExpiration} &middot; Compared against {data.analyzedExpirations.slice(1).join(", ")}
                </p>
              </div>
              <div className={`px-4 py-2 rounded-xl text-center ${
                data.hasAnomaly
                  ? "bg-red-500/10 border border-red-500/30"
                  : "bg-emerald-500/10 border border-emerald-500/30"
              }`}>
                {data.hasAnomaly ? (
                  <>
                    <div className="text-2xl font-bold text-red-400">{data.anomalyCount}</div>
                    <div className="text-xs text-red-400/70">ANOMALIES</div>
                  </>
                ) : (
                  <>
                    <div className="text-lg font-bold text-emerald-400">NORMAL</div>
                    <div className="text-xs text-emerald-400/70">No unusual activity</div>
                  </>
                )}
              </div>
            </div>

            {/* Flagged anomalies */}
            {flaggedAnomalies.length > 0 && (
              <div className="space-y-3">
                <h3 className="text-sm font-medium text-zinc-400 uppercase tracking-wider">
                  Flagged Activity
                </h3>
                {flaggedAnomalies.map((a, i) => (
                  <div
                    key={`${a.type}-${a.otmPercent}`}
                    className={`border rounded-xl overflow-hidden transition-colors ${severityBg(a.severity)}`}
                  >
                    <button
                      onClick={() => setExpandedAnomaly(expandedAnomaly === i ? null : i)}
                      className="w-full px-5 py-4 flex items-center gap-4 text-left"
                    >
                      <span className={`inline-flex px-2.5 py-1 rounded-lg text-xs font-bold uppercase tracking-wider ring-1 ${severityColor(a.severity)}`}>
                        {a.severity}
                      </span>
                      <span className={`px-2 py-0.5 rounded text-xs font-semibold uppercase ${
                        a.type === "call"
                          ? "bg-emerald-500/15 text-emerald-400"
                          : "bg-red-500/15 text-red-400"
                      }`}>
                        {a.type}
                      </span>
                      <span className="font-mono text-sm">${a.currentStrike}</span>
                      <span className="text-zinc-500 text-sm">{a.otmPercent}% OTM</span>
                      <div className="ml-auto flex items-center gap-4">
                        <div className="text-right">
                          <div className="text-lg font-bold font-mono">
                            {a.multiplier}x
                          </div>
                          <div className="text-[10px] text-zinc-500 uppercase">vs avg</div>
                        </div>
                        <div className="text-right">
                          <div className="font-mono text-sm">{a.currentDailyAvg.toLocaleString()}</div>
                          <div className="text-[10px] text-zinc-500">daily vol</div>
                        </div>
                        <div className="text-right">
                          <div className="font-mono text-sm text-zinc-400">{a.historicalAvgDailyVol.toLocaleString()}</div>
                          <div className="text-[10px] text-zinc-500">hist avg</div>
                        </div>
                        <svg
                          className={`w-4 h-4 text-zinc-500 transition-transform ${expandedAnomaly === i ? "rotate-180" : ""}`}
                          fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                        </svg>
                      </div>
                    </button>

                    {expandedAnomaly === i && (
                      <div className="px-5 pb-4 border-t border-zinc-800/30">
                        <table className="w-full text-sm mt-3">
                          <thead>
                            <tr className="text-zinc-500 text-xs uppercase">
                              <th className="text-left py-2 font-medium">Expiration</th>
                              <th className="text-right py-2 font-medium">Strike</th>
                              <th className="text-right py-2 font-medium">Total Vol</th>
                              <th className="text-right py-2 font-medium">Daily Avg</th>
                              <th className="text-right py-2 font-medium">Comparison</th>
                            </tr>
                          </thead>
                          <tbody>
                            {a.weeklyBreakdown.map((w, wi) => {
                              const isCurrent = wi === 0;
                              const barWidth = a.weeklyBreakdown.length > 0
                                ? Math.min(
                                    (w.dailyAvgVolume /
                                      Math.max(...a.weeklyBreakdown.map((x) => x.dailyAvgVolume), 1)) *
                                      100,
                                    100
                                  )
                                : 0;
                              return (
                                <tr key={w.expiration} className={`border-t border-zinc-800/20 ${isCurrent ? "text-zinc-100" : "text-zinc-400"}`}>
                                  <td className="py-2 font-mono text-xs">
                                    {w.expiration}
                                    {isCurrent && (
                                      <span className="ml-2 text-[10px] text-purple-400 font-sans uppercase">current</span>
                                    )}
                                  </td>
                                  <td className="py-2 text-right font-mono">${w.strike}</td>
                                  <td className="py-2 text-right font-mono">{w.totalVolume.toLocaleString()}</td>
                                  <td className="py-2 text-right font-mono">{w.dailyAvgVolume.toLocaleString()}</td>
                                  <td className="py-2 text-right w-32">
                                    <div className="flex items-center justify-end gap-2">
                                      <div className="w-20 h-2 bg-zinc-800 rounded-full overflow-hidden">
                                        <div
                                          className={`h-full rounded-full ${isCurrent ? "bg-purple-500" : "bg-zinc-600"}`}
                                          style={{ width: `${barWidth}%` }}
                                        />
                                      </div>
                                    </div>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Volume comparison grid */}
            <div className="space-y-3">
              <h3 className="text-sm font-medium text-zinc-400 uppercase tracking-wider">
                Full Comparison
              </h3>
              <div className="grid gap-4 lg:grid-cols-2">
                {/* Calls */}
                <div className="bg-zinc-900/50 border border-zinc-800/50 rounded-xl overflow-hidden">
                  <div className="px-4 py-3 bg-emerald-500/5 border-b border-zinc-800/30">
                    <span className="text-sm font-medium text-emerald-400">OTM Calls</span>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-zinc-500 text-[10px] uppercase">
                          <th className="px-3 py-2 text-left font-medium">OTM%</th>
                          {data.weeklyData.map((w, i) => (
                            <th key={w.expiration} className="px-3 py-2 text-right font-medium">
                              {i === 0 ? (
                                <span className="text-purple-400">{w.expiration.slice(5)}</span>
                              ) : (
                                w.expiration.slice(5)
                              )}
                            </th>
                          ))}
                          <th className="px-3 py-2 text-right font-medium">Signal</th>
                        </tr>
                      </thead>
                      <tbody>
                        {[10, 15, 20].map((pct) => {
                          const anomaly = data.anomalies.find(
                            (a) => a.type === "call" && a.otmPercent === pct
                          );
                          return (
                            <tr key={pct} className="border-t border-zinc-800/20">
                              <td className="px-3 py-2 text-zinc-400 font-mono text-xs">{pct}%</td>
                              {data.weeklyData.map((w, i) => {
                                const strike = w.calls.find((c) => c.otmPercent === pct);
                                return (
                                  <td key={w.expiration} className={`px-3 py-2 text-right font-mono text-xs ${i === 0 ? "text-zinc-100" : "text-zinc-500"}`}>
                                    <div>{strike ? strike.totalVolume.toLocaleString() : "—"}</div>
                                    <div className="text-[10px] text-zinc-600">${strike?.strike || "—"}</div>
                                  </td>
                                );
                              })}
                              <td className="px-3 py-2 text-right">
                                {anomaly && anomaly.severity !== "low" ? (
                                  <span className={`inline-flex px-2 py-0.5 rounded text-[10px] font-bold ring-1 ${severityColor(anomaly.severity)}`}>
                                    {anomaly.multiplier}x
                                  </span>
                                ) : (
                                  <span className="text-zinc-600 text-xs">—</span>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Puts */}
                <div className="bg-zinc-900/50 border border-zinc-800/50 rounded-xl overflow-hidden">
                  <div className="px-4 py-3 bg-red-500/5 border-b border-zinc-800/30">
                    <span className="text-sm font-medium text-red-400">OTM Puts</span>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-zinc-500 text-[10px] uppercase">
                          <th className="px-3 py-2 text-left font-medium">OTM%</th>
                          {data.weeklyData.map((w, i) => (
                            <th key={w.expiration} className="px-3 py-2 text-right font-medium">
                              {i === 0 ? (
                                <span className="text-purple-400">{w.expiration.slice(5)}</span>
                              ) : (
                                w.expiration.slice(5)
                              )}
                            </th>
                          ))}
                          <th className="px-3 py-2 text-right font-medium">Signal</th>
                        </tr>
                      </thead>
                      <tbody>
                        {[10, 15, 20].map((pct) => {
                          const anomaly = data.anomalies.find(
                            (a) => a.type === "put" && a.otmPercent === pct
                          );
                          return (
                            <tr key={pct} className="border-t border-zinc-800/20">
                              <td className="px-3 py-2 text-zinc-400 font-mono text-xs">{pct}%</td>
                              {data.weeklyData.map((w, i) => {
                                const strike = w.puts.find((c) => c.otmPercent === pct);
                                return (
                                  <td key={w.expiration} className={`px-3 py-2 text-right font-mono text-xs ${i === 0 ? "text-zinc-100" : "text-zinc-500"}`}>
                                    <div>{strike ? strike.totalVolume.toLocaleString() : "—"}</div>
                                    <div className="text-[10px] text-zinc-600">${strike?.strike || "—"}</div>
                                  </td>
                                );
                              })}
                              <td className="px-3 py-2 text-right">
                                {anomaly && anomaly.severity !== "low" ? (
                                  <span className={`inline-flex px-2 py-0.5 rounded text-[10px] font-bold ring-1 ${severityColor(anomaly.severity)}`}>
                                    {anomaly.multiplier}x
                                  </span>
                                ) : (
                                  <span className="text-zinc-600 text-xs">—</span>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </div>

            {/* Low-signal items (collapsed) */}
            {lowAnomalies.length > 0 && (
              <details className="bg-zinc-900/30 border border-zinc-800/30 rounded-xl">
                <summary className="px-5 py-3 text-sm text-zinc-500 cursor-pointer hover:text-zinc-300 transition-colors">
                  {lowAnomalies.length} contracts with normal activity
                </summary>
                <div className="px-5 pb-4">
                  <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                    {lowAnomalies.map((a) => (
                      <div
                        key={`${a.type}-${a.otmPercent}`}
                        className="flex items-center gap-2 text-xs text-zinc-500 bg-zinc-900/50 rounded-lg px-3 py-2"
                      >
                        <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase ${
                          a.type === "call" ? "bg-emerald-500/10 text-emerald-500/60" : "bg-red-500/10 text-red-500/60"
                        }`}>
                          {a.type}
                        </span>
                        <span className="font-mono">{a.otmPercent}% ${a.currentStrike}</span>
                        <span className="ml-auto font-mono">{a.multiplier}x</span>
                      </div>
                    ))}
                  </div>
                </div>
              </details>
            )}

            {/* Methodology */}
            <div className="text-xs text-zinc-600 border-t border-zinc-800/30 pt-4">
              <p>
                Compares daily average volume of 10%, 15%, 20% OTM weekly calls &amp; puts for the nearest
                Friday expiration against the same OTM% from the prior 3 weekly expirations. Strikes are
                rounded to the nearest $5 increment. Severity: 3x+ = medium, 5x+ = high, 10x+ = extreme.
              </p>
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
            <p className="text-zinc-600 text-sm mt-1">Compares far OTM weekly volume against the last 3 weeks</p>
          </div>
        )}
      </main>
    </div>
  );
}
