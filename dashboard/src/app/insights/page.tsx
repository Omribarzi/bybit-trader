"use client";

import { useState } from "react";
import {
  Target,
  Shield,
  TrendingUp,
  Zap,
  Server,
  MessageSquare,
  CheckCircle2,
  Circle,
  AlertTriangle,
  ArrowRight,
  ChevronDown,
  ChevronUp,
  BarChart3,
  Clock,
  DollarSign,
  Activity,
  ArrowLeft,
  Layers,
  Bot,
} from "lucide-react";
import Link from "next/link";

// --- Data Types ---

interface SystemModule {
  id: string;
  name: string;
  description: string;
  status: "complete" | "partial" | "missing";
  icon: React.ReactNode;
  details: string;
  blueprintRef: string;
}

interface RoadmapPhase {
  phase: number;
  title: string;
  timeframe: string;
  status: "done" | "current" | "upcoming";
  tasks: RoadmapTask[];
}

interface RoadmapTask {
  title: string;
  description: string;
  priority: "critical" | "high" | "medium";
  estimatedEffort: string;
  done: boolean;
}

interface GapItem {
  area: string;
  current: string;
  blueprint: string;
  impact: "critical" | "high" | "medium";
  icon: React.ReactNode;
}

// --- Static Data ---

const systemModules: SystemModule[] = [
  {
    id: "exchange",
    name: "Bybit API Integration",
    description: "REST API client with signed requests, testnet support",
    status: "complete",
    icon: <Zap className="w-5 h-5" />,
    details:
      "Full V5 API coverage: market data, account info, order placement/cancellation, WebSocket tick streaming. HMAC-SHA256 signing. Testnet toggle.",
    blueprintRef: "Bybit V5 API recommended as primary exchange",
  },
  {
    id: "data",
    name: "Data Pipeline (TimescaleDB)",
    description: "Hypertables, continuous aggregates, WebSocket collector",
    status: "complete",
    icon: <BarChart3 className="w-5 h-5" />,
    details:
      "Candle storage with 1m/1h/4h/1d aggregates, tick collector via WebSocket, sentiment scoring, trade logging. Compression + retention policies. 5 symbols tracked.",
    blueprintRef: "Tier 1 free data strategy — Binance/Bybit API historical data",
  },
  {
    id: "sentiment",
    name: "Sentiment Analysis Engine",
    description: "Grok-powered X/Twitter sentiment with contrarian signals",
    status: "complete",
    icon: <MessageSquare className="w-5 h-5" />,
    details:
      "Real-time sentiment scoring (-100 to +100), fear/greed labels, contrarian thresholds, trend detection. This goes BEYOND the blueprint — it's a unique edge.",
    blueprintRef: "Not in original blueprint — bonus differentiator",
  },
  {
    id: "dashboard",
    name: "Next.js Trading Dashboard",
    description: "Live market overview, charts, portfolio, trade execution",
    status: "complete",
    icon: <Activity className="w-5 h-5" />,
    details:
      "Price cards, candlestick chart (Recharts), sentiment gauge, signal cards, trade form, order management, portfolio view. Auto-refresh every 30s.",
    blueprintRef: "Monitoring stack — blueprint recommends Telegram + Grafana",
  },
  {
    id: "strategy-sentiment",
    name: "Sentiment + Technical Strategy",
    description: "Combined signal: 60% sentiment / 40% technical (SMA, RSI, EMA)",
    status: "complete",
    icon: <TrendingUp className="w-5 h-5" />,
    details:
      "SMA20/50 trend, RSI overbought/oversold, EMA9 momentum. Combined with sentiment for STRONG_BUY to STRONG_SELL signals. Position sizing 5-20%.",
    blueprintRef: "Blueprint recommends trend-following EMA crossover as Strategy 1",
  },
  {
    id: "strategy-trend",
    name: "Trend Following (EMA Crossover)",
    description: "EMA 10/50 crossover with ADX regime filter, ATR-based stops",
    status: "complete",
    icon: <TrendingUp className="w-5 h-5" />,
    details:
      "Built: EMA 10/50 crossover, ADX > 25 regime filter, ATR-based stop-loss/take-profit, RSI overbought/oversold guard, +DI/-DI directional confirmation. LONG/SHORT/CLOSE signals. Backtester-compatible.",
    blueprintRef: "Strategy 1 — validated systematic strategy with Sharpe 0.5-1.2",
  },
  {
    id: "strategy-funding",
    name: "Funding Rate Monitor",
    description: "Scans top 10 perps for funding arb opportunities",
    status: "complete",
    icon: <DollarSign className="w-5 h-5" />,
    details:
      "Built: Multi-symbol funding rate scanner, consistency analysis (7d history), annualized return calculation, spot vs futures basis tracking, arb P&L calculator. Ready for strategy 2 execution layer.",
    blueprintRef: "Strategy 2 — closest to 'free money', 19.26% avg annual return 2025",
  },
  {
    id: "futures",
    name: "Perpetual Futures Support",
    description: "Full futures client: leverage, positions, funding, emergency close",
    status: "complete",
    icon: <Layers className="w-5 h-5" />,
    details:
      "Built: Full V5 linear (USDT perpetual) client — market data, funding rates, position management, leverage control, TP/SL, order CRUD, emergency closeAllPositions() for kill switch. Supports testnet.",
    blueprintRef: "Entire blueprint is built around perpetual futures — this is foundational",
  },
  {
    id: "risk",
    name: "Risk Management System",
    description: "Quarter-Kelly sizing, drawdown circuit breakers, kill switch, heartbeat",
    status: "complete",
    icon: <Shield className="w-5 h-5" />,
    details:
      "Built: Quarter-Kelly position sizing (2% max risk/trade), daily -3% halt, weekly -7% size reduction (50%), -15% kill switch, 5 max positions, 25% max per asset, dead man's switch (5min heartbeat), Sharpe calculator, equity tracking.",
    blueprintRef: "Blueprint: 'Risk management is the first system you build, not the last'",
  },
  {
    id: "backtesting",
    name: "Walk-Forward Backtesting",
    description: "Rolling IS/OOS windows, overfitting detection, degradation analysis",
    status: "complete",
    icon: <Clock className="w-5 h-5" />,
    details:
      "Built: Walk-forward engine with 6mo IS / 2mo OOS rolling windows, 30-trade minimum, overfitting detection (Sharpe > 3.0 flag, >50% degradation flag), per-window breakdown, PASS/FAIL/WARNING verdict.",
    blueprintRef: "Blueprint mandates walk-forward as primary validation method",
  },
  {
    id: "telegram",
    name: "Telegram Bot Integration",
    description: "/status, /profit, /kill commands + trade alerts + drawdown warnings",
    status: "complete",
    icon: <Bot className="w-5 h-5" />,
    details:
      "Built: Full Telegram bot with /start, /status, /profit, /positions, /kill, /help commands. Trade alerts with entry/exit details, drawdown warnings (daily/weekly/total), dead man's switch alerts, daily P&L summaries, startup notification.",
    blueprintRef: "Blueprint primary monitoring channel — control bot from phone",
  },
  {
    id: "deployment",
    name: "VPS Deployment (Docker)",
    description: "Production docker-compose with bot, DB, tick collector, scheduler",
    status: "complete",
    icon: <Server className="w-5 h-5" />,
    details:
      "Built: Dockerfile + docker-compose.prod.yml with 4 services (bot, timescaledb, tick-collector, scheduler). Health checks, auto-restart, env-file config. Ready for Hetzner CX32 deployment.",
    blueprintRef: "Blueprint: Hetzner CX32 — 4 vCPU, 8GB RAM, 80GB NVMe",
  },
];

