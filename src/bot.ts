import { config } from "dotenv";
import { futuresClient } from "./api/futures-client.js";
import { RiskManager } from "./risk/risk-manager.js";
import { analyzeTrend, detectRegime } from "./strategies/trend-strategy.js";
import { fundingMonitor } from "./strategies/funding-monitor.js";
import { TradingTelegramBot } from "./telegram/bot.js";
import type { Candle } from "./backtest/backtester.js";
import type { TrendSignal } from "./strategies/trend-strategy.js";

config();

// ============================================
// CONFIGURATION
// ============================================

interface BotConfig {
  pairs: string[];
  interval: string;          // Candle interval (default: "60" = 1h)
  leverage: number;          // Default leverage (default: 3)
  scanIntervalMs: number;    // How often to check for signals (default: 60s)
  startingEquity: number;    // Starting capital (default: 200)
  dryRun: boolean;           // Paper trading mode (default: true)
}

const DEFAULT_BOT_CONFIG: BotConfig = {
  pairs: ["BTCUSDT", "ETHUSDT"],
  interval: "60",
  leverage: 3,
  scanIntervalMs: 60_000,
  startingEquity: 200,
  dryRun: true,
};

// ============================================
// TRADING BOT
// ============================================

class TradingBot {
  private config: BotConfig;
  private risk: RiskManager;
  private telegram: TradingTelegramBot | null = null;
  private running = false;
  private startTime: Date;
  private scanTimer: ReturnType<typeof setInterval> | null = null;
  private summaryTimer: ReturnType<typeof setInterval> | null = null;
  private tradeCount = 0;
  private winCount = 0;

  constructor(config: Partial<BotConfig> = {}) {
    this.config = { ...DEFAULT_BOT_CONFIG, ...config };
    this.startTime = new Date();

    // Initialize risk manager
    this.risk = new RiskManager(this.config.startingEquity);

    // Register kill switch handler
    this.risk.registerKillSwitchHandler(async () => {
      console.error("[BOT] Kill switch triggered — closing all positions");

      if (!this.config.dryRun) {
        const result = await futuresClient.closeAllPositions();
        console.log("[BOT] Closed:", result.closed);
        if (result.errors.length > 0) console.error("[BOT] Errors:", result.errors);
      }

      this.telegram?.sendDrawdownWarning(
        "total",
        this.risk.getCurrentDrawdown().percent * 100,
        this.risk.getState().currentEquity
      );
    });
  }

  // ============================================
  // LIFECYCLE
  // ============================================

  async start(): Promise<void> {
    console.log("═══════════════════════════════════════════════════════");
    console.log("  BYBIT TRADING BOT");
    console.log(`  Mode: ${this.config.dryRun ? "DRY RUN (Paper Trading)" : "LIVE"}`);
    console.log(`  Pairs: ${this.config.pairs.join(", ")}`);
    console.log(`  Leverage: ${this.config.leverage}x`);
    console.log(`  Equity: $${this.config.startingEquity}`);
    console.log(`  Scan interval: ${this.config.scanIntervalMs / 1000}s`);
    console.log("═══════════════════════════════════════════════════════");

    this.running = true;

    // Initialize Telegram bot if token is set
    if (process.env.TELEGRAM_BOT_TOKEN) {
      try {
        this.telegram = new TradingTelegramBot();
        this.telegram.registerStatusCallback(() => this.getStatus());
        this.telegram.registerKillCallback(() => this.killAll());
        console.log("[BOT] Telegram bot connected");
      } catch (error) {
        console.warn("[BOT] Telegram not configured:", error);
      }
    } else {
      console.log("[BOT] Telegram not configured (set TELEGRAM_BOT_TOKEN to enable)");
    }

    // Set leverage for all pairs (live mode only)
    if (!this.config.dryRun) {
      for (const pair of this.config.pairs) {
        try {
          const lev = this.config.leverage.toString();
          await futuresClient.setLeverage(pair, lev, lev);
          console.log(`[BOT] Set ${pair} leverage to ${this.config.leverage}x`);
        } catch (error: any) {
          // Ignore "leverage not changed" errors
          if (!error.message?.includes("110043")) {
            console.warn(`[BOT] Failed to set leverage for ${pair}:`, error);
          }
        }
      }
    }

    // Start heartbeat
    this.risk.startHeartbeatMonitor();

    // Send startup message
    this.telegram?.sendStartupMessage(
      this.config.startingEquity,
      this.config.pairs
    );

    // Run first scan immediately
    await this.scanAll();

    // Start periodic scanning
    this.scanTimer = setInterval(() => {
      this.risk.heartbeat(); // Keep alive
      this.scanAll().catch((err) => console.error("[BOT] Scan error:", err));
    }, this.config.scanIntervalMs);

    // Daily summary at midnight UTC
    this.summaryTimer = setInterval(() => {
      const now = new Date();
      if (now.getUTCHours() === 0 && now.getUTCMinutes() === 0) {
        const state = this.risk.getState();
        this.telegram?.sendDailySummary(
          state.currentEquity,
          state.dailyPnL,
          this.tradeCount,
          this.tradeCount > 0 ? (this.winCount / this.tradeCount) * 100 : 0
        );
      }
    }, 60_000);

    console.log("[BOT] Started. Scanning for signals...\n");

    // Keep running
    await new Promise<void>((resolve) => {
      const shutdown = () => {
        console.log("\n[BOT] Shutting down...");
        this.stop();
        resolve();
      };

      process.on("SIGINT", shutdown);
      process.on("SIGTERM", shutdown);
    });
  }

