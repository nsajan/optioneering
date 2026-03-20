import { NextRequest, NextResponse } from "next/server";

const BASE = "https://api.massive.com";
const KEY = process.env.MASSIVE_API_KEY!;

async function api<T>(path: string): Promise<T> {
  const sep = path.includes("?") ? "&" : "?";
  const res = await fetch(`${BASE}${path}${sep}apikey=${KEY}`);
  if (!res.ok) throw new Error(`API ${res.status}: ${res.statusText}`);
  return res.json();
}

function roundStrike(price: number): number {
  if (price >= 50) return Math.round(price / 5) * 5;
  if (price >= 10) return Math.round(price / 1) * 1;
  return Math.round(price / 0.5) * 0.5;
}

function getFridays(from: Date, count: number): Date[] {
  const fridays: Date[] = [];
  const d = new Date(from);
  const dayOfWeek = d.getDay();
  const daysUntilFri = dayOfWeek <= 5 ? 5 - dayOfWeek : 6;
  d.setDate(d.getDate() + daysUntilFri);
  fridays.push(new Date(d));
  for (let i = 1; i < count; i++) {
    d.setDate(d.getDate() + 7);
    fridays.push(new Date(d));
  }
  return fridays;
}

function fmtDate(d: Date): string {
  return d.toISOString().split("T")[0];
}

interface BarResult {
  v: number; n: number; o: number; c: number; h: number; l: number; t: number;
}

interface OptionSnapshot {
  day?: { volume: number };
  details: { contract_type: string; strike_price: number; expiration_date: string; ticker: string };
  implied_volatility: number;
  open_interest: number;
}

interface OIDataPoint {
  expiration: string;
  strike: number;
  oi: number;
  stockPrice: number;
  otmPercent: number;
  iv: number;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ symbol: string }> }
) {
  const { symbol } = await params;
  const upper = symbol.toUpperCase();
  const searchParams = request.nextUrl.searchParams;
  const weeks = Math.min(parseInt(searchParams.get("weeks") || "4", 10), 8);
  const otmPct = parseFloat(searchParams.get("otm") || "10");

  try {
    // Get current stock price
    const prevDay = await api<{ results: BarResult[] }>(`/v2/aggs/ticker/${upper}/prev`);
    const currentPrice = prevDay.results?.[0]?.c;
    if (!currentPrice) {
      return NextResponse.json({ error: "Could not get stock price" }, { status: 404 });
    }

    // Get upcoming Friday expirations (current week + next N weeks)
    const fridays = getFridays(new Date(), weeks);

    // For each expiration, get the stock price context and snapshot OI
    const callPoints: OIDataPoint[] = [];
    const putPoints: OIDataPoint[] = [];

    // Also get historical stock prices for each week to compute proper OTM strikes
    // For future expirations, use current price. For past expirations we'd use that week's price.
    // Since snapshots only work for non-expired options, we fetch all future fridays.

    const fetches = fridays.map(async (fri) => {
      const expDate = fmtDate(fri);

      // Get stock price as of the Monday of that week for context
      const weekStart = new Date(fri);
      weekStart.setDate(weekStart.getDate() - 4);

      let stockPrice = currentPrice;
      try {
        const stockBars = await api<{ results?: BarResult[] }>(
          `/v2/aggs/ticker/${upper}/range/1/day/${fmtDate(weekStart)}/${fmtDate(fri)}`
        );
        if (stockBars.results?.length) {
          stockPrice = stockBars.results[stockBars.results.length - 1].c;
        }
      } catch { /* use current price */ }

      // Compute strikes at the requested OTM% relative to that week's stock price
      const callStrike = roundStrike(stockPrice * (1 + otmPct / 100));
      const putStrike = roundStrike(stockPrice * (1 - otmPct / 100));

      // Fetch snapshot for this expiration
      try {
        const snap = await api<{ results?: OptionSnapshot[] }>(
          `/v3/snapshot/options/${upper}?expiration_date=${expDate}&limit=250`
        );
        const results = snap.results || [];

        // Find matching call
        const call = results.find(
          (s) => s.details.contract_type === "call" && Math.abs(s.details.strike_price - callStrike) < 1
        );
        if (call) {
          callPoints.push({
            expiration: expDate,
            strike: call.details.strike_price,
            oi: call.open_interest || 0,
            stockPrice,
            otmPercent: otmPct,
            iv: call.implied_volatility || 0,
          });
        }

        // Find matching put
        const put = results.find(
          (s) => s.details.contract_type === "put" && Math.abs(s.details.strike_price - putStrike) < 1
        );
        if (put) {
          putPoints.push({
            expiration: expDate,
            strike: put.details.strike_price,
            oi: put.open_interest || 0,
            stockPrice,
            otmPercent: otmPct,
            iv: put.implied_volatility || 0,
          });
        }
      } catch { /* skip unavailable expirations */ }
    });

    await Promise.all(fetches);

    // Sort by expiration date
    callPoints.sort((a, b) => a.expiration.localeCompare(b.expiration));
    putPoints.sort((a, b) => a.expiration.localeCompare(b.expiration));

    // Compute anomaly scores
    const callAvgOI = callPoints.length > 1
      ? callPoints.slice(1).reduce((s, p) => s + p.oi, 0) / (callPoints.length - 1)
      : 0;
    const putAvgOI = putPoints.length > 1
      ? putPoints.slice(1).reduce((s, p) => s + p.oi, 0) / (putPoints.length - 1)
      : 0;

    const nearestCall = callPoints[0];
    const nearestPut = putPoints[0];

    return NextResponse.json({
      ticker: upper,
      currentPrice,
      otmPercent: otmPct,
      weeks,
      calls: {
        points: callPoints,
        nearestOI: nearestCall?.oi || 0,
        avgOtherOI: Math.round(callAvgOI),
        multiplier: callAvgOI > 0 && nearestCall ? Math.round((nearestCall.oi / callAvgOI) * 10) / 10 : 0,
      },
      puts: {
        points: putPoints,
        nearestOI: nearestPut?.oi || 0,
        avgOtherOI: Math.round(putAvgOI),
        multiplier: putAvgOI > 0 && nearestPut ? Math.round((nearestPut.oi / putAvgOI) * 10) / 10 : 0,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
