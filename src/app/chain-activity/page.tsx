"use client";

import React, { useState, useMemo } from "react";
import Link from "next/link";

interface TradingDay {
  date: string;
  close: number;
  high: number;
  low: number;
}

interface Dot {
  date: string;
  stockPrice: number;
  tier: string;
  otmMid: number;
  strikePrice: number;
  volume: number;
  oi: number;
  avgVolume: number;
  multiplier: number | null;
}

interface ActivityData {
  symbol: string;
  selectedDate: string;
  optionType: "put" | "call";
  tradingDays: TradingDay[];
  dots: Dot[];
  tiers: string[];
}

const POPULAR = ["NVDA", "TSLA", "SMCI", "AAPL", "AMD", "PLTR", "HIMS", "COIN"];

function dotColor(mult: number | null): string {
  if (mult === null || mult < 1) return "rgba(113,113,122,0.3)";
  if (mult >= 10) return "rgba(248,113,113,0.9)";
  if (mult >= 5) return "rgba(251,146,60,0.85)";
  if (mult >= 3) return "rgba(250,204,21,0.8)";
  if (mult >= 2) return "rgba(250,204,21,0.5)";
  if (mult >= 1) return "rgba(161,161,170,0.4)";
  return "rgba(113,113,122,0.2)";
}

function dotRadius(volume: number, maxVol: number): number {
  if (maxVol === 0 || volume === 0) return 1.5;
  const ratio = volume / maxVol;
  return 2 + ratio * 18;
}

