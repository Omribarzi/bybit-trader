import { config } from "dotenv";
import { bybitClient } from "../api/bybit-client.js";
import { getFullSentimentAnalysis } from "../sentiment/sentiment-engine.js";
import type { SentimentScore, TradingSignal } from "../sentiment/sentiment-engine.js";
import { SMA, RSI, EMA } from "../backtest/backtester.js";
import type { Candle } from "../backtest/backtester.js";

config();

export interface CombinedSignal {
  symbol: string;
  timestamp: Date;

  // Sentiment analysis
  sentimentScore: number;
  sentimentLabel: string;
  sentimentSignal: TradingSignal;

  // Technical analysis
  technicalSignal: "BUY" | "SELL" | "HOLD";
  technicalReason: string;

  // Combined
  finalAction: "STRONG_BUY" | "BUY" | "HOLD" | "SELL" | "STRONG_SELL";
  confidence: number;
  reasoning: string;

  // Risk management
  suggestedPositionSize: number; // Percentage of portfolio
  stopLoss: number | null;
  takeProfit: number | null;

  // Market context
  currentPrice: number;
  priceChange24h: number;
  volume24h: string;
}

// Convert klines to Candle format
function klinesToCandles(klines: string[][]): Candle[] {
  return klines.map((k) => ({
    timestamp: parseInt(k[0]),
    open: parseFloat(k[1]),
    high: parseFloat(k[2]),
    low: parseFloat(k[3]),
    close: parseFloat(k[4]),
    volume: parseFloat(k[5]),
  })).reverse(); // Oldest first
}

// Technical analysis
function analyzeTechnicals(candles: Candle[]): { signal: "BUY" | "SELL" | "HOLD"; reason: string } {
  if (candles.length < 50) {
    return { signal: "HOLD", reason: "Insufficient data for technical analysis" };
  }

  const sma20 = SMA(candles, 20);
  const sma50 = SMA(candles, 50);
  const rsi = RSI(candles, 14);
  const ema9 = EMA(candles, 9);

  const currentPrice = candles[candles.length - 1].close;
  const currentSMA20 = sma20[sma20.length - 1];
  const currentSMA50 = sma50[sma50.length - 1];
  const currentRSI = rsi[rsi.length - 1];
  const currentEMA9 = ema9[ema9.length - 1];
  const prevEMA9 = ema9[ema9.length - 2];

  const reasons: string[] = [];
  let buySignals = 0;
  let sellSignals = 0;

  // Trend analysis
  if (currentPrice > currentSMA20 && currentSMA20 > currentSMA50) {
    buySignals += 2;
    reasons.push("Strong uptrend (price > SMA20 > SMA50)");
  } else if (currentPrice < currentSMA20 && currentSMA20 < currentSMA50) {
    sellSignals += 2;
    reasons.push("Strong downtrend (price < SMA20 < SMA50)");
  } else if (currentPrice > currentSMA20) {
    buySignals += 1;
    reasons.push("Price above SMA20");
  } else {
    sellSignals += 1;
    reasons.push("Price below SMA20");
  }

  // RSI analysis
  if (currentRSI < 30) {
    buySignals += 2;
    reasons.push(`RSI oversold (${currentRSI.toFixed(1)})`);
  } else if (currentRSI > 70) {
    sellSignals += 2;
    reasons.push(`RSI overbought (${currentRSI.toFixed(1)})`);
  } else if (currentRSI < 40) {
    buySignals += 1;
    reasons.push(`RSI low (${currentRSI.toFixed(1)})`);
  } else if (currentRSI > 60) {
    sellSignals += 1;
    reasons.push(`RSI high (${currentRSI.toFixed(1)})`);
  }

  // EMA momentum
  if (currentEMA9 > prevEMA9) {
    buySignals += 1;
    reasons.push("EMA9 rising (momentum up)");
  } else {
    sellSignals += 1;
    reasons.push("EMA9 falling (momentum down)");
  }

  // Determine signal
  if (buySignals >= sellSignals + 2) {
    return { signal: "BUY", reason: reasons.join("; ") };
  } else if (sellSignals >= buySignals + 2) {
    return { signal: "SELL", reason: reasons.join("; ") };
  } else {
    return { signal: "HOLD", reason: reasons.join("; ") };
  }
}

