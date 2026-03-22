"use client";

import React, { useState } from "react";
import Link from "next/link";

interface BucketData {
  bucket: string;
  volume: number;
  oi: number;
  avgIV: number;
  contracts: number;
}

interface DateResult {
  date: string;
  targetDate: string;
  weeksAgo: number;
  label: string;
  stockPrice: number;
  expiration: string;
  totalVolume: number;
  totalOI: number;
  avgIV: number;
  contractCount: number;
  buckets: BucketData[];
}

interface BucketAnomaly {
  bucket: string;
  volumeMultiplier: number | null;
  oiMultiplier: number | null;
  ivDelta: number | null;
}

interface StrikeHistory {
  date: string;
  volume: number;
  oi: number;
  iv: number;
}

interface TopStrike {
  strike: number;
  otmPct: number;
  volume: number;
  oi: number;
  iv: number;
  last: number;
  bid: number;
  ask: number;
  delta: number;
  volumeMultiplier: number | null;
  history: StrikeHistory[];
}

interface AnomalyData {
  symbol: string;
  selectedDate: string;
  optionType: "put" | "call";
  dates: DateResult[];
  totalAnomaly: { volumeMultiplier: number | null; oiMultiplier: number | null };
  bucketAnomalies: BucketAnomaly[];
  topStrikes: TopStrike[];
}

const POPULAR = ["NVDA", "TSLA", "SMCI", "AAPL", "AMD", "PLTR", "HIMS", "COIN"];

function multClass(mult: number | null): string {
  if (mult === null) return "text-zinc-400";
  if (mult >= 10) return "text-red-300 font-bold";
  if (mult >= 5) return "text-red-400 font-semibold";
  if (mult >= 3) return "text-orange-400 font-medium";
  if (mult >= 2) return "text-yellow-400";
  return "text-zinc-400";
}

function multBadge(mult: number | null): string | null {
  if (mult === null || mult < 2) return null;
  return `${mult.toFixed(1)}x`;
}

