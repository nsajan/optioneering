"use client";

import { useState, useEffect } from "react";
import Link from "next/link";

interface Signal {
  signalType: string;
  type: "call" | "put";
  otmPercent: number;
  strike: number;
  severity: "low" | "medium" | "high" | "extreme";
  multiplier: number;
  title: string;
  description: string;
}

interface TickerResult {
  ticker: string;
  currentPrice: number;
  expiration: string;
  signalCount: number;
  topSeverity: string;
  maxMultiplier: number;
  signals: Signal[];
  error?: string;
}

interface ScanResult {
  scannedAt: string;
  totalTickers: number;
  flaggedCount: number;
  cleanCount: number;
  errorCount: number;
  flagged: TickerResult[];
  clean: { ticker: string; currentPrice: number }[];
  errors: { ticker: string; error: string }[];
}

const SEVERITY_COLORS: Record<string, { bg: string; text: string; ring: string; dot: string }> = {
  extreme: { bg: "bg-red-500/10", text: "text-red-400", ring: "ring-red-500/40", dot: "bg-red-400" },
  high: { bg: "bg-orange-500/10", text: "text-orange-400", ring: "ring-orange-500/40", dot: "bg-orange-400" },
  medium: { bg: "bg-yellow-500/10", text: "text-yellow-400", ring: "ring-yellow-500/40", dot: "bg-yellow-400" },
  low: { bg: "bg-zinc-500/10", text: "text-zinc-500", ring: "ring-zinc-500/30", dot: "bg-zinc-500" },
};

const SIGNAL_ICONS: Record<string, string> = {
  weekly_volume: "V",
  daily_spike: "D",
  block_trade: "B",
  price_divergence: "P",
};

const STORAGE_KEY = "optioneering_watchlist";

const DEFAULT_WATCHLIST = [
  "SMCI", "TSLA", "NVDA", "AAPL", "AMD", "PLTR", "HIMS", "NBIS",
  "TTD", "SOFI", "RIVN", "LCID", "MARA", "COIN", "SNAP", "ROKU",
];

