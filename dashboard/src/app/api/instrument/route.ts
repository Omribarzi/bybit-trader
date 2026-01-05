import { NextRequest, NextResponse } from "next/server";
import { getInstrumentInfo } from "@/lib/bybit";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const symbol = searchParams.get("symbol") || "BTCUSDT";

    const info = await getInstrumentInfo(symbol);

    return NextResponse.json({
      symbol: info.symbol,
      baseCoin: info.baseCoin,
      quoteCoin: info.quoteCoin,
      minOrderQty: info.minOrderQty,
      maxOrderQty: info.maxOrderQty,
      minOrderAmt: info.minOrderAmt,
      maxOrderAmt: info.maxOrderAmt,
      tickSize: info.tickSize,
      basePrecision: info.basePrecision,
      quotePrecision: info.quotePrecision,
    });
  } catch (error) {
    console.error("Instrument API error:", error);
    return NextResponse.json(
      { error: "Failed to fetch instrument info" },
      { status: 500 }
    );
  }
}
