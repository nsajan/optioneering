import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getTickerDetails, getPreviousDayBar, getAggregateBars } from "@/lib/massive";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ symbol: string }> }
) {
  const { symbol } = await params;
  const upper = symbol.toUpperCase();
  const url = new URL(request.url);
  const range = url.searchParams.get("range") || "3m"; // 1w, 1m, 3m, 6m, 1y

  try {
    // Fetch ticker details and previous day bar from Massive
    const [details, prevDay] = await Promise.all([
      getTickerDetails(upper),
      getPreviousDayBar(upper),
    ]);

    // Calculate date range
    const to = new Date();
    const from = new Date();
    switch (range) {
      case "1w": from.setDate(from.getDate() - 7); break;
      case "1m": from.setMonth(from.getMonth() - 1); break;
      case "3m": from.setMonth(from.getMonth() - 3); break;
      case "6m": from.setMonth(from.getMonth() - 6); break;
      case "1y": from.setFullYear(from.getFullYear() - 1); break;
    }

    const bars = await getAggregateBars(
      upper,
      from.toISOString().split("T")[0],
      to.toISOString().split("T")[0]
    );

    // Upsert stock in DB
    const stock = await prisma.stock.upsert({
      where: { symbol: upper },
      update: {
        name: details.results.name,
        sector: details.results.sic_description,
      },
      create: {
        symbol: upper,
        name: details.results.name,
        sector: details.results.sic_description,
      },
    });

    // Save latest quote
    if (prevDay.results?.[0]) {
      const bar = prevDay.results[0];
      await prisma.stockQuote.create({
        data: {
          stockId: stock.id,
          price: bar.c,
          open: bar.o,
          high: bar.h,
          low: bar.l,
          close: bar.c,
          volume: BigInt(Math.round(bar.v)),
          date: new Date(bar.t),
        },
      });
    }

    return NextResponse.json({
      details: details.results,
      previousDay: prevDay.results?.[0] || null,
      bars: bars.results || [],
      stock,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
