"use client";

import { useState } from "react";
import Link from "next/link";

interface DailyBar {
  date: string;
  volume: number;
  trades: number;
  open: number;
  close: number;
  high: number;
  low: number;
  avgSize: number;
  vwap: number;
  dollarVolume: number;
}

interface WeekData {
  expiration: string;
  ticker: string;
  totalVolume: number;
  totalTrades: number;
  totalDollarVolume: number;
  avgDailyVolume: number;
  peakDayVolume: number;
  peakDay: string;
  tradingDays: number;
  dailyBars: DailyBar[];
  zScore: number;
  isSpike: boolean;
  vsAvg: number;
}

interface SpikeDay {
  date: string;
  volume: number;
  trades: number;
  avgSize: number;
  dollarVolume: number;
  zScore: number;
}

interface VolumeSpikeData {
  ticker: string;
  currentPrice: number;
  strike: number;
  contractType: "put" | "call";
  otmPercent: number;
  weeks: WeekData[];
  stats: {
    avgWeeklyVolume: number;
    stdDev: number;
    avgDailyVolume: number;
    dailyStdDev: number;
  };
  spikeDays: SpikeDay[];
}

const POPULAR = ["SMCI", "TSLA", "NVDA", "AAPL", "AMD", "PLTR", "HIMS", "NBIS"];

