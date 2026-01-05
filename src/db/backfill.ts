import { config } from "dotenv";
import { bybitClient } from "../api/bybit-client.js";
import { insertCandles, getLatestCandle, getCandleCount, testConnection } from "./client.js";
import type { CandleRow } from "./client.js";

config();

const SYMBOLS = ["BTCUSDT", "ETHUSDT", "SOLUSDT", "XRPUSDT", "DOGEUSDT"];
const INTERVALS = ["1h", "4h", "1d"];

// Bybit limits: 200 candles per request for spot
const BATCH_SIZE = 200;

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

// Fetch and store candles for a symbol/interval
async function backfillSymbol(
  symbol: string,
  interval: string,
  daysBack: number = 730 // 2 years
): Promise<number> {
  console.log(`\nBackfilling ${symbol} ${interval}...`);

  const intervalMs = getIntervalMs(interval);
  const now = Date.now();
  const startTime = now - daysBack * 24 * 60 * 60 * 1000;

  // Check what we already have
  const latest = await getLatestCandle(symbol, interval);
  let fetchFrom = startTime;

  if (latest) {
    // Start from where we left off
    fetchFrom = latest.time.getTime() + intervalMs;
    console.log(`  Found existing data up to ${latest.time.toISOString()}`);
  }

  if (fetchFrom >= now) {
    console.log(`  Already up to date`);
    return 0;
  }

  let totalInserted = 0;
  let currentEnd = now;

  // Bybit returns data in reverse order (newest first), so we work backwards
  while (currentEnd > fetchFrom) {
    try {
      // Fetch batch
      const klines = await bybitClient.getKlines(symbol, interval, BATCH_SIZE);

      if (!klines || klines.length === 0) {
        console.log(`  No more data available`);
        break;
      }

      // Convert to our format
      const candles = klines
        .map((k) => klineToCandle(k, symbol, interval))
        .filter((c) => c.time.getTime() >= fetchFrom);

      if (candles.length === 0) {
        break;
      }

      // Insert
      const inserted = await insertCandles(candles);
      totalInserted += inserted;

      // Update progress
      const oldestInBatch = candles[candles.length - 1].time;
      console.log(
        `  Fetched ${candles.length} candles, oldest: ${oldestInBatch.toISOString()}, inserted: ${inserted}`
      );

      currentEnd = oldestInBatch.getTime() - intervalMs;

      // Rate limiting - Bybit allows 10 requests per second
      await new Promise((r) => setTimeout(r, 150));

      // Break if we've gone far enough back (Bybit historical limit)
      if (klines.length < BATCH_SIZE) {
        console.log(`  Reached end of available history`);
        break;
      }
    } catch (error) {
      console.error(`  Error fetching data:`, error);
      await new Promise((r) => setTimeout(r, 1000));
    }
  }

  const count = await getCandleCount(symbol, interval);
  console.log(`  Total ${symbol} ${interval} candles in DB: ${count}`);

  return totalInserted;
}

