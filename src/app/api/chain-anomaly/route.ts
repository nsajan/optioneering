import { NextRequest, NextResponse } from "next/server";
import { getAggregateBars } from "@/lib/massive";

const AV_KEY = process.env.ALPHA_VANTAGE_API_KEY!;

type Bar = { o: number; c: number; h: number; l: number; v: number; vw: number; n: number; t: number };

function getSameDayOfWeek(dateStr: string, weeksBack: number): string {
  const d = new Date(dateStr + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() - weeksBack * 7);
  return d.toISOString().split("T")[0];
}

function getNearestFriday(dateStr: string): string {
  const d = new Date(dateStr + "T12:00:00Z");
  const day = d.getUTCDay();
  const daysUntilFri = day === 5 ? 7 : day < 5 ? (5 - day) : 6;
  d.setUTCDate(d.getUTCDate() + daysUntilFri);
  return d.toISOString().split("T")[0];
}

interface AVContract {
  contractID: string;
  expiration: string;
  strike: string;
  type: string;
  last: string;
  mark: string;
  bid: string;
  ask: string;
  volume: string;
  open_interest: string;
  implied_volatility: string;
  delta: string;
}

async function fetchChain(symbol: string, date: string): Promise<AVContract[]> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20000);
    const res = await fetch(
      `https://www.alphavantage.co/query?function=HISTORICAL_OPTIONS&symbol=${symbol}&date=${date}&apikey=${AV_KEY}`,
      { signal: controller.signal }
    );
    clearTimeout(timeout);
    const json = await res.json();
    return json.data || [];
  } catch {
    return [];
  }
}

async function getStockPrice(symbol: string, date: string): Promise<{ date: string; close: number } | null> {
  try {
    const end = new Date(date + "T12:00:00Z");
    end.setUTCDate(end.getUTCDate() + 5);
    const daily = await getAggregateBars(symbol, date, end.toISOString().split("T")[0], "day", 1);
    const bar = (daily.results || [])[0];
    if (!bar) return null;
    return { date: new Date(bar.t).toISOString().split("T")[0], close: bar.c };
  } catch {
    return null;
  }
}

const BUCKETS = [
  { name: "ATM-5%", min: 0, max: 5 },
  { name: "5-10%", min: 5, max: 10 },
  { name: "10-20%", min: 10, max: 20 },
  { name: "20%+", min: 20, max: 100 },
];

