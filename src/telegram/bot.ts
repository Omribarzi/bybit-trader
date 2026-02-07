import TelegramBot from "node-telegram-bot-api";
import { config } from "dotenv";

config();

// ============================================
// TYPES
// ============================================

export interface BotStatus {
  isRunning: boolean;
  uptime: number;
  currentEquity: number;
  dailyPnL: number;
  weeklyPnL: number;
  totalPnL: number;
  openPositions: number;
  isHalted: boolean;
  haltReason: string | null;
  lastHeartbeat: Date;
  activePairs: string[];
}

export interface TradeAlert {
  symbol: string;
  action: "LONG" | "SHORT" | "CLOSE_LONG" | "CLOSE_SHORT";
  price: number;
  quantity: number;
  leverage: number;
  stopLoss: number | null;
  takeProfit: number | null;
  reason: string;
  confidence: number;
}

type StatusCallback = () => BotStatus;
type KillCallback = () => Promise<{ closed: string[]; errors: string[] }>;

// ============================================
// TELEGRAM TRADING BOT
// ============================================

export class TradingTelegramBot {
  private bot: TelegramBot;
  private chatId: string;
  private getStatus: StatusCallback | null = null;
  private onKill: KillCallback | null = null;
  private startTime: Date;

  constructor() {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    if (!token) {
      throw new Error("TELEGRAM_BOT_TOKEN not set in environment");
    }

    this.chatId = process.env.TELEGRAM_CHAT_ID || "";
    this.bot = new TelegramBot(token, { polling: true });
    this.startTime = new Date();

    this.registerCommands();
  }

  // ============================================
  // COMMAND HANDLERS
  // ============================================

  private registerCommands(): void {
    // /start - Welcome message
    this.bot.onText(/\/start/, (msg) => {
      this.chatId = msg.chat.id.toString();
      this.send(
        "Bybit Trading Bot connected.\n\n" +
        "Commands:\n" +
        "/status - System status & positions\n" +
        "/profit - P&L summary\n" +
        "/positions - Open positions\n" +
        "/kill - EMERGENCY: close all positions\n" +
        "/help - Show commands"
      );
    });

    // /status - Full system status
    this.bot.onText(/\/status/, async (msg) => {
      this.chatId = msg.chat.id.toString();
      if (!this.getStatus) {
        this.send("Bot status not available — status callback not registered");
        return;
      }

      const s = this.getStatus();
      const uptime = this.formatUptime(s.uptime);

      let statusIcon = "🟢";
      if (s.isHalted) statusIcon = "🔴";
      else if (s.dailyPnL < 0) statusIcon = "🟡";

      const lines = [
        `${statusIcon} *Bot Status*`,
        "",
        `Running: ${s.isRunning ? "YES" : "NO"}`,
        `Uptime: ${uptime}`,
        `Halted: ${s.isHalted ? `YES (${s.haltReason})` : "NO"}`,
        "",
        `*Portfolio*`,
        `Equity: $${s.currentEquity.toFixed(2)}`,
        `Open Positions: ${s.openPositions}`,
        `Active Pairs: ${s.activePairs.join(", ") || "none"}`,
        "",
        `*P&L*`,
        `Daily: ${s.dailyPnL >= 0 ? "+" : ""}$${s.dailyPnL.toFixed(2)}`,
        `Weekly: ${s.weeklyPnL >= 0 ? "+" : ""}$${s.weeklyPnL.toFixed(2)}`,
        `Total: ${s.totalPnL >= 0 ? "+" : ""}$${s.totalPnL.toFixed(2)}`,
        "",
        `Last heartbeat: ${s.lastHeartbeat.toISOString()}`,
      ];

      this.send(lines.join("\n"), { parse_mode: "Markdown" });
    });

    // /profit - P&L summary
    this.bot.onText(/\/profit/, (msg) => {
      this.chatId = msg.chat.id.toString();
      if (!this.getStatus) {
        this.send("Not available");
        return;
      }

      const s = this.getStatus();
      const totalPct = s.currentEquity > 0
        ? ((s.totalPnL / (s.currentEquity - s.totalPnL)) * 100).toFixed(2)
        : "0.00";

      const lines = [
        "*P&L Report*",
        "",
        `Equity: $${s.currentEquity.toFixed(2)}`,
        `Daily P&L: ${s.dailyPnL >= 0 ? "+" : ""}$${s.dailyPnL.toFixed(2)}`,
        `Weekly P&L: ${s.weeklyPnL >= 0 ? "+" : ""}$${s.weeklyPnL.toFixed(2)}`,
        `Total P&L: ${s.totalPnL >= 0 ? "+" : ""}$${s.totalPnL.toFixed(2)} (${totalPct}%)`,
      ];

      this.send(lines.join("\n"), { parse_mode: "Markdown" });
    });

    // /positions - Open positions detail
    this.bot.onText(/\/positions/, (msg) => {
      this.chatId = msg.chat.id.toString();
      if (!this.getStatus) {
        this.send("Not available");
        return;
      }

      const s = this.getStatus();
      if (s.openPositions === 0) {
        this.send("No open positions.");
        return;
      }

      this.send(`${s.openPositions} open position(s) on: ${s.activePairs.join(", ")}`);
    });

    // /kill - EMERGENCY close all
    this.bot.onText(/\/kill/, async (msg) => {
      this.chatId = msg.chat.id.toString();

      if (!this.onKill) {
        this.send("Kill switch not configured.");
        return;
      }

      this.send("KILL SWITCH ACTIVATED\nClosing all positions...");

      try {
        const result = await this.onKill();

        const lines = ["*Kill Switch Result*", ""];

        if (result.closed.length > 0) {
          lines.push("Closed:");
          result.closed.forEach((c) => lines.push(`  ${c}`));
        } else {
          lines.push("No positions to close.");
        }

        if (result.errors.length > 0) {
          lines.push("", "Errors:");
          result.errors.forEach((e) => lines.push(`  ${e}`));
        }

        this.send(lines.join("\n"), { parse_mode: "Markdown" });
      } catch (error) {
        this.send(`Kill switch error: ${error}`);
      }
    });

    // /help
    this.bot.onText(/\/help/, (msg) => {
      this.chatId = msg.chat.id.toString();
      this.send(
        "*Commands*\n\n" +
        "/status - System status & positions\n" +
        "/profit - P&L summary\n" +
        "/positions - Open positions\n" +
        "/kill - EMERGENCY close all positions\n" +
        "/help - This message",
        { parse_mode: "Markdown" }
      );
    });
  }

