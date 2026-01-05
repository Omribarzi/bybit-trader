import { NextRequest, NextResponse } from "next/server";
import { getCandles } from "@/lib/db";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const symbol = searchParams.get("symbol") || "BTCUSDT";
    const interval = searchParams.get("interval") || "1h";
    const limit = parseInt(searchParams.get("limit") || "100");

    const candles = await getCandles(symbol, interval, limit);

    // Reverse to get chronological order for charts
    const formatted = candles.reverse().map((c: any) => ({
      time: c.time,
      open: parseFloat(c.open),
      high: parseFloat(c.high),
      low: parseFloat(c.low),
      close: parseFloat(c.close),
      volume: parseFloat(c.volume),
    }));

    return NextResponse.json({ candles: formatted });
  } catch (error) {
    console.error("Candles API error:", error);
    return NextResponse.json(
      { error: "Failed to fetch candles" },
      { status: 500 }
    );
  }
}
