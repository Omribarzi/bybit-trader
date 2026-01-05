import { bybitClient } from "../api/bybit-client.js";

export interface Candle {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface Trade {
  timestamp: number;
  type: "BUY" | "SELL";
  price: number;
  quantity: number;
  value: number;
}

export interface BacktestResult {
  symbol: string;
  strategy: string;
  startDate: Date;
  endDate: Date;
  initialBalance: number;
  finalBalance: number;
  totalReturn: number;
  totalReturnPercent: number;
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
  winRate: number;
  maxDrawdown: number;
  maxDrawdownPercent: number;
  trades: Trade[];
}

export interface StrategySignal {
  action: "BUY" | "SELL" | "HOLD";
  reason?: string;
}

export type Strategy = (candles: Candle[], position: number) => StrategySignal;

// Fetch historical klines and convert to Candle format
export async function fetchHistoricalData(
  symbol: string,
  interval: string = "60", // 1 hour
  limit: number = 200
): Promise<Candle[]> {
  const klines = await bybitClient.getKlines(symbol, interval, limit);

  // Bybit klines format: [startTime, open, high, low, close, volume, turnover]
  return klines.map((k) => ({
    timestamp: parseInt(k[0]),
    open: parseFloat(k[1]),
    high: parseFloat(k[2]),
    low: parseFloat(k[3]),
    close: parseFloat(k[4]),
    volume: parseFloat(k[5]),
  })).reverse(); // Reverse to get chronological order (oldest first)
}

// Simple Moving Average
export function SMA(candles: Candle[], period: number): number[] {
  const result: number[] = [];
  for (let i = 0; i < candles.length; i++) {
    if (i < period - 1) {
      result.push(0);
    } else {
      const sum = candles.slice(i - period + 1, i + 1).reduce((acc, c) => acc + c.close, 0);
      result.push(sum / period);
    }
  }
  return result;
}

// Exponential Moving Average
export function EMA(candles: Candle[], period: number): number[] {
  const result: number[] = [];
  const multiplier = 2 / (period + 1);

  for (let i = 0; i < candles.length; i++) {
    if (i === 0) {
      result.push(candles[i].close);
    } else if (i < period - 1) {
      // Use SMA for initial values
      const sum = candles.slice(0, i + 1).reduce((acc, c) => acc + c.close, 0);
      result.push(sum / (i + 1));
    } else {
      const ema = (candles[i].close - result[i - 1]) * multiplier + result[i - 1];
      result.push(ema);
    }
  }
  return result;
}

// Relative Strength Index
export function RSI(candles: Candle[], period: number = 14): number[] {
  const result: number[] = [];
  const gains: number[] = [];
  const losses: number[] = [];

  for (let i = 0; i < candles.length; i++) {
    if (i === 0) {
      result.push(50);
      gains.push(0);
      losses.push(0);
      continue;
    }

    const change = candles[i].close - candles[i - 1].close;
    gains.push(change > 0 ? change : 0);
    losses.push(change < 0 ? Math.abs(change) : 0);

    if (i < period) {
      result.push(50);
      continue;
    }

    const avgGain = gains.slice(i - period + 1, i + 1).reduce((a, b) => a + b, 0) / period;
    const avgLoss = losses.slice(i - period + 1, i + 1).reduce((a, b) => a + b, 0) / period;

    if (avgLoss === 0) {
      result.push(100);
    } else {
      const rs = avgGain / avgLoss;
      result.push(100 - (100 / (1 + rs)));
    }
  }
  return result;
}

// MACD
export function MACD(candles: Candle[], fastPeriod = 12, slowPeriod = 26, signalPeriod = 9): {
  macd: number[];
  signal: number[];
  histogram: number[];
} {
  const fastEMA = EMA(candles, fastPeriod);
  const slowEMA = EMA(candles, slowPeriod);

  const macdLine: number[] = fastEMA.map((fast, i) => fast - slowEMA[i]);

  // Calculate signal line (EMA of MACD)
  const signalLine: number[] = [];
  const multiplier = 2 / (signalPeriod + 1);

  for (let i = 0; i < macdLine.length; i++) {
    if (i === 0) {
      signalLine.push(macdLine[i]);
    } else {
      const signal = (macdLine[i] - signalLine[i - 1]) * multiplier + signalLine[i - 1];
      signalLine.push(signal);
    }
  }

  const histogram = macdLine.map((m, i) => m - signalLine[i]);

  return { macd: macdLine, signal: signalLine, histogram };
}

// Backtester class
export class Backtester {
  private initialBalance: number;
  private balance: number;
  private position: number = 0; // Amount of asset held
  private trades: Trade[] = [];
  private balanceHistory: number[] = [];

  constructor(initialBalance: number = 10000) {
    this.initialBalance = initialBalance;
    this.balance = initialBalance;
  }