  // ============================================
  // CALLBACKS
  // ============================================

  registerStatusCallback(cb: StatusCallback): void {
    this.getStatus = cb;
  }

  registerKillCallback(cb: KillCallback): void {
    this.onKill = cb;
  }

  // ============================================
  // ALERTS / NOTIFICATIONS
  // ============================================

  async sendTradeAlert(alert: TradeAlert): Promise<void> {
    const icon = alert.action.includes("LONG") || alert.action === "CLOSE_SHORT"
      ? "🟢" : "🔴";

    const lines = [
      `${icon} *Trade: ${alert.action}*`,
      "",
      `Symbol: ${alert.symbol}`,
      `Price: $${alert.price.toFixed(2)}`,
      `Qty: ${alert.quantity.toFixed(6)}`,
      `Leverage: ${alert.leverage}x`,
      alert.stopLoss ? `SL: $${alert.stopLoss.toFixed(2)}` : "",
      alert.takeProfit ? `TP: $${alert.takeProfit.toFixed(2)}` : "",
      "",
      `Confidence: ${alert.confidence}%`,
      `Reason: ${alert.reason}`,
    ].filter(Boolean);

    await this.send(lines.join("\n"), { parse_mode: "Markdown" });
  }

  async sendDrawdownWarning(
    type: "daily" | "weekly" | "total",
    drawdownPct: number,
    equity: number
  ): Promise<void> {
    const icons = { daily: "⚠️", weekly: "🚨", total: "💀" };
    const labels = { daily: "Daily", weekly: "Weekly", total: "TOTAL" };

    await this.send(
      `${icons[type]} *${labels[type]} Drawdown Alert*\n\n` +
      `Drawdown: ${drawdownPct.toFixed(2)}%\n` +
      `Equity: $${equity.toFixed(2)}\n\n` +
      (type === "daily" ? "Trading halted for 24h." :
       type === "weekly" ? "Position sizes reduced by 50%." :
       "KILL SWITCH ACTIVATED. All positions closed."),
      { parse_mode: "Markdown" }
    );
  }

  async sendHeartbeatTimeout(): Promise<void> {
    await this.send(
      "💀 *DEAD MAN'S SWITCH*\n\n" +
      "Bot heartbeat timeout! Kill switch activated.\n" +
      "All positions being closed.\n\n" +
      "Check the bot immediately.",
      { parse_mode: "Markdown" }
    );
  }

  async sendDailySummary(
    equity: number,
    dailyPnL: number,
    tradesCount: number,
    winRate: number
  ): Promise<void> {
    const pnlIcon = dailyPnL >= 0 ? "📈" : "📉";

    await this.send(
      `${pnlIcon} *Daily Summary*\n\n` +
      `Equity: $${equity.toFixed(2)}\n` +
      `Daily P&L: ${dailyPnL >= 0 ? "+" : ""}$${dailyPnL.toFixed(2)}\n` +
      `Trades: ${tradesCount}\n` +
      `Win Rate: ${winRate.toFixed(1)}%`,
      { parse_mode: "Markdown" }
    );
  }

  async sendStartupMessage(equity: number, pairs: string[]): Promise<void> {
    await this.send(
      "🚀 *Bot Started*\n\n" +
      `Equity: $${equity.toFixed(2)}\n` +
      `Pairs: ${pairs.join(", ")}\n` +
      `Time: ${new Date().toISOString()}\n\n` +
      "Type /status for full status.",
      { parse_mode: "Markdown" }
    );
  }

  // ============================================
  // CORE SEND
  // ============================================

  private async send(
    text: string,
    options: TelegramBot.SendMessageOptions = {}
  ): Promise<void> {
    if (!this.chatId) {
      console.warn("[Telegram] No chat ID set. Send /start to the bot first.");
      return;
    }

    try {
      await this.bot.sendMessage(this.chatId, text, options);
    } catch (error) {
      console.error("[Telegram] Failed to send message:", error);
    }
  }

  // ============================================
  // LIFECYCLE
  // ============================================

  stop(): void {
    this.bot.stopPolling();
  }

  getChatId(): string {
    return this.chatId;
  }

  // ============================================
  // HELPERS
  // ============================================

  private formatUptime(ms: number): string {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) return `${days}d ${hours % 24}h ${minutes % 60}m`;
    if (hours > 0) return `${hours}h ${minutes % 60}m`;
    return `${minutes}m`;
  }
}
