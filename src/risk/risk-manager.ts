import { bybitClient } from "../api/bybit-client.js";
import { config } from "dotenv";

config();

// ============================================
// RISK MANAGEMENT CONFIGURATION
// ============================================

export interface RiskConfig {
  // Per-trade limits
  maxRiskPerTrade: number;         // Max % of equity risked per trade (default: 2%)
  kellyFraction: number;           // Quarter-Kelly multiplier (default: 0.25)

  // Drawdown circuit breakers
  dailyDrawdownLimit: number;      // Daily loss % that triggers halt (default: -3%)
  weeklyDrawdownLimit: number;     // Weekly loss % that reduces size (default: -7%)
  totalDrawdownLimit: number;      // Total loss % that triggers kill switch (default: -15%)
  weeklyReductionFactor: number;   // Position size reduction on weekly breach (default: 0.5)

  // Position limits
  maxConcurrentPositions: number;  // Max open positions (default: 5)
  maxSingleAssetPct: number;       // Max % of portfolio in one asset (default: 25%)

  // Heartbeat / dead man's switch
  heartbeatIntervalMs: number;     // Expected heartbeat interval (default: 5 min)
  heartbeatTimeoutMs: number;      // Kill if no heartbeat for this long (default: 5 min)
}

export const DEFAULT_RISK_CONFIG: RiskConfig = {
  maxRiskPerTrade: 0.02,
  kellyFraction: 0.25,
  dailyDrawdownLimit: -0.03,
  weeklyDrawdownLimit: -0.07,
  totalDrawdownLimit: -0.15,
  weeklyReductionFactor: 0.5,
  maxConcurrentPositions: 5,
  maxSingleAssetPct: 0.25,
  heartbeatIntervalMs: 5 * 60 * 1000,
  heartbeatTimeoutMs: 5 * 60 * 1000,
};

// ============================================
// STATE TRACKING
// ============================================

export interface PositionState {
  symbol: string;
  side: "long" | "short";
  entryPrice: number;
  quantity: number;
  notionalValue: number;
  leverage: number;
  stopLoss: number | null;
  takeProfit: number | null;
  openedAt: Date;
}

export interface EquitySnapshot {
  timestamp: Date;
  equity: number;
}

export interface RiskState {
  startingEquity: number;
  currentEquity: number;
  peakEquity: number;
  positions: Map<string, PositionState>;
  equityHistory: EquitySnapshot[];
  dailyPnL: number;
  weeklyPnL: number;
  totalPnL: number;
  dailyResetAt: Date;
  weeklyResetAt: Date;
  isHalted: boolean;
  haltReason: string | null;
  haltedAt: Date | null;
  lastHeartbeat: Date;
  killSwitchTriggered: boolean;
}

export type RiskCheckResult =
  | { allowed: true; adjustedQty: number; reason: string }
  | { allowed: false; reason: string };

// ============================================
// RISK MANAGER
// ============================================

export class RiskManager {
  private config: RiskConfig;
  private state: RiskState;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private onKillSwitch: (() => Promise<void>) | null = null;

  constructor(startingEquity: number, config: Partial<RiskConfig> = {}) {
    this.config = { ...DEFAULT_RISK_CONFIG, ...config };
    const now = new Date();

    this.state = {
      startingEquity,
      currentEquity: startingEquity,
      peakEquity: startingEquity,
      positions: new Map(),
      equityHistory: [{ timestamp: now, equity: startingEquity }],
      dailyPnL: 0,
      weeklyPnL: 0,
      totalPnL: 0,
      dailyResetAt: this.getNextDailyReset(now),
      weeklyResetAt: this.getNextWeeklyReset(now),
      isHalted: false,
      haltReason: null,
      haltedAt: null,
      lastHeartbeat: now,
      killSwitchTriggered: false,
    };
  }

  // ============================================
  // POSITION SIZING (Quarter-Kelly)
  // ============================================

  /**
   * Calculate position size using Quarter-Kelly criterion.
   * kelly_pct = (win_rate * avg_win - (1 - win_rate) * avg_loss) / avg_win
   * position_size = min(kelly_pct * 0.25 * equity, maxRisk * equity)
   */
  calculatePositionSize(
    winRate: number,
    avgWin: number,
    avgLoss: number,
    currentPrice: number,
    leverage: number = 1
  ): { quantity: number; riskAmount: number; positionValue: number } {
    const equity = this.state.currentEquity;

    // Kelly criterion
    const kellyPct = avgWin > 0
      ? (winRate * avgWin - (1 - winRate) * avgLoss) / avgWin
      : 0;

    // Quarter-Kelly with hard cap
    const riskPct = Math.min(
      Math.max(kellyPct * this.config.kellyFraction, 0),
      this.config.maxRiskPerTrade
    );

    // Apply weekly reduction if breached
    const adjustedRiskPct = this.isWeeklyBreached()
      ? riskPct * this.config.weeklyReductionFactor
      : riskPct;

    const riskAmount = equity * adjustedRiskPct;
    const positionValue = riskAmount * leverage;
    const quantity = positionValue / currentPrice;

    return { quantity, riskAmount, positionValue };
  }