  run(candles: Candle[], strategy: Strategy, symbol: string, strategyName: string): BacktestResult {
    this.balance = this.initialBalance;
    this.position = 0;
    this.trades = [];
    this.balanceHistory = [this.initialBalance];

    for (let i = 0; i < candles.length; i++) {
      const historicalCandles = candles.slice(0, i + 1);
      const signal = strategy(historicalCandles, this.position);
      const currentPrice = candles[i].close;

      if (signal.action === "BUY" && this.position === 0) {
        // Buy with all available balance
        const quantity = this.balance / currentPrice;
        this.position = quantity;
        this.trades.push({
          timestamp: candles[i].timestamp,
          type: "BUY",
          price: currentPrice,
          quantity,
          value: this.balance,
        });
        this.balance = 0;
      } else if (signal.action === "SELL" && this.position > 0) {
        // Sell all position
        const value = this.position * currentPrice;
        this.trades.push({
          timestamp: candles[i].timestamp,
          type: "SELL",
          price: currentPrice,
          quantity: this.position,
          value,
        });
        this.balance = value;
        this.position = 0;
      }

      // Track portfolio value
      const portfolioValue = this.balance + this.position * currentPrice;
      this.balanceHistory.push(portfolioValue);
    }

    // Close any open position at the end
    const finalPrice = candles[candles.length - 1].close;
    const finalBalance = this.balance + this.position * finalPrice;

    // Calculate metrics
    const totalReturn = finalBalance - this.initialBalance;
    const totalReturnPercent = (totalReturn / this.initialBalance) * 100;

    // Calculate winning/losing trades
    let winningTrades = 0;
    let losingTrades = 0;
    for (let i = 0; i < this.trades.length - 1; i += 2) {
      if (i + 1 < this.trades.length) {
        const buyTrade = this.trades[i];
        const sellTrade = this.trades[i + 1];
        if (sellTrade.value > buyTrade.value) {
          winningTrades++;
        } else {
          losingTrades++;
        }
      }
    }

    // Calculate max drawdown
    let maxDrawdown = 0;
    let peak = this.balanceHistory[0];
    for (const value of this.balanceHistory) {
      if (value > peak) peak = value;
      const drawdown = peak - value;
      if (drawdown > maxDrawdown) maxDrawdown = drawdown;
    }

    return {
      symbol,
      strategy: strategyName,
      startDate: new Date(candles[0].timestamp),
      endDate: new Date(candles[candles.length - 1].timestamp),
      initialBalance: this.initialBalance,
      finalBalance,
      totalReturn,
      totalReturnPercent,
      totalTrades: this.trades.length,
      winningTrades,
      losingTrades,
      winRate: this.trades.length > 0 ? (winningTrades / (winningTrades + losingTrades)) * 100 : 0,
      maxDrawdown,
      maxDrawdownPercent: (maxDrawdown / this.initialBalance) * 100,
      trades: this.trades,
    };
  }
}

// Pre-built strategies

// 1. SMA Crossover Strategy
export function smaCrossoverStrategy(fastPeriod = 10, slowPeriod = 20): Strategy {
  return (candles: Candle[], position: number): StrategySignal => {
    if (candles.length < slowPeriod + 1) return { action: "HOLD" };

    const fastSMA = SMA(candles, fastPeriod);
    const slowSMA = SMA(candles, slowPeriod);

    const currentFast = fastSMA[fastSMA.length - 1];
    const currentSlow = slowSMA[slowSMA.length - 1];
    const prevFast = fastSMA[fastSMA.length - 2];
    const prevSlow = slowSMA[slowSMA.length - 2];

    // Golden cross (fast crosses above slow)
    if (prevFast <= prevSlow && currentFast > currentSlow && position === 0) {
      return { action: "BUY", reason: "Golden cross" };
    }

    // Death cross (fast crosses below slow)
    if (prevFast >= prevSlow && currentFast < currentSlow && position > 0) {
      return { action: "SELL", reason: "Death cross" };
    }

    return { action: "HOLD" };
  };
}

// 2. RSI Strategy
export function rsiStrategy(oversold = 30, overbought = 70): Strategy {
  return (candles: Candle[], position: number): StrategySignal => {
    if (candles.length < 15) return { action: "HOLD" };

    const rsiValues = RSI(candles, 14);
    const currentRSI = rsiValues[rsiValues.length - 1];
    const prevRSI = rsiValues[rsiValues.length - 2];

    // Buy when RSI crosses above oversold
    if (prevRSI < oversold && currentRSI >= oversold && position === 0) {
      return { action: "BUY", reason: `RSI crossed above ${oversold}` };
    }

    // Sell when RSI crosses below overbought
    if (prevRSI > overbought && currentRSI <= overbought && position > 0) {
      return { action: "SELL", reason: `RSI crossed below ${overbought}` };
    }

    return { action: "HOLD" };
  };
}

// 3. MACD Strategy
export function macdStrategy(): Strategy {
  return (candles: Candle[], position: number): StrategySignal => {
    if (candles.length < 35) return { action: "HOLD" };

    const { macd, signal, histogram } = MACD(candles);
    const currentHist = histogram[histogram.length - 1];
    const prevHist = histogram[histogram.length - 2];

    // Buy when histogram crosses above 0
    if (prevHist <= 0 && currentHist > 0 && position === 0) {
      return { action: "BUY", reason: "MACD histogram crossed above 0" };
    }

    // Sell when histogram crosses below 0
    if (prevHist >= 0 && currentHist < 0 && position > 0) {
      return { action: "SELL", reason: "MACD histogram crossed below 0" };
    }

    return { action: "HOLD" };
  };
}

// 4. Combined Strategy (SMA + RSI)
export function combinedStrategy(): Strategy {
  return (candles: Candle[], position: number): StrategySignal => {
    if (candles.length < 30) return { action: "HOLD" };

    const sma20 = SMA(candles, 20);
    const rsiValues = RSI(candles, 14);

    const currentPrice = candles[candles.length - 1].close;
    const currentSMA = sma20[sma20.length - 1];
    const currentRSI = rsiValues[rsiValues.length - 1];

    // Buy: Price above SMA and RSI < 40 (not overbought, with trend)
    if (currentPrice > currentSMA && currentRSI < 40 && position === 0) {
      return { action: "BUY", reason: "Price above SMA20, RSI shows room to grow" };
    }

    // Sell: Price below SMA or RSI > 70 (overbought)
    if ((currentPrice < currentSMA || currentRSI > 70) && position > 0) {
      return { action: "SELL", reason: "Price below SMA20 or RSI overbought" };
    }

    return { action: "HOLD" };
  };
}
