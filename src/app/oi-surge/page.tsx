"use client";

import { useState } from "react";
import Link from "next/link";

interface OIDataPoint {
  expiration: string;
  strike: number;
  oi: number;
  stockPrice: number;
  otmPercent: number;
  iv: number;
}

interface SideData {
  points: OIDataPoint[];
  nearestOI: number;
  avgOtherOI: number;
  multiplier: number;
}

interface TrendData {
  ticker: string;
  currentPrice: number;
  otmPercent: number;
  weeks: number;
  calls: SideData;
  puts: SideData;
}

const POPULAR = ["SMCI", "TSLA", "NVDA", "AAPL", "AMD", "PLTR", "HIMS", "NBIS"];

export default function OISurgePage() {
  const [symbol, setSymbol] = useState("");
  const [data, setData] = useState<TrendData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [otm, setOtm] = useState(10);
  const [weeks, setWeeks] = useState(4);

  const scan = async (ticker?: string) => {
    const t = (ticker || symbol).trim().toUpperCase();
    if (!t) return;
    setSymbol(t);
    setLoading(true);
    setError("");
    setData(null);

    try {
      const res = await fetch(`/api/oi-trend/${t}?weeks=${weeks}&otm=${otm}`);
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
        <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href="/" className="flex items-center gap-2 hover:opacity-80 transition-opacity">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-sm font-bold">O</div>
              <span className="text-lg font-semibold tracking-tight">Optioneering</span>
            </Link>
            <span className="text-zinc-600">|</span>
            <span className="text-sm text-zinc-400">OI Surge</span>
          </div>
          <div className="flex items-center gap-2">
            <Link href="/analyze" className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors">Scanner</Link>
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
              <label className="block text-[10px] text-zinc-500 uppercase tracking-wider mb-1">OTM %</label>
              <select
                value={otm}
                onChange={(e) => setOtm(Number(e.target.value))}
                className="bg-zinc-900/80 border border-zinc-700/50 rounded-lg px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:ring-2 focus:ring-purple-500/50"
              >
                {[5, 10, 15, 20, 30, 40].map((v) => (
                  <option key={v} value={v}>{v}%</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-[10px] text-zinc-500 uppercase tracking-wider mb-1">Weeks</label>
              <select
                value={weeks}
                onChange={(e) => setWeeks(Number(e.target.value))}
                className="bg-zinc-900/80 border border-zinc-700/50 rounded-lg px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:ring-2 focus:ring-purple-500/50"
              >
                {[3, 4, 5, 6, 8].map((v) => (
                  <option key={v} value={v}>{v}</option>
                ))}
              </select>
            </div>
            <button
              type="submit"
              disabled={loading}
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
                <button key={t} onClick={() => scan(t)}
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
            <p className="text-zinc-500 text-sm">Fetching OI across expirations...</p>
          </div>
        )}

        {data && (
          <div className="space-y-8">
            {/* Header stats */}
            <div className="flex flex-wrap items-center gap-6">
              <div>
                <div className="flex items-center gap-3">
                  <h2 className="text-3xl font-bold">{data.ticker}</h2>
                  <span className="text-2xl font-mono text-zinc-300">${data.currentPrice.toFixed(2)}</span>
                </div>
                <p className="text-zinc-500 text-sm mt-1">
                  Open Interest at {data.otmPercent}% OTM across {data.calls.points.length + data.puts.points.length} expirations
                </p>
              </div>
              <div className="flex gap-3 ml-auto">
                <StatBox
                  label="Call OI Surge"
                  value={`${data.calls.multiplier}x`}
                  sub={`${data.calls.nearestOI.toLocaleString()} vs avg ${data.calls.avgOtherOI.toLocaleString()}`}
                  color={data.calls.multiplier >= 4 ? "red" : data.calls.multiplier >= 2 ? "amber" : "zinc"}
                />
                <StatBox
                  label="Put OI Surge"
                  value={`${data.puts.multiplier}x`}
                  sub={`${data.puts.nearestOI.toLocaleString()} vs avg ${data.puts.avgOtherOI.toLocaleString()}`}
                  color={data.puts.multiplier >= 4 ? "red" : data.puts.multiplier >= 2 ? "amber" : "zinc"}
                />
              </div>
            </div>

            {/* Charts */}
            <div className="grid gap-6 lg:grid-cols-2">
              <OIChart
                title={`${data.otmPercent}% OTM Calls`}
                points={data.calls.points}
                color="emerald"
                multiplier={data.calls.multiplier}
                avgOI={data.calls.avgOtherOI}
              />
              <OIChart
                title={`${data.otmPercent}% OTM Puts`}
                points={data.puts.points}
                color="red"
                multiplier={data.puts.multiplier}
                avgOI={data.puts.avgOtherOI}
              />
            </div>

            {/* Data table */}
            <div className="grid gap-6 lg:grid-cols-2">
              <OITable title="Calls" points={data.calls.points} color="emerald" currentExp={data.calls.points[0]?.expiration} />
              <OITable title="Puts" points={data.puts.points} color="red" currentExp={data.puts.points[0]?.expiration} />
            </div>

            {/* Methodology */}
            <div className="text-xs text-zinc-600 border-t border-zinc-800/30 pt-4 space-y-1">
              <p><strong className="text-zinc-500">What this shows:</strong> Open interest at {data.otmPercent}% OTM for the nearest expiration vs subsequent weekly expirations. Each expiration&apos;s strike is computed relative to the stock price at that time.</p>
              <p><strong className="text-zinc-500">Why it matters:</strong> When near-term OI dwarfs later expirations at the same OTM distance, someone is loading cheap, leveraged, short-dated options — classic informed pre-event positioning.</p>
              <p><strong className="text-zinc-500">Anomaly threshold:</strong> A spike in the nearest expiration that&apos;s 3x+ the average of other expirations is flagged. 5x+ is high conviction.</p>
            </div>
          </div>
        )}

        {!data && !loading && !error && (
          <div className="text-center py-32">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-purple-500/20 to-red-600/20 border border-purple-500/10 flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-purple-400/60" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
              </svg>
            </div>
            <p className="text-zinc-500">Compare open interest across expirations to spot near-term positioning surges</p>
            <p className="text-zinc-600 text-sm mt-1">Pick a ticker to see if someone&apos;s loading up on short-dated options</p>
          </div>
        )}
      </main>
    </div>
  );
}

/* ── SVG Line Chart ── */

function OIChart({ title, points, color, multiplier, avgOI }: {
  title: string;
  points: OIDataPoint[];
  color: "emerald" | "red";
  multiplier: number;
  avgOI: number;
}) {
  if (points.length === 0) {
    return (
      <div className="bg-zinc-900/50 border border-zinc-800/50 rounded-xl p-6 flex items-center justify-center h-80">
        <p className="text-zinc-600 text-sm">No data available</p>
      </div>
    );
  }

  const W = 520;
  const H = 280;
  const PAD = { top: 40, right: 30, bottom: 60, left: 65 };
  const plotW = W - PAD.left - PAD.right;
  const plotH = H - PAD.top - PAD.bottom;

  const maxOI = Math.max(...points.map((p) => p.oi), 1);
  const minOI = 0;
  const range = maxOI - minOI || 1;

  // Position points evenly
  const pts = points.map((p, i) => ({
    x: PAD.left + (i / Math.max(points.length - 1, 1)) * plotW,
    y: PAD.top + plotH - ((p.oi - minOI) / range) * plotH,
    ...p,
  }));

  const linePath = pts.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ");

  // Area fill path
  const areaPath = `${linePath} L ${pts[pts.length - 1].x} ${PAD.top + plotH} L ${pts[0].x} ${PAD.top + plotH} Z`;

  // Y-axis ticks
  const yTicks = 5;
  const yTickVals = Array.from({ length: yTicks }, (_, i) => minOI + (range * i) / (yTicks - 1));

  // Avg line y position
  const avgY = avgOI > 0 ? PAD.top + plotH - ((avgOI - minOI) / range) * plotH : null;

  const stroke = color === "emerald" ? "#34d399" : "#f87171";
  const fill = color === "emerald" ? "#34d399" : "#f87171";
  const bgBorder = color === "emerald" ? "border-emerald-500/20" : "border-red-500/20";
  const headerBg = color === "emerald" ? "bg-emerald-500/5" : "bg-red-500/5";
  const headerText = color === "emerald" ? "text-emerald-400" : "text-red-400";

  const isAnomaly = multiplier >= 3;

  return (
    <div className={`bg-zinc-900/50 border ${bgBorder} rounded-xl overflow-hidden`}>
      <div className={`px-5 py-3 ${headerBg} border-b border-zinc-800/30 flex items-center justify-between`}>
        <span className={`text-sm font-medium ${headerText}`}>{title}</span>
        {isAnomaly && (
          <span className="px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider bg-red-500/20 text-red-300 ring-1 ring-red-500/40 animate-pulse">
            {multiplier}x SURGE
          </span>
        )}
      </div>
      <div className="p-4">
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full" preserveAspectRatio="xMidYMid meet">
          {/* Grid lines */}
          {yTickVals.map((val, i) => {
            const y = PAD.top + plotH - ((val - minOI) / range) * plotH;
            return (
              <g key={i}>
                <line x1={PAD.left} y1={y} x2={PAD.left + plotW} y2={y} stroke="#27272a" strokeWidth="1" />
                <text x={PAD.left - 8} y={y + 4} textAnchor="end" fill="#71717a" fontSize="11" fontFamily="monospace">
                  {val >= 1000 ? `${(val / 1000).toFixed(val >= 10000 ? 0 : 1)}k` : Math.round(val)}
                </text>
              </g>
            );
          })}

          {/* Avg OI reference line */}
          {avgY !== null && avgY >= PAD.top && avgY <= PAD.top + plotH && (
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

          {/* Area fill */}
          <path d={areaPath} fill={fill} opacity="0.08" />

          {/* Line */}
          <path d={linePath} fill="none" stroke={stroke} strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />

          {/* Data points */}
          {pts.map((p, i) => {
            const isFirst = i === 0;
            const isSpike = isFirst && isAnomaly;
            return (
              <g key={i}>
                {/* Glow effect for anomaly point */}
                {isSpike && (
                  <circle cx={p.x} cy={p.y} r="12" fill={stroke} opacity="0.15">
                    <animate attributeName="r" values="10;16;10" dur="2s" repeatCount="indefinite" />
                    <animate attributeName="opacity" values="0.15;0.05;0.15" dur="2s" repeatCount="indefinite" />
                  </circle>
                )}
                <circle cx={p.x} cy={p.y} r={isFirst ? 5 : 3.5} fill={isFirst ? stroke : "#18181b"} stroke={stroke} strokeWidth="2" />
                {/* OI label on each point */}
                <text
                  x={p.x}
                  y={p.y - (isFirst ? 14 : 10)}
                  textAnchor="middle"
                  fill={isFirst ? stroke : "#a1a1aa"}
                  fontSize={isFirst ? "13" : "11"}
                  fontFamily="monospace"
                  fontWeight={isFirst ? "bold" : "normal"}
                >
                  {p.oi >= 1000 ? `${(p.oi / 1000).toFixed(p.oi >= 10000 ? 0 : 1)}k` : p.oi}
                </text>
              </g>
            );
          })}

          {/* X-axis labels */}
          {pts.map((p, i) => (
            <g key={i}>
              <text
                x={p.x}
                y={PAD.top + plotH + 18}
                textAnchor="middle"
                fill={i === 0 ? "#e4e4e7" : "#71717a"}
                fontSize="10"
                fontFamily="monospace"
                fontWeight={i === 0 ? "bold" : "normal"}
              >
                {p.expiration.slice(5)}
              </text>
              <text
                x={p.x}
                y={PAD.top + plotH + 32}
                textAnchor="middle"
                fill="#52525b"
                fontSize="9"
                fontFamily="monospace"
              >
                ${p.strike}
              </text>
              <text
                x={p.x}
                y={PAD.top + plotH + 44}
                textAnchor="middle"
                fill="#3f3f46"
                fontSize="9"
                fontFamily="monospace"
              >
                stk ${p.stockPrice.toFixed(0)}
              </text>
            </g>
          ))}

          {/* Y-axis label */}
          <text x="14" y={PAD.top + plotH / 2} textAnchor="middle" fill="#52525b" fontSize="10" transform={`rotate(-90, 14, ${PAD.top + plotH / 2})`}>
            Open Interest
          </text>
        </svg>
      </div>
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

/* ── Data Table ── */

function OITable({ title, points, color, currentExp }: {
  title: string;
  points: OIDataPoint[];
  color: "emerald" | "red";
  currentExp?: string;
}) {
  const headerText = color === "emerald" ? "text-emerald-400" : "text-red-400";
  const headerBg = color === "emerald" ? "bg-emerald-500/5" : "bg-red-500/5";
  const maxOI = Math.max(...points.map((p) => p.oi), 1);

  return (
    <div className="bg-zinc-900/50 border border-zinc-800/50 rounded-xl overflow-hidden">
      <div className={`px-4 py-3 ${headerBg} border-b border-zinc-800/30`}>
        <span className={`text-sm font-medium ${headerText}`}>{title} Detail</span>
      </div>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-zinc-500 text-[10px] uppercase">
            <th className="px-4 py-2 text-left font-medium">Expiration</th>
            <th className="px-4 py-2 text-right font-medium">Strike</th>
            <th className="px-4 py-2 text-right font-medium">Stock</th>
            <th className="px-4 py-2 text-right font-medium">OI</th>
            <th className="px-4 py-2 text-right font-medium">IV</th>
            <th className="px-4 py-2 text-right font-medium w-28"></th>
          </tr>
        </thead>
        <tbody>
          {points.map((p) => {
            const isCurrent = p.expiration === currentExp;
            const barW = (p.oi / maxOI) * 100;
            const barColor = color === "emerald" ? "bg-emerald-500" : "bg-red-500";
            return (
              <tr key={p.expiration} className={`border-t border-zinc-800/20 ${isCurrent ? "text-zinc-100" : "text-zinc-500"}`}>
                <td className="px-4 py-2 font-mono text-xs">
                  {p.expiration.slice(5)}
                  {isCurrent && <span className="ml-2 text-[10px] text-purple-400 font-sans uppercase">nearest</span>}
                </td>
                <td className="px-4 py-2 text-right font-mono">${p.strike}</td>
                <td className="px-4 py-2 text-right font-mono">${p.stockPrice.toFixed(2)}</td>
                <td className="px-4 py-2 text-right font-mono font-semibold">{p.oi.toLocaleString()}</td>
                <td className="px-4 py-2 text-right font-mono text-xs">{p.iv > 0 ? `${(p.iv * 100).toFixed(0)}%` : "—"}</td>
                <td className="px-4 py-2 text-right">
                  <div className="w-24 h-2 bg-zinc-800 rounded-full overflow-hidden ml-auto">
                    <div className={`h-full rounded-full ${isCurrent ? barColor : "bg-zinc-600"}`}
                      style={{ width: `${barW}%` }} />
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