  /**
   * Simple position sizing: fixed % of equity per trade.
   * Used when win rate / avg win data isn't available yet.
   */
  calculateSimplePositionSize(
    currentPrice: number,
    stopLossPrice: number,
    leverage: number = 1
  ): { quantity: number; riskAmount: number; positionValue: number } {
    const equity = this.state.currentEquity;
    const riskPct = this.isWeeklyBreached()
      ? this.config.maxRiskPerTrade * this.config.weeklyReductionFactor
      : this.config.maxRiskPerTrade;

    const riskAmount = equity * riskPct;
    const priceDiff = Math.abs(currentPrice - stopLossPrice);
    const riskPerUnit = priceDiff / currentPrice;

    // Position size = risk amount / risk per unit
    const positionValue = riskPerUnit > 0
      ? riskAmount / riskPerUnit
      : riskAmount;
    const quantity = (positionValue * leverage) / currentPrice;

    return { quantity, riskAmount, positionValue };
  }

  // ============================================
  // PRE-TRADE RISK CHECKS
  // ============================================

  /**
   * Run all pre-trade risk checks before placing an order.
   * Returns whether the trade is allowed and the adjusted quantity.
   */
  checkTrade(
    symbol: string,
    side: "long" | "short",
    quantity: number,
    price: number,
    leverage: number = 1
  ): RiskCheckResult {
    // 1. Kill switch check
    if (this.state.killSwitchTriggered) {
      return { allowed: false, reason: "Kill switch triggered — all trading halted" };
    }

    // 2. Halt check (daily drawdown)
    if (this.state.isHalted) {
      return {
        allowed: false,
        reason: `Trading halted: ${this.state.haltReason}. Resumes at ${this.state.dailyResetAt.toISOString()}`,
      };
    }

    // 3. Max concurrent positions
    if (this.state.positions.size >= this.config.maxConcurrentPositions) {
      const existing = this.state.positions.get(symbol);
      if (!existing) {
        return {
          allowed: false,
          reason: `Max concurrent positions reached (${this.config.maxConcurrentPositions})`,
        };
      }
    }

    // 4. Single asset concentration limit
    const notionalValue = quantity * price;
    const existingPosition = this.state.positions.get(symbol);
    const totalExposure = (existingPosition?.notionalValue || 0) + notionalValue;
    const concentrationPct = totalExposure / this.state.currentEquity;

    if (concentrationPct > this.config.maxSingleAssetPct) {
      const maxAllowed = this.config.maxSingleAssetPct * this.state.currentEquity;
      const allowedNotional = maxAllowed - (existingPosition?.notionalValue || 0);
      if (allowedNotional <= 0) {
        return {
          allowed: false,
          reason: `Single asset limit exceeded (${(concentrationPct * 100).toFixed(1)}% > ${this.config.maxSingleAssetPct * 100}%)`,
        };
      }
      // Reduce quantity to fit within limit
      const adjustedQty = allowedNotional / price;
      return {
        allowed: true,
        adjustedQty: adjustedQty,
        reason: `Quantity reduced to fit ${this.config.maxSingleAssetPct * 100}% concentration limit`,
      };
    }

    // 5. Total drawdown check
    const totalDrawdown = (this.state.currentEquity - this.state.peakEquity) / this.state.peakEquity;
    if (totalDrawdown <= this.config.totalDrawdownLimit) {
      this.triggerKillSwitch("Total drawdown limit breached");
      return { allowed: false, reason: "Total drawdown limit breached — kill switch activated" };
    }

    // All checks passed
    return { allowed: true, adjustedQty: quantity, reason: "All risk checks passed" };
  }

  // ============================================
  // POSITION TRACKING
  // ============================================

  openPosition(
    symbol: string,
    side: "long" | "short",
    entryPrice: number,
    quantity: number,
    leverage: number = 1,
    stopLoss: number | null = null,
    takeProfit: number | null = null
  ): void {
    this.state.positions.set(symbol, {
      symbol,
      side,
      entryPrice,
      quantity,
      notionalValue: quantity * entryPrice,
      leverage,
      stopLoss,
      takeProfit,
      openedAt: new Date(),
    });
  }

