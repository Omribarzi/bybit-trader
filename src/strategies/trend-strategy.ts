import { EMA, RSI } from "../backtest/backtester.js";
import type { Candle, Strategy, StrategySignal } from "../backtest/backtester.js";
import { futuresClient } from "../api/futures-client.js";

// ============================================
// ADX (Average Directional Index)
// ============================================

export interface ADXResult {
  adx: number[];
  plusDI: number[];
  minusDI: number[];
}

/**
 * Calculate ADX - measures trend strength regardless of direction.
 * ADX > 25 = trending market (trade trend-following)
 * ADX < 20 = ranging market (avoid or use mean-reversion)
 */
export function ADX(candles: Candle[], period: number = 14): ADXResult {
  const adx: number[] = [];
  const plusDI: number[] = [];
  const minusDI: number[] = [];

  if (candles.length < period + 1) {
    return {
      adx: candles.map(() => 0),
      plusDI: candles.map(() => 0),
      minusDI: candles.map(() => 0),
    };
  }

  // Step 1: Calculate True Range, +DM, -DM
  const trueRanges: number[] = [0];
  const plusDMs: number[] = [0];
  const minusDMs: number[] = [0];

  for (let i = 1; i < candles.length; i++) {
    const high = candles[i].high;
    const low = candles[i].low;
    const prevHigh = candles[i - 1].high;
    const prevLow = candles[i - 1].low;
    const prevClose = candles[i - 1].close;

    // True Range
    const tr = Math.max(
      high - low,
      Math.abs(high - prevClose),
      Math.abs(low - prevClose)
    );
    trueRanges.push(tr);

    // Directional Movement
    const upMove = high - prevHigh;
    const downMove = prevLow - low;

    plusDMs.push(upMove > downMove && upMove > 0 ? upMove : 0);
    minusDMs.push(downMove > upMove && downMove > 0 ? downMove : 0);
  }

  // Step 2: Smoothed TR, +DM, -DM (Wilder's smoothing)
  let smoothedTR = 0;
  let smoothedPlusDM = 0;
  let smoothedMinusDM = 0;

  // Initialize with sum of first 'period' values
  for (let i = 1; i <= period; i++) {
    smoothedTR += trueRanges[i];
    smoothedPlusDM += plusDMs[i];
    smoothedMinusDM += minusDMs[i];
  }

  const dxValues: number[] = [];

  for (let i = 0; i < candles.length; i++) {
    if (i < period) {
      plusDI.push(0);
      minusDI.push(0);
      adx.push(0);
      continue;
    }

    if (i === period) {
      // First smoothed values
    } else {
      // Wilder's smoothing: smoothed = prev - (prev / period) + current
      smoothedTR = smoothedTR - smoothedTR / period + trueRanges[i];
      smoothedPlusDM = smoothedPlusDM - smoothedPlusDM / period + plusDMs[i];
      smoothedMinusDM = smoothedMinusDM - smoothedMinusDM / period + minusDMs[i];
    }

    // Calculate +DI and -DI
    const pDI = smoothedTR > 0 ? (smoothedPlusDM / smoothedTR) * 100 : 0;
    const mDI = smoothedTR > 0 ? (smoothedMinusDM / smoothedTR) * 100 : 0;
    plusDI.push(pDI);
    minusDI.push(mDI);

    // Calculate DX
    const diSum = pDI + mDI;
    const dx = diSum > 0 ? (Math.abs(pDI - mDI) / diSum) * 100 : 0;
    dxValues.push(dx);

    // Calculate ADX (smoothed DX)
    if (dxValues.length < period) {
      adx.push(0);
    } else if (dxValues.length === period) {
      // First ADX = average of first 'period' DX values
      const avgDX = dxValues.reduce((a, b) => a + b, 0) / period;
      adx.push(avgDX);
    } else {
      // Subsequent ADX: ((prevADX * (period-1)) + currentDX) / period
      const prevADX = adx[adx.length - 1];
      const currentADX = (prevADX * (period - 1) + dx) / period;
      adx.push(currentADX);
    }
  }

  return { adx, plusDI, minusDI };
}

