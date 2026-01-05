import { NextRequest, NextResponse } from "next/server";
import { getOpenOrders, getOrderHistory, cancelOrder } from "@/lib/bybit";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const type = searchParams.get("type") || "open";
    const symbol = searchParams.get("symbol") || undefined;
    const limit = parseInt(searchParams.get("limit") || "50");

    if (type === "open") {
      const orders = await getOpenOrders(symbol);
      return NextResponse.json({ orders });
    } else {
      const orders = await getOrderHistory(symbol, limit);
      return NextResponse.json({ orders });
    }
  } catch (error) {
    console.error("Orders API error:", error);
    return NextResponse.json(
      { error: "Failed to fetch orders", message: String(error) },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { symbol, orderId } = await request.json();

    if (!symbol || !orderId) {
      return NextResponse.json(
        { error: "Symbol and orderId required" },
        { status: 400 }
      );
    }

    const result = await cancelOrder(symbol, orderId);
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    console.error("Cancel order error:", error);
    return NextResponse.json(
      { error: "Failed to cancel order", message: String(error) },
      { status: 500 }
    );
  }
}