function bucketContracts(
  contracts: AVContract[],
  stockPrice: number,
  optionType: "put" | "call",
  expiration: string
) {
  const filtered = contracts.filter(
    (c) => c.type === optionType && c.expiration === expiration
  );

  const bucketData = BUCKETS.map((b) => {
    const inBucket = filtered.filter((c) => {
      const strike = parseFloat(c.strike);
      const otmPct = (Math.abs(strike - stockPrice) / stockPrice) * 100;
      // For puts, OTM means strike < price; for calls, strike > price
      const isOtm = optionType === "put" ? strike <= stockPrice : strike >= stockPrice;
      return isOtm && otmPct >= b.min && otmPct < b.max;
    });

    const volume = inBucket.reduce((s, c) => s + parseInt(c.volume), 0);
    const oi = inBucket.reduce((s, c) => s + parseInt(c.open_interest), 0);
    const ivSum = inBucket.reduce((s, c) => s + parseFloat(c.implied_volatility), 0);
    const avgIV = inBucket.length > 0 ? (ivSum / inBucket.length) * 100 : 0;

    return {
      bucket: b.name,
      volume,
      oi,
      avgIV: Math.round(avgIV * 10) / 10,
      contracts: inBucket.length,
    };
  });

  const totalVol = filtered.reduce((s, c) => s + parseInt(c.volume), 0);
  const totalOI = filtered.reduce((s, c) => s + parseInt(c.open_interest), 0);
  const totalIVSum = filtered.reduce((s, c) => s + parseFloat(c.implied_volatility), 0);
  const avgIV = filtered.length > 0 ? (totalIVSum / filtered.length) * 100 : 0;

  return {
    totalVolume: totalVol,
    totalOI,
    avgIV: Math.round(avgIV * 10) / 10,
    contractCount: filtered.length,
    buckets: bucketData,
    filtered,
  };
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
    // 5 dates: selected + 4 prior same-day-of-week
    const targetDates = [0, 1, 2, 3, 4].map((w) => getSameDayOfWeek(date, w));

    // Fetch stock prices in parallel (Massive API, no rate limit concern)
    const stockPrices = await Promise.all(targetDates.map((d) => getStockPrice(symbol, d)));

    // Fetch Alpha Vantage chains in batches of 2
    const actualDates = stockPrices.map((sp, i) => sp?.date || targetDates[i]);

    const [chain0, chain1] = await Promise.all([
      fetchChain(symbol, actualDates[0]),
      fetchChain(symbol, actualDates[1]),
    ]);
    const [chain2, chain3] = await Promise.all([
      fetchChain(symbol, actualDates[2]),
      fetchChain(symbol, actualDates[3]),
    ]);
    const [chain4] = await Promise.all([
      fetchChain(symbol, actualDates[4]),
    ]);
    const chains = [chain0, chain1, chain2, chain3, chain4];

    // Compute expirations (next Friday for each date)
    const expirations = actualDates.map((d) => getNearestFriday(d));

    // Bucket each date's chain
    const dateResults = actualDates.map((d, i) => {
      const price = stockPrices[i]?.close || 0;
      const result = bucketContracts(chains[i], price, optionType, expirations[i]);
      return {
        date: d,
        targetDate: targetDates[i],
        weeksAgo: i,
        label: i === 0 ? "Selected Date" : `${i}w Before`,
        stockPrice: price,
        expiration: expirations[i],
        ...result,
      };
    });

    // Compute anomaly multipliers (selected vs avg of prior 4)
    const selected = dateResults[0];
    const priors = dateResults.slice(1);

    function avgOf(fn: (d: typeof dateResults[0]) => number): number {
      const vals = priors.map(fn).filter((v) => v > 0);
      return vals.length > 0 ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
    }

    const totalAnomaly = {
      volumeMultiplier: avgOf((d) => d.totalVolume) > 0 ? selected.totalVolume / avgOf((d) => d.totalVolume) : null,
      oiMultiplier: avgOf((d) => d.totalOI) > 0 ? selected.totalOI / avgOf((d) => d.totalOI) : null,
    };

    const bucketAnomalies = BUCKETS.map((b, bi) => {
      const selBucket = selected.buckets[bi];
      const avgVol = avgOf((d) => d.buckets[bi].volume);
      const avgOI = avgOf((d) => d.buckets[bi].oi);
      const avgIV = avgOf((d) => d.buckets[bi].avgIV);
      return {
        bucket: b.name,
        volumeMultiplier: avgVol > 0 ? selBucket.volume / avgVol : null,
        oiMultiplier: avgOI > 0 ? selBucket.oi / avgOI : null,
        ivDelta: avgIV > 0 ? selBucket.avgIV - avgIV : null,
      };
    });

    // Top 15 strikes by volume on selected date
    const topStrikes = selected.filtered
      .sort((a, b) => parseInt(b.volume) - parseInt(a.volume))
      .slice(0, 15)
      .map((c) => {
        const strike = parseFloat(c.strike);
        const otmPct = (Math.abs(strike - selected.stockPrice) / selected.stockPrice) * 100;

        // Find same strike in prior dates
        const history = priors.map((p, pi) => {
          const match = chains[pi + 1].find(
            (pc) =>
              pc.type === optionType &&
              pc.expiration === expirations[pi + 1] &&
              parseFloat(pc.strike) === strike
          );
          return {
            date: p.date,
            volume: match ? parseInt(match.volume) : 0,
            oi: match ? parseInt(match.open_interest) : 0,
            iv: match ? Math.round(parseFloat(match.implied_volatility) * 1000) / 10 : 0,
          };
        });

        const avgHistVol = history.filter((h) => h.volume > 0).reduce((s, h) => s + h.volume, 0) / Math.max(history.filter((h) => h.volume > 0).length, 1);

        return {
          strike,
          otmPct: Math.round(otmPct * 10) / 10,
          volume: parseInt(c.volume),
          oi: parseInt(c.open_interest),
          iv: Math.round(parseFloat(c.implied_volatility) * 1000) / 10,
          last: parseFloat(c.last),
          bid: parseFloat(c.bid),
          ask: parseFloat(c.ask),
          delta: parseFloat(c.delta),
          volumeMultiplier: avgHistVol > 0 ? parseInt(c.volume) / avgHistVol : null,
          history,
        };
      });

    return NextResponse.json({
      symbol,
      selectedDate: date,
      optionType,
      dates: dateResults.map(({ filtered, ...rest }) => rest),
      totalAnomaly,
      bucketAnomalies,
      topStrikes,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to fetch" },
      { status: 500 }
    );
  }
}
