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

interface PremiumPoint {
  weekEnd: string;
  nextExp: string;
  strike: number;
  optionClose: number;
  stockPrice: number;
  bps: number; // option_price / stock_price * 10000
}

interface PremiumSignal {
  type: "call" | "put";
  otmPercent: number;
  strike: number;
  ticker: string;
  currentPrice: number;
  currentBps: number;
  priorWeekBps: number;
  avgBps: number;
  wowMultiplier: number;
  avgMultiplier: number;
  bestMultiplier: number;
  comparisonType: string;
  severity: "medium" | "high" | "extreme";
  nextExpiration: string;
  weeks: PremiumPoint[];
}

interface TickerResult {
  ticker: string;
  stockPrice: number;
  nextExpiration: string;
  signalCount: number;
  topSeverity: string;
  maxMultiplier: number;
  signals: PremiumSignal[];
  error?: string;
}

const SEVERITY_RANK: Record<string, number> = { extreme: 0, high: 1, medium: 2, low: 3 };

async function scanPremium(ticker: string, asOfDate: Date | null): Promise<TickerResult> {
  const referenceDate = asOfDate || new Date();

  // Get stock price
  let currentPrice: number;
  if (asOfDate) {
    const lookback = new Date(asOfDate);
    lookback.setDate(lookback.getDate() - 5);
    const bars = await api<{ results?: BarResult[] }>(
      `/v2/aggs/ticker/${ticker}/range/1/day/${fmtDate(lookback)}/${fmtDate(asOfDate)}`
    );
    const last = (bars.results || []).at(-1);
    if (!last) throw new Error("No price data for date");
    currentPrice = last.c;
  } else {
    const prev = await api<{ results: BarResult[] }>(`/v2/aggs/ticker/${ticker}/prev`);
    currentPrice = prev.results?.[0]?.c;
    if (!currentPrice) throw new Error("No price data");
  }

  // Get 4 Fridays (current + 3 prior)
  const fridays = getFridays(referenceDate, 4);
  const otmPercents = [10, 15, 20];
  const signals: PremiumSignal[] = [];

  // For each week, get stock price and forward-week option close prices on the last trading day
  interface WeekInfo {
    friday: Date;
    nextFriday: Date;
    weekStart: Date;
    stockPrice: number;
  }

  const weeks: WeekInfo[] = [];

  for (let i = 0; i < fridays.length; i++) {
    const fri = fridays[i];
    const weekStart = new Date(fri);
    weekStart.setDate(weekStart.getDate() - 4);
    const nextFri = new Date(fri);
    nextFri.setDate(nextFri.getDate() + 7);

    let stockPrice = currentPrice;
    if (i > 0) {
      try {
        const bars = await api<{ results?: BarResult[] }>(
          `/v2/aggs/ticker/${ticker}/range/1/day/${fmtDate(weekStart)}/${fmtDate(fri)}`
        );
        if (bars.results?.length) stockPrice = bars.results[bars.results.length - 1].c;
      } catch { /* use current */ }
    }

    weeks.push({ friday: fri, nextFriday: nextFri, weekStart, stockPrice });
  }

  // For each OTM level and type, get the forward-week option's closing price on each Friday
  for (const type of ["call", "put"] as const) {
    for (const pct of otmPercents) {
      const premiums: PremiumPoint[] = [];

      // Fetch all weeks in parallel
      const fetches = weeks.map(async (week, i) => {
        const sign = type === "call" ? 1 : -1;
        const strike = roundStrike(week.stockPrice * (1 + sign * pct / 100));
        const code = type === "call" ? "C" : "P";
        const oTicker = optionTicker(ticker, week.nextFriday, code, strike);

        try {
          const data = await api<{ results?: BarResult[] }>(
            `/v2/aggs/ticker/${oTicker}/range/1/day/${fmtDate(week.weekStart)}/${fmtDate(week.friday)}`
          );
          const bars = data.results || [];
          const lastBar = bars.at(-1);
          if (lastBar && lastBar.c > 0) {
            premiums.push({
              weekEnd: fmtDate(week.friday),
              nextExp: fmtDate(week.nextFriday),
              strike,
              optionClose: lastBar.c,
              stockPrice: week.stockPrice,
              bps: (lastBar.c / week.stockPrice) * 10000,
            });
          }
        } catch { /* skip */ }
      });

      await Promise.all(fetches);

      // Sort by week (most recent first)
      premiums.sort((a, b) => b.weekEnd.localeCompare(a.weekEnd));

      if (premiums.length < 2) continue;

      const current = premiums[0];
      const prior = premiums.slice(1).filter((p) => p.bps > 0);
      if (prior.length === 0) continue;

      // Week-over-week
      const wowMult = prior[0].bps > 0 ? current.bps / prior[0].bps : 0;

      // 3-week avg
      const avgBps = prior.reduce((s, p) => s + p.bps, 0) / prior.length;
      const avgMult = avgBps > 0 ? current.bps / avgBps : 0;

      const bestMult = Math.max(wowMult, avgMult);
      const comparisonType = wowMult > avgMult ? "week-over-week" : "vs 3-week avg";

      if (bestMult >= 2) {
        const sev = bestMult >= 4 ? "extreme" as const : bestMult >= 3 ? "high" as const : "medium" as const;
        signals.push({
          type,
          otmPercent: pct,
          strike: current.strike,
          ticker: `${ticker} ${type.toUpperCase()} $${current.strike}`,
          currentPrice: current.optionClose,
          currentBps: Math.round(current.bps * 10) / 10,
          priorWeekBps: Math.round(prior[0].bps * 10) / 10,
          avgBps: Math.round(avgBps * 10) / 10,
          wowMultiplier: Math.round(wowMult * 10) / 10,
          avgMultiplier: Math.round(avgMult * 10) / 10,
          bestMultiplier: Math.round(bestMult * 10) / 10,
          comparisonType,
          severity: sev,
          nextExpiration: current.nextExp,
          weeks: premiums,
        });
      }
    }
  }

  signals.sort((a, b) => {
    const so = SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity];
    return so !== 0 ? so : b.bestMultiplier - a.bestMultiplier;
  });

  const topSev = signals.length > 0 ? signals[0].severity : "low";
  const maxMult = signals.length > 0 ? signals[0].bestMultiplier : 0;

  return {
    ticker,
    stockPrice: currentPrice,
    nextExpiration: fmtDate(weeks[0].nextFriday),
    signalCount: signals.length,
    topSeverity: topSev,
    maxMultiplier: maxMult,
    signals,
  };
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const tickers: string[] = (body.tickers || []).map((t: string) => t.trim().toUpperCase()).filter(Boolean);
    const asOfParam: string | undefined = body.asOf;
    const asOfDate = asOfParam ? new Date(asOfParam + "T12:00:00Z") : null;

    if (tickers.length === 0) {
      return NextResponse.json({ error: "No tickers provided" }, { status: 400 });
    }
    if (tickers.length > 50) {
      return NextResponse.json({ error: "Maximum 50 tickers per scan" }, { status: 400 });
    }

    const results: TickerResult[] = [];
    const batchSize = 5;

    for (let i = 0; i < tickers.length; i += batchSize) {
      const batch = tickers.slice(i, i + batchSize);
      const batchResults = await Promise.all(
        batch.map(async (t) => {
          try {
            return await scanPremium(t, asOfDate);
          } catch (err) {
            return {
              ticker: t,
              stockPrice: 0,
              nextExpiration: "",
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
      ...(asOfDate ? { asOf: fmtDate(asOfDate) } : {}),
      totalTickers: tickers.length,
      flaggedCount: flagged.length,
      cleanCount: clean.length,
      errorCount: errors.length,
      flagged,
      clean: clean.map((r) => ({ ticker: r.ticker, stockPrice: r.stockPrice })),
      errors: errors.map((r) => ({ ticker: r.ticker, error: r.error })),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
