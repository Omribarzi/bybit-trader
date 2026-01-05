import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { bybitClient } from "../api/bybit-client.js";

export const getTickerTool = createTool({
  id: "get-ticker",
  description:
    "Get current price and 24h statistics for a specific trading pair on Bybit spot market",
  inputSchema: z.object({
    symbol: z
      .string()
      .describe("Trading pair symbol, e.g., BTCUSDT, ETHUSDT, SOLUSDT"),
  }),
  outputSchema: z.object({
    symbol: z.string(),
    lastPrice: z.string(),
    highPrice24h: z.string(),
    lowPrice24h: z.string(),
    volume24h: z.string(),
    turnover24h: z.string(),
    priceChange24hPercent: z.string(),
  }),
  execute: async ({ context }) => {
    const ticker = await bybitClient.getTicker(context.symbol);
    return {
      symbol: ticker.symbol,
      lastPrice: ticker.lastPrice,
      highPrice24h: ticker.highPrice24h,
      lowPrice24h: ticker.lowPrice24h,
      volume24h: ticker.volume24h,
      turnover24h: ticker.turnover24h,
      priceChange24hPercent: ticker.price24hPcnt,
    };
  },
});

export const getOrderBookTool = createTool({
  id: "get-orderbook",
  description:
    "Get the current order book (bids and asks) for a trading pair to analyze market depth and liquidity",
  inputSchema: z.object({
    symbol: z.string().describe("Trading pair symbol, e.g., BTCUSDT"),
    limit: z
      .number()
      .optional()
      .default(10)
      .describe("Number of price levels to fetch (default: 10)"),
  }),
  outputSchema: z.object({
    symbol: z.string(),
    bestBid: z.string(),
    bestAsk: z.string(),
    spread: z.string(),
    spreadPercent: z.string(),
    bids: z.array(z.object({ price: z.string(), quantity: z.string() })),
    asks: z.array(z.object({ price: z.string(), quantity: z.string() })),
  }),
  execute: async ({ context }) => {
    const orderBook = await bybitClient.getOrderBook(
      context.symbol,
      context.limit
    );
    const bestBid = orderBook.bids[0]?.[0] || "0";
    const bestAsk = orderBook.asks[0]?.[0] || "0";
    const spread = (parseFloat(bestAsk) - parseFloat(bestBid)).toFixed(8);
    const spreadPercent = (
      (parseFloat(spread) / parseFloat(bestBid)) *
      100
    ).toFixed(4);

    return {
      symbol: orderBook.symbol,
      bestBid,
      bestAsk,
      spread,
      spreadPercent,
      bids: orderBook.bids.map(([price, qty]) => ({ price, quantity: qty })),
      asks: orderBook.asks.map(([price, qty]) => ({ price, quantity: qty })),
    };
  },
});

export const getKlinesTool = createTool({
  id: "get-klines",
  description:
    "Get historical candlestick/OHLCV data for technical analysis. Useful for identifying trends, support/resistance levels, and patterns.",
  inputSchema: z.object({
    symbol: z.string().describe("Trading pair symbol, e.g., BTCUSDT"),
    interval: z
      .enum(["1", "5", "15", "30", "60", "240", "D", "W"])
      .default("60")
      .describe(
        "Candle interval: 1/5/15/30/60 minutes, 240 (4h), D (daily), W (weekly)"
      ),
    limit: z
      .number()
      .optional()
      .default(50)
      .describe("Number of candles to fetch (default: 50)"),
  }),
  outputSchema: z.object({
    symbol: z.string(),
    interval: z.string(),
    candles: z.array(
      z.object({
        timestamp: z.string(),
        open: z.string(),
        high: z.string(),
        low: z.string(),
        close: z.string(),
        volume: z.string(),
      })
    ),
    analysis: z.object({
      trend: z.string(),
      avgVolume: z.string(),
      priceRange: z.string(),
    }),
  }),
  execute: async ({ context }) => {
    const klines = await bybitClient.getKlines(
      context.symbol,
      context.interval,
      context.limit
    );

    const candles = klines.map((k) => ({
      timestamp: new Date(parseInt(k[0])).toISOString(),
      open: k[1],
      high: k[2],
      low: k[3],
      close: k[4],
      volume: k[5],
    }));

    // Simple trend analysis
    const closes = candles.map((c) => parseFloat(c.close));
    const firstClose = closes[closes.length - 1];
    const lastClose = closes[0];
    const trend =
      lastClose > firstClose * 1.02
        ? "BULLISH"
        : lastClose < firstClose * 0.98
          ? "BEARISH"
          : "SIDEWAYS";

    const volumes = candles.map((c) => parseFloat(c.volume));
    const avgVolume = (
      volumes.reduce((a, b) => a + b, 0) / volumes.length
    ).toFixed(2);

    const highs = candles.map((c) => parseFloat(c.high));
    const lows = candles.map((c) => parseFloat(c.low));
    const priceRange = `${Math.min(...lows).toFixed(2)} - ${Math.max(...highs).toFixed(2)}`;

    return {
      symbol: context.symbol,
      interval: context.interval,
      candles: candles.slice(0, 20), // Return last 20 for context
      analysis: {
        trend,
        avgVolume,
        priceRange,
      },
    };
  },
});

export const scanMarketTool = createTool({
  id: "scan-market",
  description:
    "Scan all available spot trading pairs to find top gainers, losers, or highest volume coins",
  inputSchema: z.object({
    sortBy: z
      .enum(["gainers", "losers", "volume"])
      .describe("How to sort the results"),
    limit: z
      .number()
      .optional()
      .default(10)
      .describe("Number of results to return"),
    quoteAsset: z
      .string()
      .optional()
      .default("USDT")
      .describe("Filter by quote asset (USDT, BTC, etc.)"),
  }),
  outputSchema: z.object({
    sortedBy: z.string(),
    coins: z.array(
      z.object({
        symbol: z.string(),
        price: z.string(),
        change24h: z.string(),
        volume24h: z.string(),
      })
    ),
  }),
  execute: async ({ context }) => {
    const tickers = await bybitClient.getAllTickers();

    let filtered = tickers.filter((t) => t.symbol.endsWith(context.quoteAsset));

    switch (context.sortBy) {
      case "gainers":
        filtered.sort(
          (a, b) => parseFloat(b.price24hPcnt) - parseFloat(a.price24hPcnt)
        );
        break;
      case "losers":
        filtered.sort(
          (a, b) => parseFloat(a.price24hPcnt) - parseFloat(b.price24hPcnt)
        );
        break;
      case "volume":
        filtered.sort(
          (a, b) => parseFloat(b.turnover24h) - parseFloat(a.turnover24h)
        );
        break;
    }

    return {
      sortedBy: context.sortBy,
      coins: filtered.slice(0, context.limit).map((t) => ({
        symbol: t.symbol,
        price: t.lastPrice,
        change24h: `${(parseFloat(t.price24hPcnt) * 100).toFixed(2)}%`,
        volume24h: `$${parseFloat(t.turnover24h).toLocaleString()}`,
      })),
    };
  },
});

export const marketTools = [
  getTickerTool,
  getOrderBookTool,
  getKlinesTool,
  scanMarketTool,
];
