import { config } from "dotenv";
import { insertCandles, getLatestCandle, getCandleCount, testConnection, closePool } from "./client.js";
import type { CandleRow } from "./client.js";

config();

const SYMBOLS = ["BTCUSDT", "ETHUSDT", "SOLUSDT", "XRPUSDT", "DOGEUSDT"];
const INTERVALS = ["1m", "1h", "4h", "1d"];

// Scheduler intervals (in milliseconds)
const SCHEDULES: Record<string, number> = {
  "1m": 30 * 1000,       // Update 1m candles every 30 seconds
  "1h": 5 * 60 * 1000,   // Update hourly candles every 5 minutes
  "4h": 15 * 60 * 1000,  // Update 4h candles every 15 minutes
  "1d": 60 * 60 * 1000,  // Update daily candles every hour
};

// Bybit interval mapping
const INTERVAL_MAP: Record<string, string> = {
  "1m": "1",
  "5m": "5",
  "15m": "15",
  "1h": "60",
  "4h": "240",
  "1d": "D",
};

// Convert Bybit kline to our format
function klineToCandle(kline: string[], symbol: string, interval: string): CandleRow {
  return {
    time: new Date(parseInt(kline[0])),
    symbol,
    interval,
    open: parseFloat(kline[1]),
    high: parseFloat(kline[2]),
    low: parseFloat(kline[3]),
    close: parseFloat(kline[4]),
    volume: parseFloat(kline[5]),
    turnover: parseFloat(kline[6]),
  };
}

// Calculate how many ms per interval
function getIntervalMs(interval: string): number {
  const map: Record<string, number> = {
    "1m": 60 * 1000,
    "5m": 5 * 60 * 1000,
    "15m": 15 * 60 * 1000,
    "1h": 60 * 60 * 1000,
    "4h": 4 * 60 * 60 * 1000,
    "1d": 24 * 60 * 60 * 1000,
  };
  return map[interval] || 60 * 60 * 1000;
}

// Fetch latest candles from Bybit API
async function fetchLatestCandles(
  symbol: string,
  interval: string,
  limit: number = 10
): Promise<CandleRow[]> {
  const params = {
    category: "spot",
    symbol,
    interval: INTERVAL_MAP[interval] || "60",
    limit: String(limit),
  };

  const url = `https://api.bybit.com/v5/market/kline?${new URLSearchParams(params)}`;

  const response = await fetch(url);
  const data = await response.json();

  if (data.retCode !== 0 || !data.result?.list?.length) {
    throw new Error(`Bybit API error: ${data.retMsg || "No data"}`);
  }

  return data.result.list.map((k: string[]) => klineToCandle(k, symbol, interval));
}

// Update candles for a symbol/interval
async function updateCandles(symbol: string, interval: string): Promise<number> {
  const latest = await getLatestCandle(symbol, interval);
  const intervalMs = getIntervalMs(interval);

  // Calculate how many candles we might be missing
  let candlesToFetch = 10;
  if (latest) {
    const timeSinceLast = Date.now() - latest.time.getTime();
    candlesToFetch = Math.min(Math.ceil(timeSinceLast / intervalMs) + 2, 50);
  }

  const candles = await fetchLatestCandles(symbol, interval, candlesToFetch);

  // Filter to only new candles
  const newCandles = latest
    ? candles.filter(c => c.time.getTime() > latest.time.getTime())
    : candles;

  if (newCandles.length === 0) {
    return 0;
  }

  const inserted = await insertCandles(newCandles);
  return inserted;
}

// Run a single update cycle for all symbols
async function runUpdateCycle(interval: string): Promise<void> {
  const timestamp = new Date().toISOString().slice(11, 19);
  console.log(`\n[${timestamp}] Updating ${interval} candles...`);

  let totalInserted = 0;
  const results: string[] = [];

  for (const symbol of SYMBOLS) {
    try {
      const inserted = await updateCandles(symbol, interval);
      if (inserted > 0) {
        results.push(`${symbol}: +${inserted}`);
        totalInserted += inserted;
      }
      // Small delay between symbols to avoid rate limiting
      await new Promise(r => setTimeout(r, 100));
    } catch (error) {
      console.error(`  Error updating ${symbol} ${interval}:`, error);
    }
  }

  if (totalInserted > 0) {
    console.log(`  Added: ${results.join(", ")}`);
  } else {
    console.log(`  No new candles`);
  }
}

// Schedule periodic updates
function scheduleUpdates(interval: string, scheduleMs: number): NodeJS.Timeout {
  console.log(`Scheduled ${interval} updates every ${scheduleMs / 1000 / 60} minutes`);

  // Run immediately on start
  runUpdateCycle(interval).catch(console.error);

  // Then schedule recurring
  return setInterval(() => {
    runUpdateCycle(interval).catch(console.error);
  }, scheduleMs);
}

// Print data summary
async function printSummary(): Promise<void> {
  console.log("\nCurrent Data Summary:");
  console.log("-".repeat(70));

  for (const symbol of SYMBOLS) {
    const counts: string[] = [];
    for (const interval of INTERVALS) {
      const count = await getCandleCount(symbol, interval);
      counts.push(`${interval}:${count.toLocaleString()}`);
    }
    console.log(`  ${symbol}: ${counts.join(" | ")}`);
  }
  console.log("-".repeat(70));
}

// Graceful shutdown
let intervals: NodeJS.Timeout[] = [];

async function shutdown(signal: string): Promise<void> {
  console.log(`\n\nReceived ${signal}, shutting down...`);

  // Clear all intervals
  intervals.forEach(i => clearInterval(i));

  // Close database pool
  await closePool();

  console.log("Scheduler stopped.");
  process.exit(0);
}

// Main entry point
async function main(): Promise<void> {
  console.log("=".repeat(60));
  console.log("  CANDLE BACKFILL SCHEDULER");
  console.log("=".repeat(60));
  console.log(`Started at: ${new Date().toISOString()}`);
  console.log(`Symbols: ${SYMBOLS.join(", ")}`);
  console.log(`Intervals: ${INTERVALS.join(", ")}`);
  console.log("");

  // Test database connection
  const connected = await testConnection();
  if (!connected) {
    console.error("Failed to connect to database!");
    process.exit(1);
  }
  console.log("Database connected successfully");

  // Print initial summary
  await printSummary();

  // Schedule updates for each interval
  for (const interval of INTERVALS) {
    const scheduleMs = SCHEDULES[interval] || 60 * 60 * 1000;
    intervals.push(scheduleUpdates(interval, scheduleMs));
  }

  console.log("\nScheduler running. Press Ctrl+C to stop.\n");

  // Handle graceful shutdown
  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));

  // Keep alive
  setInterval(() => {
    const uptime = process.uptime();
    const hours = Math.floor(uptime / 3600);
    const mins = Math.floor((uptime % 3600) / 60);
    console.log(`[Heartbeat] Uptime: ${hours}h ${mins}m`);
  }, 30 * 60 * 1000); // Log heartbeat every 30 minutes
}

main().catch((err) => {
  console.error("Scheduler failed:", err);
  process.exit(1);
});
