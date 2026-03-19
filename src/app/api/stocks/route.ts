import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const stocks = await prisma.stock.findMany({
    include: {
      quotes: {
        orderBy: { date: "desc" },
        take: 1,
      },
    },
  });
  return NextResponse.json(stocks);
}

export async function POST(request: NextRequest) {
  const { symbol, name, sector } = await request.json();

  const stock = await prisma.stock.upsert({
    where: { symbol },
    update: { name, sector },
    create: { symbol, name, sector },
  });

  return NextResponse.json(stock, { status: 201 });
}