  stop(): void {
    this.running = false;

    if (this.scanTimer) clearInterval(this.scanTimer);
    if (this.summaryTimer) clearInterval(this.summaryTimer);

    this.risk.stopHeartbeatMonitor();
    this.telegram?.stop();

    console.log("[BOT] Stopped.");
  }

  // ============================================
  // CORE SCANNING LOOP
  // ============================================

  private async scanAll(): Promise<void> {
    if (!this.risk.isTradeAllowed()) {
      console.log(`[BOT] Trading halted: ${this.risk.getState().haltReason}`);
      return;
    }

    for (const pair of this.config.pairs) {
      try {
        await this.analyzePair(pair);
      } catch (error) {
        console.error(`[BOT] Error analyzing ${pair}:`, error);
      }
    }

    // Log funding rates every scan
    try {
      const rates = await futuresClient.getTopFundingRates(this.config.pairs);
      const rateStr = rates
        .map((r) => `${r.symbol}: ${(r.rate * 100).toFixed(4)}%`)
        .join(" | ");
      console.log(`[FUNDING] ${rateStr}`);
    } catch {
      // Non-critical
    }
  }

  private async analyzePair(symbol: string): Promise<void> {
    // Fetch candles
    const klines = await futuresClient.getKlines(symbol, this.config.interval, 200);
    const candles: Candle[] = klines
      .map((k) => ({
        timestamp: parseInt(k[0]),
        open: parseFloat(k[1]),
        high: parseFloat(k[2]),
        low: parseFloat(k[3]),
        close: parseFloat(k[4]),
        volume: parseFloat(k[5]),
      }))
      .reverse();

    const currentPrice = candles[candles.length - 1].close;

    // Run trend analysis
    const signal = analyzeTrend(candles, {
      leverage: this.config.leverage,
    });

    // Get current position state
    const existingPosition = this.risk.getState().positions
      .find((p) => p.symbol === symbol);

    // Process signal
    await this.processSignal(symbol, signal, currentPrice, existingPosition);
  }

