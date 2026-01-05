import { NextResponse } from "next/server";

export async function GET() {
  try {
    // Fetch from Bybit mainnet (public endpoint)
    const symbols = ["BTCUSDT", "ETHUSDT", "SOLUSDT", "XRPUSDT", "DOGEUSDT"];

    const response = await fetch(
      "https://api.bybit.com/v5/market/tickers?category=spot"
    );

    const data = await response.json();

    if (data.retCode !== 0) {
      throw new Error(data.retMsg);
    }

    const tickers = data.result.list
      .filter((t: any) => symbols.includes(t.symbol))
      .map((t: any) => ({
        symbol: t.symbol,
        price: parseFloat(t.lastPrice),
        change24h: (parseFloat(t.price24hPcnt) * 100).toFixed(2),
        high24h: parseFloat(t.highPrice24h),
        low24h: parseFloat(t.lowPrice24h),
        volume24h: parseFloat(t.turnover24h),
      }));

    return NextResponse.json({ tickers });
  } catch (error) {
    console.error("Market API error:", error);
    return NextResponse.json(
      { error: "Failed to fetch market data" },
      { status: 500 }
    );
  }
}
