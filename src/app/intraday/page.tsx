"use client";

import { useState } from "react";
import Link from "next/link";

interface StrikeInfo {
  strike: number;
  ticker: string;
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
                          <th className="text-left px-4 py-2 font-medium">Time</th>
                          <th className="text-right px-4 py-2 font-medium">Price</th>
                          <th className="text-right px-4 py-2 font-medium">5% OTM</th>
                          <th className="text-right px-4 py-2 font-medium">10% OTM</th>
                          <th className="text-right px-4 py-2 font-medium">15% OTM</th>
                          <th className="text-right px-4 py-2 font-medium">20% OTM</th>
                        </tr>
                      </thead>
                      <tbody>
                        {week.hours.map((h) => (
                          <tr
                            key={h.hour}
                            className="border-b border-zinc-800/20 hover:bg-zinc-800/30 transition-colors"
                          >
                            <td className="px-4 py-2 text-zinc-400">{h.label}</td>
                            <td className="px-4 py-2 text-right font-mono text-zinc-200">
                              {fmt(h.close)}
                            </td>
                            {([h.otm5, h.otm10, h.otm15, h.otm20] as (StrikeInfo | null)[]).map((s, idx) => (
                              <td key={idx} className="px-4 py-2 text-right">
                                {s ? (
                                  <div>
                                    <span className="font-mono text-zinc-300">${s.strike}</span>
                                    <div className="text-[10px] text-zinc-600 font-mono truncate max-w-[180px]">
                                      {s.ticker}
                                    </div>
                                  </div>
                                ) : (
                                  <span className="text-zinc-700">—</span>
                                )}
                              </td>
                            ))}
                          </tr>
                        ))}
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
