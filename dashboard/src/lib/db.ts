import pg from "pg";

const { Pool } = pg;

const pool = new Pool({
  host: process.env.DB_HOST || "localhost",
  port: parseInt(process.env.DB_PORT || "5432"),
  database: process.env.DB_NAME || "bybit_trader",
  user: process.env.DB_USER || "trader",
  password: process.env.DB_PASSWORD || "trader_secret_2024",
  max: 10,
});

export async function query<T = any>(text: string, params?: any[]): Promise<T[]> {
  const result = await pool.query(text, params);
  return result.rows;
}

export async function getCandles(
  symbol: string,
  interval: string,
  limit: number = 100
) {
  return query(
    `SELECT time, open, high, low, close, volume
     FROM candles
     WHERE symbol = $1 AND interval = $2
     ORDER BY time DESC
     LIMIT $3`,
    [symbol, interval, limit]
  );
}

export async function getSentimentHistory(symbol: string, hours: number = 48) {
  return query(
    `SELECT time, score, label, confidence, summary
     FROM sentiment_scores
     WHERE symbol = $1 AND time > NOW() - ($2 || ' hours')::INTERVAL
     ORDER BY time DESC`,
    [symbol, hours]
  );
}

export async function getLatestSentiment(symbol: string) {
  const rows = await query(
    `SELECT time, score, label, confidence, summary, key_topics, influencer_sentiment, news_impact
     FROM sentiment_scores
     WHERE symbol = $1
     ORDER BY time DESC
     LIMIT 1`,
    [symbol]
  );
  return rows[0] || null;
}

export async function getSignals(limit: number = 20) {
  return query(
    `SELECT time, symbol, strategy, action, confidence, sentiment_score, price_at_signal, reasoning
     FROM strategy_signals
     ORDER BY time DESC
     LIMIT $1`,
    [limit]
  );
}

export async function getTrades(limit: number = 20) {
  return query(
    `SELECT time, symbol, side, order_type, quantity, price, value, strategy, sentiment_score
     FROM trades
     ORDER BY time DESC
     LIMIT $1`,
    [limit]
  );
}

export async function getPortfolioValue() {
  const rows = await query(
    `SELECT time, total_value_usd, cash_balance, positions, pnl_24h, pnl_total
     FROM portfolio_snapshots
     ORDER BY time DESC
     LIMIT 1`
  );
  return rows[0] || null;
}

export async function getDataStats() {
  const candleStats = await query(`
    SELECT symbol, interval, COUNT(*) as count, MIN(time) as earliest, MAX(time) as latest
    FROM candles
    GROUP BY symbol, interval
    ORDER BY symbol, interval
  `);

  const sentimentCount = await query(
    `SELECT COUNT(*) as count FROM sentiment_scores`
  );

  const tradeCount = await query(`SELECT COUNT(*) as count FROM trades`);

  return {
    candles: candleStats,
    sentimentCount: sentimentCount[0]?.count || 0,
    tradeCount: tradeCount[0]?.count || 0,
  };
}