const gapAnalysis: GapItem[] = [
  {
    area: "Paper Trading",
    current: "Bot built but no dry-run done yet",
    blueprint: "2+ weeks dry-run on testnet before live deployment",
    impact: "critical",
    icon: <Clock className="w-4 h-4" />,
  },
  {
    area: "VPS Provisioning",
    current: "Docker config ready, need to provision Hetzner",
    blueprint: "Hetzner CX32, IP whitelisting, UptimeRobot monitoring",
    impact: "high",
    icon: <Server className="w-4 h-4" />,
  },
  {
    area: "Funding Arb Execution",
    current: "Monitor built, no auto-execution yet",
    blueprint: "Auto open/close delta-neutral positions, collect funding",
    impact: "medium",
    icon: <DollarSign className="w-4 h-4" />,
  },
];

const roadmap: RoadmapPhase[] = [
  {
    phase: 1,
    title: "Foundation Built",
    timeframe: "Weeks 1-2 (DONE)",
    status: "done",
    tasks: [
      {
        title: "Bybit API integration",
        description: "REST + WebSocket, testnet, signed requests",
        priority: "critical",
        estimatedEffort: "2 days",
        done: true,
      },
      {
        title: "TimescaleDB data pipeline",
        description: "Candle storage, tick collector, continuous aggregates",
        priority: "critical",
        estimatedEffort: "2 days",
        done: true,
      },
      {
        title: "Sentiment analysis engine",
        description: "Grok-powered X sentiment with contrarian signals",
        priority: "high",
        estimatedEffort: "2 days",
        done: true,
      },
      {
        title: "Trading dashboard",
        description: "Next.js UI with charts, portfolio, trade execution",
        priority: "high",
        estimatedEffort: "3 days",
        done: true,
      },
      {
        title: "Basic technical analysis",
        description: "SMA, EMA, RSI indicators + combined signal strategy",
        priority: "high",
        estimatedEffort: "1 day",
        done: true,
      },
    ],
  },
  {
    phase: 2,
    title: "Critical Infrastructure",
    timeframe: "Weeks 3-4 (DONE)",
    status: "done",
    tasks: [
      {
        title: "Perpetual futures support",
        description:
          "Full V5 linear client: market data, positions, leverage, TP/SL, funding rates, emergency close",
        priority: "critical",
        estimatedEffort: "2 days",
        done: true,
      },
      {
        title: "Risk management system",
        description:
          "Quarter-Kelly sizing, 2% per-trade cap, -3% daily halt, -7% weekly reduction, -15% kill switch, dead man's switch",
        priority: "critical",
        estimatedEffort: "3 days",
        done: true,
      },
      {
        title: "Trend-following EMA strategy",
        description:
          "EMA 10/50 crossover with ADX regime filter, ATR stops, +DI/-DI confirmation, RSI guard",
        priority: "critical",
        estimatedEffort: "2 days",
        done: true,
      },
      {
        title: "Funding rate monitor",
        description:
          "Multi-symbol scanner, consistency analysis, annualized returns, arb P&L calculator",
        priority: "high",
        estimatedEffort: "1 day",
        done: true,
      },
      {
        title: "Walk-forward backtesting",
        description:
          "Rolling IS/OOS windows, 30-trade min, overfitting detection, PASS/FAIL/WARNING verdict",
        priority: "high",
        estimatedEffort: "3 days",
        done: true,
      },
    ],
  },
  {
    phase: 3,
    title: "Go Live Preparation",
    timeframe: "Weeks 5-6 (NOW)",
    status: "current",
    tasks: [
      {
        title: "Telegram bot integration",
        description:
          "/status, /profit, /kill commands. Trade alerts, drawdown warnings, heartbeat monitoring, daily summaries",
        priority: "critical",
        estimatedEffort: "2 days",
        done: true,
      },
      {
        title: "Autonomous trading bot",
        description:
          "Full bot runner: scan loop, risk-checked entries/exits, Telegram alerts, dry-run mode, graceful shutdown",
        priority: "critical",
        estimatedEffort: "2 days",
        done: true,
      },
      {
        title: "Docker production deployment",
        description:
          "Dockerfile + docker-compose.prod.yml with bot, DB, tick-collector, scheduler services",
        priority: "high",
        estimatedEffort: "1 day",
        done: true,
      },
      {
        title: "Paper trading validation",
        description:
          "2+ weeks dry-run on Bybit testnet. Run: npm run bot. Compare results vs backtest (expect 30-50% degradation)",
        priority: "critical",
        estimatedEffort: "14 days",
        done: false,
      },
    ],
  },
  {
    phase: 4,
    title: "Cautious Live Deployment",
    timeframe: "Weeks 7-8",
    status: "upcoming",
    tasks: [
      {
        title: "Deploy $200 live (trend strategy)",
        description:
          "1% risk per trade ($2/trade). Validate execution, slippage, fills. NOT for generating returns",
        priority: "critical",
        estimatedEffort: "Ongoing",
        done: false,
      },
      {
        title: "Deploy $200 live (funding arb)",
        description:
          "Delta-neutral positions. ~$6-8/month expected. Proves system works at small scale",
        priority: "high",
        estimatedEffort: "Ongoing",
        done: false,
      },
      {
        title: "Hold $600 in reserve",
        description:
          "Only scale up after 30+ live trades confirm profitability",
        priority: "high",
        estimatedEffort: "-",
        done: false,
      },
    ],
  },
  {
    phase: 5,
    title: "Scale & Optimize",
    timeframe: "Months 3-6",
    status: "upcoming",
    tasks: [
      {
        title: "Scale to $500 deployed after 30+ profitable trades",
        description: "Increase allocation only with proven track record",
        priority: "high",
        estimatedEffort: "Ongoing",
        done: false,
      },
      {
        title: "Add grid trading module",
        description:
          "Activate only when regime filter detects ranging market. Complement trend strategy",
        priority: "medium",
        estimatedEffort: "3 days",
        done: false,
      },
      {
        title: "Deploy full $1K after 100+ trades & 2+ months profit",
        description: "Track monthly Sharpe ratio and max drawdown formally",
        priority: "high",
        estimatedEffort: "Ongoing",
        done: false,
      },
      {
        title: "Explore Polymarket opportunities",
        description: "Experimental phase: arbitrage on prediction markets",
        priority: "medium",
        estimatedEffort: "Research",
        done: false,
      },
    ],
  },
];

