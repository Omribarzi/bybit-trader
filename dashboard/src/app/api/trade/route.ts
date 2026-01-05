import { NextRequest, NextResponse } from "next/server";
import { placeOrder, getTicker } from "@/lib/bybit";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { symbol, side, orderType, qty, price } = body;

    // Validate required fields
    if (!symbol || !side || !orderType || !qty) {
      return NextResponse.json(
        { error: "Missing required fields: symbol, side, orderType, qty" },
        { status: 400 }
      );
    }

    // Validate side
    if (side !== "Buy" && side !== "Sell") {
      return NextResponse.json(
        { error: "Side must be 'Buy' or 'Sell'" },
        { status: 400 }
      );
    }

    // Validate order type
    if (orderType !== "Market" && orderType !== "Limit") {
      return NextResponse.json(
        { error: "Order type must be 'Market' or 'Limit'" },
        { status: 400 }
      );
    }

    // Limit orders require price
    if (orderType === "Limit" && !price) {
      return NextResponse.json(
        { error: "Limit orders require a price" },
        { status: 400 }
      );
    }

    // Get current price for reference
    const ticker = await getTicker(symbol);
    const currentPrice = parseFloat(ticker.lastPrice);

    // Log the order params for debugging
    const orderParams = {
      symbol,
      side,
      orderType,
      qty: String(qty),
      price: price ? String(price) : undefined,
    };
    console.log("Placing order with params:", orderParams);

    // Place the order
    const result = await placeOrder(orderParams);

    return NextResponse.json({
      success: true,
      orderId: result.orderId,
      orderLinkId: result.orderLinkId,
      symbol,
      side,
      orderType,
      qty,
      price: orderType === "Limit" ? price : currentPrice,
      testnet: process.env.BYBIT_TESTNET === "true",
    });
  } catch (error) {
    console.error("Trade API error:", error);
    return NextResponse.json(
      {
        error: "Failed to place order",
        message: error instanceof Error ? error.message : String(error)
      },
      { status: 500 }
    );
  }
}
