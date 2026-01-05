import { config } from "dotenv";
import WebSocket from "ws";
import { insertTicks, getTickCount, testConnection, closePool } from "./client.js";
import type { TickRow } from "./client.js";

config();

const SYMBOLS = ["BTCUSDT", "ETHUSDT", "SOLUSDT", "XRPUSDT", "DOGEUSDT"];
const WS_URL = "wss://stream.bybit.com/v5/public/spot";

// Buffer for batching inserts
const tickBuffer: TickRow[] = [];
const BATCH_SIZE = 100;
const FLUSH_INTERVAL = 1000; // Flush every 1 second

// Stats
let totalTicks = 0;
let totalInserted = 0;
let reconnectCount = 0;

interface BybitTrade {
  T: number;      // timestamp ms
  s: string;      // symbol
  S: string;      // side: Buy/Sell
  v: string;      // quantity
  p: string;      // price
  i: string;      // trade ID
}

interface BybitMessage {
  topic: string;
  type: string;
  ts: number;
  data: BybitTrade[];
}

function parseTradeMessage(msg: BybitMessage): TickRow[] {
  return msg.data.map((trade) => ({
    time: new Date(trade.T),
    symbol: trade.s,
    price: parseFloat(trade.p),
    quantity: parseFloat(trade.v),
    side: trade.S as "Buy" | "Sell",
    trade_id: trade.i,
  }));
}

async function flushBuffer(): Promise<void> {
  if (tickBuffer.length === 0) return;

  const toInsert = tickBuffer.splice(0, tickBuffer.length);
  try {
    const inserted = await insertTicks(toInsert);
    totalInserted += inserted;
  } catch (error) {
    console.error("Error inserting ticks:", error);
    // Put them back in buffer for retry
    tickBuffer.unshift(...toInsert);
  }
}

function createWebSocket(): WebSocket {
  const ws = new WebSocket(WS_URL);

  ws.on("open", () => {
    console.log("WebSocket connected to Bybit");

    // Subscribe to trade streams for all symbols
    const subscribeMsg = {
      op: "subscribe",
      args: SYMBOLS.map((s) => `publicTrade.${s}`),
    };
    ws.send(JSON.stringify(subscribeMsg));
    console.log(`Subscribed to ${SYMBOLS.length} symbols: ${SYMBOLS.join(", ")}`);
  });

  ws.on("message", (data: WebSocket.Data) => {
    try {
      const msg = JSON.parse(data.toString()) as BybitMessage;

      // Skip subscription confirmations and pings
      if (!msg.topic || !msg.data) return;

      const ticks = parseTradeMessage(msg);
      tickBuffer.push(...ticks);
      totalTicks += ticks.length;

      // Flush if buffer is full
      if (tickBuffer.length >= BATCH_SIZE) {
        flushBuffer().catch(console.error);
      }
    } catch (error) {
      // Ignore parse errors (ping/pong messages)
    }
  });

  ws.on("close", () => {
    console.log("WebSocket closed, reconnecting in 5s...");
    reconnectCount++;
    setTimeout(() => {
      createWebSocket();
    }, 5000);
  });

  ws.on("error", (error) => {
    console.error("WebSocket error:", error.message);
  });

  // Respond to pings
  ws.on("ping", () => {
    ws.pong();
  });

  return ws;
}

async function printStats(): Promise<void> {
  const dbCount = await getTickCount();
  const timestamp = new Date().toISOString().slice(11, 19);
  console.log(
    `[${timestamp}] Received: ${totalTicks.toLocaleString()} | ` +
    `Inserted: ${totalInserted.toLocaleString()} | ` +
    `Buffer: ${tickBuffer.length} | ` +
    `DB Total: ${dbCount.toLocaleString()} | ` +
    `Reconnects: ${reconnectCount}`
  );
}

async function shutdown(signal: string): Promise<void> {
  console.log(`\n\nReceived ${signal}, shutting down...`);

  // Flush remaining buffer
  console.log(`Flushing ${tickBuffer.length} remaining ticks...`);
  await flushBuffer();

  // Close database pool
  await closePool();

  console.log("Tick collector stopped.");
  process.exit(0);
}

async function main(): Promise<void> {
  console.log("=".repeat(60));
  console.log("  BYBIT TICK COLLECTOR (WebSocket)");
  console.log("=".repeat(60));
  console.log(`Started at: ${new Date().toISOString()}`);
  console.log(`Symbols: ${SYMBOLS.join(", ")}`);
  console.log(`Batch size: ${BATCH_SIZE} | Flush interval: ${FLUSH_INTERVAL}ms`);
  console.log("");

  // Test database connection
  const connected = await testConnection();
  if (!connected) {
    console.error("Failed to connect to database!");
    process.exit(1);
  }
  console.log("Database connected successfully");

  // Print initial tick count
  const initialCount = await getTickCount();
  console.log(`Existing ticks in DB: ${initialCount.toLocaleString()}`);
  console.log("");

  // Start WebSocket connection
  createWebSocket();

  // Periodic flush
  setInterval(() => {
    flushBuffer().catch(console.error);
  }, FLUSH_INTERVAL);

  // Print stats every 30 seconds
  setInterval(() => {
    printStats().catch(console.error);
  }, 30000);

  console.log("Tick collector running. Press Ctrl+C to stop.\n");

  // Handle graceful shutdown
  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
}

main().catch((err) => {
  console.error("Tick collector failed:", err);
  process.exit(1);
});
