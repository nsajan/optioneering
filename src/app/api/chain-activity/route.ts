import { NextRequest, NextResponse } from "next/server";
import { getAggregateBars } from "@/lib/massive";

const AV_KEY = process.env.ALPHA_VANTAGE_API_KEY!;

type Bar = { o: number; c: number; h: number; l: number; v: number; vw: number; n: number; t: number };

interface AVContract {
  expiration: string;
  strike: string;
  type: string;
  volume: string;
  open_interest: string;
  implied_volatility: string;
}

function getNearestFriday(dateStr: string): string {
  const d = new Date(dateStr + "T12:00:00Z");
  const day = d.getUTCDay();
  const daysUntilFri = day === 5 ? 7 : day < 5 ? (5 - day) : 6;
  d.setUTCDate(d.getUTCDate() + daysUntilFri);
  return d.toISOString().split("T")[0];
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

function delay(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

const OTM_TIERS = [
  { label: "2%", min: 0, max: 2 },
  { label: "5%", min: 2, max: 5 },
  { label: "10%", min: 5, max: 10 },
  { label: "15%", min: 10, max: 15 },
  { label: "20%", min: 15, max: 20 },
  { label: "25%+", min: 20, max: 100 },
];

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const symbol = searchParams.get("symbol")?.toUpperCase();
  const date = searchParams.get("date");
  const optionType = (searchParams.get("type") || "put") as "put" | "call";

  if (!symbol || !date) {
    return NextResponse.json({ error: "symbol and date required" }, { status: 400 });
  }

  try {
    // Get 4 weeks of daily stock bars
    const startDate = new Date(date + "T12:00:00Z");
    startDate.setUTCDate(startDate.getUTCDate() - 28);
    const startStr = startDate.toISOString().split("T")[0];

    const daily = await getAggregateBars(symbol, startStr, date, "day", 1);
    const bars = (daily.results || []) as Bar[];
    if (bars.length === 0) {
      return NextResponse.json({ error: "No stock data found" }, { status: 404 });
    }

    // Build trading day list with prices
    const tradingDays = bars.map((b) => ({
      date: new Date(b.t).toISOString().split("T")[0],
      close: b.c,
      open: b.o,
      high: b.h,
      low: b.l,
    }));

    // Fetch Alpha Vantage chains in batches of 3 with small delay
    const chains: Map<string, AVContract[]> = new Map();
    const batchSize = 3;
    for (let i = 0; i < tradingDays.length; i += batchSize) {
      const batch = tradingDays.slice(i, i + batchSize);
      const results = await Promise.all(
        batch.map((td) => fetchChain(symbol, td.date))
      );
      batch.forEach((td, j) => chains.set(td.date, results[j]));
      // Small delay between batches to respect rate limits
      if (i + batchSize < tradingDays.length) {
        await delay(500);
      }
    }

    // For each trading day, compute activity per OTM tier
    interface DayPoint {
      date: string;
      stockPrice: number;
      expiration: string;
      tiers: {
        label: string;
        otmMid: number;
        strikePrice: number;
        volume: number;
        oi: number;
        avgIV: number;
        contracts: number;
      }[];
      totalVolume: number;
      totalOI: number;
    }

    const dayPoints: DayPoint[] = tradingDays.map((td) => {
      const chain = chains.get(td.date) || [];
      const exp = getNearestFriday(td.date);

      const filtered = chain.filter(
        (c) => c.type === optionType && c.expiration === exp
      );

      const tiers = OTM_TIERS.map((tier) => {
        const inTier = filtered.filter((c) => {
          const strike = parseFloat(c.strike);
          const otmPct = (Math.abs(strike - td.close) / td.close) * 100;
          const isOtm = optionType === "put" ? strike <= td.close : strike >= td.close;
          return isOtm && otmPct >= tier.min && otmPct < tier.max;
        });

        const volume = inTier.reduce((s, c) => s + parseInt(c.volume), 0);
        const oi = inTier.reduce((s, c) => s + parseInt(c.open_interest), 0);
        const ivSum = inTier.reduce((s, c) => s + parseFloat(c.implied_volatility), 0);
        const avgIV = inTier.length > 0 ? (ivSum / inTier.length) * 100 : 0;

        // Compute the representative strike price for this tier
        const midOtm = (tier.min + Math.min(tier.max, 25)) / 2 / 100;
        const strikePrice = optionType === "put"
          ? td.close * (1 - midOtm)
          : td.close * (1 + midOtm);

        return {
          label: tier.label,
          otmMid: (tier.min + Math.min(tier.max, 25)) / 2,
          strikePrice: Math.round(strikePrice * 100) / 100,
          volume,
          oi,
          avgIV: Math.round(avgIV * 10) / 10,
          contracts: inTier.length,
        };
      });

      return {
        date: td.date,
        stockPrice: td.close,
        expiration: exp,
        tiers,
        totalVolume: filtered.reduce((s, c) => s + parseInt(c.volume), 0),
        totalOI: filtered.reduce((s, c) => s + parseInt(c.open_interest), 0),
      };
    });

    // Compute rolling averages for each tier (use all prior days as baseline)
    const dots: {
      date: string;
      stockPrice: number;
      tier: string;
      otmMid: number;
      strikePrice: number;
      volume: number;
      oi: number;
      avgVolume: number;
      multiplier: number | null;
    }[] = [];

    for (let i = 0; i < dayPoints.length; i++) {
      const dp = dayPoints[i];
      // Use all days except current as baseline
      const others = dayPoints.filter((_, j) => j !== i);

      for (const tier of dp.tiers) {
        const otherVols = others
          .map((o) => o.tiers.find((t) => t.label === tier.label)?.volume || 0)
          .filter((v) => v > 0);
        const avgVol = otherVols.length > 0
          ? otherVols.reduce((a, b) => a + b, 0) / otherVols.length
          : 0;

        dots.push({
          date: dp.date,
          stockPrice: dp.stockPrice,
          tier: tier.label,
          otmMid: tier.otmMid,
          strikePrice: tier.strikePrice,
          volume: tier.volume,
          oi: tier.oi,
          avgVolume: Math.round(avgVol),
          multiplier: avgVol > 0 ? tier.volume / avgVol : null,
        });
      }
    }

    return NextResponse.json({
      symbol,
      selectedDate: date,
      optionType,
      tradingDays: tradingDays.map((td) => ({
        date: td.date,
        close: td.close,
        high: td.high,
        low: td.low,
      })),
      dots,
      tiers: OTM_TIERS.map((t) => t.label),
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to fetch" },
      { status: 500 }
    );
  }
}
