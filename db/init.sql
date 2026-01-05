-- Enable TimescaleDB extension
CREATE EXTENSION IF NOT EXISTS timescaledb;

-- ============================================
-- CANDLES TABLE (OHLCV price data)
-- ============================================
CREATE TABLE IF NOT EXISTS candles (
    time        TIMESTAMPTZ NOT NULL,
    symbol      TEXT NOT NULL,
    interval    TEXT NOT NULL,  -- '1m', '5m', '15m', '1h', '4h', '1d'
    open        DOUBLE PRECISION NOT NULL,
    high        DOUBLE PRECISION NOT NULL,
    low         DOUBLE PRECISION NOT NULL,
    close       DOUBLE PRECISION NOT NULL,
    volume      DOUBLE PRECISION NOT NULL,
    turnover    DOUBLE PRECISION,  -- Quote volume (USDT)
    PRIMARY KEY (time, symbol, interval)
);

-- Convert to hypertable (TimescaleDB magic)
SELECT create_hypertable('candles', 'time',
    chunk_time_interval => INTERVAL '7 days',
    if_not_exists => TRUE
);

-- Create indexes for fast queries
CREATE INDEX IF NOT EXISTS idx_candles_symbol_time ON candles (symbol, time DESC);
CREATE INDEX IF NOT EXISTS idx_candles_interval ON candles (interval, time DESC);

-- ============================================
-- SENTIMENT SCORES TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS sentiment_scores (
    time                TIMESTAMPTZ NOT NULL,
    symbol              TEXT NOT NULL,
    score               INTEGER NOT NULL,  -- -100 to +100
    label               TEXT NOT NULL,     -- extreme_fear, fear, neutral, greed, extreme_greed
    confidence          INTEGER NOT NULL,  -- 0-100
    summary             TEXT,
    key_topics          TEXT[],
    influencer_sentiment TEXT,
    news_impact         TEXT,
    source              TEXT DEFAULT 'grok',  -- grok, fear_greed_index, etc.
    PRIMARY KEY (time, symbol, source)
);

SELECT create_hypertable('sentiment_scores', 'time',
    chunk_time_interval => INTERVAL '30 days',
    if_not_exists => TRUE
);

CREATE INDEX IF NOT EXISTS idx_sentiment_symbol_time ON sentiment_scores (symbol, time DESC);

-- ============================================
-- TRADES TABLE (executed trades)
-- ============================================
CREATE TABLE IF NOT EXISTS trades (
    id              SERIAL,
    time            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    symbol          TEXT NOT NULL,
    side            TEXT NOT NULL,  -- BUY, SELL
    order_type      TEXT NOT NULL,  -- MARKET, LIMIT
    quantity        DOUBLE PRECISION NOT NULL,
    price           DOUBLE PRECISION NOT NULL,
    value           DOUBLE PRECISION NOT NULL,  -- quantity * price
    order_id        TEXT,
    strategy        TEXT,  -- which strategy triggered this
    sentiment_score INTEGER,  -- sentiment at time of trade
    technical_signal TEXT,  -- BUY, SELL, HOLD at time of trade
    notes           TEXT,
    PRIMARY KEY (id, time)
);

SELECT create_hypertable('trades', 'time',
    chunk_time_interval => INTERVAL '90 days',
    if_not_exists => TRUE
);

-- ============================================
-- PORTFOLIO SNAPSHOTS (for tracking P&L)
-- ============================================
CREATE TABLE IF NOT EXISTS portfolio_snapshots (
    time            TIMESTAMPTZ NOT NULL,
    total_value_usd DOUBLE PRECISION NOT NULL,
    cash_balance    DOUBLE PRECISION NOT NULL,
    positions       JSONB,  -- {"BTC": 0.5, "ETH": 2.0}
    pnl_24h         DOUBLE PRECISION,
    pnl_7d          DOUBLE PRECISION,
    pnl_30d         DOUBLE PRECISION,
    pnl_total       DOUBLE PRECISION,
    PRIMARY KEY (time)
);

SELECT create_hypertable('portfolio_snapshots', 'time',
    chunk_time_interval => INTERVAL '30 days',
    if_not_exists => TRUE
);

-- ============================================
-- STRATEGY SIGNALS (for analysis)
-- ============================================
CREATE TABLE IF NOT EXISTS strategy_signals (
    time            TIMESTAMPTZ NOT NULL,
    symbol          TEXT NOT NULL,
    strategy        TEXT NOT NULL,
    action          TEXT NOT NULL,  -- STRONG_BUY, BUY, HOLD, SELL, STRONG_SELL
    confidence      INTEGER,
    sentiment_score INTEGER,
    technical_signal TEXT,
    price_at_signal DOUBLE PRECISION,
    reasoning       TEXT,
    PRIMARY KEY (time, symbol, strategy)
);

SELECT create_hypertable('strategy_signals', 'time',
    chunk_time_interval => INTERVAL '30 days',
    if_not_exists => TRUE
);

CREATE INDEX IF NOT EXISTS idx_signals_symbol_time ON strategy_signals (symbol, time DESC);

-- ============================================
-- CONTINUOUS AGGREGATES (auto-computed rollups)
-- ============================================

-- Hourly OHLCV from 1-minute data
CREATE MATERIALIZED VIEW IF NOT EXISTS candles_1h
WITH (timescaledb.continuous) AS
SELECT
    time_bucket('1 hour', time) AS time,
    symbol,
    '1h' as interval,
    first(open, time) as open,
    max(high) as high,
    min(low) as low,
    last(close, time) as close,
    sum(volume) as volume,
    sum(turnover) as turnover
FROM candles
WHERE interval = '1m'
GROUP BY time_bucket('1 hour', time), symbol
WITH NO DATA;

