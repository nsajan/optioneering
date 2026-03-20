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

interface BarResult {
  v: number; n: number; o: number; c: number; h: number; l: number; t: number;
}

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

function severity(mult: number): Signal["severity"] {
  if (mult >= 10) return "extreme";
  if (mult >= 5) return "high";
  if (mult >= 3) return "medium";
  return "low";
}

const SEVERITY_RANK: Record<string, number> = { extreme: 0, high: 1, medium: 2, low: 3 };

// Fast scan for a single ticker — only volume-based signals, 3 weeks comparison
async function fastScan(ticker: string): Promise<TickerResult> {
  // Get stock price
  const prevDay = await api<{ results: BarResult[] }>(`/v2/aggs/ticker/${ticker}/prev`);
  const currentPrice = prevDay.results?.[0]?.c;
  if (!currentPrice) throw new Error("No price data");

  const fridays = getFridays(new Date(), 3); // current + 2 prior (faster than 4)
  const otmPercents = [10, 15, 20, 30, 40];
  const signals: Signal[] = [];

  // For each week, fetch volume at each OTM tier
  interface StrikeVolume {
    otmPercent: number;
    strike: number;
    type: "call" | "put";
    totalVolume: number;
    totalTrades: number;
    days: number;
    dailyBars: BarResult[];
  }

  const weeklyStrikes: StrikeVolume[][] = [];

  for (let i = 0; i < fridays.length; i++) {
    const fri = fridays[i];
    const weekStart = new Date(fri);
    weekStart.setDate(weekStart.getDate() - 4);

    // Get stock price for that week
    let stockPrice = currentPrice;
    if (i > 0) {
      try {
        const bars = await api<{ results?: BarResult[] }>(
          `/v2/aggs/ticker/${ticker}/range/1/day/${fmtDate(weekStart)}/${fmtDate(fri)}`
        );
        if (bars.results?.length) stockPrice = bars.results[bars.results.length - 1].c;
      } catch { /* use current */ }
    }

    const strikes: StrikeVolume[] = [];
    const fetches: Promise<void>[] = [];

    for (const pct of otmPercents) {
      for (const side of ["call", "put"] as const) {
        const sign = side === "call" ? 1 : -1;
        const strike = roundStrike(stockPrice * (1 + sign * pct / 100));
        const code = side === "call" ? "C" : "P";
        const oTicker = optionTicker(ticker, fri, code, strike);

        fetches.push(
          api<{ results?: BarResult[] }>(
            `/v2/aggs/ticker/${oTicker}/range/1/day/${fmtDate(weekStart)}/${fmtDate(fri)}`
          ).then((data) => {
            const bars = data.results || [];
            strikes.push({
              otmPercent: pct,
              strike,
              type: side,
              totalVolume: bars.reduce((s, b) => s + b.v, 0),
              totalTrades: bars.reduce((s, b) => s + b.n, 0),
              days: Math.max(bars.length, 1),
              dailyBars: bars,
            });
          }).catch(() => {
            strikes.push({
              otmPercent: pct, strike, type: side,
              totalVolume: 0, totalTrades: 0, days: 1, dailyBars: [],
            });
          })
        );
      }
    }

    await Promise.all(fetches);
    weeklyStrikes.push(strikes);
  }

  const currentWeek = weeklyStrikes[0];
  const priorWeeks = weeklyStrikes.slice(1);

  for (const current of currentWeek) {
    const dailyAvg = current.totalVolume / current.days;

    // Find matching OTM% + type in prior weeks
    const priorAvgs = priorWeeks
      .map((week) => week.find((s) => s.otmPercent === current.otmPercent && s.type === current.type))
      .filter((s): s is StrikeVolume => !!s && s.totalVolume > 0)
      .map((s) => s.totalVolume / s.days);

    const histAvg = priorAvgs.length > 0
      ? priorAvgs.reduce((s, v) => s + v, 0) / priorAvgs.length
      : 0;

    // Weekly volume signal
    const weeklyMult = histAvg > 0 ? dailyAvg / histAvg : dailyAvg > 0 ? 999 : 0;
    if (weeklyMult >= 3) {
      signals.push({
        signalType: "weekly_volume",
        type: current.type,
        otmPercent: current.otmPercent,
        strike: current.strike,
        severity: severity(weeklyMult),
        multiplier: Math.round(weeklyMult * 10) / 10,
        title: `Weekly vol ${Math.round(weeklyMult * 10) / 10}x normal`,
        description: `${current.type.toUpperCase()} $${current.strike} (${current.otmPercent}% OTM): ${Math.round(dailyAvg)}/day vs hist ${Math.round(histAvg)}/day`,
      });
    }

    // Daily spike (last 2 days)
    if (current.dailyBars.length >= 2) {
      const last2 = current.dailyBars.slice(-2);
      const last2Avg = last2.reduce((s, b) => s + b.v, 0) / 2;

      const priorLast2 = priorWeeks
        .map((week) => week.find((s) => s.otmPercent === current.otmPercent && s.type === current.type))
        .filter((s): s is StrikeVolume => !!s && s.dailyBars.length >= 2)
        .map((s) => {
          const l2 = s.dailyBars.slice(-2);
          return l2.reduce((sum, b) => sum + b.v, 0) / 2;
        })
        .filter((v) => v > 0);

      const histLast2 = priorLast2.length > 0
        ? priorLast2.reduce((s, v) => s + v, 0) / priorLast2.length
        : 0;

      const dailyMult = histLast2 > 0 ? last2Avg / histLast2 : last2Avg > 10 ? 999 : 0;
      if (dailyMult >= 3 && last2Avg > 10) {
        signals.push({
          signalType: "daily_spike",
          type: current.type,
          otmPercent: current.otmPercent,
          strike: current.strike,
          severity: severity(dailyMult),
          multiplier: Math.round(dailyMult * 10) / 10,
          title: `Last 2 days ${Math.round(dailyMult * 10) / 10}x end-of-week avg`,
          description: `${current.type.toUpperCase()} $${current.strike}: last 2d avg ${Math.round(last2Avg)}/day vs prior ${Math.round(histLast2)}/day`,
        });
      }
    }

    // Block trades
    for (const bar of current.dailyBars) {
      if (bar.n > 0 && bar.v > 20) {
        const avgSize = bar.v / bar.n;
        const priorSizes = priorWeeks
          .map((week) => week.find((s) => s.otmPercent === current.otmPercent && s.type === current.type))
          .filter((s): s is StrikeVolume => !!s)
          .flatMap((s) => s.dailyBars)
          .filter((b) => b.n > 0 && b.v > 5)
          .map((b) => b.v / b.n);

        const histSize = priorSizes.length > 0
          ? priorSizes.reduce((s, v) => s + v, 0) / priorSizes.length
          : 0;

        const sizeMult = histSize > 0 ? avgSize / histSize : avgSize > 10 ? 999 : 0;
        if (sizeMult >= 3 && avgSize >= 10) {
          const date = new Date(bar.t).toISOString().split("T")[0];
          signals.push({
            signalType: "block_trade",
            type: current.type,
            otmPercent: current.otmPercent,
            strike: current.strike,
            severity: severity(sizeMult),
            multiplier: Math.round(sizeMult * 10) / 10,
            title: `Block trade on ${date}`,
            description: `${current.type.toUpperCase()} $${current.strike}: ${bar.v} vol in ${bar.n} trades (avg ${Math.round(avgSize)} vs hist ${Math.round(histSize)})`,
          });
        }
      }
    }
  }

  // Only keep medium+ severity
  const flagged = signals
    .filter((s) => s.severity !== "low")
    .sort((a, b) => {
      const so = SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity];
      return so !== 0 ? so : b.multiplier - a.multiplier;
    });

  const topSev = flagged.length > 0 ? flagged[0].severity : "low";
  const maxMult = flagged.length > 0 ? flagged[0].multiplier : 0;

  return {
    ticker,
    currentPrice,
    expiration: fmtDate(fridays[0]),
    signalCount: flagged.length,
    topSeverity: topSev,
    maxMultiplier: maxMult,
    signals: flagged,
  };
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const tickers: string[] = (body.tickers || []).map((t: string) => t.trim().toUpperCase()).filter(Boolean);

    if (tickers.length === 0) {
      return NextResponse.json({ error: "No tickers provided" }, { status: 400 });
    }

    if (tickers.length > 30) {
      return NextResponse.json({ error: "Maximum 30 tickers per scan" }, { status: 400 });
    }

    // Scan tickers in parallel batches of 5 to avoid rate limits
    const results: TickerResult[] = [];
    const batchSize = 5;

    for (let i = 0; i < tickers.length; i += batchSize) {
      const batch = tickers.slice(i, i + batchSize);
      const batchResults = await Promise.all(
        batch.map(async (ticker) => {
          try {
            return await fastScan(ticker);
          } catch (err) {
            return {
              ticker,
              currentPrice: 0,
              expiration: "",
              signalCount: 0,
              topSeverity: "low",
              maxMultiplier: 0,
              signals: [],
              error: err instanceof Error ? err.message : "Scan failed",
            } as TickerResult;
          }
        })
      );
      results.push(...batchResults);
    }

    // Sort: most signals / highest severity first
    const flagged = results
      .filter((r) => r.signalCount > 0)
      .sort((a, b) => {
        const so = SEVERITY_RANK[a.topSeverity] - SEVERITY_RANK[b.topSeverity];
        if (so !== 0) return so;
        if (b.signalCount !== a.signalCount) return b.signalCount - a.signalCount;
        return b.maxMultiplier - a.maxMultiplier;
      });

    const clean = results.filter((r) => r.signalCount === 0 && !r.error);
    const errors = results.filter((r) => !!r.error);

    return NextResponse.json({
      scannedAt: new Date().toISOString(),
      totalTickers: tickers.length,
      flaggedCount: flagged.length,
      cleanCount: clean.length,
      errorCount: errors.length,
      flagged,
      clean: clean.map((r) => ({ ticker: r.ticker, currentPrice: r.currentPrice })),
      errors: errors.map((r) => ({ ticker: r.ticker, error: r.error })),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
