import { NextRequest, NextResponse } from "next/server";
import { getSignals, getTrades, getDataStats } from "@/lib/db";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get("limit") || "20");

    const [signals, trades, stats] = await Promise.all([
      getSignals(limit),
      getTrades(limit),
      getDataStats(),
    ]);

    return NextResponse.json({
      signals,
      trades,
      stats,
    });
  } catch (error) {
    console.error("Signals API error:", error);
    return NextResponse.json(
      { error: "Failed to fetch signals" },
      { status: 500 }
    );
  }
}
