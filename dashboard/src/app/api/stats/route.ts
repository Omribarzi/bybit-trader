import { NextResponse } from "next/server";
import { getDataStats } from "@/lib/db";

export async function GET() {
  try {
    const stats = await getDataStats();

    return NextResponse.json({
      candles: stats.candles,
      sentimentCount: stats.sentimentCount,
      tradeCount: stats.tradeCount,
    });
  } catch (error) {
    console.error("Stats API error:", error);
    return NextResponse.json(
      { error: "Failed to fetch stats" },
      { status: 500 }
    );
  }
}
