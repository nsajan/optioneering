import { NextRequest, NextResponse } from "next/server";

const BASE = "https://api.massive.com";
const KEY = process.env.MASSIVE_API_KEY!;

async function api<T>(path: string): Promise<T> {
  const sep = path.includes("?") ? "&" : "?";
  const res = await fetch(`${BASE}${path}${sep}apikey=${KEY}`);
  if (!res.ok) throw new Error(`API ${res.status}: ${res.statusText}`);
  return res.json();
}

function getFridays(from: Date, count: number): Date[] {
  const fridays: Date[] = [];
  const d = new Date(from);
  const dayOfWeek = d.getDay();
  const daysUntilFri = dayOfWeek <= 5 ? 5 - dayOfWeek : 6;
  d.setDate(d.getDate() + daysUntilFri);
  fridays.push(new Date(d));
  for (let i = 1; i < count; i++) {
    d.setDate(d.getDate() - 7);
    fridays.push(new Date(d));
  }
  return fridays;
}

function fmtDate(d: Date): string {
  return d.toISOString().split("T")[0];
}

function fmtDateShort(d: Date): string {
  const y = d.getFullYear().toString().slice(2);
  const m = (d.getMonth() + 1).toString().padStart(2, "0");
  const day = d.getDate().toString().padStart(2, "0");
  return `${y}${m}${day}`;
}

function optionTicker(underlying: string, expDate: Date, type: "C" | "P", strike: number): string {
  return `O:${underlying}${fmtDateShort(expDate)}${type}${(strike * 1000).toString().padStart(8, "0")}`;
}

function roundStrike(price: number): number {
  if (price >= 50) return Math.round(price / 5) * 5;
  if (price >= 10) return Math.round(price / 1) * 1;
  return Math.round(price / 0.5) * 0.5;
}

// --- Types ---

interface BarResult {
  v: number;
  n: number;
  o: number;
  c: number;
  h: number;
  l: number;
  t: number;
}