  closePosition(symbol: string, exitPrice: number): number {
    const position = this.state.positions.get(symbol);
    if (!position) return 0;

    // Calculate P&L
    const priceDiff = position.side === "long"
      ? exitPrice - position.entryPrice
      : position.entryPrice - exitPrice;
    const pnl = priceDiff * position.quantity * position.leverage;

    // Update equity and P&L tracking
    this.state.currentEquity += pnl;
    this.state.dailyPnL += pnl;
    this.state.weeklyPnL += pnl;
    this.state.totalPnL += pnl;

    // Update peak
    if (this.state.currentEquity > this.state.peakEquity) {
      this.state.peakEquity = this.state.currentEquity;
    }

    // Record equity snapshot
    this.state.equityHistory.push({
      timestamp: new Date(),
      equity: this.state.currentEquity,
    });

    // Remove position
    this.state.positions.delete(symbol);

    // Check drawdown limits after closing
    this.checkDrawdownLimits();

    return pnl;
  }

  // ============================================
  // DRAWDOWN MONITORING
  // ============================================

  private checkDrawdownLimits(): void {
    this.checkPeriodResets();

    // Daily drawdown check
    const dailyDrawdownPct = this.state.dailyPnL / this.state.currentEquity;
    if (dailyDrawdownPct <= this.config.dailyDrawdownLimit && !this.state.isHalted) {
      this.state.isHalted = true;
      this.state.haltReason = `Daily drawdown limit breached (${(dailyDrawdownPct * 100).toFixed(1)}%)`;
      this.state.haltedAt = new Date();
      console.error(`[RISK] HALT: ${this.state.haltReason}`);
    }

    // Total drawdown check
    const totalDrawdown = (this.state.currentEquity - this.state.peakEquity) / this.state.peakEquity;
    if (totalDrawdown <= this.config.totalDrawdownLimit) {
      this.triggerKillSwitch(`Total drawdown ${(totalDrawdown * 100).toFixed(1)}% exceeds limit`);
    }
  }

  private isWeeklyBreached(): boolean {
    const weeklyDrawdownPct = this.state.weeklyPnL / this.state.currentEquity;
    return weeklyDrawdownPct <= this.config.weeklyDrawdownLimit;
  }

  private checkPeriodResets(): void {
    const now = new Date();

    // Daily reset
    if (now >= this.state.dailyResetAt) {
      this.state.dailyPnL = 0;
      this.state.dailyResetAt = this.getNextDailyReset(now);
      if (this.state.isHalted && !this.state.killSwitchTriggered) {
        this.state.isHalted = false;
        this.state.haltReason = null;
        this.state.haltedAt = null;
        console.log("[RISK] Daily halt lifted — trading resumed");
      }
    }

    // Weekly reset
    if (now >= this.state.weeklyResetAt) {
      this.state.weeklyPnL = 0;
      this.state.weeklyResetAt = this.getNextWeeklyReset(now);
      console.log("[RISK] Weekly P&L reset");
    }
  }

  // ============================================
  // KILL SWITCH
  // ============================================

  /**
   * Emergency: close all positions, cancel all orders, enter read-only mode.
   */
  async triggerKillSwitch(reason: string): Promise<void> {
    if (this.state.killSwitchTriggered) return;

    this.state.killSwitchTriggered = true;
    this.state.isHalted = true;
    this.state.haltReason = `KILL SWITCH: ${reason}`;
    this.state.haltedAt = new Date();

    console.error(`\n[RISK] *** KILL SWITCH ACTIVATED ***`);
    console.error(`[RISK] Reason: ${reason}`);
    console.error(`[RISK] Time: ${new Date().toISOString()}`);
    console.error(`[RISK] Equity: $${this.state.currentEquity.toFixed(2)}`);
    console.error(`[RISK] Total P&L: $${this.state.totalPnL.toFixed(2)}`);

    // Execute the kill callback if registered
    if (this.onKillSwitch) {
      try {
        await this.onKillSwitch();
      } catch (error) {
        console.error("[RISK] Kill switch callback error:", error);
      }
    }
  }

  /**
   * Register a callback that runs when kill switch is triggered.
   * Typically: cancel all orders + close all positions on exchange.
   */
  registerKillSwitchHandler(handler: () => Promise<void>): void {
    this.onKillSwitch = handler;
  }

  /**
   * Manual reset of kill switch (requires explicit operator action).
   */
  resetKillSwitch(newEquity?: number): void {
    this.state.killSwitchTriggered = false;
    this.state.isHalted = false;
    this.state.haltReason = null;
    this.state.haltedAt = null;
    if (newEquity !== undefined) {
      this.state.currentEquity = newEquity;
      this.state.peakEquity = newEquity;
    }
    console.log("[RISK] Kill switch manually reset");
  }