// ============================================
// ATR (Average True Range) — for stop placement
// ============================================

export function ATR(candles: Candle[], period: number = 14): number[] {
  const atr: number[] = [0];

  for (let i = 1; i < candles.length; i++) {
    const tr = Math.max(
      candles[i].high - candles[i].low,
      Math.abs(candles[i].high - candles[i - 1].close),
      Math.abs(candles[i].low - candles[i - 1].close)
    );

    if (i < period) {
      // Simple average for initial values
      const sum = [tr];
      for (let j = Math.max(1, i - period + 1); j < i; j++) {
        sum.push(atr[j] || 0);
      }
      atr.push(sum.reduce((a, b) => a + b, 0) / sum.length);
    } else if (i === period) {
      // First ATR = average of first 'period' TRs
      let trSum = 0;
      for (let j = 1; j <= period; j++) {
        trSum += Math.max(
          candles[j].high - candles[j].low,
          Math.abs(candles[j].high - candles[j - 1].close),
          Math.abs(candles[j].low - candles[j - 1].close)
        );
      }
      atr.push(trSum / period);
    } else {
      // Wilder's smoothing
      atr.push((atr[i - 1] * (period - 1) + tr) / period);
    }
  }

  return atr;
}

// ============================================
// REGIME DETECTION
// ============================================

export type MarketRegime = "trending" | "ranging" | "volatile";

export function detectRegime(candles: Candle[], adxPeriod: number = 14): {
  regime: MarketRegime;
  adxValue: number;
  trendDirection: "up" | "down" | "none";
} {
  const { adx, plusDI, minusDI } = ADX(candles, adxPeriod);
  const currentADX = adx[adx.length - 1];
  const currentPlusDI = plusDI[plusDI.length - 1];
  const currentMinusDI = minusDI[minusDI.length - 1];

  let regime: MarketRegime;
  if (currentADX >= 25) {
    regime = "trending";
  } else if (currentADX <= 15) {
    regime = "ranging";
  } else {
    // Check volatility as tie-breaker
    const atr = ATR(candles, 14);
    const currentATR = atr[atr.length - 1];
    const avgPrice = candles[candles.length - 1].close;
    const atrPct = (currentATR / avgPrice) * 100;
    regime = atrPct > 3 ? "volatile" : "ranging";
  }

  const trendDirection = currentPlusDI > currentMinusDI ? "up" : currentMinusDI > currentPlusDI ? "down" : "none";

  return { regime, adxValue: currentADX, trendDirection };
}

// ============================================
// EMA CROSSOVER TREND STRATEGY
// ============================================

export interface TrendStrategyConfig {
  fastPeriod: number;     // Default: 10
  slowPeriod: number;     // Default: 50
  adxThreshold: number;   // Min ADX to trade (default: 25)
  atrMultiplierSL: number; // ATR multiplier for stop-loss (default: 2.0)
  atrMultiplierTP: number; // ATR multiplier for take-profit (default: 3.0)
  rsiOverbought: number;  // RSI overbought filter (default: 75)
  rsiOversold: number;    // RSI oversold filter (default: 25)
  leverage: number;       // Default: 3
}

export const DEFAULT_TREND_CONFIG: TrendStrategyConfig = {
  fastPeriod: 10,
  slowPeriod: 50,
  adxThreshold: 25,
  atrMultiplierSL: 2.0,
  atrMultiplierTP: 3.0,
  rsiOverbought: 75,
  rsiOversold: 25,
  leverage: 3,
};

export interface TrendSignal {
  action: "LONG" | "SHORT" | "CLOSE_LONG" | "CLOSE_SHORT" | "HOLD";
  reason: string;
  regime: MarketRegime;
  adxValue: number;
  confidence: number;
  stopLoss: number | null;
  takeProfit: number | null;
  indicators: {
    fastEMA: number;
    slowEMA: number;
    rsi: number;
    atr: number;
    plusDI: number;
    minusDI: number;
  };
}

