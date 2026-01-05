import pg from "pg";
import { config } from "dotenv";

config();

const { Pool } = pg;

// Database connection pool
const pool = new Pool({
  host: process.env.DB_HOST || "localhost",
  port: parseInt(process.env.DB_PORT || "5432"),
  database: process.env.DB_NAME || "bybit_trader",
  user: process.env.DB_USER || "trader",
  password: process.env.DB_PASSWORD || "trader_secret_2024",
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

// Test connection on startup
pool.on("connect", () => {
  console.log("Connected to TimescaleDB");
});

pool.on("error", (err) => {
  console.error("Database pool error:", err);
});

export interface CandleRow {
  time: Date;
  symbol: string;
  interval: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  turnover?: number;
}

export interface SentimentRow {
  time: Date;
  symbol: string;
  score: number;
  label: string;
  confidence: number;
  summary?: string;
  key_topics?: string[];
  influencer_sentiment?: string;
  news_impact?: string;
  source?: string;
}

export interface TradeRow {
  id?: number;
  time: Date;
  symbol: string;
  side: "BUY" | "SELL";
  order_type: string;
  quantity: number;
  price: number;
  value: number;
  order_id?: string;
  strategy?: string;
  sentiment_score?: number;
  technical_signal?: string;
  notes?: string;
}

// ============================================
// CANDLE OPERATIONS
// ============================================

export async function insertCandles(candles: CandleRow[]): Promise<number> {
  if (candles.length === 0) return 0;

  const values: any[] = [];
  const placeholders: string[] = [];

  candles.forEach((c, i) => {
    const offset = i * 8;
    placeholders.push(
      `($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5}, $${offset + 6}, $${offset + 7}, $${offset + 8})`
    );
    values.push(
      c.time,
      c.symbol,
      c.interval,
      c.open,
      c.high,
      c.low,
      c.close,
      c.volume
    );
  });

  const query = `
    INSERT INTO candles (time, symbol, interval, open, high, low, close, volume)
    VALUES ${placeholders.join(", ")}
    ON CONFLICT (time, symbol, interval) DO NOTHING
  `;

  const result = await pool.query(query, values);
  return result.rowCount || 0;
}

export async function getCandles(
  symbol: string,
  interval: string,
  startTime: Date,
  endTime: Date = new Date(),
  limit?: number
): Promise<CandleRow[]> {
  const query = `
    SELECT time, symbol, interval, open, high, low, close, volume, turnover
    FROM candles
    WHERE symbol = $1 AND interval = $2 AND time >= $3 AND time <= $4
    ORDER BY time ASC
    ${limit ? `LIMIT ${limit}` : ""}
  `;

  const result = await pool.query(query, [symbol, interval, startTime, endTime]);
  return result.rows;
}

export async function getLatestCandle(
  symbol: string,
  interval: string
): Promise<CandleRow | null> {
  const query = `
    SELECT time, symbol, interval, open, high, low, close, volume
    FROM candles
    WHERE symbol = $1 AND interval = $2
    ORDER BY time DESC
    LIMIT 1
  `;

  const result = await pool.query(query, [symbol, interval]);
  return result.rows[0] || null;
}

export async function getCandleCount(symbol: string, interval: string): Promise<number> {
  const result = await pool.query(
    "SELECT COUNT(*) FROM candles WHERE symbol = $1 AND interval = $2",
    [symbol, interval]
  );
  return parseInt(result.rows[0].count);
}

// ============================================
// SENTIMENT OPERATIONS
// ============================================

export async function insertSentiment(sentiment: SentimentRow): Promise<void> {
  const query = `
    INSERT INTO sentiment_scores
    (time, symbol, score, label, confidence, summary, key_topics, influencer_sentiment, news_impact, source)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
    ON CONFLICT (time, symbol, source) DO UPDATE SET
      score = EXCLUDED.score,
      label = EXCLUDED.label,
      confidence = EXCLUDED.confidence,
      summary = EXCLUDED.summary
  `;

  await pool.query(query, [
    sentiment.time,
    sentiment.symbol,
    sentiment.score,
    sentiment.label,
    sentiment.confidence,
    sentiment.summary,
    sentiment.key_topics,
    sentiment.influencer_sentiment,
    sentiment.news_impact,
    sentiment.source || "grok",
  ]);
}

export async function getSentimentHistory(
  symbol: string,
  hours: number = 24
): Promise<SentimentRow[]> {
  const query = `
    SELECT time, symbol, score, label, confidence, summary, key_topics,
           influencer_sentiment, news_impact, source
    FROM sentiment_scores
    WHERE symbol = $1 AND time > NOW() - ($2 || ' hours')::INTERVAL
    ORDER BY time DESC
  `;

  const result = await pool.query(query, [symbol, hours]);
  return result.rows;
}

export async function getLatestSentiment(symbol: string): Promise<SentimentRow | null> {
  const query = `
    SELECT time, symbol, score, label, confidence, summary, key_topics,
           influencer_sentiment, news_impact, source
    FROM sentiment_scores
    WHERE symbol = $1
    ORDER BY time DESC
    LIMIT 1
  `;

  const result = await pool.query(query, [symbol]);
  return result.rows[0] || null;
}

export async function getSentimentTrend(
  symbol: string,
  hours: number = 24
): Promise<{ trend: "rising" | "falling" | "stable"; avgScore: number; readings: number }> {
  const query = `
    WITH recent AS (
      SELECT score, time,
             NTILE(2) OVER (ORDER BY time) as half
      FROM sentiment_scores
      WHERE symbol = $1 AND time > NOW() - ($2 || ' hours')::INTERVAL
    )
    SELECT
      AVG(score) FILTER (WHERE half = 1) as first_half_avg,
      AVG(score) FILTER (WHERE half = 2) as second_half_avg,
      AVG(score) as avg_score,
      COUNT(*) as readings
    FROM recent
  `;

  const result = await pool.query(query, [symbol, hours]);
  const row = result.rows[0];

  if (!row || row.readings < 2) {
    return { trend: "stable", avgScore: 0, readings: 0 };
  }

  const diff = (row.second_half_avg || 0) - (row.first_half_avg || 0);
  let trend: "rising" | "falling" | "stable" = "stable";
  if (diff > 10) trend = "rising";
  else if (diff < -10) trend = "falling";

  return {
    trend,
    avgScore: parseFloat(row.avg_score) || 0,
    readings: parseInt(row.readings),
  };
}

// ============================================
// TRADE OPERATIONS
// ============================================

export async function insertTrade(trade: TradeRow): Promise<number> {
  const query = `
    INSERT INTO trades
    (time, symbol, side, order_type, quantity, price, value, order_id, strategy, sentiment_score, technical_signal, notes)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
    RETURNING id
  `;

  const result = await pool.query(query, [
    trade.time,
    trade.symbol,
    trade.side,
    trade.order_type,
    trade.quantity,
    trade.price,
    trade.value,
    trade.order_id,
    trade.strategy,
    trade.sentiment_score,
    trade.technical_signal,
    trade.notes,
  ]);

  return result.rows[0].id;
}

export async function getTrades(
  symbol?: string,
  startTime?: Date,
  endTime?: Date
): Promise<TradeRow[]> {
  let query = "SELECT * FROM trades WHERE 1=1";
  const params: any[] = [];

  if (symbol) {
    params.push(symbol);
    query += ` AND symbol = $${params.length}`;
  }
  if (startTime) {
    params.push(startTime);
    query += ` AND time >= $${params.length}`;
  }
  if (endTime) {
    params.push(endTime);
    query += ` AND time <= $${params.length}`;
  }

  query += " ORDER BY time DESC";

  const result = await pool.query(query, params);
  return result.rows;
}

// ============================================
// STRATEGY SIGNALS
// ============================================

export async function insertSignal(signal: {
  time: Date;
  symbol: string;
  strategy: string;
  action: string;
  confidence?: number;
  sentiment_score?: number;
  technical_signal?: string;
  price_at_signal?: number;
  reasoning?: string;
}): Promise<void> {
  const query = `
    INSERT INTO strategy_signals
    (time, symbol, strategy, action, confidence, sentiment_score, technical_signal, price_at_signal, reasoning)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
    ON CONFLICT (time, symbol, strategy) DO UPDATE SET
      action = EXCLUDED.action,
      confidence = EXCLUDED.confidence
  `;

  await pool.query(query, [
    signal.time,
    signal.symbol,
    signal.strategy,
    signal.action,
    signal.confidence,
    signal.sentiment_score,
    signal.technical_signal,
    signal.price_at_signal,
    signal.reasoning,
  ]);
}

// ============================================
// TICK OPERATIONS
// ============================================

export interface TickRow {
  time: Date;
  symbol: string;
  price: number;
  quantity: number;
  side: "Buy" | "Sell";
  trade_id?: string;
}

export async function insertTicks(ticks: TickRow[]): Promise<number> {
  if (ticks.length === 0) return 0;

  const values: any[] = [];
  const placeholders: string[] = [];

  ticks.forEach((t, i) => {
    const offset = i * 6;
    placeholders.push(
      `($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5}, $${offset + 6})`
    );
    values.push(t.time, t.symbol, t.price, t.quantity, t.side, t.trade_id);
  });

  const query = `
    INSERT INTO ticks (time, symbol, price, quantity, side, trade_id)
    VALUES ${placeholders.join(", ")}
    ON CONFLICT (time, symbol, trade_id) DO NOTHING
  `;

  const result = await pool.query(query, values);
  return result.rowCount || 0;
}

export async function getTickCount(symbol?: string): Promise<number> {
  const query = symbol
    ? "SELECT COUNT(*) FROM ticks WHERE symbol = $1"
    : "SELECT COUNT(*) FROM ticks";
  const result = await pool.query(query, symbol ? [symbol] : []);
  return parseInt(result.rows[0].count);
}

export async function getLatestTick(symbol: string): Promise<TickRow | null> {
  const query = `
    SELECT time, symbol, price, quantity, side, trade_id
    FROM ticks
    WHERE symbol = $1
    ORDER BY time DESC
    LIMIT 1
  `;
  const result = await pool.query(query, [symbol]);
  return result.rows[0] || null;
}

// ============================================
// UTILITY FUNCTIONS
// ============================================

export async function getDataRange(
  table: string,
  symbol: string
): Promise<{ earliest: Date | null; latest: Date | null; count: number }> {
  const query = `
    SELECT MIN(time) as earliest, MAX(time) as latest, COUNT(*) as count
    FROM ${table}
    WHERE symbol = $1
  `;

  const result = await pool.query(query, [symbol]);
  const row = result.rows[0];

  return {
    earliest: row.earliest,
    latest: row.latest,
    count: parseInt(row.count),
  };
}

export async function testConnection(): Promise<boolean> {
  try {
    await pool.query("SELECT 1");
    return true;
  } catch (error) {
    console.error("Database connection failed:", error);
    return false;
  }
}

export async function closePool(): Promise<void> {
  await pool.end();
}

export { pool };
