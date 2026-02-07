import { Backtester } from "./backtester.js";
import type { Candle, Strategy, BacktestResult } from "./backtester.js";

// ============================================
// WALK-FORWARD ANALYSIS
// ============================================

export interface WalkForwardConfig {
  inSamplePeriod: number;   // Number of candles for in-sample (optimization) window
  outOfSamplePeriod: number; // Number of candles for out-of-sample (validation) window
  initialBalance: number;
  minTrades: number;         // Minimum trades for statistical significance (default: 30)
  maxSharpeThreshold: number; // Flag overfitting if Sharpe > this (default: 3.0)
}

export const DEFAULT_WF_CONFIG: WalkForwardConfig = {
  inSamplePeriod: 4320,     // ~6 months of hourly candles (180 * 24)
  outOfSamplePeriod: 1440,  // ~2 months of hourly candles (60 * 24)
  initialBalance: 1000,
  minTrades: 30,
  maxSharpeThreshold: 3.0,
};

export interface WalkForwardWindow {
  windowIndex: number;
  inSampleStart: number;
  inSampleEnd: number;
  outOfSampleStart: number;
  outOfSampleEnd: number;
  inSampleResult: BacktestResult;
  outOfSampleResult: BacktestResult;
  degradationPct: number;    // How much worse OOS is vs IS
  isOverfit: boolean;
}

export interface WalkForwardResult {
  strategyName: string;
  symbol: string;
  windows: WalkForwardWindow[];
  aggregate: {
    totalTrades: number;
    oosWinRate: number;
    oosReturnPct: number;
    oosSharpe: number;
    oosMaxDrawdownPct: number;
    avgDegradation: number;
    isOverfit: boolean;
    overfitReasons: string[];
    passesMinTrades: boolean;
    verdict: "PASS" | "FAIL" | "WARNING";
    verdictReason: string;
  };
}

// ============================================
// WALK-FORWARD ENGINE
// ============================================

export class WalkForwardEngine {
  private config: WalkForwardConfig;

  constructor(config: Partial<WalkForwardConfig> = {}) {
    this.config = { ...DEFAULT_WF_CONFIG, ...config };
  }

  /**
   * Run walk-forward analysis on a strategy.
   *
   * Divides data into sequential IS/OOS windows, rolls forward.
   * IS = In-Sample (where you'd optimize parameters)
   * OOS = Out-of-Sample (where you validate)
   */
  run(
    candles: Candle[],
    strategy: Strategy,
    symbol: string,
    strategyName: string
  ): WalkForwardResult {
    const { inSamplePeriod, outOfSamplePeriod } = this.config;
    const windowSize = inSamplePeriod + outOfSamplePeriod;

    if (candles.length < windowSize) {
      throw new Error(
        `Insufficient data: need ${windowSize} candles, have ${candles.length}. ` +
        `(${inSamplePeriod} IS + ${outOfSamplePeriod} OOS)`
      );
    }

    const windows: WalkForwardWindow[] = [];
    let windowIndex = 0;

    // Roll forward through the data
    for (
      let start = 0;
      start + windowSize <= candles.length;
      start += outOfSamplePeriod
    ) {
      const isStart = start;
      const isEnd = start + inSamplePeriod;
      const oosStart = isEnd;
      const oosEnd = Math.min(isEnd + outOfSamplePeriod, candles.length);

      if (oosEnd - oosStart < outOfSamplePeriod * 0.5) break; // Skip if OOS too short

      const isCandles = candles.slice(isStart, isEnd);
      const oosCandles = candles.slice(oosStart, oosEnd);

      // Run backtest on both windows
      const isBacktester = new Backtester(this.config.initialBalance);
      const oosBacktester = new Backtester(this.config.initialBalance);

      const isResult = isBacktester.run(isCandles, strategy, symbol, `${strategyName}_IS_${windowIndex}`);
      const oosResult = oosBacktester.run(oosCandles, strategy, symbol, `${strategyName}_OOS_${windowIndex}`);

      // Calculate degradation
      const degradationPct = isResult.totalReturnPercent !== 0
        ? ((isResult.totalReturnPercent - oosResult.totalReturnPercent) / Math.abs(isResult.totalReturnPercent)) * 100
        : 0;

      // Check for overfitting signs
      const isOverfit =
        degradationPct > 70 || // OOS is 70%+ worse than IS
        (isResult.totalReturnPercent > 50 && oosResult.totalReturnPercent < 0); // IS great, OOS negative

      windows.push({
        windowIndex,
        inSampleStart: isStart,
        inSampleEnd: isEnd,
        outOfSampleStart: oosStart,
        outOfSampleEnd: oosEnd,
        inSampleResult: isResult,
        outOfSampleResult: oosResult,
        degradationPct,
        isOverfit,
      });

      windowIndex++;
    }

    // Aggregate OOS results
    const aggregate = this.aggregateResults(windows, strategyName, symbol);

    return { strategyName, symbol, windows, aggregate };
  }

