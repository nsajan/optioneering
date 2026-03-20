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

interface BarResult {
  v: number; n: number; o: number; c: number; h: number; l: number; t: number;
}

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

interface WeekSummary {
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
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ symbol: string }> }
) {
  const { symbol } = await params;
  const upper = symbol.toUpperCase();
  const searchParams = request.nextUrl.searchParams;

  const strike = parseFloat(searchParams.get("strike") || "0");
  const contractType = (searchParams.get("type") || "put").toLowerCase() as "put" | "call";
  const weeks = Math.min(parseInt(searchParams.get("weeks") || "6", 10), 10);

  if (!strike || strike <= 0) {
    return NextResponse.json({ error: "Strike price required" }, { status: 400 });
  }

  try {
    // Get current stock price
    const prevDay = await api<{ results: BarResult[] }>(`/v2/aggs/ticker/${upper}/prev`);
    const currentPrice = prevDay.results?.[0]?.c;
    if (!currentPrice) {
      return NextResponse.json({ error: "Could not get stock price" }, { status: 404 });
    }

    const otmPercent = contractType === "put"
      ? ((currentPrice - strike) / currentPrice) * 100
      : ((strike - currentPrice) / currentPrice) * 100;

    // Get weekly expiries (current + prior weeks)
    const fridays = getFridays(new Date(), weeks);
    const typeCode = contractType === "call" ? "C" : "P";

    // Fetch volume data for each week in parallel
    const weeklyData: WeekSummary[] = [];
    const fetches = fridays.map(async (fri) => {
      const ticker = optionTicker(upper, fri, typeCode, strike);
      const weekStart = new Date(fri);
      // Fetch 2 full weeks of data to capture early positioning
      weekStart.setDate(weekStart.getDate() - 11);

      try {
        const data = await api<{ results?: BarResult[] }>(
          `/v2/aggs/ticker/${ticker}/range/1/day/${fmtDate(weekStart)}/${fmtDate(fri)}`
        );
        const bars = data.results || [];
        const dailyBars: DailyBar[] = bars.map((b) => ({
          date: new Date(b.t).toISOString().split("T")[0],
          volume: b.v,
          trades: b.n,
          open: b.o,
          close: b.c,
          high: b.h,
          low: b.l,
          avgSize: b.n > 0 ? Math.round(b.v / b.n) : 0,
          vwap: b.v > 0 ? Math.round(((b.o + b.c + b.h + b.l) / 4) * 100) / 100 : 0,
          dollarVolume: b.v * ((b.o + b.c + b.h + b.l) / 4) * 100,
        }));

        const totalVolume = dailyBars.reduce((s, b) => s + b.volume, 0);
        const totalTrades = dailyBars.reduce((s, b) => s + b.trades, 0);
        const totalDollarVolume = dailyBars.reduce((s, b) => s + b.dollarVolume, 0);
        const peakBar = dailyBars.reduce((max, b) => b.volume > max.volume ? b : max, dailyBars[0] || { volume: 0, date: "" });

        weeklyData.push({
          expiration: fmtDate(fri),
          ticker,
          totalVolume,
          totalTrades,
          totalDollarVolume: Math.round(totalDollarVolume),
          avgDailyVolume: dailyBars.length > 0 ? Math.round(totalVolume / dailyBars.length) : 0,
          peakDayVolume: peakBar?.volume || 0,
          peakDay: peakBar?.date || "",
          tradingDays: dailyBars.length,
          dailyBars,
        });
      } catch {
        weeklyData.push({
          expiration: fmtDate(fri),
          ticker,
          totalVolume: 0,
          totalTrades: 0,
          totalDollarVolume: 0,
          avgDailyVolume: 0,
          peakDayVolume: 0,
          peakDay: "",
          tradingDays: 0,
          dailyBars: [],
        });
      }
    });

    await Promise.all(fetches);

    // Sort oldest first
    weeklyData.sort((a, b) => a.expiration.localeCompare(b.expiration));

    // Compute z-scores and spike detection
    const volumes = weeklyData.map((w) => w.totalVolume).filter((v) => v > 0);
    const mean = volumes.length > 0 ? volumes.reduce((s, v) => s + v, 0) / volumes.length : 0;
    const stdDev = volumes.length > 1
      ? Math.sqrt(volumes.reduce((s, v) => s + (v - mean) ** 2, 0) / (volumes.length - 1))
      : 0;

    const weeklyWithScores = weeklyData.map((w) => ({
      ...w,
      zScore: stdDev > 0 ? Math.round(((w.totalVolume - mean) / stdDev) * 100) / 100 : 0,
      isSpike: stdDev > 0 ? (w.totalVolume - mean) / stdDev > 1.5 : false,
      vsAvg: mean > 0 ? Math.round((w.totalVolume / mean) * 10) / 10 : 0,
    }));

    // Daily spike detection across all bars
    const allBars = weeklyData.flatMap((w) => w.dailyBars);
    const dailyVolumes = allBars.map((b) => b.volume).filter((v) => v > 0);
    const dailyMean = dailyVolumes.length > 0 ? dailyVolumes.reduce((s, v) => s + v, 0) / dailyVolumes.length : 0;
    const dailyStdDev = dailyVolumes.length > 1
      ? Math.sqrt(dailyVolumes.reduce((s, v) => s + (v - dailyMean) ** 2, 0) / (dailyVolumes.length - 1))
      : 0;

    const spikedays = allBars
      .filter((b) => dailyStdDev > 0 && (b.volume - dailyMean) / dailyStdDev > 1.5)
      .map((b) => ({
        date: b.date,
        volume: b.volume,
        trades: b.trades,
        avgSize: b.avgSize,
        dollarVolume: Math.round(b.dollarVolume),
        zScore: Math.round(((b.volume - dailyMean) / dailyStdDev) * 100) / 100,
      }))
      .sort((a, b) => b.zScore - a.zScore);

    return NextResponse.json({
      ticker: upper,
      currentPrice,
      strike,
      contractType,
      otmPercent: Math.round(otmPercent * 10) / 10,
      weeks: weeklyWithScores,
      stats: {
        avgWeeklyVolume: Math.round(mean),
        stdDev: Math.round(stdDev),
        avgDailyVolume: Math.round(dailyMean),
        dailyStdDev: Math.round(dailyStdDev),
      },
      spikeDays: spikedays,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
