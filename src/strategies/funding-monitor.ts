import { futuresClient } from "../api/futures-client.js";
import { bybitClient } from "../api/bybit-client.js";
import { config } from "dotenv";

config();

// ============================================
// TYPES
// ============================================

export interface FundingOpportunity {
  symbol: string;
  currentRate: number;
  annualizedPct: number;
  avgRate8h: number;       // Average over recent history
  consistency: number;      // % of periods where rate was same sign
  spotPrice: number;
  futuresPrice: number;
  basisPct: number;         // (futures - spot) / spot
  recommendedAction: "OPEN_ARB" | "CLOSE_ARB" | "MONITOR" | "SKIP";
  reasoning: string;
  estimatedDailyReturn: number;  // In USD based on $500 allocation
  estimatedMonthlyReturn: number;
}

export interface ArbPosition {
  symbol: string;
  spotQty: number;
  futuresQty: number;
  entryBasis: number;
  entryTime: Date;
  collectedFunding: number;
  spotEntryPrice: number;
  futuresEntryPrice: number;
}

export interface FundingSnapshot {
  timestamp: Date;
  rates: { symbol: string; rate: number; annualizedPct: number }[];
}

// ============================================
// FUNDING RATE MONITOR
// ============================================

export class FundingMonitor {
  private history: FundingSnapshot[] = [];
  private maxHistorySize = 500;

  /**
   * Scan current funding rates and identify arbitrage opportunities.
   */
  async scan(
    symbols: string[] = ["BTCUSDT", "ETHUSDT", "SOLUSDT", "XRPUSDT", "DOGEUSDT",
                          "AVAXUSDT", "ADAUSDT", "LINKUSDT", "MATICUSDT", "DOTUSDT"],
    allocationUsd: number = 500
  ): Promise<FundingOpportunity[]> {
    const opportunities: FundingOpportunity[] = [];

    // Get all futures tickers for funding rates
    const rates = await futuresClient.getTopFundingRates(symbols);

    // Record snapshot
    this.history.push({ timestamp: new Date(), rates });
    if (this.history.length > this.maxHistorySize) {
      this.history = this.history.slice(-this.maxHistorySize);
    }

    for (const { symbol, rate, annualizedPct } of rates) {
      try {
        // Get funding history for consistency check
        const fundingHistory = await futuresClient.getFundingHistory(symbol, 30);

        // Calculate average and consistency
        const historicalRates = fundingHistory.map((f) => parseFloat(f.fundingRate));
        const avgRate = historicalRates.length > 0
          ? historicalRates.reduce((a, b) => a + b, 0) / historicalRates.length
          : rate;

        // Consistency = % of periods where rate was same sign as current
        const sameSignCount = historicalRates.filter((r) =>
          rate > 0 ? r > 0 : r < 0
        ).length;
        const consistency = historicalRates.length > 0
          ? sameSignCount / historicalRates.length
          : 0;

        // Get spot and futures prices for basis calculation
        let spotPrice = 0;
        let futuresPrice = 0;
        try {
          const [spotTicker, futuresTicker] = await Promise.all([
            bybitClient.getTicker(symbol),
            futuresClient.getTicker(symbol),
          ]);
          spotPrice = parseFloat(spotTicker.lastPrice);
          futuresPrice = parseFloat(futuresTicker.lastPrice);
        } catch {
          // If spot ticker fails, use futures price
          const futuresTicker = await futuresClient.getTicker(symbol);
          futuresPrice = parseFloat(futuresTicker.lastPrice);
          spotPrice = futuresPrice;
        }

        const basisPct = spotPrice > 0
          ? ((futuresPrice - spotPrice) / spotPrice) * 100
          : 0;

        // Calculate estimated returns
        // Funding is paid 3x per day (every 8 hours)
        const dailyReturn = Math.abs(rate) * 3 * allocationUsd;
        const monthlyReturn = dailyReturn * 30;

        // Determine recommendation
        let recommendedAction: FundingOpportunity["recommendedAction"];
        let reasoning: string;

        if (Math.abs(rate) >= 0.0001 && consistency >= 0.7) {
          recommendedAction = "OPEN_ARB";
          reasoning = `Strong opportunity: ${(rate * 100).toFixed(4)}% per 8h, ${(consistency * 100).toFixed(0)}% consistent. ` +
            `Long spot + short perp to collect ${rate > 0 ? "positive" : "negative"} funding.`;
        } else if (Math.abs(rate) >= 0.0001 && consistency >= 0.5) {
          recommendedAction = "MONITOR";
          reasoning = `Moderate opportunity: ${(rate * 100).toFixed(4)}% per 8h but only ${(consistency * 100).toFixed(0)}% consistent. Monitor for stability.`;
        } else if (Math.abs(rate) < 0.0001) {
          recommendedAction = "SKIP";
          reasoning = `Funding rate too low (${(rate * 100).toFixed(4)}%) — fees would eat into profits.`;
        } else {
          recommendedAction = "SKIP";
          reasoning = `Low consistency (${(consistency * 100).toFixed(0)}%) — rate flips too often for reliable arb.`;
        }

        opportunities.push({
          symbol,
          currentRate: rate,
          annualizedPct,
          avgRate8h: avgRate,
          consistency,
          spotPrice,
          futuresPrice,
          basisPct,
          recommendedAction,
          reasoning,
          estimatedDailyReturn: dailyReturn,
          estimatedMonthlyReturn: monthlyReturn,
        });
      } catch (error) {
        console.error(`Error scanning ${symbol}:`, error);
      }
    }

    // Sort by estimated monthly return (highest first)
    return opportunities.sort((a, b) => b.estimatedMonthlyReturn - a.estimatedMonthlyReturn);
  }