  // ============================================
  // DEAD MAN'S SWITCH (HEARTBEAT)
  // ============================================

  /**
   * Start the heartbeat monitor. If no heartbeat is received within
   * the timeout period, trigger kill switch automatically.
   */
  startHeartbeatMonitor(): void {
    this.heartbeat(); // Initial heartbeat

    this.heartbeatTimer = setInterval(() => {
      const elapsed = Date.now() - this.state.lastHeartbeat.getTime();
      if (elapsed > this.config.heartbeatTimeoutMs) {
        console.error(`[RISK] Heartbeat timeout! Last: ${this.state.lastHeartbeat.toISOString()}`);
        this.triggerKillSwitch("Dead man's switch — heartbeat timeout");
      }
    }, 30_000); // Check every 30 seconds
  }

  /**
   * Send a heartbeat to indicate the bot is still alive.
   */
  heartbeat(): void {
    this.state.lastHeartbeat = new Date();
  }

  /**
   * Stop the heartbeat monitor.
   */
  stopHeartbeatMonitor(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  // ============================================
  // EQUITY UPDATE
  // ============================================

  /**
   * Update equity from exchange balance (call periodically).
   */
  updateEquity(newEquity: number): void {
    const pnlDelta = newEquity - this.state.currentEquity;
    this.state.currentEquity = newEquity;
    this.state.dailyPnL += pnlDelta;
    this.state.weeklyPnL += pnlDelta;
    this.state.totalPnL = newEquity - this.state.startingEquity;

    if (newEquity > this.state.peakEquity) {
      this.state.peakEquity = newEquity;
    }

    this.state.equityHistory.push({
      timestamp: new Date(),
      equity: newEquity,
    });

    // Trim history to last 1000 entries
    if (this.state.equityHistory.length > 1000) {
      this.state.equityHistory = this.state.equityHistory.slice(-1000);
    }

    this.checkDrawdownLimits();
  }

  // ============================================
  // GETTERS
  // ============================================

  getState(): Readonly<Omit<RiskState, "positions"> & { positions: PositionState[] }> {
    return {
      ...this.state,
      positions: Array.from(this.state.positions.values()),
    };
  }

  getCurrentDrawdown(): { amount: number; percent: number } {
    const amount = this.state.currentEquity - this.state.peakEquity;
    const percent = this.state.peakEquity > 0 ? amount / this.state.peakEquity : 0;
    return { amount, percent };
  }

  getMaxDrawdown(): { amount: number; percent: number } {
    let peak = this.state.equityHistory[0]?.equity || this.state.startingEquity;
    let maxDrawdown = 0;

    for (const snapshot of this.state.equityHistory) {
      if (snapshot.equity > peak) peak = snapshot.equity;
      const drawdown = peak - snapshot.equity;
      if (drawdown > maxDrawdown) maxDrawdown = drawdown;
    }

    return {
      amount: maxDrawdown,
      percent: peak > 0 ? maxDrawdown / peak : 0,
    };
  }

  getSharpeRatio(riskFreeRate: number = 0): number {
    if (this.state.equityHistory.length < 2) return 0;

    // Calculate daily returns
    const returns: number[] = [];
    for (let i = 1; i < this.state.equityHistory.length; i++) {
      const ret =
        (this.state.equityHistory[i].equity - this.state.equityHistory[i - 1].equity) /
        this.state.equityHistory[i - 1].equity;
      returns.push(ret);
    }

    if (returns.length === 0) return 0;

    const avgReturn = returns.reduce((a, b) => a + b, 0) / returns.length;
    const stdDev = Math.sqrt(
      returns.reduce((sum, r) => sum + Math.pow(r - avgReturn, 2), 0) / returns.length
    );

    if (stdDev === 0) return 0;

    // Annualize (assuming ~365 data points per year for crypto)
    return ((avgReturn - riskFreeRate) / stdDev) * Math.sqrt(365);
  }

  isTradeAllowed(): boolean {
    return !this.state.isHalted && !this.state.killSwitchTriggered;
  }

  // ============================================
  // HELPERS
  // ============================================

  private getNextDailyReset(from: Date): Date {
    const reset = new Date(from);
    reset.setUTCHours(0, 0, 0, 0);
    reset.setUTCDate(reset.getUTCDate() + 1);
    return reset;
  }

  private getNextWeeklyReset(from: Date): Date {
    const reset = new Date(from);
    const day = reset.getUTCDay();
    const daysUntilMonday = day === 0 ? 1 : 8 - day;
    reset.setUTCDate(reset.getUTCDate() + daysUntilMonday);
    reset.setUTCHours(0, 0, 0, 0);
    return reset;
  }
}
