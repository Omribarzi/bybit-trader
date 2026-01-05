import { NextRequest, NextResponse } from "next/server";
import { getSentimentHistory, getLatestSentiment } from "@/lib/db";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const symbol = searchParams.get("symbol") || "BTC";
    const hours = parseInt(searchParams.get("hours") || "48");

    const [history, latest] = await Promise.all([
      getSentimentHistory(symbol, hours),
      getLatestSentiment(symbol),
    ]);

    return NextResponse.json({
      history: history.map((s: any) => ({
        time: s.time,
        score: s.score,
        label: s.label,
        confidence: s.confidence,
      })),
      latest,
    });
  } catch (error) {
    console.error("Sentiment API error:", error);
    return NextResponse.json(
      { error: "Failed to fetch sentiment" },
      { status: 500 }
    );
  }
}
