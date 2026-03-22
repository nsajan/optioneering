"use client";

import React, { useState } from "react";
import Link from "next/link";

const OTM_LABELS = [5, 10, 15, 20];

interface StrikeInfo {
  strike: number;
  ticker: string;
  premium: number | null;
  volume: number | null;
}

interface HourData {
  hour: number;
  label: string;
  close: number | null;
  otm5: StrikeInfo | null;
  otm10: StrikeInfo | null;
  otm15: StrikeInfo | null;
  otm20: StrikeInfo | null;
}

interface WeekData {
  date: string;
  weeksAgo: number;
  label: string;
  expiration: string;
  summary: {
    open: number | null;
    close: number | null;
  };
  hours: HourData[];
}

interface IntradayData {
  symbol: string;
  date: string;
  optionType: "put" | "call";
  timezone: string;
  weeks: WeekData[];
}

const POPULAR = ["SMCI", "TSLA", "NVDA", "AAPL", "AMD", "PLTR", "HIMS", "TTD"];

export default function IntradayPage() {
  const [symbol, setSymbol] = useState("");
  const [date, setDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    return d.toISOString().split("T")[0];
  });
  const [optionType, setOptionType] = useState<"put" | "call">("put");
  const [data, setData] = useState<IntradayData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const fetch_ = async (ticker?: string) => {
    const t = (ticker || symbol).trim().toUpperCase();
    if (!t || !date) return;
    setSymbol(t);
    setLoading(true);
    setError("");
    setData(null);

    try {
      const res = await fetch(`/api/intraday?symbol=${t}&date=${date}&type=${optionType}`);
      const json = await res.json();
      if (json.error) throw new Error(json.error);
      setData(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    }
    setLoading(false);
  };

  const fmt = (v: number | null) => (v !== null ? `$${v.toFixed(2)}` : "—");

  // Average of prior weeks' value for a given hour, otmKey, and field (volume or premium)
  function getAvgPrior(hour: number, otmKey: string, field: "volume" | "premium"): number | null {
    if (!data || data.weeks.length < 2) return null;
    const priorWeeks = data.weeks.slice(1);
    const vals: number[] = [];
    for (const w of priorWeeks) {
      const h = w.hours.find((h) => h.hour === hour);
      if (!h) continue;
      const s = (h as Record<string, unknown>)[otmKey] as StrikeInfo | null;
      const v = s?.[field];
      if (v !== null && v !== undefined) vals.push(v);
    }
    if (vals.length === 0) return null;
    return vals.reduce((a, b) => a + b, 0) / vals.length;
  }

  function multColor(val: number | null | undefined, hour: number, otmKey: string, field: "volume" | "premium", isSelectedWeek: boolean): string {
    if (!isSelectedWeek || val === null || val === undefined) return field === "volume" ? "text-zinc-500" : "text-zinc-300";
    const avg = getAvgPrior(hour, otmKey, field);
    if (avg === null || avg === 0) return val > 0 ? "text-yellow-400" : (field === "volume" ? "text-zinc-500" : "text-zinc-300");
    const mult = val / avg;
    if (mult >= 5) return "text-red-400 font-semibold";
    if (mult >= 3) return "text-orange-400 font-medium";
    if (mult >= 2) return "text-yellow-400";
    return field === "volume" ? "text-zinc-500" : "text-zinc-300";
  }

  function multBadge(val: number | null | undefined, hour: number, otmKey: string, field: "volume" | "premium", isSelectedWeek: boolean): string | null {
    if (!isSelectedWeek || val === null || val === undefined) return null;
    const avg = getAvgPrior(hour, otmKey, field);
    if (avg === null || avg === 0) return null;
    const mult = val / avg;
    if (mult >= 2) return `${mult.toFixed(1)}x`;
    return null;
  }

  return (
    <div className="min-h-screen bg-[#0a0a0f] text-zinc-100">
      <nav className="border-b border-zinc-800/50 bg-[#0a0a0f]/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-[90rem] mx-auto px-6 py-4 flex items-center justify-between">
          <Link href="/" className="text-zinc-500 hover:text-zinc-300 text-sm">
            &larr; Home
          </Link>
          <h1 className="text-lg font-semibold tracking-tight">Intraday Prices</h1>
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
              onKeyDown={(e) => e.key === "Enter" && fetch_()}
              placeholder="AAPL"
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
            onClick={() => fetch_()}
            disabled={loading}
            className="bg-purple-600 hover:bg-purple-500 disabled:bg-zinc-700 px-5 py-2 rounded-lg text-sm font-medium transition-colors"
          >
            {loading ? "Loading..." : "Fetch"}
          </button>
        </div>

        {/* Quick tickers */}
        <div className="flex flex-wrap gap-2 mb-8">
          {POPULAR.map((t) => (
            <button
              key={t}
              onClick={() => fetch_(t)}
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

        {data && (
          <>
            {/* Header */}
            <div className="flex items-baseline gap-4 mb-6">
              <span className="text-2xl font-bold">{data.symbol}</span>
              <span className={`text-sm font-medium ${data.optionType === "put" ? "text-red-400" : "text-emerald-400"}`}>
                {data.optionType.toUpperCase()}S
              </span>
              <span className="text-zinc-500 text-sm">{data.timezone}</span>
            </div>

            {/* 4 tables stacked */}
            <div className="space-y-6">
              {data.weeks.map((week) => (
                <div
                  key={week.date}
                  className={`bg-zinc-900/50 border rounded-xl overflow-hidden ${
                    week.weeksAgo === 0 ? "border-purple-500/40" : "border-zinc-800/50"
                  }`}
                >
                  <div className="px-4 py-3 border-b border-zinc-800/50 flex items-baseline justify-between">
                    <div className="flex items-baseline gap-3">
                      <span className={`text-sm font-medium ${week.weeksAgo === 0 ? "text-purple-400" : "text-zinc-400"}`}>
                        {week.label}
                      </span>
                      <span className="text-zinc-600 text-xs">{week.date}</span>
                      <span className="text-zinc-700 text-xs">exp {week.expiration}</span>
                    </div>
                    {week.summary.close !== null && (
                      <span className="font-mono text-sm text-zinc-300">{fmt(week.summary.close)}</span>
                    )}
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-zinc-800/30 text-zinc-600 text-xs">
                          <th className="text-left px-3 py-2 font-medium">Time</th>
                          <th className="text-right px-3 py-2 font-medium">Price</th>
                          {OTM_LABELS.map((pct) => (
                            <th key={pct} className="text-center px-1 py-2 font-medium" colSpan={2}>
                              {pct}% OTM
                            </th>
                          ))}
                        </tr>
                        <tr className="border-b border-zinc-800/20 text-zinc-700 text-[10px]">
                          <th></th>
                          <th></th>
                          {OTM_LABELS.map((pct) => (
                            <React.Fragment key={pct}>
                              <th className="text-right px-1 py-1 font-normal">Premium</th>
                              <th className="text-right px-1 py-1 font-normal">Vol</th>
                            </React.Fragment>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {week.hours.map((h) => {
                          const otmKeys = ["otm5", "otm10", "otm15", "otm20"];
                          const strikes = [h.otm5, h.otm10, h.otm15, h.otm20];
                          const isSelected = week.weeksAgo === 0;

                          return (
                            <tr
                              key={h.hour}
                              className="border-b border-zinc-800/20 hover:bg-zinc-800/30 transition-colors"
                            >
                              <td className="px-3 py-2 text-zinc-400">{h.label}</td>
                              <td className="px-3 py-2 text-right font-mono text-zinc-200">
                                {fmt(h.close)}
                              </td>
                              {strikes.map((s, idx) => {
                                const key = otmKeys[idx];
                                const pc = multColor(s?.premium, h.hour, key, "premium", isSelected);
                                const pBadge = multBadge(s?.premium, h.hour, key, "premium", isSelected);
                                const vc = multColor(s?.volume, h.hour, key, "volume", isSelected);
                                const vBadge = multBadge(s?.volume, h.hour, key, "volume", isSelected);

                                return (
                                  <React.Fragment key={idx}>
                                    <td className={`px-1 py-2 text-right font-mono text-sm ${pc}`}>
                                      {s?.premium !== null && s?.premium !== undefined ? (
                                        <span>
                                          ${s.premium.toFixed(2)}
                                          {pBadge && (
                                            <span className="ml-1 text-[10px] opacity-80">
                                              {pBadge}
                                            </span>
                                          )}
                                        </span>
                                      ) : (
                                        <span className="text-zinc-700">—</span>
                                      )}
                                    </td>
                                    <td className={`px-1 py-2 text-right font-mono text-xs ${vc}`}>
                                      {s?.volume !== null && s?.volume !== undefined ? (
                                        <span>
                                          {s.volume.toLocaleString()}
                                          {vBadge && (
                                            <span className="ml-1 text-[10px] opacity-80">
                                              {vBadge}
                                            </span>
                                          )}
                                        </span>
                                      ) : (
                                        <span className="text-zinc-700">—</span>
                                      )}
                                    </td>
                                  </React.Fragment>
                                );
                              })}
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}

        {!data && !loading && !error && (
          <div className="text-center text-zinc-600 py-20">
            Select a ticker and date to view hourly prices with option codes
          </div>
        )}
      </main>
    </div>
  );
}
