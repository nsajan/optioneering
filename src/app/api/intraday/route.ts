import { NextRequest, NextResponse } from "next/server";
import { getAggregateBars } from "@/lib/massive";

function getSameDayOfWeek(dateStr: string, weeksBack: number): string {
  const d = new Date(dateStr + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() - weeksBack * 7);
  return d.toISOString().split("T")[0];
}

// Get the nearest Friday on or after a given date
// If the date IS a Friday, skip to next Friday (avoid same-day expiration)
function getNearestFriday(dateStr: string): string {
  const d = new Date(dateStr + "T12:00:00Z");
  const day = d.getUTCDay(); // 0=Sun..6=Sat
  const daysUntilFri = day === 5 ? 7 : day < 5 ? (5 - day) : 6;
  d.setUTCDate(d.getUTCDate() + daysUntilFri);
  return d.toISOString().split("T")[0];
}

// Find actual expiration: start from next Friday, if that's a holiday go backward
// Uses daily bars to check if a date is a trading day
async function findExpiration(symbol: string, dateStr: string): Promise<string> {
  const friday = getNearestFriday(dateStr);
  const fri = new Date(friday + "T12:00:00Z");
  const start = new Date(fri);
  start.setUTCDate(start.getUTCDate() - 4); // look at Mon-Fri of that week
  const startStr = start.toISOString().split("T")[0];

  const daily = await getAggregateBars(symbol, startStr, friday, "day", 1).catch(() => ({ results: [] as never[], resultsCount: 0 }));
  const bars = daily.results || [];
  if (bars.length === 0) return friday; // fallback

  // Last trading day in that week (on or before Friday) = expiration
  const lastBar = bars[bars.length - 1];
  return new Date(lastBar.t).toISOString().split("T")[0];
}

// Round strike to nearest standard increment based on price level
function roundStrike(price: number): number {
  if (price < 25) return Math.round(price * 2) / 2; // $0.50 increments
  if (price < 100) return Math.round(price); // $1 increments
  return Math.round(price / 5) * 5; // $5 increments
}

// Build option ticker: O:{SYMBOL}{YYMMDD}{C|P}{strike*1000 padded 8 digits}
function optionTicker(symbol: string, expDate: string, type: "put" | "call", strike: number): string {
  const yy = expDate.slice(2, 4);
  const mm = expDate.slice(5, 7);
  const dd = expDate.slice(8, 10);
  const cp = type === "call" ? "C" : "P";
  const strikeStr = String(Math.round(strike * 1000)).padStart(8, "0");
  return `O:${symbol}${yy}${mm}${dd}${cp}${strikeStr}`;
}

function buildHourlyPrices(
  bars: { o: number; c: number; h: number; l: number; v: number; vw: number; n: number; t: number }[],
  utcOffset: number,
  symbol: string,
  expDate: string,
  optionType: "put" | "call"
) {
  const targetHoursUTC = [];
  for (let cstHour = 9; cstHour <= 15; cstHour++) {
    targetHoursUTC.push(cstHour + utcOffset);
  }

  const otmPcts = [5, 10, 15, 20];

  return targetHoursUTC.map((utcHour) => {
    const cstHour = utcHour - utcOffset;
    const bar = bars.find((b) => new Date(b.t).getUTCHours() === utcHour);

    const label =
      cstHour === 12
        ? "12:00 PM"
        : cstHour > 12
          ? `${cstHour - 12}:00 PM`
          : `${cstHour}:00 AM`;

    const price = bar?.c ?? null;

    // Compute OTM strikes and option codes
    const strikes: Record<string, { strike: number; ticker: string } | null> = {};
    for (const pct of otmPcts) {
      if (price !== null) {
        const rawStrike =
          optionType === "put"
            ? price * (1 - pct / 100)
            : price * (1 + pct / 100);
        const strike = roundStrike(rawStrike);
        strikes[`otm${pct}`] = {
          strike,
          ticker: optionTicker(symbol, expDate, optionType, strike),
        };
      } else {
        strikes[`otm${pct}`] = null;
      }
    }

    return {
      hour: cstHour,
      label,
      close: price,
      ...strikes,
    };
  });
}

function buildSummary(bars: { o: number; c: number; h: number; l: number; v: number }[]) {
  if (bars.length === 0) return { open: null, close: null, high: null, low: null, volume: 0 };
  return {
    open: bars[0].o,
    close: bars[bars.length - 1].c,
    high: Math.max(...bars.map((b) => b.h)),
    low: Math.min(...bars.map((b) => b.l)),
    volume: bars.reduce((s, b) => s + b.v, 0),
  };
}

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const symbol = searchParams.get("symbol")?.toUpperCase();
  const date = searchParams.get("date"); // YYYY-MM-DD
  const optionType = (searchParams.get("type") || "put") as "put" | "call";

  if (!symbol || !date) {
    return NextResponse.json({ error: "symbol and date required" }, { status: 400 });
  }

  try {
    const d = new Date(date + "T12:00:00Z");
    const month = d.getUTCMonth();
    const isCDT = month >= 2 && month <= 10;
    const utcOffset = isCDT ? 5 : 6;

    // Fetch all 4 weeks in parallel
    const dates = [0, 1, 2, 3].map((w) => getSameDayOfWeek(date, w));

    // Trading day fallback: go FORWARD (holiday → next trading day)
    // Fetch a 5-day window starting from the target date, take the FIRST bar
    async function fetchWithFallback(dt: string) {
      const start = new Date(dt + "T12:00:00Z");
      const end = new Date(start);
      end.setUTCDate(end.getUTCDate() + 5);
      const endStr = end.toISOString().split("T")[0];

      const daily = await getAggregateBars(symbol!, dt, endStr, "day", 1).catch(() => ({ results: [] as never[], resultsCount: 0 }));
      const dailyBars = daily.results || [];
      if (dailyBars.length === 0) {
        return { data: { results: [] as never[], resultsCount: 0 }, actualDate: dt };
      }

      // First bar is the next trading day on or after the target
      const firstBar = dailyBars[0];
      const tradingDay = new Date(firstBar.t).toISOString().split("T")[0];

      const hourly = await getAggregateBars(symbol!, tradingDay, tradingDay, "hour", 1).catch(() => ({ results: [] as never[], resultsCount: 0 }));
      return { data: hourly, actualDate: tradingDay };
    }

    const fetched = await Promise.all(dates.map((dt) => fetchWithFallback(dt)));
    const results = fetched.map((f) => f.data);
    const actualDates = fetched.map((f) => f.actualDate);

    // Resolve actual expirations (Friday or prev day if holiday) in parallel
    const expirations = await Promise.all(actualDates.map((dt) => findExpiration(symbol, dt)));

    const weeks = actualDates.map((dt, i) => {
      const bars = results[i].results || [];
      const expDate = expirations[i];
      return {
        date: dt,
        weeksAgo: i,
        label: i === 0 ? "Selected Date" : `${i} Week${i > 1 ? "s" : ""} Before`,
        expiration: expDate,
        summary: buildSummary(bars),
        hours: buildHourlyPrices(bars, utcOffset, symbol, expDate, optionType),
      };
    });

    return NextResponse.json({
      symbol,
      date,
      optionType,
      timezone: isCDT ? "CDT" : "CST",
      weeks,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to fetch" },
      { status: 500 }
    );
  }
}