export default function ChainActivityPage() {
  const [symbol, setSymbol] = useState("NVDA");
  const [date, setDate] = useState("2025-01-24");
  const [optionType, setOptionType] = useState<"put" | "call">("put");
  const [data, setData] = useState<ActivityData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [hoveredDot, setHoveredDot] = useState<Dot | null>(null);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });

  const fetchData = async (ticker?: string) => {
    const t = (ticker || symbol).trim().toUpperCase();
    if (!t || !date) return;
    setSymbol(t);
    setLoading(true);
    setError("");
    setData(null);

    try {
      const res = await fetch(`/api/chain-activity?symbol=${t}&date=${date}&type=${optionType}`);
      const json = await res.json();
      if (json.error) throw new Error(json.error);
      setData(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    }
    setLoading(false);
  };

  const chart = useMemo(() => {
    if (!data) return null;

    const W = 1100;
    const H = 500;
    const pad = { top: 30, right: 40, bottom: 50, left: 60 };
    const chartW = W - pad.left - pad.right;
    const chartH = H - pad.top - pad.bottom;

    const days = data.tradingDays;
    const dots = data.dots.filter((d) => d.volume > 0);

    // X scale: date index
    const xScale = (i: number) => pad.left + (i / Math.max(days.length - 1, 1)) * chartW;
    const dateIndex = new Map(days.map((d, i) => [d.date, i]));

    // Y scale: price range including strike prices of dots
    const allPrices = days.map((d) => d.close);
    const allStrikes = dots.map((d) => d.strikePrice);
    const allY = [...allPrices, ...allStrikes];
    const yMin = Math.min(...allY) * 0.97;
    const yMax = Math.max(...allY) * 1.03;
    const yScale = (price: number) => pad.top + ((yMax - price) / (yMax - yMin)) * chartH;

    // Max volume for dot sizing
    const maxVol = Math.max(...dots.map((d) => d.volume), 1);

    // Price line path
    const linePath = days
      .map((d, i) => `${i === 0 ? "M" : "L"}${xScale(i).toFixed(1)},${yScale(d.close).toFixed(1)}`)
      .join(" ");

    // Y axis ticks
    const yTicks: number[] = [];
    const yStep = Math.ceil((yMax - yMin) / 6);
    for (let p = Math.ceil(yMin); p <= yMax; p += yStep) {
      yTicks.push(p);
    }

    // X axis ticks (every 5th day)
    const xTicks = days.filter((_, i) => i % 5 === 0 || i === days.length - 1);

    // Selected date vertical line
    const selIdx = dateIndex.get(data.selectedDate);

    return {
      W, H, pad, chartW, chartH,
      xScale, yScale, dateIndex,
      days, dots, maxVol,
      linePath, yTicks, xTicks, yMin, yMax,
      selIdx,
    };
  }, [data]);

  return (
    <div className="min-h-screen bg-[#0a0a0f] text-zinc-100">
      <nav className="border-b border-zinc-800/50 bg-[#0a0a0f]/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-[90rem] mx-auto px-6 py-4 flex items-center justify-between">
          <Link href="/" className="text-zinc-500 hover:text-zinc-300 text-sm">
            &larr; Home
          </Link>
          <h1 className="text-lg font-semibold tracking-tight">Chain Activity Map</h1>
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
            <label className="block text-xs text-zinc-500 mb-1">End Date</label>
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
            {loading ? "Loading..." : "Visualize"}
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
            Fetching ~20 days of options chain data... this takes about 15-20 seconds.
          </div>
        )}

        {data && chart && (
          <>
            <div className="flex items-baseline gap-4 mb-4">
              <span className="text-2xl font-bold">{data.symbol}</span>
              <span className={`text-sm font-medium ${data.optionType === "put" ? "text-red-400" : "text-emerald-400"}`}>
                {data.optionType.toUpperCase()}S
              </span>
              <span className="text-zinc-500 text-sm">4-week activity map — next-week expiry</span>
            </div>

            {/* Legend */}
            <div className="flex items-center gap-6 mb-4 text-[10px] text-zinc-500">
              <span>Dot size = volume</span>
              <div className="flex items-center gap-2">
                <span>Color:</span>
                <span className="flex items-center gap-1"><span className="inline-block w-2 h-2 rounded-full" style={{ background: "rgba(161,161,170,0.4)" }} /> normal</span>
                <span className="flex items-center gap-1"><span className="inline-block w-2 h-2 rounded-full" style={{ background: "rgba(250,204,21,0.5)" }} /> 2x</span>
                <span className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded-full" style={{ background: "rgba(250,204,21,0.8)" }} /> 3x</span>
                <span className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded-full" style={{ background: "rgba(251,146,60,0.85)" }} /> 5x</span>
                <span className="flex items-center gap-1"><span className="inline-block w-4 h-4 rounded-full" style={{ background: "rgba(248,113,113,0.9)" }} /> 10x+</span>
              </div>
              <span className="text-purple-400">Purple line = selected date</span>
            </div>

            {/* Chart */}
            <div className="bg-zinc-900/50 border border-zinc-800/50 rounded-xl p-4 relative">
              <svg
                viewBox={`0 0 ${chart.W} ${chart.H}`}
                className="w-full"
                style={{ maxHeight: "550px" }}
                onMouseMove={(e) => {
                  const rect = e.currentTarget.getBoundingClientRect();
                  setMousePos({
                    x: e.clientX - rect.left,
                    y: e.clientY - rect.top,
                  });
                }}
                onMouseLeave={() => setHoveredDot(null)}
              >
                {/* Grid lines */}
                {chart.yTicks.map((p) => (
                  <g key={p}>
                    <line
                      x1={chart.pad.left}
                      x2={chart.W - chart.pad.right}
                      y1={chart.yScale(p)}
                      y2={chart.yScale(p)}
                      stroke="rgba(63,63,70,0.3)"
                      strokeDasharray="4,4"
                    />
                    <text
                      x={chart.pad.left - 8}
                      y={chart.yScale(p) + 4}
                      textAnchor="end"
                      fill="rgba(113,113,122,0.6)"
                      fontSize="10"
                      fontFamily="monospace"
                    >
                      ${p}
                    </text>
                  </g>
                ))}

                {/* X axis labels */}
                {chart.xTicks.map((d) => {
                  const idx = chart.dateIndex.get(d.date)!;
                  return (
                    <text
                      key={d.date}
                      x={chart.xScale(idx)}
                      y={chart.H - chart.pad.bottom + 20}
                      textAnchor="middle"
                      fill="rgba(113,113,122,0.6)"
                      fontSize="10"
                      fontFamily="monospace"
                    >
                      {d.date.slice(5)}
                    </text>
                  );
                })}

                {/* Selected date vertical line */}
                {chart.selIdx !== undefined && (
                  <line
                    x1={chart.xScale(chart.selIdx)}
                    x2={chart.xScale(chart.selIdx)}
                    y1={chart.pad.top}
                    y2={chart.H - chart.pad.bottom}
                    stroke="rgba(168,85,247,0.4)"
                    strokeWidth="1.5"
                    strokeDasharray="6,4"
                  />
                )}

                {/* Dots (rendered before line so line is on top) */}
                {chart.dots
                  .sort((a, b) => (a.multiplier || 0) - (b.multiplier || 0))
                  .map((dot, i) => {
                    const idx = chart.dateIndex.get(dot.date);
                    if (idx === undefined) return null;
                    const cx = chart.xScale(idx);
                    const cy = chart.yScale(dot.strikePrice);
                    const r = dotRadius(dot.volume, chart.maxVol);
                    const color = dotColor(dot.multiplier);

                    return (
                      <circle
                        key={i}
                        cx={cx}
                        cy={cy}
                        r={r}
                        fill={color}
                        stroke={dot.multiplier && dot.multiplier >= 5 ? "rgba(255,255,255,0.15)" : "none"}
                        strokeWidth="0.5"
                        onMouseEnter={() => setHoveredDot(dot)}
                        onMouseLeave={() => setHoveredDot(null)}
                        style={{ cursor: "crosshair" }}
                      />
                    );
                  })}

                {/* Stock price line */}
                <path
                  d={chart.linePath}
                  fill="none"
                  stroke="rgba(228,228,231,0.7)"
                  strokeWidth="1.5"
                  strokeLinejoin="round"
                />

                {/* Price dots */}
                {chart.days.map((d, i) => (
                  <circle
                    key={d.date}
                    cx={chart.xScale(i)}
                    cy={chart.yScale(d.close)}
                    r="2"
                    fill="rgba(228,228,231,0.8)"
                  />
                ))}
              </svg>

              {/* Tooltip */}
              {hoveredDot && (
                <div
                  className="absolute pointer-events-none bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-xs shadow-xl z-20"
                  style={{
                    left: Math.min(mousePos.x + 12, chart.W - 200),
                    top: mousePos.y - 80,
                  }}
                >
                  <div className="text-zinc-300 font-medium mb-1">{hoveredDot.date} — {hoveredDot.tier} OTM</div>
                  <div className="text-zinc-400">Strike: ${hoveredDot.strikePrice.toFixed(0)} | Stock: ${hoveredDot.stockPrice.toFixed(2)}</div>
                  <div className="flex gap-4 mt-1">
                    <span className="text-zinc-200">Vol: {hoveredDot.volume.toLocaleString()}</span>
                    <span className="text-cyan-400/70">OI: {hoveredDot.oi.toLocaleString()}</span>
                  </div>
                  <div className="flex gap-4 mt-0.5">
                    <span className="text-zinc-500">Avg: {hoveredDot.avgVolume.toLocaleString()}</span>
                    {hoveredDot.multiplier !== null && (
                      <span className={
                        hoveredDot.multiplier >= 5 ? "text-red-400 font-medium" :
                        hoveredDot.multiplier >= 3 ? "text-orange-400" :
                        hoveredDot.multiplier >= 2 ? "text-yellow-400" : "text-zinc-400"
                      }>
                        {hoveredDot.multiplier.toFixed(1)}x
                      </span>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Summary table below chart */}
            <div className="mt-6 bg-zinc-900/50 border border-zinc-800/50 rounded-xl overflow-hidden">
              <div className="px-4 py-3 border-b border-zinc-800/50">
                <span className="text-sm font-medium text-zinc-300">Daily Volume by OTM Tier</span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-[11px]">
                  <thead>
                    <tr className="border-b border-zinc-800/30 text-zinc-600">
                      <th className="text-left px-3 py-2 font-medium sticky left-0 bg-zinc-900/90">Date</th>
                      <th className="text-right px-3 py-2 font-medium">Price</th>
                      {data.tiers.map((t) => (
                        <th key={t} className="text-right px-3 py-2 font-medium">{t}</th>
                      ))}
                      <th className="text-right px-3 py-2 font-medium">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.tradingDays.map((td) => {
                      const dayDots = data.dots.filter((d) => d.date === td.date);
                      const totalVol = dayDots.reduce((s, d) => s + d.volume, 0);
                      const isSelected = td.date === data.selectedDate;

                      return (
                        <tr
                          key={td.date}
                          className={`border-b border-zinc-800/20 ${isSelected ? "bg-purple-500/5" : ""}`}
                        >
                          <td className={`px-3 py-1.5 font-mono sticky left-0 ${isSelected ? "text-purple-400 bg-purple-500/5" : "text-zinc-400 bg-zinc-900/90"}`}>
                            {td.date.slice(5)}
                          </td>
                          <td className="px-3 py-1.5 text-right font-mono text-zinc-300">
                            ${td.close.toFixed(2)}
                          </td>
                          {data.tiers.map((tier) => {
                            const dot = dayDots.find((d) => d.tier === tier);
                            if (!dot || dot.volume === 0) {
                              return <td key={tier} className="px-3 py-1.5 text-right text-zinc-700">—</td>;
                            }
                            const mc = dot.multiplier;
                            const color = !isSelected ? "text-zinc-500" :
                              mc !== null && mc >= 10 ? "text-red-300 font-bold" :
                              mc !== null && mc >= 5 ? "text-red-400 font-semibold" :
                              mc !== null && mc >= 3 ? "text-orange-400 font-medium" :
                              mc !== null && mc >= 2 ? "text-yellow-400" : "text-zinc-400";
                            return (
                              <td key={tier} className={`px-3 py-1.5 text-right font-mono ${color}`}>
                                {dot.volume.toLocaleString()}
                                {isSelected && mc !== null && mc >= 2 && (
                                  <span className="ml-1 text-[9px] opacity-70">{mc.toFixed(1)}x</span>
                                )}
                              </td>
                            );
                          })}
                          <td className={`px-3 py-1.5 text-right font-mono ${isSelected ? "text-zinc-200 font-medium" : "text-zinc-500"}`}>
                            {totalVol.toLocaleString()}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}

        {!data && !loading && !error && (
          <div className="text-center text-zinc-600 py-20">
            Visualize options chain activity density over 4 weeks
          </div>
        )}
      </main>
    </div>
  );
}
