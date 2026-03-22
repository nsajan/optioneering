import { NextRequest, NextResponse } from "next/server";
import { getAggregateBars } from "@/lib/massive";

type Bar = { o: number; c: number; h: number; l: number; v: number; vw: number; n: number; t: number };

function getSameDayOfWeek(dateStr: string, weeksBack: number): string {
  const d = new Date(dateStr + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() - weeksBack * 7);
  return d.toISOString().split("T")[0];
}

// If date is Friday, skip to next Friday; otherwise nearest Friday on or after
function getNearestFriday(dateStr: string): string {
  const d = new Date(dateStr + "T12:00:00Z");
  const day = d.getUTCDay();
  const daysUntilFri = day === 5 ? 7 : day < 5 ? (5 - day) : 6;
  d.setUTCDate(d.getUTCDate() + daysUntilFri);
  return d.toISOString().split("T")[0];
}

// Expiration fallback: if Friday is holiday, go backward to prev trading day
async function findExpiration(symbol: string, dateStr: string): Promise<string> {
  const friday = getNearestFriday(dateStr);
  const fri = new Date(friday + "T12:00:00Z");
  const start = new Date(fri);
  start.setUTCDate(start.getUTCDate() - 4);
  const startStr = start.toISOString().split("T")[0];

  const daily = await getAggregateBars(symbol, startStr, friday, "day", 1).catch(() => ({ results: [] as Bar[], resultsCount: 0 }));
  const bars = daily.results || [];
  if (bars.length === 0) return friday;

  const lastBar = bars[bars.length - 1];
  return new Date(lastBar.t).toISOString().split("T")[0];
}

function roundStrike(price: number): number {
  if (price < 25) return Math.round(price * 2) / 2;
  if (price < 100) return Math.round(price);
  return Math.round(price / 5) * 5;
}

function optionTicker(symbol: string, expDate: string, type: "put" | "call", strike: number): string {
  const yy = expDate.slice(2, 4);
  const mm = expDate.slice(5, 7);
  const dd = expDate.slice(8, 10);
  const cp = type === "call" ? "C" : "P";
  const strikeStr = String(Math.round(strike * 1000)).padStart(8, "0");
  return `O:${symbol}${yy}${mm}${dd}${cp}${strikeStr}`;
}

function buildSummary(bars: Bar[]) {
  if (bars.length === 0) return { open: null, close: null, high: null, low: null, volume: 0 };
  return {
    open: bars[0].o,
    close: bars[bars.length - 1].c,
    high: Math.max(...bars.map((b) => b.h)),
    low: Math.min(...bars.map((b) => b.l)),
    volume: bars.reduce((s, b) => s + b.v, 0),
  };
}

const OTM_PCTS = [5, 10, 15, 20];