/**
 * EMA Crossover Trend-Following Strategy with ADX Regime Filter.
 *
 * Entry rules:
 * - ADX > threshold (trending market confirmed)
 * - Fast EMA crosses above slow EMA → LONG (if +DI > -DI)
 * - Fast EMA crosses below slow EMA → SHORT (if -DI > +DI)
 * - RSI filter: don't enter long if RSI > 75, don't enter short if RSI < 25
 *
 * Exit rules:
 * - Opposite crossover
 * - ADX drops below threshold (trend dying)
 * - Stop loss / take profit hit (ATR-based)
 */
export function analyzeTrend(
  candles: Candle[],
  config: Partial<TrendStrategyConfig> = {}
): TrendSignal {
  const cfg = { ...DEFAULT_TREND_CONFIG, ...config };

  const minRequired = Math.max(cfg.slowPeriod + 5, 30);
  if (candles.length < minRequired) {
    return {
      action: "HOLD",
      reason: `Insufficient data (need ${minRequired} candles, have ${candles.length})`,
      regime: "ranging",
      adxValue: 0,
      confidence: 0,
      stopLoss: null,
      takeProfit: null,
      indicators: { fastEMA: 0, slowEMA: 0, rsi: 0, atr: 0, plusDI: 0, minusDI: 0 },
    };
  }

  // Calculate indicators
  const fastEMA = EMA(candles, cfg.fastPeriod);
  const slowEMA = EMA(candles, cfg.slowPeriod);
  const rsiValues = RSI(candles, 14);
  const atrValues = ATR(candles, 14);
  const { adx, plusDI, minusDI } = ADX(candles, 14);

  const i = candles.length - 1;
  const currentPrice = candles[i].close;
  const currentFastEMA = fastEMA[i];
  const currentSlowEMA = slowEMA[i];
  const prevFastEMA = fastEMA[i - 1];
  const prevSlowEMA = slowEMA[i - 1];
  const currentRSI = rsiValues[i];
  const currentATR = atrValues[i];
  const currentADX = adx[i];
  const currentPlusDI = plusDI[i];
  const currentMinusDI = minusDI[i];

  const indicators = {
    fastEMA: currentFastEMA,
    slowEMA: currentSlowEMA,
    rsi: currentRSI,
    atr: currentATR,
    plusDI: currentPlusDI,
    minusDI: currentMinusDI,
  };

  // Detect regime
  const { regime } = detectRegime(candles);

  // Base result
  const base = { regime, adxValue: currentADX, indicators };

  // Regime filter: only trade in trending markets
  if (currentADX < cfg.adxThreshold) {
    return {
      ...base,
      action: "HOLD",
      reason: `Ranging market (ADX ${currentADX.toFixed(1)} < ${cfg.adxThreshold}). No trend-following trades.`,
      confidence: 0,
      stopLoss: null,
      takeProfit: null,
    };
  }

  // Check for crossovers
  const goldenCross = prevFastEMA <= prevSlowEMA && currentFastEMA > currentSlowEMA;
  const deathCross = prevFastEMA >= prevSlowEMA && currentFastEMA < currentSlowEMA;

  // ATR-based stop loss and take profit
  const longSL = currentPrice - currentATR * cfg.atrMultiplierSL;
  const longTP = currentPrice + currentATR * cfg.atrMultiplierTP;
  const shortSL = currentPrice + currentATR * cfg.atrMultiplierSL;
  const shortTP = currentPrice - currentATR * cfg.atrMultiplierTP;

  // LONG entry: golden cross + uptrend confirmed by DI
  if (goldenCross && currentPlusDI > currentMinusDI) {
    if (currentRSI > cfg.rsiOverbought) {
      return {
        ...base,
        action: "HOLD",
        reason: `Golden cross but RSI overbought (${currentRSI.toFixed(1)})`,
        confidence: 30,
        stopLoss: null,
        takeProfit: null,
      };
    }

    const confidence = Math.min(90, 50 + (currentADX - cfg.adxThreshold) * 2);
    return {
      ...base,
      action: "LONG",
      reason: `Golden cross (EMA${cfg.fastPeriod} crossed above EMA${cfg.slowPeriod}), ADX ${currentADX.toFixed(1)}, +DI ${currentPlusDI.toFixed(1)} > -DI ${currentMinusDI.toFixed(1)}`,
      confidence,
      stopLoss: longSL,
      takeProfit: longTP,
    };
  }

  // SHORT entry: death cross + downtrend confirmed by DI
  if (deathCross && currentMinusDI > currentPlusDI) {
    if (currentRSI < cfg.rsiOversold) {
      return {
        ...base,
        action: "HOLD",
        reason: `Death cross but RSI oversold (${currentRSI.toFixed(1)})`,
        confidence: 30,
        stopLoss: null,
        takeProfit: null,
      };
    }

    const confidence = Math.min(90, 50 + (currentADX - cfg.adxThreshold) * 2);
    return {
      ...base,
      action: "SHORT",
      reason: `Death cross (EMA${cfg.fastPeriod} crossed below EMA${cfg.slowPeriod}), ADX ${currentADX.toFixed(1)}, -DI ${currentMinusDI.toFixed(1)} > +DI ${currentPlusDI.toFixed(1)}`,
      confidence,
      stopLoss: shortSL,
      takeProfit: shortTP,
    };
  }

  // Check for exit signals on existing trend
  if (currentFastEMA > currentSlowEMA && currentMinusDI > currentPlusDI) {
    return {
      ...base,
      action: "CLOSE_LONG",
      reason: "Trend weakening: -DI crossed above +DI while in uptrend",
      confidence: 60,
      stopLoss: null,
      takeProfit: null,
    };
  }

  if (currentFastEMA < currentSlowEMA && currentPlusDI > currentMinusDI) {
    return {
      ...base,
      action: "CLOSE_SHORT",
      reason: "Trend weakening: +DI crossed above -DI while in downtrend",
      confidence: 60,
      stopLoss: null,
      takeProfit: null,
    };
  }

  // Determine current bias
  const bias = currentFastEMA > currentSlowEMA ? "bullish" : "bearish";
  return {
    ...base,
    action: "HOLD",
    reason: `In ${bias} trend (ADX ${currentADX.toFixed(1)}), waiting for crossover signal`,
    confidence: 40,
    stopLoss: null,
    takeProfit: null,
  };
}