-- Daily OHLCV
CREATE MATERIALIZED VIEW IF NOT EXISTS candles_1d
WITH (timescaledb.continuous) AS
SELECT
    time_bucket('1 day', time) AS time,
    symbol,
    '1d' as interval,
    first(open, time) as open,
    max(high) as high,
    min(low) as low,
    last(close, time) as close,
    sum(volume) as volume,
    sum(turnover) as turnover
FROM candles
WHERE interval = '1h'
GROUP BY time_bucket('1 day', time), symbol
WITH NO DATA;

-- Daily sentiment average
CREATE MATERIALIZED VIEW IF NOT EXISTS sentiment_daily
WITH (timescaledb.continuous) AS
SELECT
    time_bucket('1 day', time) AS time,
    symbol,
    avg(score)::INTEGER as avg_score,
    min(score) as min_score,
    max(score) as max_score,
    count(*) as readings
FROM sentiment_scores
GROUP BY time_bucket('1 day', time), symbol
WITH NO DATA;

-- ============================================
-- HELPER FUNCTIONS
-- ============================================

-- Get latest candle for a symbol
CREATE OR REPLACE FUNCTION get_latest_candle(p_symbol TEXT, p_interval TEXT DEFAULT '1h')
RETURNS TABLE (
    time TIMESTAMPTZ,
    open DOUBLE PRECISION,
    high DOUBLE PRECISION,
    low DOUBLE PRECISION,
    close DOUBLE PRECISION,
    volume DOUBLE PRECISION
) AS $$
BEGIN
    RETURN QUERY
    SELECT c.time, c.open, c.high, c.low, c.close, c.volume
    FROM candles c
    WHERE c.symbol = p_symbol AND c.interval = p_interval
    ORDER BY c.time DESC
    LIMIT 1;
END;
$$ LANGUAGE plpgsql;

-- Get sentiment trend (is it rising or falling?)
CREATE OR REPLACE FUNCTION get_sentiment_trend(p_symbol TEXT, p_hours INTEGER DEFAULT 24)
RETURNS TABLE (
    current_score INTEGER,
    avg_score DOUBLE PRECISION,
    trend TEXT,
    readings INTEGER
) AS $$
DECLARE
    first_half_avg DOUBLE PRECISION;
    second_half_avg DOUBLE PRECISION;
BEGIN
    -- Calculate averages for first and second half of the period
    SELECT
        avg(score) FILTER (WHERE time < NOW() - (p_hours/2 || ' hours')::INTERVAL),
        avg(score) FILTER (WHERE time >= NOW() - (p_hours/2 || ' hours')::INTERVAL)
    INTO first_half_avg, second_half_avg
    FROM sentiment_scores
    WHERE symbol = p_symbol AND time > NOW() - (p_hours || ' hours')::INTERVAL;

    RETURN QUERY
    SELECT
        (SELECT s.score FROM sentiment_scores s WHERE s.symbol = p_symbol ORDER BY s.time DESC LIMIT 1),
        avg(s.score),
        CASE
            WHEN second_half_avg - first_half_avg > 10 THEN 'rising'
            WHEN first_half_avg - second_half_avg > 10 THEN 'falling'
            ELSE 'stable'
        END,
        count(*)::INTEGER
    FROM sentiment_scores s
    WHERE s.symbol = p_symbol AND s.time > NOW() - (p_hours || ' hours')::INTERVAL;
END;
$$ LANGUAGE plpgsql;

-- Calculate returns between two dates
CREATE OR REPLACE FUNCTION calculate_returns(
    p_symbol TEXT,
    p_start TIMESTAMPTZ,
    p_end TIMESTAMPTZ DEFAULT NOW()
)
RETURNS DOUBLE PRECISION AS $$
DECLARE
    start_price DOUBLE PRECISION;
    end_price DOUBLE PRECISION;
BEGIN
    SELECT close INTO start_price FROM candles
    WHERE symbol = p_symbol AND interval = '1h' AND time >= p_start
    ORDER BY time LIMIT 1;

    SELECT close INTO end_price FROM candles
    WHERE symbol = p_symbol AND interval = '1h' AND time <= p_end
    ORDER BY time DESC LIMIT 1;

    IF start_price IS NULL OR end_price IS NULL THEN
        RETURN NULL;
    END IF;

    RETURN ((end_price - start_price) / start_price) * 100;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- COMPRESSION POLICY (for old data)
-- ============================================
-- Compress data older than 30 days to save space
ALTER TABLE candles SET (
    timescaledb.compress,
    timescaledb.compress_segmentby = 'symbol,interval'
);

SELECT add_compression_policy('candles', INTERVAL '30 days', if_not_exists => TRUE);

ALTER TABLE sentiment_scores SET (
    timescaledb.compress,
    timescaledb.compress_segmentby = 'symbol'
);

SELECT add_compression_policy('sentiment_scores', INTERVAL '90 days', if_not_exists => TRUE);

-- ============================================
-- RETENTION POLICY (optional - remove very old data)
-- ============================================
-- Keep 2 years of data, remove older
-- SELECT add_retention_policy('candles', INTERVAL '2 years', if_not_exists => TRUE);

COMMENT ON TABLE candles IS 'OHLCV price data from Bybit, partitioned by time for efficient queries';
COMMENT ON TABLE sentiment_scores IS 'X/Twitter sentiment scores from Grok analysis';
COMMENT ON TABLE trades IS 'All executed trades with context (sentiment, strategy)';
COMMENT ON TABLE portfolio_snapshots IS 'Periodic snapshots of portfolio value for P&L tracking';
COMMENT ON TABLE strategy_signals IS 'Historical record of all trading signals for backtesting analysis';