  private aggregateResults(
    windows: WalkForwardWindow[],
    strategyName: string,
    symbol: string
  ): WalkForwardResult["aggregate"] {
    if (windows.length === 0) {
      return {
        totalTrades: 0,
        oosWinRate: 0,
        oosReturnPct: 0,
        oosSharpe: 0,
        oosMaxDrawdownPct: 0,
        avgDegradation: 0,
        isOverfit: true,
        overfitReasons: ["No walk-forward windows generated"],
        passesMinTrades: false,
        verdict: "FAIL",
        verdictReason: "Insufficient data for walk-forward analysis",
      };
    }

    // Aggregate OOS metrics
    let totalTrades = 0;
    let totalWins = 0;
    let totalLosses = 0;
    let combinedReturn = 1;
    let maxDrawdownPct = 0;
    let totalDegradation = 0;
    const oosReturns: number[] = [];

    for (const w of windows) {
      const oos = w.outOfSampleResult;
      totalTrades += oos.totalTrades;
      totalWins += oos.winningTrades;
      totalLosses += oos.losingTrades;
      combinedReturn *= 1 + oos.totalReturnPercent / 100;
      maxDrawdownPct = Math.max(maxDrawdownPct, oos.maxDrawdownPercent);
      totalDegradation += w.degradationPct;
      oosReturns.push(oos.totalReturnPercent);
    }

    const oosReturnPct = (combinedReturn - 1) * 100;
    const oosWinRate = totalWins + totalLosses > 0
      ? (totalWins / (totalWins + totalLosses)) * 100
      : 0;
    const avgDegradation = totalDegradation / windows.length;

    // Calculate OOS Sharpe (simplified)
    const avgReturn = oosReturns.reduce((a, b) => a + b, 0) / oosReturns.length;
    const stdDev = oosReturns.length > 1
      ? Math.sqrt(
          oosReturns.reduce((sum, r) => sum + Math.pow(r - avgReturn, 2), 0) /
          (oosReturns.length - 1)
        )
      : 1;
    const oosSharpe = stdDev > 0 ? (avgReturn / stdDev) * Math.sqrt(oosReturns.length) : 0;

    // Check for overfitting
    const overfitReasons: string[] = [];
    const overfitWindows = windows.filter((w) => w.isOverfit).length;

    if (overfitWindows > windows.length * 0.5) {
      overfitReasons.push(
        `${overfitWindows}/${windows.length} windows show overfitting (>50%)`
      );
    }
    if (avgDegradation > 50) {
      overfitReasons.push(
        `Average OOS degradation is ${avgDegradation.toFixed(1)}% (>50%)`
      );
    }
    if (oosSharpe > this.config.maxSharpeThreshold) {
      overfitReasons.push(
        `OOS Sharpe of ${oosSharpe.toFixed(2)} exceeds ${this.config.maxSharpeThreshold} — suspiciously high`
      );
    }

    const isOverfit = overfitReasons.length > 0;
    const passesMinTrades = totalTrades >= this.config.minTrades;

    // Final verdict
    let verdict: "PASS" | "FAIL" | "WARNING";
    let verdictReason: string;

    if (isOverfit) {
      verdict = "FAIL";
      verdictReason = `Overfitting detected: ${overfitReasons.join("; ")}`;
    } else if (!passesMinTrades) {
      verdict = "WARNING";
      verdictReason = `Only ${totalTrades} trades across OOS windows (need ${this.config.minTrades}+). Results not statistically significant.`;
    } else if (oosReturnPct < 0) {
      verdict = "FAIL";
      verdictReason = `Strategy is unprofitable in out-of-sample testing (${oosReturnPct.toFixed(2)}%)`;
    } else if (avgDegradation > 30) {
      verdict = "WARNING";
      verdictReason = `Strategy profitable but significant IS-to-OOS degradation (${avgDegradation.toFixed(1)}%). Consider simpler parameters.`;
    } else {
      verdict = "PASS";
      verdictReason = `Strategy validated: ${oosReturnPct.toFixed(2)}% OOS return, ${oosWinRate.toFixed(1)}% win rate, ${totalTrades} trades across ${windows.length} windows.`;
    }

    return {
      totalTrades,
      oosWinRate,
      oosReturnPct,
      oosSharpe,
      oosMaxDrawdownPct: maxDrawdownPct,
      avgDegradation,
      isOverfit,
      overfitReasons,
      passesMinTrades,
      verdict,
      verdictReason,
    };
  }

