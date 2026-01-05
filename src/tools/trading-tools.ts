import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { bybitClient } from "../api/bybit-client.js";

export const getBalanceTool = createTool({
  id: "get-balance",
  description:
    "Get the current wallet balance for all coins or a specific coin in the unified trading account",
  inputSchema: z.object({
    coin: z
      .string()
      .optional()
      .describe(
        "Specific coin to check (e.g., BTC, ETH, USDT). Leave empty for all balances."
      ),
  }),
  outputSchema: z.object({
    balances: z.array(
      z.object({
        coin: z.string(),
        free: z.string(),
        locked: z.string(),
        total: z.string(),
        usdValue: z.string().optional(),
      })
    ),
  }),
  execute: async ({ context }) => {
    if (context.coin) {
      const balance = await bybitClient.getCoinBalance(context.coin);
      return {
        balances: balance
          ? [
              {
                coin: balance.coin,
                free: balance.free,
                locked: balance.locked,
                total: balance.total,
              },
            ]
          : [],
      };
    }

    const balances = await bybitClient.getWalletBalance();
    return {
      balances: balances
        .filter((b) => parseFloat(b.total) > 0)
        .map((b) => ({
          coin: b.coin,
          free: b.free,
          locked: b.locked,
          total: b.total,
        })),
    };
  },
});

export const placeMarketOrderTool = createTool({
  id: "place-market-order",
  description:
    "Place a market order to buy or sell immediately at the current market price. Use this for instant execution.",
  inputSchema: z.object({
    symbol: z.string().describe("Trading pair symbol, e.g., BTCUSDT"),
    side: z.enum(["Buy", "Sell"]).describe("Order side: Buy or Sell"),
    quantity: z.string().describe("Amount of base asset to buy/sell"),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    orderId: z.string(),
    symbol: z.string(),
    side: z.string(),
    quantity: z.string(),
    status: z.string(),
    message: z.string(),
  }),
  execute: async ({ context }) => {
    try {
      const result = await bybitClient.placeOrder({
        symbol: context.symbol,
        side: context.side,
        orderType: "Market",
        qty: context.quantity,
      });

      return {
        success: true,
        orderId: result.orderId,
        symbol: result.symbol,
        side: result.side,
        quantity: result.qty,
        status: result.status,
        message: `Market ${context.side.toLowerCase()} order placed successfully`,
      };
    } catch (error) {
      return {
        success: false,
        orderId: "",
        symbol: context.symbol,
        side: context.side,
        quantity: context.quantity,
        status: "FAILED",
        message: error instanceof Error ? error.message : "Order failed",
      };
    }
  },
});

export const placeLimitOrderTool = createTool({
  id: "place-limit-order",
  description:
    "Place a limit order at a specific price. The order will only execute when the market reaches your price.",
  inputSchema: z.object({
    symbol: z.string().describe("Trading pair symbol, e.g., BTCUSDT"),
    side: z.enum(["Buy", "Sell"]).describe("Order side: Buy or Sell"),
    quantity: z.string().describe("Amount of base asset to buy/sell"),
    price: z.string().describe("Limit price for the order"),
    timeInForce: z
      .enum(["GTC", "IOC", "FOK"])
      .optional()
      .default("GTC")
      .describe(
        "GTC: Good Till Cancel, IOC: Immediate or Cancel, FOK: Fill or Kill"
      ),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    orderId: z.string(),
    symbol: z.string(),
    side: z.string(),
    quantity: z.string(),
    price: z.string(),
    status: z.string(),
    message: z.string(),
  }),
  execute: async ({ context }) => {
    try {
      const result = await bybitClient.placeOrder({
        symbol: context.symbol,
        side: context.side,
        orderType: "Limit",
        qty: context.quantity,
        price: context.price,
        timeInForce: context.timeInForce,
      });

      return {
        success: true,
        orderId: result.orderId,
        symbol: result.symbol,
        side: result.side,
        quantity: result.qty,
        price: result.price,
        status: result.status,
        message: `Limit ${context.side.toLowerCase()} order placed at ${context.price}`,
      };
    } catch (error) {
      return {
        success: false,
        orderId: "",
        symbol: context.symbol,
        side: context.side,
        quantity: context.quantity,
        price: context.price,
        status: "FAILED",
        message: error instanceof Error ? error.message : "Order failed",
      };
    }
  },
});

export const cancelOrderTool = createTool({
  id: "cancel-order",
  description: "Cancel an open order by its order ID",
  inputSchema: z.object({
    symbol: z.string().describe("Trading pair symbol of the order"),
    orderId: z.string().describe("The order ID to cancel"),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    orderId: z.string(),
    message: z.string(),
  }),
  execute: async ({ context }) => {
    try {
      const result = await bybitClient.cancelOrder(
        context.symbol,
        context.orderId
      );
      return {
        success: true,
        orderId: result.orderId,
        message: "Order cancelled successfully",
      };
    } catch (error) {
      return {
        success: false,
        orderId: context.orderId,
        message: error instanceof Error ? error.message : "Cancel failed",
      };
    }
  },
});

export const getOpenOrdersTool = createTool({
  id: "get-open-orders",
  description: "Get all currently open orders, optionally filtered by symbol",
  inputSchema: z.object({
    symbol: z
      .string()
      .optional()
      .describe("Filter by trading pair symbol (optional)"),
  }),
  outputSchema: z.object({
    orders: z.array(
      z.object({
        orderId: z.string(),
        symbol: z.string(),
        side: z.string(),
        type: z.string(),
        price: z.string(),
        quantity: z.string(),
        status: z.string(),
      })
    ),
    count: z.number(),
  }),
  execute: async ({ context }) => {
    const orders = await bybitClient.getOpenOrders(context.symbol);
    return {
      orders: orders.map((o) => ({
        orderId: o.orderId,
        symbol: o.symbol,
        side: o.side,
        type: o.orderType,
        price: o.price,
        quantity: o.qty,
        status: o.status,
      })),
      count: orders.length,
    };
  },
});

export const getOrderHistoryTool = createTool({
  id: "get-order-history",
  description: "Get recent order history to review past trades and orders",
  inputSchema: z.object({
    symbol: z
      .string()
      .optional()
      .describe("Filter by trading pair symbol (optional)"),
    limit: z
      .number()
      .optional()
      .default(20)
      .describe("Number of orders to fetch"),
  }),
  outputSchema: z.object({
    orders: z.array(
      z.object({
        orderId: z.string(),
        symbol: z.string(),
        side: z.string(),
        type: z.string(),
        price: z.string(),
        quantity: z.string(),
        status: z.string(),
      })
    ),
  }),
  execute: async ({ context }) => {
    const orders = await bybitClient.getOrderHistory(
      context.symbol,
      context.limit
    );
    return {
      orders: orders.map((o) => ({
        orderId: o.orderId,
        symbol: o.symbol,
        side: o.side,
        type: o.orderType,
        price: o.price,
        quantity: o.qty,
        status: o.status,
      })),
    };
  },
});

export const tradingTools = [
  getBalanceTool,
  placeMarketOrderTool,
  placeLimitOrderTool,
  cancelOrderTool,
  getOpenOrdersTool,
  getOrderHistoryTool,
];
