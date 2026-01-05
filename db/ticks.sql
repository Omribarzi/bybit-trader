-- ============================================
-- TICKS TABLE (real-time market trades from WebSocket)
-- ============================================
CREATE TABLE IF NOT EXISTS ticks (
    time        TIMESTAMPTZ NOT NULL,
    symbol      TEXT NOT NULL,
    price       DOUBLE PRECISION NOT NULL,
    quantity    DOUBLE PRECISION NOT NULL,
    side        TEXT NOT NULL,  -- Buy, Sell
    trade_id    TEXT,
    PRIMARY KEY (time, symbol, trade_id)
);

-- Convert to hypertable with small chunks (lots of data)
SELECT create_hypertable('ticks', 'time',
    chunk_time_interval => INTERVAL '1 day',
    if_not_exists => TRUE
);

-- Index for fast symbol queries
CREATE INDEX IF NOT EXISTS idx_ticks_symbol_time ON ticks (symbol, time DESC);

-- Compression policy (compress after 7 days)
ALTER TABLE ticks SET (
    timescaledb.compress,
    timescaledb.compress_segmentby = 'symbol'
);

SELECT add_compression_policy('ticks', INTERVAL '7 days', if_not_exists => TRUE);

-- Retention policy (keep 90 days of tick data)
-- Uncomment if you want to auto-delete old data
-- SELECT add_retention_policy('ticks', INTERVAL '90 days', if_not_exists => TRUE);

-- ============================================
-- Continuous aggregate: 1-second OHLCV from ticks
-- ============================================
CREATE MATERIALIZED VIEW IF NOT EXISTS candles_1s
WITH (timescaledb.continuous) AS
SELECT
    time_bucket('1 second', time) AS time,
    symbol,
    '1s' as interval,
    first(price, time) as open,
    max(price) as high,
    min(price) as low,
    last(price, time) as close,
    sum(quantity) as volume,
    count(*) as tick_count
FROM ticks
GROUP BY time_bucket('1 second', time), symbol
WITH NO DATA;

-- Refresh policy for 1s candles
SELECT add_continuous_aggregate_policy('candles_1s',
    start_offset => INTERVAL '1 hour',
    end_offset => INTERVAL '1 second',
    schedule_interval => INTERVAL '10 seconds',
    if_not_exists => TRUE
);

COMMENT ON TABLE ticks IS 'Real-time market trades from Bybit WebSocket';