/**
 * Create a Backtester-compatible strategy from the trend-following config.
 */
export function emaCrossoverStrategy(config: Partial<TrendStrategyConfig> = {}): Strategy {
  const cfg = { ...DEFAULT_TREND_CONFIG, ...config };

  return (candles: Candle[], position: number): StrategySignal => {
    const signal = analyzeTrend(candles, cfg);

    if (signal.action === "LONG" && position === 0) {
      return { action: "BUY", reason: signal.reason };
    }
    if (signal.action === "SHORT" && position > 0) {
      return { action: "SELL", reason: signal.reason };
    }
    if (signal.action === "CLOSE_LONG" && position > 0) {
      return { action: "SELL", reason: signal.reason };
    }

    return { action: "HOLD", reason: signal.reason };
  };
}

// ============================================
// LIVE ANALYSIS HELPER
// ============================================

/**
 * Run trend analysis on live data from Bybit futures.
 */
export async function analyzeTrendLive(
  symbol: string,
  interval: string = "60",
  config: Partial<TrendStrategyConfig> = {}
): Promise<TrendSignal & { symbol: string; currentPrice: number }> {
  const klines = await futuresClient.getKlines(symbol, interval, 200);

  const candles: Candle[] = klines
    .map((k) => ({
      timestamp: parseInt(k[0]),
      open: parseFloat(k[1]),
      high: parseFloat(k[2]),
      low: parseFloat(k[3]),
      close: parseFloat(k[4]),
      volume: parseFloat(k[5]),
    }))
    .reverse(); // Oldest first

  const signal = analyzeTrend(candles, config);
  const currentPrice = candles[candles.length - 1].close;

  return { ...signal, symbol, currentPrice };
}
