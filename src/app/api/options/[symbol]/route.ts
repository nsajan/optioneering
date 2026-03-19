import { NextRequest, NextResponse } from "next/server";
import { getOptionContracts, getOptionChainSnapshot } from "@/lib/massive";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ symbol: string }> }
) {
  const { symbol } = await params;
  const upper = symbol.toUpperCase();
  const url = new URL(request.url);
  const expiration = url.searchParams.get("expiration") || undefined;
  const contractType = url.searchParams.get("type") as "call" | "put" | undefined;

  try {
    // First try the snapshot (requires higher plan)
    try {
      const snapshot = await getOptionChainSnapshot(upper, {
        expiration_date: expiration,
        contract_type: contractType,
        limit: 250,
      });
      return NextResponse.json({ source: "snapshot", data: snapshot.results });
    } catch {
      // Fall back to contracts reference
    }

    // Fallback: return available contracts
    const contracts = await getOptionContracts(upper, {
      contract_type: contractType,
      expiration_date: expiration,
      "expiration_date.gte": expiration ? undefined : new Date().toISOString().split("T")[0],
      limit: 250,
      order: "asc",
      sort: "expiration_date",
    });

    return NextResponse.json({ source: "contracts", data: contracts.results });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
