import { NextResponse } from "next/server";
import { getWalletBalance } from "@/lib/bybit";

export async function GET() {
  try {
    const balances = await getWalletBalance();

    // Calculate total USD value
    const totalUsd = balances.reduce((sum, b) => {
      return sum + parseFloat(b.usdValue || "0");
    }, 0);

    return NextResponse.json({
      balances,
      totalUsd,
      testnet: process.env.BYBIT_TESTNET === "true",
    });
  } catch (error) {
    console.error("Account API error:", error);
    return NextResponse.json(
      { error: "Failed to fetch account data", message: String(error) },
      { status: 500 }
    );
  }
}