  /**
   * Print a human-readable report of walk-forward results.
   */
  static formatReport(result: WalkForwardResult): string {
    const lines: string[] = [];
    const { aggregate, windows } = result;

    lines.push("═══════════════════════════════════════════════════════");
    lines.push(`  WALK-FORWARD ANALYSIS: ${result.strategyName}`);
    lines.push(`  Symbol: ${result.symbol} | Windows: ${windows.length}`);
    lines.push("═══════════════════════════════════════════════════════");
    lines.push("");

    // Verdict
    const icon = aggregate.verdict === "PASS" ? "[PASS]" :
                 aggregate.verdict === "WARNING" ? "[WARN]" : "[FAIL]";
    lines.push(`  ${icon} ${aggregate.verdictReason}`);
    lines.push("");

    // Aggregate metrics
    lines.push("  OOS AGGREGATE METRICS:");
    lines.push(`    Total Return:    ${aggregate.oosReturnPct.toFixed(2)}%`);
    lines.push(`    Win Rate:        ${aggregate.oosWinRate.toFixed(1)}%`);
    lines.push(`    Total Trades:    ${aggregate.totalTrades}`);
    lines.push(`    Sharpe Ratio:    ${aggregate.oosSharpe.toFixed(2)}`);
    lines.push(`    Max Drawdown:    ${aggregate.oosMaxDrawdownPct.toFixed(2)}%`);
    lines.push(`    Avg Degradation: ${aggregate.avgDegradation.toFixed(1)}%`);
    lines.push("");

    // Per-window breakdown
    lines.push("  WINDOW BREAKDOWN:");
    lines.push("  ─────────────────────────────────────────────────────");
    lines.push("  Window  | IS Return  | OOS Return | Degradation | Flag");
    lines.push("  ─────────────────────────────────────────────────────");

    for (const w of windows) {
      const flag = w.isOverfit ? " OVERFIT" : "";
      lines.push(
        `  ${String(w.windowIndex + 1).padStart(6)}  | ` +
        `${w.inSampleResult.totalReturnPercent.toFixed(2).padStart(9)}% | ` +
        `${w.outOfSampleResult.totalReturnPercent.toFixed(2).padStart(9)}% | ` +
        `${w.degradationPct.toFixed(1).padStart(10)}% |${flag}`
      );
    }

    lines.push("  ─────────────────────────────────────────────────────");
    lines.push("");

    if (aggregate.overfitReasons.length > 0) {
      lines.push("  OVERFITTING WARNINGS:");
      for (const reason of aggregate.overfitReasons) {
        lines.push(`    - ${reason}`);
      }
      lines.push("");
    }

    lines.push("═══════════════════════════════════════════════════════");

    return lines.join("\n");
  }
}