interface DailyBar {
  date: string;
  volume: number;
  trades: number;
  open: number;
  close: number;
  high: number;
  low: number;
  avgSize: number; // volume / trades
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

// Signal types from the backtest insights
interface Signal {
  id: string;
  signalType: "weekly_volume" | "daily_spike" | "block_trade" | "price_divergence";
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

async function getWeekVolume(
  ticker: string,
  weekStart: string,
  weekEnd: string
): Promise<{ bars: BarResult[]; totalVolume: number; totalTrades: number }> {
  try {
    const data = await api<{ results?: BarResult[] }>(
      `/v2/aggs/ticker/${ticker}/range/1/day/${weekStart}/${weekEnd}`
    );
    const bars = data.results || [];
    return {
      bars,
      totalVolume: bars.reduce((s, b) => s + b.v, 0),
      totalTrades: bars.reduce((s, b) => s + b.n, 0),
    };
  } catch {
    return { bars: [], totalVolume: 0, totalTrades: 0 };
  }
}

function barToDailyBar(b: BarResult): DailyBar {
  return {
    date: new Date(b.t).toISOString().split("T")[0],
    volume: b.v,
    trades: b.n,
    open: b.o,
    close: b.c,
    high: b.h,
    low: b.l,
    avgSize: b.n > 0 ? Math.round(b.v / b.n) : 0,
  };
}

function severity(mult: number): Signal["severity"] {
  if (mult >= 10) return "extreme";
  if (mult >= 5) return "high";
  if (mult >= 3) return "medium";
  return "low";
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ symbol: string }> }
) {
  const { symbol } = await params;
  const upper = symbol.toUpperCase();

  try {
    // 1. Get current stock price + recent bars
    const prevDay = await api<{ results: BarResult[] }>(`/v2/aggs/ticker/${upper}/prev`);
    const currentPrice = prevDay.results?.[0]?.c;
    if (!currentPrice) {
      return NextResponse.json({ error: "Could not get stock price" }, { status: 404 });
    }

    // 2. Get 4 Fridays (this week + 3 prior)
    const fridays = getFridays(new Date(), 4);
    const otmPercents = [10, 15, 20, 30, 40];

    // 3. Gather weekly data
    const weeklyData: WeekData[] = [];

    for (let i = 0; i < fridays.length; i++) {
      const fri = fridays[i];
      const weekStart = new Date(fri);
      weekStart.setDate(weekStart.getDate() - 4);

      // Get stock bars for the week
      const stockWeekBars = await api<{ results?: BarResult[] }>(
        `/v2/aggs/ticker/${upper}/range/1/day/${fmtDate(weekStart)}/${fmtDate(fri)}`
      );
      const sBars = stockWeekBars.results || [];
      const stockPrice = i === 0 ? currentPrice : sBars.length > 0 ? sBars[sBars.length - 1].c : currentPrice;

      const calls: StrikeData[] = [];
      const puts: StrikeData[] = [];
      const fetches: Promise<void>[] = [];

      for (const pct of otmPercents) {
        const callStrike = roundStrike(stockPrice * (1 + pct / 100));
        const putStrike = roundStrike(stockPrice * (1 - pct / 100));
        const callTicker = optionTicker(upper, fri, "C", callStrike);
        const putTicker = optionTicker(upper, fri, "P", putStrike);

        fetches.push(
          getWeekVolume(callTicker, fmtDate(weekStart), fmtDate(fri)).then((res) => {
            const days = Math.max(res.bars.length, 1);
            calls.push({
              otmPercent: pct,
              strike: callStrike,
              ticker: callTicker,
              totalVolume: res.totalVolume,
              totalTrades: res.totalTrades,
              dailyAvgVolume: res.totalVolume / days,
              dailyBars: res.bars.map(barToDailyBar),
            });
          })
        );

        fetches.push(
          getWeekVolume(putTicker, fmtDate(weekStart), fmtDate(fri)).then((res) => {
            const days = Math.max(res.bars.length, 1);
            puts.push({
              otmPercent: pct,
              strike: putStrike,
              ticker: putTicker,
              totalVolume: res.totalVolume,
              totalTrades: res.totalTrades,
              dailyAvgVolume: res.totalVolume / days,
              dailyBars: res.bars.map(barToDailyBar),
            });
          })
        );
      }

      await Promise.all(fetches);
      calls.sort((a, b) => a.otmPercent - b.otmPercent);
      puts.sort((a, b) => a.otmPercent - b.otmPercent);

      weeklyData.push({
        expiration: fmtDate(fri),
        stockPrice,
        daysTraded: sBars.length || 1,
        calls,
        puts,
        stockBars: sBars.map(barToDailyBar),
      });
    }

    // 4. Generate signals
    const signals: Signal[] = [];
    const currentWeek = weeklyData[0];
    const priorWeeks = weeklyData.slice(1);

    for (const type of ["call", "put"] as const) {
      const currentContracts = type === "call" ? currentWeek.calls : currentWeek.puts;

      for (const current of currentContracts) {
        const priorMatches = priorWeeks.map((week) => {
          const contracts = type === "call" ? week.calls : week.puts;
          return contracts.find((c) => c.otmPercent === current.otmPercent);
        });

        const priorDailyAvgs = priorMatches
          .filter((m): m is StrikeData => !!m && m.dailyAvgVolume > 0)
          .map((m) => m.dailyAvgVolume);
        const historicalAvgDaily =
          priorDailyAvgs.length > 0
            ? priorDailyAvgs.reduce((s, v) => s + v, 0) / priorDailyAvgs.length
            : 0;

        const breakdown = [
          {
            expiration: currentWeek.expiration,
            strike: current.strike,
            totalVolume: current.totalVolume,
            dailyAvgVolume: Math.round(current.dailyAvgVolume),
          },
          ...priorMatches.map((m, idx) => ({
            expiration: priorWeeks[idx].expiration,
            strike: m?.strike || 0,
            totalVolume: m?.totalVolume || 0,
            dailyAvgVolume: Math.round(m?.dailyAvgVolume || 0),
          })),
        ];

        // --- SIGNAL 1: Weekly Volume Anomaly ---
        const weeklyMult =
          historicalAvgDaily > 0
            ? current.dailyAvgVolume / historicalAvgDaily
            : current.dailyAvgVolume > 0 ? 999 : 0;

        if (weeklyMult >= 2) {
          signals.push({
            id: `weekly_${type}_${current.otmPercent}`,
            signalType: "weekly_volume",
            type,
            otmPercent: current.otmPercent,
            strike: current.strike,
            ticker: current.ticker,
            severity: severity(weeklyMult),
            multiplier: Math.round(weeklyMult * 10) / 10,
            title: `Weekly volume ${Math.round(weeklyMult * 10) / 10}x normal`,
            description: `${type.toUpperCase()} $${current.strike} (${current.otmPercent}% OTM) averaging ${Math.round(current.dailyAvgVolume).toLocaleString()}/day vs historical ${Math.round(historicalAvgDaily).toLocaleString()}/day`,
            evidence: {
              currentDailyAvg: Math.round(current.dailyAvgVolume),
              historicalDailyAvg: Math.round(historicalAvgDaily),
            },
            weeklyBreakdown: breakdown,
          });
        }

        // --- SIGNAL 2: Daily Spike (last 2 days vs prior week's last 2 days) ---
        const currentBars = current.dailyBars;
        if (currentBars.length >= 2) {
          const last2 = currentBars.slice(-2);
          const last2Avg = last2.reduce((s, b) => s + b.volume, 0) / 2;

          // Get last 2 bars from each prior week
          const priorLast2Avgs = priorMatches
            .filter((m): m is StrikeData => !!m && m.dailyBars.length >= 2)
            .map((m) => {
              const l2 = m.dailyBars.slice(-2);
              return l2.reduce((s, b) => s + b.volume, 0) / 2;
            })
            .filter((v) => v > 0);

          const histLast2Avg =
            priorLast2Avgs.length > 0
              ? priorLast2Avgs.reduce((s, v) => s + v, 0) / priorLast2Avgs.length
              : 0;

          const dailyMult = histLast2Avg > 0 ? last2Avg / histLast2Avg : last2Avg > 10 ? 999 : 0;

          if (dailyMult >= 2 && last2Avg > 10) {
            signals.push({
              id: `daily_${type}_${current.otmPercent}`,
              signalType: "daily_spike",
              type,
              otmPercent: current.otmPercent,
              strike: current.strike,
              ticker: current.ticker,
              severity: severity(dailyMult),
              multiplier: Math.round(dailyMult * 10) / 10,
              title: `Last 2 days ${Math.round(dailyMult * 10) / 10}x vs prior weeks' end-of-week`,
              description: `${type.toUpperCase()} $${current.strike}: last 2 days avg ${Math.round(last2Avg).toLocaleString()}/day vs prior weeks' last 2 days avg ${Math.round(histLast2Avg).toLocaleString()}/day`,
              evidence: {
                last2Days: last2.map((b) => ({ date: b.date, volume: b.volume, trades: b.trades })),
                last2DailyAvg: Math.round(last2Avg),
                historicalLast2Avg: Math.round(histLast2Avg),
              },
              weeklyBreakdown: breakdown,
            });
          }
        }

        // --- SIGNAL 3: Block Trades (high volume, low trade count) ---
        for (const bar of currentBars) {
          if (bar.trades > 0 && bar.volume > 20) {
            const avgSize = bar.volume / bar.trades;

            // Compare avg trade size to prior weeks
            const priorSizes = priorMatches
              .filter((m): m is StrikeData => !!m)
              .flatMap((m) => m.dailyBars)
              .filter((b) => b.trades > 0 && b.volume > 5)
              .map((b) => b.volume / b.trades);

            const histAvgSize =
              priorSizes.length > 0
                ? priorSizes.reduce((s, v) => s + v, 0) / priorSizes.length
                : 0;

            const sizeMult = histAvgSize > 0 ? avgSize / histAvgSize : avgSize > 10 ? 999 : 0;

            if (sizeMult >= 3 && avgSize >= 10) {
              signals.push({
                id: `block_${type}_${current.otmPercent}_${bar.date}`,
                signalType: "block_trade",
                type,
                otmPercent: current.otmPercent,
                strike: current.strike,
                ticker: current.ticker,
                severity: severity(sizeMult),
                multiplier: Math.round(sizeMult * 10) / 10,
                title: `Block trade detected on ${bar.date}`,
                description: `${type.toUpperCase()} $${current.strike}: ${bar.volume.toLocaleString()} vol in ${bar.trades} trades (avg ${Math.round(avgSize)} contracts/trade vs historical ${Math.round(histAvgSize)})`,
                evidence: {
                  date: bar.date,
                  volume: bar.volume,
                  trades: bar.trades,
                  avgTradeSize: Math.round(avgSize),
                  historicalAvgSize: Math.round(histAvgSize),
                },
                weeklyBreakdown: breakdown,
              });
            }
          }
        }

        // --- SIGNAL 4: Price Divergence (option price up while stock down, or vice versa) ---
        if (currentBars.length >= 2) {
          const lastBar = currentBars[currentBars.length - 1];
          const prevBar = currentBars[currentBars.length - 2];
          const stockBars = currentWeek.stockBars;

          if (stockBars.length >= 2 && prevBar.close > 0 && lastBar.close > 0) {
            const lastStockBar = stockBars[stockBars.length - 1];
            const prevStockBar = stockBars[stockBars.length - 2];

            const optionChange = (lastBar.close - prevBar.close) / prevBar.close;
            const stockChange = (lastStockBar.close - prevStockBar.close) / prevStockBar.close;

            // For calls: option price UP while stock DOWN is suspicious
            // For puts: option price UP while stock UP is suspicious
            const isDivergent =
              type === "call"
                ? optionChange > 0.05 && stockChange < -0.01
                : optionChange > 0.05 && stockChange > 0.01;

            if (isDivergent) {
              const optPctStr = `${optionChange >= 0 ? "+" : ""}${(optionChange * 100).toFixed(0)}%`;
              const stkPctStr = `${stockChange >= 0 ? "+" : ""}${(stockChange * 100).toFixed(1)}%`;

              signals.push({
                id: `diverge_${type}_${current.otmPercent}`,
                signalType: "price_divergence",
                type,
                otmPercent: current.otmPercent,
                strike: current.strike,
                ticker: current.ticker,
                severity: "high",
                multiplier: 0,
                title: `Price divergence: option ${optPctStr} while stock ${stkPctStr}`,
                description: `${type.toUpperCase()} $${current.strike} price rose from $${prevBar.close.toFixed(2)} to $${lastBar.close.toFixed(2)} (${optPctStr}) while stock moved ${stkPctStr}. Informed flow signal.`,
                evidence: {
                  optionFrom: prevBar.close,
                  optionTo: lastBar.close,
                  optionChange: optPctStr,
                  stockFrom: prevStockBar.close,
                  stockTo: lastStockBar.close,
                  stockChange: stkPctStr,
                  date: lastBar.date,
                },
                weeklyBreakdown: breakdown,
              });
            }
          }
        }
      }
    }

    // Sort: extreme/high first, then by multiplier
    const severityOrder = { extreme: 0, high: 1, medium: 2, low: 3 };
    signals.sort((a, b) => {
      const so = severityOrder[a.severity] - severityOrder[b.severity];
      if (so !== 0) return so;
      return b.multiplier - a.multiplier;
    });

    // Deduplicate: if same contract has both weekly and daily signal, keep both but note it
    const flaggedSignals = signals.filter((s) => s.severity !== "low");
    const normalSignals = signals.filter((s) => s.severity === "low");

    return NextResponse.json({
      ticker: upper,
      currentPrice,
      currentExpiration: currentWeek.expiration,
      analyzedExpirations: weeklyData.map((w) => w.expiration),
      hasAnomaly: flaggedSignals.length > 0,
      signalCount: flaggedSignals.length,
      signals: flaggedSignals,
      normalSignals,
      weeklyData,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