  private async processSignal(
    symbol: string,
    signal: TrendSignal,
    currentPrice: number,
    existingPosition: any
  ): Promise<void> {
    const timestamp = new Date().toISOString().slice(11, 19);

    // Log every signal
    if (signal.action !== "HOLD") {
      console.log(
        `[${timestamp}] ${symbol} | ${signal.action} | ` +
        `ADX: ${signal.adxValue.toFixed(1)} | ` +
        `Regime: ${signal.regime} | ` +
        `Confidence: ${signal.confidence}% | ` +
        `${signal.reason}`
      );
    } else {
      // Quieter log for holds
      const regime = signal.regime;
      const adx = signal.adxValue.toFixed(1);
      console.log(
        `[${timestamp}] ${symbol} | HOLD | Regime: ${regime} (ADX ${adx})`
      );
    }

    // === ENTRY SIGNALS ===

    if (signal.action === "LONG" && !existingPosition) {
      const sizing = this.risk.calculateSimplePositionSize(
        currentPrice,
        signal.stopLoss || currentPrice * 0.95,
        this.config.leverage
      );

      const check = this.risk.checkTrade(
        symbol, "long", sizing.quantity, currentPrice, this.config.leverage
      );

      if (!check.allowed) {
        console.log(`[RISK] Trade blocked: ${check.reason}`);
        return;
      }

      const qty = check.adjustedQty;

      if (this.config.dryRun) {
        console.log(
          `[DRY RUN] LONG ${symbol} | Qty: ${qty.toFixed(6)} | ` +
          `Price: $${currentPrice.toFixed(2)} | ` +
          `SL: $${signal.stopLoss?.toFixed(2) || "N/A"} | TP: $${signal.takeProfit?.toFixed(2) || "N/A"}`
        );
      } else {
        // Place real order
        try {
          await futuresClient.placeOrder({
            symbol,
            side: "Buy",
            orderType: "Market",
            qty: qty.toFixed(6),
            stopLoss: signal.stopLoss?.toFixed(2),
            takeProfit: signal.takeProfit?.toFixed(2),
          });
          console.log(`[LIVE] LONG ${symbol} executed`);
        } catch (error) {
          console.error(`[LIVE] Order failed:`, error);
          return;
        }
      }

      // Track position in risk manager
      this.risk.openPosition(
        symbol, "long", currentPrice, qty,
        this.config.leverage, signal.stopLoss, signal.takeProfit
      );

      // Send alert
      this.telegram?.sendTradeAlert({
        symbol,
        action: "LONG",
        price: currentPrice,
        quantity: qty,
        leverage: this.config.leverage,
        stopLoss: signal.stopLoss,
        takeProfit: signal.takeProfit,
        reason: signal.reason,
        confidence: signal.confidence,
      });

      this.tradeCount++;
    }

    if (signal.action === "SHORT" && !existingPosition) {
      const sizing = this.risk.calculateSimplePositionSize(
        currentPrice,
        signal.stopLoss || currentPrice * 1.05,
        this.config.leverage
      );

      const check = this.risk.checkTrade(
        symbol, "short", sizing.quantity, currentPrice, this.config.leverage
      );

      if (!check.allowed) {
        console.log(`[RISK] Trade blocked: ${check.reason}`);
        return;
      }

      const qty = check.adjustedQty;

      if (this.config.dryRun) {
        console.log(
          `[DRY RUN] SHORT ${symbol} | Qty: ${qty.toFixed(6)} | ` +
          `Price: $${currentPrice.toFixed(2)} | ` +
          `SL: $${signal.stopLoss?.toFixed(2) || "N/A"} | TP: $${signal.takeProfit?.toFixed(2) || "N/A"}`
        );
      } else {
        try {
          await futuresClient.placeOrder({
            symbol,
            side: "Sell",
            orderType: "Market",
            qty: qty.toFixed(6),
            stopLoss: signal.stopLoss?.toFixed(2),
            takeProfit: signal.takeProfit?.toFixed(2),
          });
          console.log(`[LIVE] SHORT ${symbol} executed`);
        } catch (error) {
          console.error(`[LIVE] Order failed:`, error);
          return;
        }
      }

      this.risk.openPosition(
        symbol, "short", currentPrice, qty,
        this.config.leverage, signal.stopLoss, signal.takeProfit
      );

      this.telegram?.sendTradeAlert({
        symbol,
        action: "SHORT",
        price: currentPrice,
        quantity: qty,
        leverage: this.config.leverage,
        stopLoss: signal.stopLoss,
        takeProfit: signal.takeProfit,
        reason: signal.reason,
        confidence: signal.confidence,
      });

      this.tradeCount++;
    }

    // === EXIT SIGNALS ===

    if (signal.action === "CLOSE_LONG" && existingPosition?.side === "long") {
      const pnl = this.risk.closePosition(symbol, currentPrice);

      if (!this.config.dryRun) {
        try {
          await futuresClient.placeOrder({
            symbol,
            side: "Sell",
            orderType: "Market",
            qty: existingPosition.quantity.toFixed(6),
            reduceOnly: true,
          });
        } catch (error) {
          console.error(`[LIVE] Close failed:`, error);
        }
      }

      const pnlStr = pnl >= 0 ? `+$${pnl.toFixed(2)}` : `-$${Math.abs(pnl).toFixed(2)}`;
      console.log(`[${this.config.dryRun ? "DRY RUN" : "LIVE"}] CLOSE LONG ${symbol} | P&L: ${pnlStr}`);

      this.telegram?.sendTradeAlert({
        symbol,
        action: "CLOSE_LONG",
        price: currentPrice,
        quantity: existingPosition.quantity,
        leverage: this.config.leverage,
        stopLoss: null,
        takeProfit: null,
        reason: `${signal.reason} | P&L: ${pnlStr}`,
        confidence: signal.confidence,
      });

      if (pnl > 0) this.winCount++;
      this.tradeCount++;
    }

    if (signal.action === "CLOSE_SHORT" && existingPosition?.side === "short") {
      const pnl = this.risk.closePosition(symbol, currentPrice);

      if (!this.config.dryRun) {
        try {
          await futuresClient.placeOrder({
            symbol,
            side: "Buy",
            orderType: "Market",
            qty: existingPosition.quantity.toFixed(6),
            reduceOnly: true,
          });
        } catch (error) {
          console.error(`[LIVE] Close failed:`, error);
        }
      }

      const pnlStr = pnl >= 0 ? `+$${pnl.toFixed(2)}` : `-$${Math.abs(pnl).toFixed(2)}`;
      console.log(`[${this.config.dryRun ? "DRY RUN" : "LIVE"}] CLOSE SHORT ${symbol} | P&L: ${pnlStr}`);

      this.telegram?.sendTradeAlert({
        symbol,
        action: "CLOSE_SHORT",
        price: currentPrice,
        quantity: existingPosition.quantity,
        leverage: this.config.leverage,
        stopLoss: null,
        takeProfit: null,
        reason: `${signal.reason} | P&L: ${pnlStr}`,
        confidence: signal.confidence,
      });

      if (pnl > 0) this.winCount++;
      this.tradeCount++;
    }
  }