// --- Helper Components ---

function StatusBadge({ status }: { status: "complete" | "partial" | "missing" }) {
  const config = {
    complete: { bg: "bg-green-500/10 border-green-500/30", text: "text-green-400", label: "Ready" },
    partial: { bg: "bg-yellow-500/10 border-yellow-500/30", text: "text-yellow-400", label: "Partial" },
    missing: { bg: "bg-red-500/10 border-red-500/30", text: "text-red-400", label: "Missing" },
  }[status];

  return (
    <span className={`px-2 py-0.5 text-xs font-medium rounded-full border ${config.bg} ${config.text}`}>
      {config.label}
    </span>
  );
}

function ImpactBadge({ impact }: { impact: "critical" | "high" | "medium" }) {
  const config = {
    critical: { bg: "bg-red-500/10 border-red-500/30", text: "text-red-400" },
    high: { bg: "bg-orange-500/10 border-orange-500/30", text: "text-orange-400" },
    medium: { bg: "bg-blue-500/10 border-blue-500/30", text: "text-blue-400" },
  }[impact];

  return (
    <span className={`px-2 py-0.5 text-xs font-medium rounded-full border ${config.bg} ${config.text}`}>
      {impact}
    </span>
  );
}

function ProgressRing({ percent }: { percent: number }) {
  const circumference = 2 * Math.PI * 40;
  const strokeDashoffset = circumference - (percent / 100) * circumference;
  const color =
    percent >= 70 ? "text-green-400" : percent >= 40 ? "text-yellow-400" : "text-red-400";

  return (
    <div className="relative inline-flex items-center justify-center">
      <svg className="w-28 h-28 -rotate-90" viewBox="0 0 100 100">
        <circle
          cx="50"
          cy="50"
          r="40"
          fill="none"
          stroke="currentColor"
          strokeWidth="6"
          className="text-gray-800"
        />
        <circle
          cx="50"
          cy="50"
          r="40"
          fill="none"
          stroke="currentColor"
          strokeWidth="6"
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
          strokeLinecap="round"
          className={color}
        />
      </svg>
      <span className={`absolute text-2xl font-bold ${color}`}>{percent}%</span>
    </div>
  );
}