export default function WatchlistPage() {
  const [watchlist, setWatchlist] = useState<string[]>([]);
  const [newTicker, setNewTicker] = useState("");
  const [data, setData] = useState<ScanResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [progress, setProgress] = useState("");
  const [expandedTicker, setExpandedTicker] = useState<string | null>(null);

  // Load watchlist from localStorage
  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      try {
        setWatchlist(JSON.parse(saved));
      } catch {
        setWatchlist(DEFAULT_WATCHLIST);
      }
    } else {
      setWatchlist(DEFAULT_WATCHLIST);
    }
  }, []);

  // Save watchlist to localStorage
  useEffect(() => {
    if (watchlist.length > 0) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(watchlist));
    }
  }, [watchlist]);

  const addTicker = () => {
    const t = newTicker.trim().toUpperCase();
    if (t && !watchlist.includes(t)) {
      setWatchlist([...watchlist, t]);
      setNewTicker("");
    }
  };

  const removeTicker = (t: string) => {
    setWatchlist(watchlist.filter((x) => x !== t));
  };

  const scan = async () => {
    if (watchlist.length === 0) return;
    setLoading(true);
    setError("");
    setData(null);
    setProgress(`Scanning ${watchlist.length} tickers...`);

    try {
      const res = await fetch("/api/watchlist-scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tickers: watchlist }),
      });
      const json = await res.json();
      if (json.error) throw new Error(json.error);
      setData(json);
      setProgress("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Scan failed");
      setProgress("");
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-[#0a0a0f] text-zinc-100">
      <nav className="border-b border-zinc-800/50 bg-[#0a0a0f]/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href="/" className="flex items-center gap-2 hover:opacity-80 transition-opacity">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-sm font-bold">O</div>
              <span className="text-lg font-semibold tracking-tight">Optioneering</span>
            </Link>
            <span className="text-zinc-600">|</span>
            <span className="text-sm text-zinc-400">Watchlist Scanner</span>
          </div>
          <div className="flex items-center gap-2">
            <Link href="/analyze" className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors">Scanner</Link>
            <Link href="/volume-spike" className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors">Vol Spike</Link>
            <Link href="/oi-surge" className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors">OI Surge</Link>
          </div>
        </div>
      </nav>

      <main className="max-w-5xl mx-auto px-6 py-8">
        {/* Watchlist Management */}
        <div className="mb-8 space-y-4">
          <div className="flex items-end gap-3">
            <div>
              <label className="block text-[10px] text-zinc-500 uppercase tracking-wider mb-1">Add Ticker</label>
              <form onSubmit={(e) => { e.preventDefault(); addTicker(); }} className="flex gap-2">
                <input
                  type="text"
                  value={newTicker}
                  onChange={(e) => setNewTicker(e.target.value.toUpperCase())}
                  placeholder="AAPL"
                  className="w-28 bg-zinc-900/80 border border-zinc-700/50 rounded-lg px-3 py-2 text-sm font-mono text-zinc-100 placeholder-zinc-600 focus:outline-none focus:ring-2 focus:ring-purple-500/50"
                />
                <button type="submit" className="px-3 py-2 bg-zinc-800 hover:bg-zinc-700 rounded-lg text-sm transition-colors">+</button>
              </form>
            </div>
            <button
              onClick={scan}
              disabled={loading || watchlist.length === 0}
              className="bg-purple-600 hover:bg-purple-500 disabled:opacity-50 px-6 py-2 rounded-lg text-sm font-medium transition-colors"
            >
              {loading ? (
                <span className="flex items-center gap-2">
                  <span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Scanning...
                </span>
              ) : `Scan ${watchlist.length} Tickers`}
            </button>
          </div>

          {/* Watchlist pills */}
          <div className="flex flex-wrap gap-1.5">
            {watchlist.map((t) => {
              const flagged = data?.flagged.find((f) => f.ticker === t);
              const sevColor = flagged ? SEVERITY_COLORS[flagged.topSeverity] : null;
              return (
                <div
                  key={t}
                  className={`group flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-mono border transition-colors ${
                    flagged
                      ? `${sevColor!.bg} ${sevColor!.text} border-transparent ring-1 ${sevColor!.ring}`
                      : "bg-zinc-900 border-zinc-800 text-zinc-400 hover:border-zinc-700"
                  }`}
                >
                  {flagged && <span className={`w-1.5 h-1.5 rounded-full ${sevColor!.dot} animate-pulse`} />}
                  {t}
                  {flagged && <span className="text-[10px] opacity-70">{flagged.signalCount}</span>}
                  <button
                    onClick={() => removeTicker(t)}
                    className="opacity-0 group-hover:opacity-100 text-zinc-500 hover:text-zinc-300 ml-0.5 transition-opacity"
                  >
                    x
                  </button>
                </div>
              );
            })}
          </div>
        </div>

        {error && (
          <div className="bg-red-900/20 border border-red-800/50 rounded-lg p-4 mb-6 text-red-300 text-sm">{error}</div>
        )}

        {loading && (
          <div className="flex flex-col items-center justify-center py-24 gap-4">
            <div className="w-12 h-12 border-3 border-zinc-700 border-t-purple-500 rounded-full animate-spin" />
            <p className="text-zinc-500 text-sm">{progress}</p>
            <p className="text-zinc-600 text-xs">Checking {watchlist.length} tickers across 3 weeks of OTM options data...</p>
          </div>
        )}

        {data && (
          <div className="space-y-6">
            {/* Summary Stats */}
            <div className="flex flex-wrap gap-3">
              <StatBox label="Scanned" value={String(data.totalTickers)} sub={new Date(data.scannedAt).toLocaleTimeString()} color="zinc" />
              <StatBox
                label="Flagged"
                value={String(data.flaggedCount)}
                sub={`${data.cleanCount} clean`}
                color={data.flaggedCount > 0 ? "red" : "zinc"}
              />
              {data.flagged.length > 0 && (
                <StatBox
                  label="Top Signal"
                  value={`${data.flagged[0].maxMultiplier}x`}
                  sub={data.flagged[0].ticker}
                  color={data.flagged[0].topSeverity === "extreme" ? "red" : "amber"}
                />
              )}
            </div>

            {/* Flagged Tickers */}
            {data.flagged.length > 0 && (
              <div className="space-y-3">
                <h3 className="text-sm font-medium text-red-400 flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-red-400 animate-pulse" />
                  Flagged Tickers ({data.flaggedCount})
                </h3>
                {data.flagged.map((r) => (
                  <FlaggedCard
                    key={r.ticker}
                    result={r}
                    isExpanded={expandedTicker === r.ticker}
                    onToggle={() => setExpandedTicker(expandedTicker === r.ticker ? null : r.ticker)}
                  />
                ))}
              </div>
            )}

            {/* Clean Tickers */}
            {data.clean.length > 0 && (
              <div>
                <h3 className="text-sm font-medium text-emerald-400 mb-3">Clean ({data.cleanCount})</h3>
                <div className="flex flex-wrap gap-2">
                  {data.clean.map((r) => (
                    <span key={r.ticker} className="px-3 py-1.5 bg-emerald-500/5 border border-emerald-500/20 rounded-lg text-sm font-mono text-emerald-400/70">
                      {r.ticker} <span className="text-zinc-600">${r.currentPrice.toFixed(2)}</span>
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Errors */}
            {data.errors.length > 0 && (
              <div>
                <h3 className="text-sm font-medium text-zinc-500 mb-2">Errors ({data.errorCount})</h3>
                <div className="flex flex-wrap gap-2">
                  {data.errors.map((r) => (
                    <span key={r.ticker} className="px-3 py-1.5 bg-zinc-900 border border-zinc-800 rounded-lg text-sm font-mono text-zinc-600">
                      {r.ticker} <span className="text-[10px]">{r.error}</span>
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {!data && !loading && !error && (
          <div className="text-center py-24">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-red-500/20 to-purple-600/20 border border-red-500/10 flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-red-400/60" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
              </svg>
            </div>
            <p className="text-zinc-500">Scan your watchlist for unusual options activity across all tickers at once</p>
            <p className="text-zinc-600 text-sm mt-1">Add tickers above and hit Scan to find anomalies</p>
          </div>
        )}
      </main>
    </div>
  );
}

/* ── Flagged Ticker Card ── */

function FlaggedCard({ result, isExpanded, onToggle }: {
  result: TickerResult;
  isExpanded: boolean;
  onToggle: () => void;
}) {
  const sev = SEVERITY_COLORS[result.topSeverity] || SEVERITY_COLORS.low;

  // Count signal types
  const typeCounts: Record<string, number> = {};
  const sideCounts = { call: 0, put: 0 };
  for (const s of result.signals) {
    typeCounts[s.signalType] = (typeCounts[s.signalType] || 0) + 1;
    sideCounts[s.type]++;
  }

  return (
    <div className={`${sev.bg} border rounded-xl overflow-hidden ring-1 ${sev.ring}`}>
      <button
        onClick={onToggle}
        className="w-full px-5 py-4 flex items-center justify-between hover:bg-white/[0.02] transition-colors"
      >
        <div className="flex items-center gap-4">
          <div className="text-left">
            <div className="flex items-center gap-3">
              <span className={`w-2.5 h-2.5 rounded-full ${sev.dot} animate-pulse`} />
              <span className="text-xl font-bold font-mono">{result.ticker}</span>
              <span className="text-lg font-mono text-zinc-400">${result.currentPrice.toFixed(2)}</span>
              <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${sev.bg} ${sev.text} ring-1 ${sev.ring}`}>
                {result.topSeverity}
              </span>
            </div>
            <div className="flex items-center gap-3 mt-1">
              <span className="text-xs text-zinc-500">Exp: {result.expiration}</span>
              <span className="text-xs text-zinc-500">{result.signalCount} signals</span>
              {/* Signal type mini badges */}
              <div className="flex gap-1">
                {Object.entries(typeCounts).map(([type, count]) => (
                  <span key={type} className="px-1.5 py-0.5 rounded text-[9px] font-mono bg-zinc-800 text-zinc-400">
                    {SIGNAL_ICONS[type] || "?"}{count}
                  </span>
                ))}
              </div>
              {/* Call/Put breakdown */}
              <div className="flex gap-1">
                {sideCounts.call > 0 && <span className="text-[10px] text-emerald-400/70">{sideCounts.call}C</span>}
                {sideCounts.put > 0 && <span className="text-[10px] text-red-400/70">{sideCounts.put}P</span>}
              </div>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <div className="text-right">
            <div className={`text-2xl font-bold font-mono ${sev.text}`}>{result.maxMultiplier}x</div>
            <div className="text-[10px] text-zinc-600">top signal</div>
          </div>
          <Link
            href={`/analyze?ticker=${result.ticker}`}
            onClick={(e) => e.stopPropagation()}
            className="px-3 py-1.5 bg-purple-600/20 hover:bg-purple-600/30 text-purple-300 rounded-lg text-xs font-medium transition-colors"
          >
            Deep Scan
          </Link>
          <svg className={`w-4 h-4 text-zinc-500 transition-transform ${isExpanded ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </button>

      {isExpanded && (
        <div className="border-t border-zinc-800/30 px-5 py-3">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-zinc-500 text-[10px] uppercase">
                <th className="py-1 text-left font-medium">Signal</th>
                <th className="py-1 text-left font-medium">Type</th>
                <th className="py-1 text-right font-medium">Strike</th>
                <th className="py-1 text-right font-medium">OTM%</th>
                <th className="py-1 text-right font-medium">Multiplier</th>
                <th className="py-1 text-left font-medium pl-4">Detail</th>
              </tr>
            </thead>
            <tbody>
              {result.signals.map((s, i) => {
                const ss = SEVERITY_COLORS[s.severity] || SEVERITY_COLORS.low;
                return (
                  <tr key={i} className="border-t border-zinc-800/20">
                    <td className="py-1.5">
                      <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold uppercase ${ss.bg} ${ss.text} ring-1 ${ss.ring}`}>
                        {s.severity}
                      </span>
                    </td>
                    <td className={`py-1.5 text-xs font-mono ${s.type === "call" ? "text-emerald-400" : "text-red-400"}`}>
                      {s.type.toUpperCase()}
                    </td>
                    <td className="py-1.5 text-right font-mono text-zinc-300">${s.strike}</td>
                    <td className="py-1.5 text-right font-mono text-zinc-500">{s.otmPercent}%</td>
                    <td className={`py-1.5 text-right font-mono font-bold ${ss.text}`}>{s.multiplier}x</td>
                    <td className="py-1.5 text-xs text-zinc-500 pl-4 max-w-xs truncate">{s.title}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/* ── Stat Box ── */

function StatBox({ label, value, sub, color }: {
  label: string;
  value: string;
  sub: string;
  color: "red" | "amber" | "zinc";
}) {
  const styles = {
    red: "bg-red-500/10 border-red-500/30 text-red-400",
    amber: "bg-amber-500/10 border-amber-500/30 text-amber-400",
    zinc: "bg-zinc-800/50 border-zinc-700/30 text-zinc-400",
  };

  return (
    <div className={`px-4 py-3 rounded-xl border text-center ${styles[color]}`}>
      <div className="text-[10px] uppercase tracking-wider opacity-70 mb-1">{label}</div>
      <div className="text-2xl font-bold font-mono">{value}</div>
      <div className="text-[10px] opacity-60 mt-0.5">{sub}</div>
    </div>
  );
}