// Combine sentiment and technical signals
function combineSignals(
  sentimentSignal: TradingSignal,
  technicalSignal: "BUY" | "SELL" | "HOLD",
  sentimentScore: number,
  currentPrice: number
): {
  action: CombinedSignal["finalAction"];
  confidence: number;
  reasoning: string;
  positionSize: number;
  stopLoss: number | null;
  takeProfit: number | null;
} {
  // Mapping signals to numeric values
  const sentimentValue = {
    STRONG_BUY: 2,
    BUY: 1,
    HOLD: 0,
    SELL: -1,
    STRONG_SELL: -2,
  }[sentimentSignal.action];

  const technicalValue = {
    BUY: 1,
    HOLD: 0,
    SELL: -1,
  }[technicalSignal];

  // Weight: 60% sentiment, 40% technical (sentiment is leading indicator)
  const combinedScore = sentimentValue * 0.6 + technicalValue * 0.4;

  let action: CombinedSignal["finalAction"];
  let confidence: number;
  let reasoning: string;
  let positionSize: number;
  let stopLoss: number | null = null;
  let takeProfit: number | null = null;

  // Agreement between signals increases confidence
  const signalsAgree = (sentimentValue > 0 && technicalValue > 0) ||
                       (sentimentValue < 0 && technicalValue < 0) ||
                       (sentimentValue === 0 && technicalValue === 0);

  if (combinedScore >= 1.5) {
    action = "STRONG_BUY";
    confidence = signalsAgree ? 85 : 65;
    positionSize = signalsAgree ? 20 : 10; // % of portfolio
    stopLoss = currentPrice * 0.95; // 5% stop loss
    takeProfit = currentPrice * 1.15; // 15% take profit
    reasoning = "Strong buy: Both sentiment and technicals bullish";
  } else if (combinedScore >= 0.5) {
    action = "BUY";
    confidence = signalsAgree ? 70 : 55;
    positionSize = signalsAgree ? 15 : 8;
    stopLoss = currentPrice * 0.93; // 7% stop loss
    takeProfit = currentPrice * 1.12;
    reasoning = "Buy signal: Favorable conditions";
  } else if (combinedScore <= -1.5) {
    action = "STRONG_SELL";
    confidence = signalsAgree ? 85 : 65;
    positionSize = 0;
    reasoning = "Strong sell: Exit all positions";
  } else if (combinedScore <= -0.5) {
    action = "SELL";
    confidence = signalsAgree ? 70 : 55;
    positionSize = 0;
    reasoning = "Sell signal: Reduce exposure";
  } else {
    action = "HOLD";
    confidence = 50;
    positionSize = 0; // Don't add to position
    reasoning = "Hold: Mixed signals, wait for clarity";
  }

  // Adjust for extreme sentiment (contrarian edge)
  if (Math.abs(sentimentScore) > 75) {
    confidence += 10;
    reasoning += ` (extreme sentiment = high conviction contrarian opportunity)`;
  }

  return { action, confidence, reasoning, positionSize, stopLoss, takeProfit };
}

// Main strategy function
export async function analyzeCoin(symbol: string): Promise<CombinedSignal> {
  const pairSymbol = symbol.includes("USDT") ? symbol : `${symbol}USDT`;
  const baseSymbol = symbol.replace("USDT", "");

  // Fetch market data
  const [ticker, klines] = await Promise.all([
    bybitClient.getTicker(pairSymbol),
    bybitClient.getKlines(pairSymbol, "60", 100), // 100 hourly candles
  ]);

  const currentPrice = parseFloat(ticker.lastPrice);
  const priceChange24h = parseFloat(ticker.price24hPcnt) * 100;

  // Get sentiment analysis
  const { sentiment, signal: sentimentSignal } = await getFullSentimentAnalysis(
    baseSymbol,
    priceChange24h
  );

  // Get technical analysis
  const candles = klinesToCandles(klines);
  const { signal: technicalSignal, reason: technicalReason } = analyzeTechnicals(candles);

  // Combine signals
  const combined = combineSignals(
    sentimentSignal,
    technicalSignal,
    sentiment.score,
    currentPrice
  );

  return {
    symbol: pairSymbol,
    timestamp: new Date(),

    sentimentScore: sentiment.score,
    sentimentLabel: sentiment.label,
    sentimentSignal,

    technicalSignal,
    technicalReason,

    finalAction: combined.action,
    confidence: combined.confidence,
    reasoning: combined.reasoning,

    suggestedPositionSize: combined.positionSize,
    stopLoss: combined.stopLoss,
    takeProfit: combined.takeProfit,

    currentPrice,
    priceChange24h,
    volume24h: ticker.turnover24h,
  };
}

// Scan multiple coins and rank by opportunity
export async function scanMarketWithSentiment(
  symbols: string[] = ["BTC", "ETH", "SOL", "XRP", "DOGE"]
): Promise<CombinedSignal[]> {
  console.log("Scanning market with sentiment analysis...\n");

  const results: CombinedSignal[] = [];

  for (const symbol of symbols) {
    try {
      console.log(`Analyzing ${symbol}...`);
      const signal = await analyzeCoin(symbol);
      results.push(signal);
    } catch (error) {
      console.error(`Error analyzing ${symbol}:`, error);
    }
  }

  // Sort by actionability (STRONG_BUY first, then BUY, etc.)
  const actionPriority: Record<string, number> = {
    STRONG_BUY: 5,
    BUY: 4,
    HOLD: 3,
    SELL: 2,
    STRONG_SELL: 1,
  };

  return results.sort((a, b) => {
    const priorityDiff = actionPriority[b.finalAction] - actionPriority[a.finalAction];
    if (priorityDiff !== 0) return priorityDiff;
    return b.confidence - a.confidence;
  });
}