// Compute which option tickers we need for a given day's stock bars
function getOptionTickersForDay(
  stockBars: Bar[],
  utcOffset: number,
  symbol: string,
  expDate: string,
  optionType: "put" | "call"
) {
  // Use the first valid bar's close to compute strikes (strikes stay same all day for a given OTM%)
  // Actually strikes shift as price moves, so compute per-hour. But we need to know all unique tickers to fetch.
  const tickers = new Set<string>();
  const hourStrikeMap: Record<number, Record<string, { strike: number; ticker: string }>> = {};

  for (let cstHour = 9; cstHour <= 15; cstHour++) {
    const utcHour = cstHour + utcOffset;
    const bar = stockBars.find((b) => new Date(b.t).getUTCHours() === utcHour);
    if (!bar) continue;

    hourStrikeMap[cstHour] = {};
    for (const pct of OTM_PCTS) {
      const rawStrike = optionType === "put" ? bar.c * (1 - pct / 100) : bar.c * (1 + pct / 100);
      const strike = roundStrike(rawStrike);
      const ticker = optionTicker(symbol, expDate, optionType, strike);
      tickers.add(ticker);
      hourStrikeMap[cstHour][`otm${pct}`] = { strike, ticker };
    }
  }

  return { tickers: Array.from(tickers), hourStrikeMap };
}

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const symbol = searchParams.get("symbol")?.toUpperCase();
  const date = searchParams.get("date");
  const optionType = (searchParams.get("type") || "put") as "put" | "call";

  if (!symbol || !date) {
    return NextResponse.json({ error: "symbol and date required" }, { status: 400 });
  }

  try {
    const d = new Date(date + "T12:00:00Z");
    const month = d.getUTCMonth();
    const isCDT = month >= 2 && month <= 10;
    const utcOffset = isCDT ? 5 : 6;

    // Step 1: Resolve actual trading days for all 4 weeks
    const dates = [0, 1, 2, 3].map((w) => getSameDayOfWeek(date, w));

    async function fetchTradingDay(dt: string) {
      const end = new Date(dt + "T12:00:00Z");
      end.setUTCDate(end.getUTCDate() + 5);
      const endStr = end.toISOString().split("T")[0];

      const daily = await getAggregateBars(symbol!, dt, endStr, "day", 1).catch(() => ({ results: [] as Bar[], resultsCount: 0 }));
      const dailyBars = daily.results || [];
      if (dailyBars.length === 0) return { actualDate: dt, stockBars: [] as Bar[] };

      const tradingDay = new Date(dailyBars[0].t).toISOString().split("T")[0];
      const hourly = await getAggregateBars(symbol!, tradingDay, tradingDay, "hour", 1).catch(() => ({ results: [] as Bar[], resultsCount: 0 }));
      return { actualDate: tradingDay, stockBars: hourly.results || [] };
    }

    const tradingDays = await Promise.all(dates.map(fetchTradingDay));

    // Step 2: Resolve expirations
    const expirations = await Promise.all(tradingDays.map((td) => findExpiration(symbol, td.actualDate)));

    // Step 3: For each week, figure out which option tickers we need and fetch their hourly bars
    const weekOptionData = await Promise.all(
      tradingDays.map(async (td, i) => {
        const expDate = expirations[i];
        const { tickers, hourStrikeMap } = getOptionTickersForDay(td.stockBars, utcOffset, symbol, expDate, optionType);

        // Fetch hourly bars for all unique option tickers in parallel
        const optionBarsMap: Record<string, Bar[]> = {};
        await Promise.all(
          tickers.map(async (ticker) => {
            const res = await getAggregateBars(ticker, td.actualDate, td.actualDate, "hour", 1).catch(() => ({ results: [] as Bar[], resultsCount: 0 }));
            optionBarsMap[ticker] = res.results || [];
          })
        );

        return { hourStrikeMap, optionBarsMap };
      })
    );

    // Step 4: Build response
    const weeks = tradingDays.map((td, i) => {
      const expDate = expirations[i];
      const { hourStrikeMap, optionBarsMap } = weekOptionData[i];

      const hours = [];
      for (let cstHour = 9; cstHour <= 15; cstHour++) {
        const utcHour = cstHour + utcOffset;
        const stockBar = td.stockBars.find((b) => new Date(b.t).getUTCHours() === utcHour);

        const label =
          cstHour === 12 ? "12:00 PM" : cstHour > 12 ? `${cstHour - 12}:00 PM` : `${cstHour}:00 AM`;

        const strikes: Record<string, { strike: number; ticker: string; premium: number | null; volume: number | null } | null> = {};
        for (const pct of OTM_PCTS) {
          const info = hourStrikeMap[cstHour]?.[`otm${pct}`];
          if (info) {
            const optBars = optionBarsMap[info.ticker] || [];
            const optBar = optBars.find((b) => new Date(b.t).getUTCHours() === utcHour);
            strikes[`otm${pct}`] = {
              strike: info.strike,
              ticker: info.ticker,
              premium: optBar?.c ?? null,
              volume: optBar ? Math.round(optBar.v) : null,
            };
          } else {
            strikes[`otm${pct}`] = null;
          }
        }

        hours.push({
          hour: cstHour,
          label,
          close: stockBar?.c ?? null,
          ...strikes,
        });
      }

      return {
        date: td.actualDate,
        weeksAgo: i,
        label: i === 0 ? "Selected Date" : `${i} Week${i > 1 ? "s" : ""} Before`,
        expiration: expDate,
        summary: buildSummary(td.stockBars),
        hours,
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