export default function VolumeSpikePage() {
  const [symbol, setSymbol] = useState("");
  const [strike, setStrike] = useState("");
  const [contractType, setContractType] = useState<"put" | "call">("put");
  const [weeks, setWeeks] = useState(6);
  const [data, setData] = useState<VolumeSpikeData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [expandedWeek, setExpandedWeek] = useState<string | null>(null);

  const scan = async (ticker?: string) => {
    const t = (ticker || symbol).trim().toUpperCase();
    if (!t || !strike) return;
    setSymbol(t);
    setLoading(true);
    setError("");
    setData(null);

    try {
      const res = await fetch(
        `/api/volume-spike/${t}?strike=${strike}&type=${contractType}&weeks=${weeks}`
      );
      const json = await res.json();
      if (json.error) throw new Error(json.error);
      setData(json);
      // Auto-expand the spike week if there is one
      const spike = json.weeks.find((w: WeekData) => w.isSpike);
      if (spike) setExpandedWeek(spike.expiration);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
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
            <span className="text-sm text-zinc-400">Volume Spike</span>
          </div>
          <div className="flex items-center gap-2">
            <Link href="/analyze" className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors">Scanner</Link>
            <Link href="/oi-surge" className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors">OI Surge</Link>
          </div>
        </div>
      </nav>

      <main className="max-w-5xl mx-auto px-6 py-8">
        {/* Controls */}
        <div className="mb-8 space-y-4">
          <form onSubmit={(e) => { e.preventDefault(); scan(); }} className="flex flex-wrap items-end gap-3">
            <div>
              <label className="block text-[10px] text-zinc-500 uppercase tracking-wider mb-1">Ticker</label>
              <input
                type="text"
                value={symbol}
                onChange={(e) => setSymbol(e.target.value.toUpperCase())}
                placeholder="SMCI"
                className="w-28 bg-zinc-900/80 border border-zinc-700/50 rounded-lg px-3 py-2 text-sm font-mono text-zinc-100 placeholder-zinc-600 focus:outline-none focus:ring-2 focus:ring-purple-500/50"
              />
            </div>
            <div>
              <label className="block text-[10px] text-zinc-500 uppercase tracking-wider mb-1">Strike</label>
              <input
                type="number"
                value={strike}
                onChange={(e) => setStrike(e.target.value)}
                placeholder="25"
                step="0.5"
                className="w-24 bg-zinc-900/80 border border-zinc-700/50 rounded-lg px-3 py-2 text-sm font-mono text-zinc-100 placeholder-zinc-600 focus:outline-none focus:ring-2 focus:ring-purple-500/50"
              />
            </div>
            <div>
              <label className="block text-[10px] text-zinc-500 uppercase tracking-wider mb-1">Type</label>
              <div className="flex rounded-lg overflow-hidden border border-zinc-700/50">
                <button
                  type="button"
                  onClick={() => setContractType("put")}
                  className={`px-4 py-2 text-sm font-medium transition-colors ${
                    contractType === "put"
                      ? "bg-red-500/20 text-red-300 border-r border-red-500/30"
                      : "bg-zinc-900/80 text-zinc-500 border-r border-zinc-700/50 hover:text-zinc-300"
                  }`}
                >
                  Put
                </button>
                <button
                  type="button"
                  onClick={() => setContractType("call")}
                  className={`px-4 py-2 text-sm font-medium transition-colors ${
                    contractType === "call"
                      ? "bg-emerald-500/20 text-emerald-300"
                      : "bg-zinc-900/80 text-zinc-500 hover:text-zinc-300"
                  }`}
                >
                  Call
                </button>
              </div>
            </div>
            <div>
              <label className="block text-[10px] text-zinc-500 uppercase tracking-wider mb-1">Weeks</label>
              <select
                value={weeks}
                onChange={(e) => setWeeks(Number(e.target.value))}
                className="bg-zinc-900/80 border border-zinc-700/50 rounded-lg px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:ring-2 focus:ring-purple-500/50"
              >
                {[4, 5, 6, 8, 10].map((v) => (
                  <option key={v} value={v}>{v}</option>
                ))}
              </select>
            </div>
            <button
              type="submit"
              disabled={loading || !strike}
              className="bg-purple-600 hover:bg-purple-500 disabled:opacity-50 px-5 py-2 rounded-lg text-sm font-medium transition-colors"
            >
              {loading ? (
                <span className="flex items-center gap-2">
                  <span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Loading
                </span>
              ) : "Scan"}
            </button>
          </form>

          {!data && !loading && (
            <div className="flex flex-wrap gap-2">
              {POPULAR.map((t) => (
                <button key={t} onClick={() => { setSymbol(t); }}
                  className="px-4 py-2 bg-zinc-900 border border-zinc-800 rounded-lg text-sm font-mono hover:bg-zinc-800 hover:border-zinc-700 transition-colors">
                  {t}
                </button>
              ))}
            </div>
          )}
        </div>

        {error && (
          <div className="bg-red-900/20 border border-red-800/50 rounded-lg p-4 mb-6 text-red-300 text-sm">{error}</div>
        )}

        {loading && (
          <div className="flex flex-col items-center justify-center py-32 gap-4">
            <div className="w-12 h-12 border-3 border-zinc-700 border-t-purple-500 rounded-full animate-spin" />
            <p className="text-zinc-500 text-sm">Fetching volume across {weeks} weekly expirations...</p>
          </div>
        )}

        {data && (
          <div className="space-y-8">
            {/* Header */}
            <div className="flex flex-wrap items-center gap-6">
              <div>
                <div className="flex items-center gap-3">
                  <h2 className="text-3xl font-bold">{data.ticker}</h2>
                  <span className="text-2xl font-mono text-zinc-300">${data.currentPrice.toFixed(2)}</span>
                </div>
                <p className="text-zinc-500 text-sm mt-1">
                  ${data.strike} {data.contractType.toUpperCase()} ({data.otmPercent}% OTM) across {data.weeks.length} weekly expirations
                </p>
              </div>
              <div className="flex gap-3 ml-auto">
                <StatBox
                  label="Avg Weekly Vol"
                  value={data.stats.avgWeeklyVolume.toLocaleString()}
                  sub={`${"\u00B1"}${data.stats.stdDev.toLocaleString()} std dev`}
                  color="zinc"
                />
                {data.spikeDays.length > 0 && (
                  <StatBox
                    label="Spike Days"
                    value={String(data.spikeDays.length)}
                    sub={`Top: ${data.spikeDays[0].date.slice(5)}`}
                    color={data.spikeDays[0].zScore >= 3 ? "red" : "amber"}
                  />
                )}
              </div>
            </div>

            {/* Weekly Volume Bar Chart */}
            <WeeklyVolumeChart weeks={data.weeks} contractType={data.contractType} avgVolume={data.stats.avgWeeklyVolume} />

            {/* Daily Heatmap / Timeline */}
            <DailyTimeline
              weeks={data.weeks}
              contractType={data.contractType}
              dailyMean={data.stats.avgDailyVolume}
              dailyStdDev={data.stats.dailyStdDev}
            />

            {/* Spike Days Alert */}
            {data.spikeDays.length > 0 && (
              <div className="bg-red-900/10 border border-red-800/30 rounded-xl overflow-hidden">
                <div className="px-5 py-3 bg-red-500/5 border-b border-red-800/20 flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-red-400 animate-pulse" />
                  <span className="text-sm font-medium text-red-400">Anomalous Days Detected</span>
                </div>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-zinc-500 text-[10px] uppercase">
                      <th className="px-4 py-2 text-left font-medium">Date</th>
                      <th className="px-4 py-2 text-right font-medium">Volume</th>
                      <th className="px-4 py-2 text-right font-medium">Trades</th>
                      <th className="px-4 py-2 text-right font-medium">Avg Size</th>
                      <th className="px-4 py-2 text-right font-medium">$ Premium</th>
                      <th className="px-4 py-2 text-right font-medium">Z-Score</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.spikeDays.map((d) => (
                      <tr key={d.date} className="border-t border-zinc-800/20">
                        <td className="px-4 py-2 font-mono text-xs text-zinc-100">{d.date}</td>
                        <td className="px-4 py-2 text-right font-mono font-semibold text-red-300">{d.volume.toLocaleString()}</td>
                        <td className="px-4 py-2 text-right font-mono text-zinc-400">{d.trades}</td>
                        <td className="px-4 py-2 text-right font-mono text-zinc-400">{d.avgSize}</td>
                        <td className="px-4 py-2 text-right font-mono text-zinc-400">${(d.dollarVolume / 1000).toFixed(1)}k</td>
                        <td className="px-4 py-2 text-right">
                          <span className={`font-mono font-bold ${d.zScore >= 3 ? "text-red-400" : "text-amber-400"}`}>
                            {d.zScore.toFixed(1)}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Weekly Breakdown (expandable) */}
            <div className="space-y-3">
              <h3 className="text-sm font-medium text-zinc-400">Weekly Breakdown</h3>
              {data.weeks.map((w) => (
                <WeekCard
                  key={w.expiration}
                  week={w}
                  contractType={data.contractType}
                  avgVolume={data.stats.avgWeeklyVolume}
                  dailyMean={data.stats.avgDailyVolume}
                  isExpanded={expandedWeek === w.expiration}
                  onToggle={() => setExpandedWeek(expandedWeek === w.expiration ? null : w.expiration)}
                />
              ))}
            </div>

            {/* Methodology */}
            <div className="text-xs text-zinc-600 border-t border-zinc-800/30 pt-4 space-y-1">
              <p><strong className="text-zinc-500">What this shows:</strong> Daily option volume for the ${data.strike} {data.contractType} across {data.weeks.length} consecutive weekly expirations, each fetching ~2 weeks of trading leading into expiry.</p>
              <p><strong className="text-zinc-500">Spike detection:</strong> Days with volume &gt;1.5 standard deviations above the mean are flagged. Z-score measures how many standard deviations above average.</p>
              <p><strong className="text-zinc-500">Why it matters:</strong> Unusual volume at a specific strike before a catalyst can indicate informed positioning. Look for volume spikes that don&apos;t correspond to stock price movement.</p>
            </div>
          </div>
        )}

        {!data && !loading && !error && (
          <div className="text-center py-32">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-amber-500/20 to-red-600/20 border border-amber-500/10 flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-amber-400/60" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
              </svg>
            </div>
            <p className="text-zinc-500">Monitor weekly volume at a specific strike to detect unusual activity spikes</p>
            <p className="text-zinc-600 text-sm mt-1">Enter a ticker, strike price, and type to compare volume across weekly expirations</p>
          </div>
        )}
      </main>
    </div>
  );
}

/* ── Weekly Volume Bar Chart ── */

function WeeklyVolumeChart({ weeks, contractType, avgVolume }: {
  weeks: WeekData[];
  contractType: "put" | "call";
  avgVolume: number;
}) {
  const W = 600;
  const H = 260;
  const PAD = { top: 30, right: 20, bottom: 55, left: 65 };
  const plotW = W - PAD.left - PAD.right;
  const plotH = H - PAD.top - PAD.bottom;

  const maxVol = Math.max(...weeks.map((w) => w.totalVolume), 1);
  const barWidth = Math.min(plotW / weeks.length * 0.65, 50);
  const gap = plotW / weeks.length;

  const color = contractType === "put" ? "#f87171" : "#34d399";
  const colorMuted = contractType === "put" ? "#991b1b" : "#065f46";
  const avgY = PAD.top + plotH - (avgVolume / maxVol) * plotH;

  // Y-axis ticks
  const yTicks = 5;
  const yTickVals = Array.from({ length: yTicks }, (_, i) => (maxVol * i) / (yTicks - 1));

  return (
    <div className="bg-zinc-900/50 border border-zinc-800/50 rounded-xl overflow-hidden">
      <div className="px-5 py-3 bg-zinc-800/20 border-b border-zinc-800/30 flex items-center justify-between">
        <span className="text-sm font-medium text-zinc-300">Weekly Total Volume</span>
        <span className="text-[10px] text-zinc-500 font-mono">avg: {avgVolume.toLocaleString()}</span>
      </div>
      <div className="p-4">
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full" preserveAspectRatio="xMidYMid meet">
          {/* Grid + Y labels */}
          {yTickVals.map((val, i) => {
            const y = PAD.top + plotH - (val / maxVol) * plotH;
            return (
              <g key={i}>
                <line x1={PAD.left} y1={y} x2={PAD.left + plotW} y2={y} stroke="#27272a" strokeWidth="1" />
                <text x={PAD.left - 8} y={y + 4} textAnchor="end" fill="#71717a" fontSize="10" fontFamily="monospace">
                  {val >= 1000 ? `${(val / 1000).toFixed(val >= 10000 ? 0 : 1)}k` : Math.round(val)}
                </text>
              </g>
            );
          })}

          {/* Average line */}
          {avgVolume > 0 && (
            <g>
              <line
                x1={PAD.left} y1={avgY} x2={PAD.left + plotW} y2={avgY}
                stroke="#a78bfa" strokeWidth="1" strokeDasharray="6 4" opacity="0.6"
              />
              <text x={PAD.left + plotW + 2} y={avgY + 4} fill="#a78bfa" fontSize="9" fontFamily="monospace" opacity="0.8">
                avg
              </text>
            </g>
          )}

          {/* Bars */}
          {weeks.map((w, i) => {
            const x = PAD.left + gap * i + (gap - barWidth) / 2;
            const barH = (w.totalVolume / maxVol) * plotH;
            const y = PAD.top + plotH - barH;
            const isSpike = w.isSpike;

            return (
              <g key={w.expiration}>
                {/* Glow for spike */}
                {isSpike && (
                  <rect x={x - 4} y={y - 4} width={barWidth + 8} height={barH + 8} rx="6" fill={color} opacity="0.1">
                    <animate attributeName="opacity" values="0.1;0.05;0.1" dur="2s" repeatCount="indefinite" />
                  </rect>
                )}
                <rect
                  x={x} y={y} width={barWidth} height={barH}
                  rx="3"
                  fill={isSpike ? color : colorMuted}
                  opacity={isSpike ? 0.9 : 0.5}
                />
                {/* Volume label */}
                <text
                  x={x + barWidth / 2} y={y - 6}
                  textAnchor="middle"
                  fill={isSpike ? color : "#a1a1aa"}
                  fontSize={isSpike ? "11" : "9"}
                  fontFamily="monospace"
                  fontWeight={isSpike ? "bold" : "normal"}
                >
                  {w.totalVolume >= 1000 ? `${(w.totalVolume / 1000).toFixed(1)}k` : w.totalVolume}
                </text>
                {/* Multiplier badge for spikes */}
                {isSpike && w.vsAvg > 0 && (
                  <text
                    x={x + barWidth / 2} y={y - 18}
                    textAnchor="middle"
                    fill={color}
                    fontSize="10"
                    fontFamily="monospace"
                    fontWeight="bold"
                  >
                    {w.vsAvg}x
                  </text>
                )}
                {/* X label */}
                <text
                  x={x + barWidth / 2} y={PAD.top + plotH + 16}
                  textAnchor="middle"
                  fill={isSpike ? "#e4e4e7" : "#71717a"}
                  fontSize="10"
                  fontFamily="monospace"
                  fontWeight={isSpike ? "bold" : "normal"}
                >
                  {w.expiration.slice(5)}
                </text>
                {/* Z-score under date */}
                <text
                  x={x + barWidth / 2} y={PAD.top + plotH + 30}
                  textAnchor="middle"
                  fill={isSpike ? color : "#52525b"}
                  fontSize="9"
                  fontFamily="monospace"
                >
                  z:{w.zScore.toFixed(1)}
                </text>
                {/* Peak day */}
                {w.peakDay && (
                  <text
                    x={x + barWidth / 2} y={PAD.top + plotH + 43}
                    textAnchor="middle"
                    fill="#3f3f46"
                    fontSize="8"
                    fontFamily="monospace"
                  >
                    pk:{w.peakDay.slice(5)}
                  </text>
                )}
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
}

/* ── Daily Timeline Heatmap ── */

function DailyTimeline({ weeks, contractType, dailyMean, dailyStdDev }: {
  weeks: WeekData[];
  contractType: "put" | "call";
  dailyMean: number;
  dailyStdDev: number;
}) {
  // Collect all daily bars across all weeks, deduplicate by date
  const barMap = new Map<string, DailyBar & { expiration: string }>();
  for (const w of weeks) {
    for (const b of w.dailyBars) {
      const existing = barMap.get(b.date);
      if (!existing || b.volume > existing.volume) {
        barMap.set(b.date, { ...b, expiration: w.expiration });
      }
    }
  }
  const allBars = Array.from(barMap.values()).sort((a, b) => a.date.localeCompare(b.date));

  if (allBars.length === 0) return null;

  const W = 600;
  const H = 200;
  const PAD = { top: 30, right: 20, bottom: 40, left: 65 };
  const plotW = W - PAD.left - PAD.right;
  const plotH = H - PAD.top - PAD.bottom;

  const maxVol = Math.max(...allBars.map((b) => b.volume), 1);
  const barWidth = Math.min(plotW / allBars.length * 0.8, 12);
  const gap = plotW / allBars.length;

  const color = contractType === "put" ? "#f87171" : "#34d399";
  const spikeThreshold = dailyMean + 1.5 * dailyStdDev;

  // Y ticks
  const yTicks = 4;
  const yTickVals = Array.from({ length: yTicks }, (_, i) => (maxVol * i) / (yTicks - 1));

  // Mean line
  const meanY = dailyMean > 0 ? PAD.top + plotH - (dailyMean / maxVol) * plotH : null;

  return (
    <div className="bg-zinc-900/50 border border-zinc-800/50 rounded-xl overflow-hidden">
      <div className="px-5 py-3 bg-zinc-800/20 border-b border-zinc-800/30 flex items-center justify-between">
        <span className="text-sm font-medium text-zinc-300">Daily Volume Timeline</span>
        <span className="text-[10px] text-zinc-500 font-mono">
          {allBars[0].date.slice(5)} to {allBars[allBars.length - 1].date.slice(5)} | avg: {dailyMean.toLocaleString()}/day
        </span>
      </div>
      <div className="p-4">
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full" preserveAspectRatio="xMidYMid meet">
          {/* Grid */}
          {yTickVals.map((val, i) => {
            const y = PAD.top + plotH - (val / maxVol) * plotH;
            return (
              <g key={i}>
                <line x1={PAD.left} y1={y} x2={PAD.left + plotW} y2={y} stroke="#27272a" strokeWidth="1" />
                <text x={PAD.left - 8} y={y + 4} textAnchor="end" fill="#71717a" fontSize="10" fontFamily="monospace">
                  {val >= 1000 ? `${(val / 1000).toFixed(val >= 10000 ? 0 : 1)}k` : Math.round(val)}
                </text>
              </g>
            );
          })}

          {/* Mean line */}
          {meanY !== null && meanY >= PAD.top && meanY <= PAD.top + plotH && (
            <line
              x1={PAD.left} y1={meanY} x2={PAD.left + plotW} y2={meanY}
              stroke="#a78bfa" strokeWidth="1" strokeDasharray="4 3" opacity="0.5"
            />
          )}

          {/* Spike threshold line */}
          {spikeThreshold > 0 && spikeThreshold < maxVol && (
            <line
              x1={PAD.left} y1={PAD.top + plotH - (spikeThreshold / maxVol) * plotH}
              x2={PAD.left + plotW} y2={PAD.top + plotH - (spikeThreshold / maxVol) * plotH}
              stroke="#ef4444" strokeWidth="1" strokeDasharray="3 3" opacity="0.3"
            />
          )}

          {/* Bars */}
          {allBars.map((b, i) => {
            const x = PAD.left + gap * i + (gap - barWidth) / 2;
            const barH = Math.max((b.volume / maxVol) * plotH, 1);
            const y = PAD.top + plotH - barH;
            const isSpike = b.volume > spikeThreshold;

            return (
              <g key={b.date}>
                {isSpike && (
                  <circle cx={x + barWidth / 2} cy={y - 8} r="3" fill={color}>
                    <animate attributeName="opacity" values="1;0.3;1" dur="1.5s" repeatCount="indefinite" />
                  </circle>
                )}
                <rect
                  x={x} y={y} width={barWidth} height={barH}
                  rx="1"
                  fill={isSpike ? color : "#52525b"}
                  opacity={isSpike ? 0.9 : 0.35}
                />
                {/* Date labels — show every Nth */}
                {(i % Math.max(Math.floor(allBars.length / 10), 1) === 0 || isSpike) && (
                  <text
                    x={x + barWidth / 2} y={PAD.top + plotH + 14}
                    textAnchor="middle"
                    fill={isSpike ? color : "#52525b"}
                    fontSize="8"
                    fontFamily="monospace"
                    fontWeight={isSpike ? "bold" : "normal"}
                  >
                    {b.date.slice(5)}
                  </text>
                )}
                {/* Volume label on spikes */}
                {isSpike && (
                  <text
                    x={x + barWidth / 2} y={y - 14}
                    textAnchor="middle"
                    fill={color}
                    fontSize="9"
                    fontFamily="monospace"
                    fontWeight="bold"
                  >
                    {b.volume >= 1000 ? `${(b.volume / 1000).toFixed(1)}k` : b.volume}
                  </text>
                )}
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
}

/* ── Week Card (expandable) ── */

function WeekCard({ week, contractType, avgVolume, dailyMean, isExpanded, onToggle }: {
  week: WeekData;
  contractType: "put" | "call";
  avgVolume: number;
  dailyMean: number;
  isExpanded: boolean;
  onToggle: () => void;
}) {
  const isSpike = week.isSpike;
  const borderColor = isSpike
    ? (contractType === "put" ? "border-red-500/30" : "border-emerald-500/30")
    : "border-zinc-800/50";
  const barColor = contractType === "put" ? "bg-red-500" : "bg-emerald-500";
  const textColor = contractType === "put" ? "text-red-400" : "text-emerald-400";
  const maxDailyVol = Math.max(...week.dailyBars.map((b) => b.volume), 1);

  return (
    <div className={`bg-zinc-900/50 border ${borderColor} rounded-xl overflow-hidden`}>
      <button
        onClick={onToggle}
        className="w-full px-5 py-3 flex items-center justify-between hover:bg-zinc-800/20 transition-colors"
      >
        <div className="flex items-center gap-3">
          {isSpike && <span className="w-2 h-2 rounded-full bg-red-400 animate-pulse" />}
          <span className="text-sm font-mono text-zinc-200">Exp: {week.expiration}</span>
          <span className="text-xs text-zinc-500">{week.ticker}</span>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-sm font-mono text-zinc-300">{week.totalVolume.toLocaleString()} vol</span>
          {week.vsAvg > 0 && (
            <span className={`text-xs font-mono font-bold ${isSpike ? textColor : "text-zinc-500"}`}>
              {week.vsAvg}x avg
            </span>
          )}
          <span className={`text-xs font-mono ${week.zScore > 1.5 ? textColor : "text-zinc-600"}`}>
            z:{week.zScore.toFixed(1)}
          </span>
          <svg className={`w-4 h-4 text-zinc-500 transition-transform ${isExpanded ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </button>

      {isExpanded && week.dailyBars.length > 0 && (
        <div className="border-t border-zinc-800/30">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-zinc-500 text-[10px] uppercase">
                <th className="px-4 py-2 text-left font-medium">Date</th>
                <th className="px-4 py-2 text-right font-medium">Volume</th>
                <th className="px-4 py-2 text-right font-medium">Trades</th>
                <th className="px-4 py-2 text-right font-medium">Avg Size</th>
                <th className="px-4 py-2 text-right font-medium">Close</th>
                <th className="px-4 py-2 text-right font-medium w-28"></th>
              </tr>
            </thead>
            <tbody>
              {week.dailyBars.map((b) => {
                const isDaySpike = b.volume > dailyMean * 2;
                return (
                  <tr key={b.date} className={`border-t border-zinc-800/20 ${isDaySpike ? "text-zinc-100" : "text-zinc-500"}`}>
                    <td className="px-4 py-1.5 font-mono text-xs">
                      {b.date}
                      {isDaySpike && <span className="ml-2 text-[9px] text-red-400 font-sans uppercase">spike</span>}
                    </td>
                    <td className={`px-4 py-1.5 text-right font-mono font-semibold ${isDaySpike ? textColor : ""}`}>
                      {b.volume.toLocaleString()}
                    </td>
                    <td className="px-4 py-1.5 text-right font-mono">{b.trades}</td>
                    <td className="px-4 py-1.5 text-right font-mono">{b.avgSize}</td>
                    <td className="px-4 py-1.5 text-right font-mono">${b.close.toFixed(2)}</td>
                    <td className="px-4 py-1.5 text-right">
                      <div className="w-24 h-1.5 bg-zinc-800 rounded-full overflow-hidden ml-auto">
                        <div
                          className={`h-full rounded-full ${isDaySpike ? barColor : "bg-zinc-600"}`}
                          style={{ width: `${(b.volume / maxDailyVol) * 100}%` }}
                        />
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
