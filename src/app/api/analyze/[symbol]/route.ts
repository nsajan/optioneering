import { NextRequest, NextResponse } from "next/server";

const BASE = "https://api.massive.com";
const KEY = process.env.MASSIVE_API_KEY!;

async function api<T>(path: string): Promise<T> {
  const sep = path.includes("?") ? "&" : "?";
  const res = await fetch(`${BASE}${path}${sep}apikey=${KEY}`);
  if (!res.ok) throw new Error(`API ${res.status}: ${res.statusText}`);
  return res.json();
}

// Get the next N Fridays going back from a date
function getFridays(from: Date, count: number): Date[] {
  const fridays: Date[] = [];
  const d = new Date(from);
  // Find nearest upcoming Friday (or today if Friday)
  const dayOfWeek = d.getDay();
  const daysUntilFri = dayOfWeek <= 5 ? 5 - dayOfWeek : 6;
  d.setDate(d.getDate() + daysUntilFri);
  fridays.push(new Date(d));
  // Go back 3 weeks
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

function optionTicker(
  underlying: string,
  expDate: Date,
  type: "C" | "P",
  strike: number
): string {
  return `O:${underlying}${fmtDateShort(expDate)}${type}${(strike * 1000).toString().padStart(8, "0")}`;
}

function roundStrike(price: number): number {
  return Math.round(price / 5) * 5;
}

interface BarResult {
  v: number;
  n: number;
  o: number;
  c: number;
  h: number;
  l: number;
  t: number;
}

interface WeekData {
  expiration: string;
  stockPrice: number;
  daysTraded: number;
  calls: StrikeData[];
  puts: StrikeData[];
}

interface StrikeData {
  otmPercent: number;
  strike: number;
  ticker: string;
  totalVolume: number;
  totalTrades: number;
  dailyAvgVolume: number;
  dailyBars: { date: string; volume: number; trades: number; close: number }[];
}

interface AnomalyResult {
  type: "call" | "put";
  otmPercent: number;
  currentStrike: number;
  currentTicker: string;
  currentVolume: number;
  currentDailyAvg: number;
  historicalAvgDailyVol: number;
  multiplier: number;
  severity: "low" | "medium" | "high" | "extreme";
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

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ symbol: string }> }
) {
  const { symbol } = await params;
  const upper = symbol.toUpperCase();

  try {
    // 1. Get current stock price
    const prevDay = await api<{ results: BarResult[] }>(
      `/v2/aggs/ticker/${upper}/prev`
    );
    const currentPrice = prevDay.results?.[0]?.c;
    if (!currentPrice) {
      return NextResponse.json({ error: "Could not get stock price" }, { status: 404 });
    }

    // 2. Get 4 Fridays (this week + 3 prior)
    const fridays = getFridays(new Date(), 4);

    // 3. Get stock price near each Friday for proper OTM calculation
    const weeklyData: WeekData[] = [];
    const otmPercents = [10, 15, 20];

    for (let i = 0; i < fridays.length; i++) {
      const fri = fridays[i];
      const weekStart = new Date(fri);
      weekStart.setDate(weekStart.getDate() - 4); // Monday of that week

      // Get stock price for that week (use Thursday close or nearest)
      let stockPrice: number;
      if (i === 0) {
        stockPrice = currentPrice;
      } else {
        const weekBars = await api<{ results?: BarResult[] }>(
          `/v2/aggs/ticker/${upper}/range/1/day/${fmtDate(weekStart)}/${fmtDate(fri)}`
        );
        const bars = weekBars.results || [];
        stockPrice = bars.length > 0 ? bars[bars.length - 1].c : currentPrice;
      }

      const calls: StrikeData[] = [];
      const puts: StrikeData[] = [];

      // Fetch volume for each OTM level
      const fetches: Promise<void>[] = [];

      for (const pct of otmPercents) {
        const callStrike = roundStrike(stockPrice * (1 + pct / 100));
        const putStrike = roundStrike(stockPrice * (1 - pct / 100));
        const callTicker = optionTicker(upper, fri, "C", callStrike);
        const putTicker = optionTicker(upper, fri, "P", putStrike);

        fetches.push(
          getWeekVolume(callTicker, fmtDate(weekStart), fmtDate(fri)).then(
            (res) => {
              const days = Math.max(res.bars.length, 1);
              calls.push({
                otmPercent: pct,
                strike: callStrike,
                ticker: callTicker,
                totalVolume: res.totalVolume,
                totalTrades: res.totalTrades,
                dailyAvgVolume: res.totalVolume / days,
                dailyBars: res.bars.map((b) => ({
                  date: new Date(b.t).toISOString().split("T")[0],
                  volume: b.v,
                  trades: b.n,
                  close: b.c,
                })),
              });
            }
          )
        );

        fetches.push(
          getWeekVolume(putTicker, fmtDate(weekStart), fmtDate(fri)).then(
            (res) => {
              const days = Math.max(res.bars.length, 1);
              puts.push({
                otmPercent: pct,
                strike: putStrike,
                ticker: putTicker,
                totalVolume: res.totalVolume,
                totalTrades: res.totalTrades,
                dailyAvgVolume: res.totalVolume / days,
                dailyBars: res.bars.map((b) => ({
                  date: new Date(b.t).toISOString().split("T")[0],
                  volume: b.v,
                  trades: b.n,
                  close: b.c,
                })),
              });
            }
          )
        );
      }

      await Promise.all(fetches);

      // Sort by OTM percent
      calls.sort((a, b) => a.otmPercent - b.otmPercent);
      puts.sort((a, b) => a.otmPercent - b.otmPercent);

      weeklyData.push({
        expiration: fmtDate(fri),
        stockPrice,
        daysTraded: i === 0 ? Math.max(1, calls[0]?.dailyBars.length || 1) : 5,
        calls,
        puts,
      });
    }

    // 4. Detect anomalies: compare current week vs. avg of prior 3 weeks
    const currentWeek = weeklyData[0];
    const priorWeeks = weeklyData.slice(1);
    const anomalies: AnomalyResult[] = [];

    for (const type of ["call", "put"] as const) {
      const currentContracts = type === "call" ? currentWeek.calls : currentWeek.puts;

      for (const current of currentContracts) {
        // Find matching OTM% in prior weeks
        const priorMatches = priorWeeks.map((week) => {
          const contracts = type === "call" ? week.calls : week.puts;
          return contracts.find((c) => c.otmPercent === current.otmPercent);
        });

        const priorDailyAvgs = priorMatches
          .filter((m): m is StrikeData => !!m)
          .map((m) => m.dailyAvgVolume);

        const historicalAvgDaily =
          priorDailyAvgs.length > 0
            ? priorDailyAvgs.reduce((s, v) => s + v, 0) / priorDailyAvgs.length
            : 0;

        const currentDailyAvg = current.dailyAvgVolume;
        const multiplier =
          historicalAvgDaily > 0 ? currentDailyAvg / historicalAvgDaily : currentDailyAvg > 0 ? 999 : 0;

        let severity: AnomalyResult["severity"] = "low";
        if (multiplier >= 10) severity = "extreme";
        else if (multiplier >= 5) severity = "high";
        else if (multiplier >= 3) severity = "medium";

        anomalies.push({
          type,
          otmPercent: current.otmPercent,
          currentStrike: current.strike,
          currentTicker: current.ticker,
          currentVolume: current.totalVolume,
          currentDailyAvg: Math.round(currentDailyAvg),
          historicalAvgDailyVol: Math.round(historicalAvgDaily),
          multiplier: Math.round(multiplier * 10) / 10,
          severity,
          weeklyBreakdown: [
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
          ],
        });
      }
    }

    // Sort anomalies by multiplier descending
    anomalies.sort((a, b) => b.multiplier - a.multiplier);

    const hasAnomaly = anomalies.some((a) => a.severity !== "low");

    return NextResponse.json({
      ticker: upper,
      currentPrice,
      currentExpiration: currentWeek.expiration,
      analyzedExpirations: weeklyData.map((w) => w.expiration),
      hasAnomaly,
      anomalyCount: anomalies.filter((a) => a.severity !== "low").length,
      anomalies,
      weeklyData,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