  /**
   * Get the best current funding arbitrage opportunities.
   */
  async getBestOpportunities(
    topN: number = 3,
    minConsistency: number = 0.6,
    minRatePct: number = 0.005 // 0.005% per 8h minimum
  ): Promise<FundingOpportunity[]> {
    const all = await this.scan();
    return all
      .filter(
        (o) =>
          o.consistency >= minConsistency &&
          Math.abs(o.currentRate) >= minRatePct / 100 &&
          o.recommendedAction !== "SKIP"
      )
      .slice(0, topN);
  }

  /**
   * Calculate the P&L of a funding arbitrage position.
   */
  calculateArbPnL(position: ArbPosition, currentSpotPrice: number, currentFuturesPrice: number): {
    spotPnL: number;
    futuresPnL: number;
    fundingPnL: number;
    totalPnL: number;
    returnPct: number;
    holdingHours: number;
  } {
    // Spot P&L (long position)
    const spotPnL = (currentSpotPrice - position.spotEntryPrice) * position.spotQty;

    // Futures P&L (short position — inverted)
    const futuresPnL = (position.futuresEntryPrice - currentFuturesPrice) * position.futuresQty;

    // Funding collected
    const fundingPnL = position.collectedFunding;

    const totalPnL = spotPnL + futuresPnL + fundingPnL;
    const initialValue = position.spotEntryPrice * position.spotQty;
    const returnPct = initialValue > 0 ? (totalPnL / initialValue) * 100 : 0;
    const holdingHours = (Date.now() - position.entryTime.getTime()) / (1000 * 60 * 60);

    return { spotPnL, futuresPnL, fundingPnL, totalPnL, returnPct, holdingHours };
  }

  /**
   * Get funding rate history snapshots.
   */
  getHistory(): FundingSnapshot[] {
    return this.history;
  }

  /**
   * Get summary statistics for a symbol's funding rates.
   */
  async getSymbolStats(symbol: string): Promise<{
    currentRate: number;
    avgRate24h: number;
    avgRate7d: number;
    maxRate: number;
    minRate: number;
    annualizedPct: number;
    consistency7d: number;
  }> {
    const history = await futuresClient.getFundingHistory(symbol, 200);
    const rates = history.map((f) => parseFloat(f.fundingRate));

    if (rates.length === 0) {
      return {
        currentRate: 0, avgRate24h: 0, avgRate7d: 0,
        maxRate: 0, minRate: 0, annualizedPct: 0, consistency7d: 0,
      };
    }

    const currentRate = rates[0]; // Most recent
    const rates24h = rates.slice(0, 3);  // 3 periods per day
    const rates7d = rates.slice(0, 21);  // 21 periods per week

    const avg = (arr: number[]) => arr.reduce((a, b) => a + b, 0) / arr.length;
    const sameSign = rates7d.filter((r) => (currentRate > 0 ? r > 0 : r < 0)).length;

    return {
      currentRate,
      avgRate24h: avg(rates24h),
      avgRate7d: avg(rates7d),
      maxRate: Math.max(...rates),
      minRate: Math.min(...rates),
      annualizedPct: currentRate * 3 * 365 * 100,
      consistency7d: rates7d.length > 0 ? sameSign / rates7d.length : 0,
    };
  }
}

export const fundingMonitor = new FundingMonitor();