// Extended backfill using start/end parameters
async function backfillSymbolExtended(
  symbol: string,
  interval: string,
  daysBack: number = 730
): Promise<number> {
  console.log(`\nBackfilling ${symbol} ${interval} (extended)...`);

  const intervalMs = getIntervalMs(interval);
  const now = Date.now();
  let endTime = now;
  const targetStart = now - daysBack * 24 * 60 * 60 * 1000;

  // Check what we already have
  const count = await getCandleCount(symbol, interval);
  if (count > 0) {
    const latest = await getLatestCandle(symbol, interval);
    if (latest) {
      console.log(`  Have ${count} candles, latest: ${latest.time.toISOString()}`);
    }
  }

  let totalInserted = 0;
  let batchNum = 0;
  const maxBatches = Math.ceil((daysBack * 24) / BATCH_SIZE) + 10; // Safety limit

  while (endTime > targetStart && batchNum < maxBatches) {
    batchNum++;

    try {
      // Bybit API: start/end in milliseconds
      const startMs = endTime - BATCH_SIZE * intervalMs;

      // Use the raw API for more control
      // Map interval format: 1h -> 60, 4h -> 240, 1d -> D
      const intervalMap: Record<string, string> = {
        "1m": "1",
        "5m": "5",
        "15m": "15",
        "1h": "60",
        "4h": "240",
        "1d": "D",
      };

      const params = {
        category: "spot",
        symbol,
        interval: intervalMap[interval] || "60",
        limit: BATCH_SIZE,
        end: endTime,
      };

      // Use mainnet for historical data (public endpoint, more data available)
      const response = await fetch(
        `https://api.bybit.com/v5/market/kline?${new URLSearchParams(
          Object.entries(params).map(([k, v]) => [k, String(v)])
        )}`
      );

      const data = await response.json();

      if (data.retCode !== 0 || !data.result?.list?.length) {
        console.log(`  No more data or API error`);
        break;
      }

      const klines = data.result.list as string[][];

      // Convert and filter
      const candles = klines
        .map((k) => klineToCandle(k, symbol, interval))
        .filter((c) => c.time.getTime() >= targetStart);

      if (candles.length === 0) {
        break;
      }

      // Insert
      const inserted = await insertCandles(candles);
      totalInserted += inserted;

      // Find oldest candle time for next iteration
      const oldestTime = Math.min(...candles.map((c) => c.time.getTime()));
      console.log(
        `  Batch ${batchNum}: ${candles.length} candles, oldest: ${new Date(oldestTime).toISOString()}, new: ${inserted}`
      );

      endTime = oldestTime - intervalMs;

      // Rate limit
      await new Promise((r) => setTimeout(r, 100));

      // If we got fewer than requested, we've hit the limit
      if (klines.length < BATCH_SIZE) {
        console.log(`  Reached end of available history`);
        break;
      }
    } catch (error) {
      console.error(`  Error:`, error);
      await new Promise((r) => setTimeout(r, 1000));
    }
  }

  const finalCount = await getCandleCount(symbol, interval);
  console.log(`  Final count for ${symbol} ${interval}: ${finalCount} candles`);

  return totalInserted;
}

async function main() {
  console.log("=".repeat(60));
  console.log("  HISTORICAL DATA BACKFILL");
  console.log("=".repeat(60));

  // Test DB connection
  const connected = await testConnection();
  if (!connected) {
    console.error("Failed to connect to database!");
    process.exit(1);
  }
  console.log("Database connected successfully\n");

  const startTime = Date.now();
  let totalCandles = 0;

  // Backfill each symbol and interval
  for (const symbol of SYMBOLS) {
    for (const interval of INTERVALS) {
      try {
        const inserted = await backfillSymbolExtended(symbol, interval, 365); // 1 year for now
        totalCandles += inserted;
      } catch (error) {
        console.error(`Failed to backfill ${symbol} ${interval}:`, error);
      }
    }
  }

  const duration = ((Date.now() - startTime) / 1000).toFixed(1);

  console.log("\n" + "=".repeat(60));
  console.log("  BACKFILL COMPLETE");
  console.log("=".repeat(60));
  console.log(`Total new candles inserted: ${totalCandles}`);
  console.log(`Duration: ${duration}s`);

  // Summary
  console.log("\nData Summary:");
  for (const symbol of SYMBOLS) {
    for (const interval of INTERVALS) {
      const count = await getCandleCount(symbol, interval);
      if (count > 0) {
        const latest = await getLatestCandle(symbol, interval);
        console.log(
          `  ${symbol} ${interval}: ${count} candles (latest: ${latest?.time.toISOString().split("T")[0]})`
        );
      }
    }
  }

  process.exit(0);
}

main().catch((err) => {
  console.error("Backfill failed:", err);
  process.exit(1);
});
