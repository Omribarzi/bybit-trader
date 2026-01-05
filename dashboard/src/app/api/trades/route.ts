import { NextRequest, NextResponse } from "next/server";
import { getTradeHistory } from "@/lib/bybit";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const symbol = searchParams.get("symbol") || undefined;
    const limit = parseInt(searchParams.get("limit") || "50");

    const trades = await getTradeHistory(symbol, limit);

    return NextResponse.json({ trades });
  } catch (error) {
    console.error("Trades API error:", error);
    return NextResponse.json(
      { error: "Failed to fetch trades", message: String(error) },
      { status: 500 }
    );
  }
}