// --- Main Page ---

export default function InsightsPage() {
  const [expandedModules, setExpandedModules] = useState<Set<string>>(new Set());
  const [expandedPhases, setExpandedPhases] = useState<Set<number>>(new Set([3])); // Current phase open by default

  const toggleModule = (id: string) => {
    setExpandedModules((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const togglePhase = (phase: number) => {
    setExpandedPhases((prev) => {
      const next = new Set(prev);
      if (next.has(phase)) next.delete(phase);
      else next.add(phase);
      return next;
    });
  };

  // Calculate overall readiness
  const totalModules = systemModules.length;
  const completeModules = systemModules.filter((m) => m.status === "complete").length;
  const partialModules = systemModules.filter((m) => m.status === "partial").length;
  const readinessPercent = Math.round(
    ((completeModules + partialModules * 0.5) / totalModules) * 100
  );

  const totalTasks = roadmap.flatMap((p) => p.tasks).length;
  const doneTasks = roadmap.flatMap((p) => p.tasks).filter((t) => t.done).length;

  return (
    <div className="min-h-screen bg-black text-white p-6 max-w-7xl mx-auto">
      {/* Header */}
      <header className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-3">
          <Target className="w-8 h-8 text-blue-500" />
          <div>
            <h1 className="text-2xl font-bold">System Insights</h1>
            <p className="text-sm text-gray-500">
              Blueprint gap analysis & roadmap to live trading
            </p>
          </div>
        </div>
        <Link
          href="/"
          className="flex items-center gap-2 px-4 py-2 bg-gray-800 hover:bg-gray-700 rounded-lg transition-colors text-sm"
        >
          <ArrowLeft className="w-4 h-4" />
          Dashboard
        </Link>
      </header>

      {/* Overview Cards */}
      <section className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
        <div className="bg-gray-900/50 border border-gray-800 rounded-xl p-6 flex items-center gap-6">
          <ProgressRing percent={readinessPercent} />
          <div>
            <div className="text-sm text-gray-400">System Readiness</div>
            <div className="text-lg font-semibold mt-1">
              {completeModules}/{totalModules} modules
            </div>
            <div className="text-xs text-gray-500 mt-1">
              {partialModules > 0 && `${partialModules} partially built`}
            </div>
          </div>
        </div>

        <div className="bg-gray-900/50 border border-gray-800 rounded-xl p-6">
          <div className="text-sm text-gray-400 mb-2">Roadmap Progress</div>
          <div className="text-3xl font-bold">{doneTasks}/{totalTasks}</div>
          <div className="text-xs text-gray-500 mt-1">tasks completed</div>
          <div className="w-full bg-gray-800 rounded-full h-2 mt-3">
            <div
              className="bg-blue-500 h-2 rounded-full transition-all"
              style={{ width: `${(doneTasks / totalTasks) * 100}%` }}
            />
          </div>
        </div>

        <div className="bg-gray-900/50 border border-gray-800 rounded-xl p-6">
          <div className="text-sm text-gray-400 mb-2">Current Phase</div>
          <div className="text-3xl font-bold text-yellow-400">3</div>
          <div className="text-xs text-gray-500 mt-1">Go Live Preparation</div>
          <div className="text-xs text-yellow-400/70 mt-2">Telegram + Deploy + Paper Trade</div>
        </div>

        <div className="bg-gray-900/50 border border-gray-800 rounded-xl p-6">
          <div className="text-sm text-gray-400 mb-2">Realistic Targets</div>
          <div className="text-xl font-bold text-green-400">2-3%/mo</div>
          <div className="text-xs text-gray-500 mt-1">= elite retail trader territory</div>
          <div className="text-xs text-gray-500 mt-1">
            Sharpe 0.75-1.5 &middot; Max DD &lt;25%
          </div>
        </div>
      </section>

      {/* What You've Built vs What The Blueprint Says */}
      <section className="mb-8">
        <div className="flex items-center gap-2 mb-4">
          <AlertTriangle className="w-5 h-5 text-yellow-400" />
          <h2 className="text-lg font-semibold">Gap Analysis: Current State vs Blueprint</h2>
        </div>
        <div className="bg-gray-900/50 border border-gray-800 rounded-xl overflow-hidden">
          <div className="grid grid-cols-[auto_1fr_1fr_auto] gap-4 p-4 border-b border-gray-800 text-sm font-medium text-gray-400">
            <div className="w-8" />
            <div>Current State</div>
            <div>Blueprint Target</div>
            <div>Impact</div>
          </div>
          {gapAnalysis.map((gap, i) => (
            <div
              key={i}
              className="grid grid-cols-[auto_1fr_1fr_auto] gap-4 p-4 border-b border-gray-800/50 items-center text-sm hover:bg-gray-800/20 transition-colors"
            >
              <div className="w-8 flex items-center justify-center text-gray-500">{gap.icon}</div>
              <div>
                <div className="text-gray-400 text-xs mb-0.5">{gap.area}</div>
                <div className="text-gray-300">{gap.current}</div>
              </div>
              <div className="flex items-center gap-2">
                <ArrowRight className="w-3 h-3 text-gray-600 shrink-0" />
                <span className="text-white">{gap.blueprint}</span>
              </div>
              <div>
                <ImpactBadge impact={gap.impact} />
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* System Modules */}
      <section className="mb-8">
        <div className="flex items-center gap-2 mb-4">
          <Layers className="w-5 h-5 text-blue-400" />
          <h2 className="text-lg font-semibold">System Modules</h2>
          <div className="ml-auto flex items-center gap-3 text-xs text-gray-500">
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-green-400" /> Ready
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-yellow-400" /> Partial
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-red-400" /> Missing
            </span>
          </div>
        </div>
        <div className="space-y-2">
          {systemModules.map((mod) => {
            const isExpanded = expandedModules.has(mod.id);
            return (
              <div
                key={mod.id}
                className="bg-gray-900/50 border border-gray-800 rounded-xl overflow-hidden"
              >
                <button
                  onClick={() => toggleModule(mod.id)}
                  className="w-full flex items-center gap-4 p-4 text-left hover:bg-gray-800/30 transition-colors"
                >
                  <div
                    className={`p-2 rounded-lg ${
                      mod.status === "complete"
                        ? "bg-green-500/10 text-green-400"
                        : mod.status === "partial"
                        ? "bg-yellow-500/10 text-yellow-400"
                        : "bg-red-500/10 text-red-400"
                    }`}
                  >
                    {mod.icon}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{mod.name}</span>
                      <StatusBadge status={mod.status} />
                    </div>
                    <p className="text-sm text-gray-500 truncate">{mod.description}</p>
                  </div>
                  {isExpanded ? (
                    <ChevronUp className="w-4 h-4 text-gray-500" />
                  ) : (
                    <ChevronDown className="w-4 h-4 text-gray-500" />
                  )}
                </button>
                {isExpanded && (
                  <div className="px-4 pb-4 border-t border-gray-800/50">
                    <div className="mt-3 space-y-2">
                      <p className="text-sm text-gray-300">{mod.details}</p>
                      <div className="flex items-start gap-2 text-xs text-gray-500">
                        <Target className="w-3 h-3 mt-0.5 shrink-0" />
                        <span>Blueprint: {mod.blueprintRef}</span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {/* Roadmap */}
      <section className="mb-8">
        <div className="flex items-center gap-2 mb-4">
          <ArrowRight className="w-5 h-5 text-purple-400" />
          <h2 className="text-lg font-semibold">Roadmap to Live Trading</h2>
        </div>
        <div className="space-y-3">
          {roadmap.map((phase) => {
            const isExpanded = expandedPhases.has(phase.phase);
            const phaseDone = phase.tasks.filter((t) => t.done).length;
            const phaseTotal = phase.tasks.length;
            const phasePercent = phaseTotal > 0 ? Math.round((phaseDone / phaseTotal) * 100) : 0;

            return (
              <div
                key={phase.phase}
                className={`bg-gray-900/50 border rounded-xl overflow-hidden ${
                  phase.status === "current"
                    ? "border-yellow-500/40"
                    : phase.status === "done"
                    ? "border-green-500/30"
                    : "border-gray-800"
                }`}
              >
                <button
                  onClick={() => togglePhase(phase.phase)}
                  className="w-full flex items-center gap-4 p-4 text-left hover:bg-gray-800/20 transition-colors"
                >
                  <div
                    className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold shrink-0 ${
                      phase.status === "done"
                        ? "bg-green-500/20 text-green-400"
                        : phase.status === "current"
                        ? "bg-yellow-500/20 text-yellow-400"
                        : "bg-gray-800 text-gray-500"
                    }`}
                  >
                    {phase.status === "done" ? (
                      <CheckCircle2 className="w-5 h-5" />
                    ) : (
                      phase.phase
                    )}
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{phase.title}</span>
                      {phase.status === "current" && (
                        <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-yellow-500/10 border border-yellow-500/30 text-yellow-400">
                          CURRENT
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-3 mt-1">
                      <span className="text-sm text-gray-500">{phase.timeframe}</span>
                      <span className="text-xs text-gray-600">
                        {phaseDone}/{phaseTotal} tasks
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="w-20 bg-gray-800 rounded-full h-1.5 hidden md:block">
                      <div
                        className={`h-1.5 rounded-full transition-all ${
                          phase.status === "done"
                            ? "bg-green-400"
                            : phase.status === "current"
                            ? "bg-yellow-400"
                            : "bg-gray-600"
                        }`}
                        style={{ width: `${phasePercent}%` }}
                      />
                    </div>
                    {isExpanded ? (
                      <ChevronUp className="w-4 h-4 text-gray-500" />
                    ) : (
                      <ChevronDown className="w-4 h-4 text-gray-500" />
                    )}
                  </div>
                </button>
                {isExpanded && (
                  <div className="px-4 pb-4 border-t border-gray-800/50">
                    <div className="mt-3 space-y-2">
                      {phase.tasks.map((task, i) => (
                        <div
                          key={i}
                          className={`flex items-start gap-3 p-3 rounded-lg ${
                            task.done ? "bg-green-500/5" : "bg-gray-800/30"
                          }`}
                        >
                          {task.done ? (
                            <CheckCircle2 className="w-4 h-4 text-green-400 mt-0.5 shrink-0" />
                          ) : (
                            <Circle className="w-4 h-4 text-gray-600 mt-0.5 shrink-0" />
                          )}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span
                                className={`text-sm font-medium ${
                                  task.done ? "text-gray-400 line-through" : "text-gray-200"
                                }`}
                              >
                                {task.title}
                              </span>
                              <ImpactBadge impact={task.priority} />
                            </div>
                            <p className="text-xs text-gray-500 mt-0.5">{task.description}</p>
                          </div>
                          <span className="text-xs text-gray-600 shrink-0">
                            {task.estimatedEffort}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {/* Key Insights */}
      <section className="mb-8">
        <div className="flex items-center gap-2 mb-4">
          <Zap className="w-5 h-5 text-yellow-400" />
          <h2 className="text-lg font-semibold">Key Insights</h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-gray-900/50 border border-green-500/20 rounded-xl p-6">
            <h3 className="font-semibold text-green-400 mb-3">What's Strong</h3>
            <ul className="space-y-2 text-sm text-gray-300">
              <li className="flex items-start gap-2">
                <CheckCircle2 className="w-4 h-4 text-green-400 mt-0.5 shrink-0" />
                <span>
                  <strong>Bybit API</strong> is production-ready — signed requests, testnet, WebSocket streaming
                </span>
              </li>
              <li className="flex items-start gap-2">
                <CheckCircle2 className="w-4 h-4 text-green-400 mt-0.5 shrink-0" />
                <span>
                  <strong>Sentiment engine</strong> is a unique edge beyond the blueprint — most algo traders ignore social data entirely
                </span>
              </li>
              <li className="flex items-start gap-2">
                <CheckCircle2 className="w-4 h-4 text-green-400 mt-0.5 shrink-0" />
                <span>
                  <strong>TimescaleDB</strong> with hypertables and continuous aggregates is professional-grade infrastructure
                </span>
              </li>
              <li className="flex items-start gap-2">
                <CheckCircle2 className="w-4 h-4 text-green-400 mt-0.5 shrink-0" />
                <span>
                  <strong>Dashboard</strong> provides real-time visibility that the blueprint's Telegram-only approach lacks
                </span>
              </li>
            </ul>
          </div>

          <div className="bg-gray-900/50 border border-yellow-500/20 rounded-xl p-6">
            <h3 className="font-semibold text-yellow-400 mb-3">What's Left</h3>
            <ul className="space-y-2 text-sm text-gray-300">
              <li className="flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-yellow-400 mt-0.5 shrink-0" />
                <span>
                  <strong>Paper trading validation</strong> — run <code>npm run bot</code> for 2+ weeks on testnet. Compare live results vs backtest expectations. This is the most critical step before going live
                </span>
              </li>
              <li className="flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-yellow-400 mt-0.5 shrink-0" />
                <span>
                  <strong>Provision Hetzner VPS</strong> — deploy via <code>docker compose -f docker-compose.prod.yml up -d</code>. Set up IP whitelisting on Bybit API keys
                </span>
              </li>
              <li className="flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-yellow-400 mt-0.5 shrink-0" />
                <span>
                  <strong>Telegram setup</strong> — create bot via @BotFather, set TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID in .env. Send /start to your bot
                </span>
              </li>
            </ul>
          </div>
        </div>
      </section>

      {/* Strategic Decision */}
      <section className="mb-8">
        <div className="bg-gradient-to-r from-blue-500/10 to-purple-500/10 border border-blue-500/20 rounded-xl p-6">
          <h3 className="font-semibold text-blue-400 mb-3">
            Strategic Decision: TypeScript Custom vs Freqtrade
          </h3>
          <p className="text-sm text-gray-300 mb-4">
            The blueprint recommends Freqtrade (Python), but you've already built significant
            infrastructure in TypeScript. Here's the tradeoff:
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
            <div className="p-4 bg-gray-900/50 rounded-lg">
              <div className="font-medium text-green-400 mb-2">Stay TypeScript (Recommended)</div>
              <ul className="space-y-1 text-gray-400">
                <li>+ 3,300+ lines already built and working</li>
                <li>+ Sentiment engine is a unique differentiator</li>
                <li>+ Dashboard gives visual edge over CLI-only Freqtrade</li>
                <li>+ Full control over execution logic</li>
                <li>- Need to build futures, risk management, backtesting from scratch</li>
                <li>- No Hyperopt equivalent</li>
              </ul>
            </div>
            <div className="p-4 bg-gray-900/50 rounded-lg">
              <div className="font-medium text-yellow-400 mb-2">Switch to Freqtrade</div>
              <ul className="space-y-1 text-gray-400">
                <li>+ Battle-tested framework with Hyperopt</li>
                <li>+ Walk-forward and dry-run built in</li>
                <li>+ Huge community, hundreds of strategy templates</li>
                <li>+ FreqAI module for ML integration</li>
                <li>- Lose all existing code investment</li>
                <li>- Lose sentiment engine + dashboard</li>
                <li>- 2-3 week restart to reach current state</li>
              </ul>
            </div>
          </div>
          <p className="text-xs text-gray-500 mt-4">
            Verdict: Continue with TypeScript. The existing infrastructure is too valuable to
            discard. Add the missing pieces (futures, risk management, walk-forward testing) as
            focused modules. Your sentiment engine gives you an edge that Freqtrade users don't have.
          </p>
        </div>
      </section>

      {/* Reality Check */}
      <section className="mb-8">
        <div className="bg-gray-900/50 border border-gray-800 rounded-xl p-6">
          <h3 className="font-semibold mb-3">Reality Check: Return Expectations</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
            <div className="p-4 bg-gray-800/30 rounded-lg">
              <div className="text-2xl font-bold text-green-400">2-3%</div>
              <div className="text-xs text-gray-500 mt-1">Monthly target</div>
              <div className="text-xs text-gray-600">Elite if sustained</div>
            </div>
            <div className="p-4 bg-gray-800/30 rounded-lg">
              <div className="text-2xl font-bold text-blue-400">0.75-1.5</div>
              <div className="text-xs text-gray-500 mt-1">Sharpe ratio target</div>
              <div className="text-xs text-gray-600">&gt;1.0 is impressive</div>
            </div>
            <div className="p-4 bg-gray-800/30 rounded-lg">
              <div className="text-2xl font-bold text-yellow-400">&lt;25%</div>
              <div className="text-xs text-gray-500 mt-1">Max drawdown</div>
              <div className="text-xs text-gray-600">Expect 20-30% in practice</div>
            </div>
            <div className="p-4 bg-gray-800/30 rounded-lg">
              <div className="text-2xl font-bold text-purple-400">6-18mo</div>
              <div className="text-xs text-gray-500 mt-1">Time to profitability</div>
              <div className="text-xs text-gray-600">$1K is tuition, not capital</div>
            </div>
          </div>
          <p className="text-xs text-gray-500 mt-4 text-center">
            10% monthly = 214% annual. Renaissance Technologies (300 PhDs, $12B) averages ~66%
            annually. Realistic targets make you more likely to survive long enough to succeed.
          </p>
        </div>
      </section>

      {/* Monthly Cost */}
      <section className="mb-8">
        <div className="bg-gray-900/50 border border-gray-800 rounded-xl p-6">
          <h3 className="font-semibold mb-3">Monthly Operating Cost</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { name: "Hetzner VPS", cost: "$7.40", status: "pending" },
              { name: "Bybit + Binance", cost: "$0", status: "free" },
              { name: "Freqtrade/Data", cost: "$0", status: "free" },
              { name: "Telegram/Uptime", cost: "$0", status: "free" },
            ].map((item, i) => (
              <div key={i} className="p-3 bg-gray-800/30 rounded-lg text-center">
                <div className="text-lg font-bold">{item.cost}</div>
                <div className="text-xs text-gray-500">{item.name}</div>
              </div>
            ))}
          </div>
          <div className="text-center mt-3 text-sm text-gray-400">
            Total infrastructure: <strong className="text-white">~$7.40/month</strong> &middot;
            Full $1K stays as trading capital
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="pt-6 border-t border-gray-800 text-center text-sm text-gray-500">
        <p>
          Based on "The Solo Algo Trader's Blueprint: Crypto Futures on $1K"
        </p>
        <p className="mt-1">System analysis generated {new Date().toLocaleDateString()}</p>
      </footer>
    </div>
  );
}