  // ============================================
  // KILL SWITCH
  // ============================================

  private async killAll(): Promise<{ closed: string[]; errors: string[] }> {
    console.error("[BOT] KILL SWITCH — closing all positions");
    await this.risk.triggerKillSwitch("Manual kill via Telegram");

    if (this.config.dryRun) {
      // Clear all tracked positions
      const state = this.risk.getState();
      const closed = state.positions.map(
        (p) => `${p.symbol} ${p.side} ${p.quantity.toFixed(6)} (dry run)`
      );
      return { closed, errors: [] };
    }

    return futuresClient.closeAllPositions();
  }

  // ============================================
  // STATUS
  // ============================================

  private getStatus() {
    const state = this.risk.getState();
    return {
      isRunning: this.running,
      uptime: Date.now() - this.startTime.getTime(),
      currentEquity: state.currentEquity,
      dailyPnL: state.dailyPnL,
      weeklyPnL: state.weeklyPnL,
      totalPnL: state.totalPnL,
      openPositions: state.positions.length,
      isHalted: state.isHalted,
      haltReason: state.haltReason,
      lastHeartbeat: state.lastHeartbeat,
      activePairs: state.positions.map((p) => p.symbol),
    };
  }
}

// ============================================
// ENTRY POINT
// ============================================

const bot = new TradingBot({
  pairs: (process.env.BOT_PAIRS || "BTCUSDT,ETHUSDT").split(","),
  interval: process.env.BOT_INTERVAL || "60",
  leverage: parseInt(process.env.BOT_LEVERAGE || "3"),
  scanIntervalMs: parseInt(process.env.BOT_SCAN_INTERVAL || "60000"),
  startingEquity: parseFloat(process.env.BOT_EQUITY || "200"),
  dryRun: process.env.BOT_LIVE !== "true",
});

bot.start().catch((err) => {
  console.error("Bot crashed:", err);
  process.exit(1);
});