export default function ChainAnomalyPage() {
  const [symbol, setSymbol] = useState("NVDA");
  const [date, setDate] = useState("2025-01-24");
  const [optionType, setOptionType] = useState<"put" | "call">("put");
  const [data, setData] = useState<AnomalyData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [expandedStrike, setExpandedStrike] = useState<number | null>(null);

  const fetchData = async (ticker?: string) => {
    const t = (ticker || symbol).trim().toUpperCase();
    if (!t || !date) return;
    setSymbol(t);
    setLoading(true);
    setError("");
    setData(null);

    try {
      const res = await fetch(`/api/chain-anomaly?symbol=${t}&date=${date}&type=${optionType}`);
      const json = await res.json();
      if (json.error) throw new Error(json.error);
      setData(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-[#0a0a0f] text-zinc-100">
      <nav className="border-b border-zinc-800/50 bg-[#0a0a0f]/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-[90rem] mx-auto px-6 py-4 flex items-center justify-between">
          <Link href="/" className="text-zinc-500 hover:text-zinc-300 text-sm">
            &larr; Home
          </Link>
          <h1 className="text-lg font-semibold tracking-tight">Chain Anomaly Scanner</h1>
          <div className="w-16" />
        </div>
      </nav>

      <main className="max-w-[90rem] mx-auto px-6 py-8">
        {/* Controls */}
        <div className="flex flex-wrap gap-3 items-end mb-6">
          <div>
            <label className="block text-xs text-zinc-500 mb-1">Ticker</label>
            <input
              type="text"
              value={symbol}
              onChange={(e) => setSymbol(e.target.value.toUpperCase())}
              onKeyDown={(e) => e.key === "Enter" && fetchData()}
              placeholder="NVDA"
              className="bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 w-28 text-sm focus:outline-none focus:border-purple-500"
            />
          </div>
          <div>
            <label className="block text-xs text-zinc-500 mb-1">Date</label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-purple-500"
            />
          </div>
          <div>
            <label className="block text-xs text-zinc-500 mb-1">Type</label>
            <div className="flex rounded-lg overflow-hidden border border-zinc-700">
              <button
                onClick={() => setOptionType("put")}
                className={`px-4 py-2 text-sm font-medium transition-colors ${
                  optionType === "put"
                    ? "bg-red-500/20 text-red-400 border-r border-zinc-700"
                    : "bg-zinc-900 text-zinc-500 border-r border-zinc-700 hover:text-zinc-300"
                }`}
              >
                Puts
              </button>
              <button
                onClick={() => setOptionType("call")}
                className={`px-4 py-2 text-sm font-medium transition-colors ${
                  optionType === "call"
                    ? "bg-emerald-500/20 text-emerald-400"
                    : "bg-zinc-900 text-zinc-500 hover:text-zinc-300"
                }`}
              >
                Calls
              </button>
            </div>
          </div>
          <button
            onClick={() => fetchData()}
            disabled={loading}
            className="bg-purple-600 hover:bg-purple-500 disabled:bg-zinc-700 px-5 py-2 rounded-lg text-sm font-medium transition-colors"
          >
            {loading ? "Scanning..." : "Scan"}
          </button>
        </div>

        <div className="flex flex-wrap gap-2 mb-8">
          {POPULAR.map((t) => (
            <button
              key={t}
              onClick={() => fetchData(t)}
              className="px-3 py-1 rounded-full bg-zinc-800/60 hover:bg-zinc-700 text-xs text-zinc-400 hover:text-zinc-200 transition-colors"
            >
              {t}
            </button>
          ))}
        </div>

        {error && (
          <div className="bg-red-500/10 border border-red-500/30 text-red-400 rounded-lg px-4 py-3 mb-6 text-sm">
            {error}
          </div>
        )}

        {loading && (
          <div className="text-center text-zinc-500 py-20">
            Fetching options chains for 5 dates... this may take a moment.
          </div>
        )}

        {data && (
          <>
            {/* Header */}
            <div className="flex items-baseline gap-4 mb-6">
              <span className="text-2xl font-bold">{data.symbol}</span>
              <span className={`text-sm font-medium ${data.optionType === "put" ? "text-red-400" : "text-emerald-400"}`}>
                {data.optionType.toUpperCase()}S
              </span>
              <span className="text-zinc-500 text-sm">Next-week expiry comparison</span>
            </div>

            {/* Section 1: Stock Price Cards */}
            <div className="grid grid-cols-5 gap-3 mb-8">
              {data.dates.map((d) => (
                <div
                  key={d.date}
                  className={`rounded-xl border px-4 py-3 ${
                    d.weeksAgo === 0
                      ? "border-purple-500/40 bg-purple-500/5"
                      : "border-zinc-800/50 bg-zinc-900/50"
                  }`}
                >
                  <div className={`text-[10px] font-medium mb-1 ${d.weeksAgo === 0 ? "text-purple-400" : "text-zinc-500"}`}>
                    {d.label}
                  </div>
                  <div className="text-zinc-400 text-xs mb-2">{d.date}</div>
                  <div className="font-mono text-lg text-zinc-100">
                    ${d.stockPrice.toFixed(2)}
                  </div>
                  <div className="text-zinc-600 text-[10px] mt-1">
                    exp {d.expiration}
                  </div>
                </div>
              ))}
            </div>

            {/* Section 2: Totals Comparison */}
            <div className="bg-zinc-900/50 border border-zinc-800/50 rounded-xl overflow-hidden mb-6">
              <div className="px-4 py-3 border-b border-zinc-800/50">
                <span className="text-sm font-medium text-zinc-300">
                  Total Next-Week Expiry {data.optionType === "put" ? "Puts" : "Calls"}
                </span>
                {data.totalAnomaly.volumeMultiplier && data.totalAnomaly.volumeMultiplier >= 2 && (
                  <span className={`ml-3 text-xs px-2 py-0.5 rounded-full bg-red-500/10 border border-red-500/30 ${multClass(data.totalAnomaly.volumeMultiplier)}`}>
                    Volume {data.totalAnomaly.volumeMultiplier.toFixed(1)}x vs avg
                  </span>
                )}
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-zinc-800/30 text-zinc-600 text-xs">
                      <th className="text-left px-4 py-2 font-medium w-32">Metric</th>
                      {data.dates.map((d) => (
                        <th
                          key={d.date}
                          className={`text-right px-4 py-2 font-medium ${d.weeksAgo === 0 ? "text-purple-400" : ""}`}
                        >
                          {d.weeksAgo === 0 ? "Selected" : `${d.weeksAgo}w`}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="border-b border-zinc-800/20">
                      <td className="px-4 py-2 text-zinc-400">Volume</td>
                      {data.dates.map((d) => (
                        <td
                          key={d.date}
                          className={`px-4 py-2 text-right font-mono ${
                            d.weeksAgo === 0 ? multClass(data.totalAnomaly.volumeMultiplier) : "text-zinc-400"
                          }`}
                        >
                          {d.totalVolume.toLocaleString()}
                          {d.weeksAgo === 0 && multBadge(data.totalAnomaly.volumeMultiplier) && (
                            <span className="ml-1 text-[10px] opacity-80">
                              {multBadge(data.totalAnomaly.volumeMultiplier)}
                            </span>
                          )}
                        </td>
                      ))}
                    </tr>
                    <tr className="border-b border-zinc-800/20">
                      <td className="px-4 py-2 text-zinc-400">Open Interest</td>
                      {data.dates.map((d) => (
                        <td
                          key={d.date}
                          className={`px-4 py-2 text-right font-mono ${
                            d.weeksAgo === 0 ? multClass(data.totalAnomaly.oiMultiplier) : "text-cyan-400/60"
                          }`}
                        >
                          {d.totalOI.toLocaleString()}
                          {d.weeksAgo === 0 && multBadge(data.totalAnomaly.oiMultiplier) && (
                            <span className="ml-1 text-[10px] opacity-80">
                              {multBadge(data.totalAnomaly.oiMultiplier)}
                            </span>
                          )}
                        </td>
                      ))}
                    </tr>
                    <tr className="border-b border-zinc-800/20">
                      <td className="px-4 py-2 text-zinc-400">Avg IV</td>
                      {data.dates.map((d) => (
                        <td key={d.date} className="px-4 py-2 text-right font-mono text-violet-400/60">
                          {d.avgIV.toFixed(1)}%
                        </td>
                      ))}
                    </tr>
                    <tr>
                      <td className="px-4 py-2 text-zinc-400">Contracts</td>
                      {data.dates.map((d) => (
                        <td key={d.date} className="px-4 py-2 text-right font-mono text-zinc-500">
                          {d.contractCount}
                        </td>
                      ))}
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            {/* Section 3: OTM Bucket Breakdown */}
            <div className="bg-zinc-900/50 border border-zinc-800/50 rounded-xl overflow-hidden mb-6">
              <div className="px-4 py-3 border-b border-zinc-800/50">
                <span className="text-sm font-medium text-zinc-300">OTM Bucket Breakdown</span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-zinc-800/30 text-zinc-600 text-xs">
                      <th className="text-left px-4 py-2 font-medium w-24">Bucket</th>
                      <th className="text-left px-4 py-2 font-medium w-16">Metric</th>
                      {data.dates.map((d) => (
                        <th
                          key={d.date}
                          className={`text-right px-4 py-2 font-medium ${d.weeksAgo === 0 ? "text-purple-400" : ""}`}
                        >
                          {d.weeksAgo === 0 ? "Selected" : `${d.weeksAgo}w`}
                        </th>
                      ))}
                      <th className="text-right px-4 py-2 font-medium text-zinc-500">Mult</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.bucketAnomalies.map((ba, bi) => {
                      const bucketRows = [
                        { metric: "Vol", field: "volume" as const, mult: ba.volumeMultiplier },
                        { metric: "OI", field: "oi" as const, mult: ba.oiMultiplier },
                        { metric: "IV", field: "avgIV" as const, mult: null },
                      ];

                      return bucketRows.map((row, ri) => (
                        <tr
                          key={`${bi}-${ri}`}
                          className={`border-b border-zinc-800/20 ${ri === 0 ? "border-t border-zinc-700/30" : ""}`}
                        >
                          {ri === 0 && (
                            <td rowSpan={3} className="px-4 py-2 text-zinc-200 font-medium text-xs align-top">
                              {ba.bucket}
                            </td>
                          )}
                          <td className="px-4 py-2 text-zinc-500 text-xs">{row.metric}</td>
                          {data.dates.map((d) => {
                            const bucket = d.buckets[bi];
                            const val = row.field === "avgIV" ? bucket.avgIV : bucket[row.field];
                            const isSelected = d.weeksAgo === 0;
                            const color = isSelected && row.mult !== null
                              ? multClass(row.mult)
                              : row.field === "oi"
                              ? "text-cyan-400/50"
                              : row.field === "avgIV"
                              ? "text-violet-400/50"
                              : "text-zinc-400";

                            return (
                              <td key={d.date} className={`px-4 py-2 text-right font-mono text-xs ${color}`}>
                                {row.field === "avgIV"
                                  ? `${val.toFixed(1)}%`
                                  : val.toLocaleString()}
                                {isSelected && row.mult !== null && multBadge(row.mult) && (
                                  <span className="ml-1 text-[10px] opacity-80">{multBadge(row.mult)}</span>
                                )}
                              </td>
                            );
                          })}
                          <td className={`px-4 py-2 text-right font-mono text-xs ${multClass(row.mult)}`}>
                            {row.mult !== null ? `${row.mult.toFixed(1)}x` : row.field === "avgIV" && ba.ivDelta !== null ? `${ba.ivDelta > 0 ? "+" : ""}${ba.ivDelta.toFixed(1)}%` : "—"}
                          </td>
                        </tr>
                      ));
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Section 4: Top Strikes */}
            <div className="bg-zinc-900/50 border border-zinc-800/50 rounded-xl overflow-hidden">
              <div className="px-4 py-3 border-b border-zinc-800/50">
                <span className="text-sm font-medium text-zinc-300">Top Strikes by Volume (Selected Date)</span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-zinc-800/30 text-zinc-600 text-xs">
                      <th className="text-left px-4 py-2 font-medium">Strike</th>
                      <th className="text-right px-3 py-2 font-medium">OTM%</th>
                      <th className="text-right px-3 py-2 font-medium">Volume</th>
                      <th className="text-right px-3 py-2 font-medium">OI</th>
                      <th className="text-right px-3 py-2 font-medium">IV</th>
                      <th className="text-right px-3 py-2 font-medium">Last</th>
                      <th className="text-right px-3 py-2 font-medium">Bid/Ask</th>
                      <th className="text-right px-3 py-2 font-medium">Delta</th>
                      <th className="text-right px-3 py-2 font-medium">Vol Mult</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.topStrikes.map((s) => (
                      <React.Fragment key={s.strike}>
                        <tr
                          className="border-b border-zinc-800/20 hover:bg-zinc-800/30 cursor-pointer transition-colors"
                          onClick={() => setExpandedStrike(expandedStrike === s.strike ? null : s.strike)}
                        >
                          <td className="px-4 py-2 font-mono text-zinc-200">
                            <span className="mr-2 text-zinc-600 text-[10px]">{expandedStrike === s.strike ? "▼" : "▶"}</span>
                            ${s.strike.toFixed(0)}
                          </td>
                          <td className="px-3 py-2 text-right font-mono text-zinc-400">{s.otmPct.toFixed(1)}%</td>
                          <td className={`px-3 py-2 text-right font-mono ${multClass(s.volumeMultiplier)}`}>
                            {s.volume.toLocaleString()}
                            {multBadge(s.volumeMultiplier) && (
                              <span className="ml-1 text-[10px] opacity-80">{multBadge(s.volumeMultiplier)}</span>
                            )}
                          </td>
                          <td className="px-3 py-2 text-right font-mono text-cyan-400/70">{s.oi.toLocaleString()}</td>
                          <td className="px-3 py-2 text-right font-mono text-violet-400/70">{s.iv.toFixed(1)}%</td>
                          <td className="px-3 py-2 text-right font-mono text-zinc-300">${s.last.toFixed(2)}</td>
                          <td className="px-3 py-2 text-right font-mono text-zinc-500 text-xs">
                            ${s.bid.toFixed(2)} / ${s.ask.toFixed(2)}
                          </td>
                          <td className="px-3 py-2 text-right font-mono text-zinc-400">{s.delta.toFixed(3)}</td>
                          <td className={`px-3 py-2 text-right font-mono font-medium ${multClass(s.volumeMultiplier)}`}>
                            {s.volumeMultiplier !== null ? `${s.volumeMultiplier.toFixed(1)}x` : "—"}
                          </td>
                        </tr>
                        {expandedStrike === s.strike && (
                          <tr className="bg-zinc-800/20">
                            <td colSpan={9} className="px-8 py-3">
                              <div className="text-[10px] text-zinc-500 mb-2">Historical comparison for ${s.strike} strike</div>
                              <div className="grid grid-cols-4 gap-3">
                                {s.history.map((h) => (
                                  <div key={h.date} className="bg-zinc-900/60 rounded-lg px-3 py-2 border border-zinc-800/30">
                                    <div className="text-zinc-500 text-[10px] mb-1">{h.date}</div>
                                    <div className="flex justify-between text-xs">
                                      <span className="text-zinc-400">Vol</span>
                                      <span className="font-mono text-zinc-300">{h.volume.toLocaleString()}</span>
                                    </div>
                                    <div className="flex justify-between text-xs">
                                      <span className="text-zinc-400">OI</span>
                                      <span className="font-mono text-cyan-400/60">{h.oi.toLocaleString()}</span>
                                    </div>
                                    <div className="flex justify-between text-xs">
                                      <span className="text-zinc-400">IV</span>
                                      <span className="font-mono text-violet-400/60">{h.iv.toFixed(1)}%</span>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}

        {!data && !loading && !error && (
          <div className="text-center text-zinc-600 py-20">
            Compare options chain activity against prior weeks to spot anomalies
          </div>
        )}
      </main>
    </div>
  );
}
