"use client";

import { useState, useEffect, useCallback } from "react";
import { RefreshCw, Activity, Database, Zap, AlertTriangle, Wallet, Clock, History, Target } from "lucide-react";
import Link from "next/link";
import { PriceCard } from "@/components/PriceCard";
import { SentimentGauge } from "@/components/SentimentGauge";
import { PriceChart } from "@/components/PriceChart";
import { SignalCard } from "@/components/SignalCard";
import { DataStats } from "@/components/DataStats";
import { Portfolio } from "@/components/Portfolio";
import { OrdersTable } from "@/components/OrdersTable";
import { TradesTable } from "@/components/TradesTable";
import { TradeForm } from "@/components/TradeForm";

interface Ticker {
  symbol: string;
  price: number;
  change24h: string;
  volume24h: number;
}

interface Candle {
  time: string;
  close: number;
  volume: number;
}

interface Sentiment {
  score: number;
  label: string;
  confidence: number;
  summary?: string;
  keyTopics?: string[];
  trend?: string;
}

interface Signal {
  time: string;
  symbol: string;
  action: string;
  confidence: number;
  reasoning: string;
  sentiment_score?: number;
  price_at_signal?: number;
}

interface Balance {
  coin: string;
  free: string;
  locked: string;
  total: string;
  usdValue?: string;
}

interface Order {
  orderId: string;
  symbol: string;
  side: string;
  orderType: string;
  price: string;
  qty: string;
  cumExecQty?: string;
  status: string;
  createdTime: string;
}

interface Trade {
  execId: string;
  symbol: string;
  orderId: string;
  side: string;
  execPrice: string;
  execQty: string;
  execValue: string;
  execFee: string;
  execTime: string;
}

export default function Dashboard() {
  const [tickers, setTickers] = useState<Ticker[]>([]);
  const [selectedSymbol, setSelectedSymbol] = useState("BTCUSDT");
  const [candles, setCandles] = useState<Candle[]>([]);
  const [sentiment, setSentiment] = useState<Sentiment | null>(null);
  const [signals, setSignals] = useState<Signal[]>([]);
  const [candleStats, setCandleStats] = useState<any[]>([]);
  const [sentimentCount, setSentimentCount] = useState(0);
  const [tradeCount, setTradeCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);

  // Account state
  const [balances, setBalances] = useState<Balance[]>([]);
  const [totalUsd, setTotalUsd] = useState(0);
  const [isTestnet, setIsTestnet] = useState(true);
  const [openOrders, setOpenOrders] = useState<Order[]>([]);
  const [orderHistory, setOrderHistory] = useState<Order[]>([]);
  const [tradeHistory, setTradeHistory] = useState<Trade[]>([]);
  const [accountLoading, setAccountLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"open" | "history" | "trades">("open");

  // Fetch market data
  const fetchMarket = useCallback(async () => {
    try {
      const res = await fetch("/api/market");
      const data = await res.json();
      if (data.tickers) {
        setTickers(data.tickers);
      }
    } catch (error) {
      console.error("Failed to fetch market:", error);
    }
  }, []);

  // Fetch candles for selected symbol
  const fetchCandles = useCallback(async (symbol: string) => {
    try {
      const res = await fetch(`/api/candles?symbol=${symbol}&interval=1h&limit=168`);
      const data = await res.json();
      if (data.candles) {
        setCandles(data.candles);
      }
    } catch (error) {
      console.error("Failed to fetch candles:", error);
    }
  }, []);

  // Fetch sentiment for selected symbol
  const fetchSentiment = useCallback(async (symbol: string) => {
    try {
      const baseSymbol = symbol.replace("USDT", "");
      const res = await fetch(`/api/sentiment?symbol=${baseSymbol}`);
      const data = await res.json();
      if (data.latest) {
        setSentiment(data.latest);
      }
    } catch (error) {
      console.error("Failed to fetch sentiment:", error);
    }
  }, []);

  // Fetch signals
  const fetchSignals = useCallback(async () => {
    try {
      const res = await fetch("/api/signals");
      const data = await res.json();
      if (data.signals) {
        setSignals(data.signals);
      }
    } catch (error) {
      console.error("Failed to fetch signals:", error);
    }
  }, []);

  // Fetch data stats
  const fetchStats = useCallback(async () => {
    try {
      const res = await fetch("/api/stats");
      const data = await res.json();
      if (data.candles) {
        setCandleStats(data.candles);
        setSentimentCount(parseInt(data.sentimentCount) || 0);
        setTradeCount(parseInt(data.tradeCount) || 0);
      }
    } catch (error) {
      console.error("Failed to fetch stats:", error);
    }
  }, []);

  // Fetch account data
  const fetchAccount = useCallback(async () => {
    try {
      const res = await fetch("/api/account");
      const data = await res.json();
      if (data.balances) {
        setBalances(data.balances);
        setTotalUsd(data.totalUsd || 0);
        setIsTestnet(data.testnet);
      }
    } catch (error) {
      console.error("Failed to fetch account:", error);
    }
  }, []);

  // Fetch orders
  const fetchOrders = useCallback(async () => {
    try {
      const [openRes, historyRes] = await Promise.all([
        fetch("/api/orders?type=open"),
        fetch("/api/orders?type=history&limit=20"),
      ]);
      const openData = await openRes.json();
      const historyData = await historyRes.json();
      if (openData.orders) setOpenOrders(openData.orders);
      if (historyData.orders) setOrderHistory(historyData.orders);
    } catch (error) {
      console.error("Failed to fetch orders:", error);
    }
  }, []);

  // Fetch trade history
  const fetchTrades = useCallback(async () => {
    try {
      const res = await fetch("/api/trades?limit=20");
      const data = await res.json();
      if (data.trades) setTradeHistory(data.trades);
    } catch (error) {
      console.error("Failed to fetch trades:", error);
    }
  }, []);

  // Cancel order
  const handleCancelOrder = async (symbol: string, orderId: string) => {
    try {
      const res = await fetch("/api/orders", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ symbol, orderId }),
      });
      if (res.ok) {
        await fetchOrders();
        await fetchAccount();
      }
    } catch (error) {
      console.error("Failed to cancel order:", error);
    }
  };

  // Initial load
  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      setAccountLoading(true);
      await Promise.all([
        fetchMarket(),
        fetchCandles(selectedSymbol),
        fetchSentiment(selectedSymbol),
        fetchSignals(),
        fetchStats(),
      ]);
      setLoading(false);
      setLastUpdate(new Date());

      // Load account data separately (may fail on API issues)
      await Promise.all([
        fetchAccount(),
        fetchOrders(),
        fetchTrades(),
      ]);
      setAccountLoading(false);
    };

    loadData();
  }, [fetchMarket, fetchCandles, fetchSentiment, fetchSignals, fetchStats, fetchAccount, fetchOrders, fetchTrades, selectedSymbol]);

  // Auto refresh every 30 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      fetchMarket();
    }, 30000);

    return () => clearInterval(interval);
  }, [fetchMarket]);

  // Handle symbol change
  const handleSymbolChange = async (symbol: string) => {
    setSelectedSymbol(symbol);
    await Promise.all([
      fetchCandles(symbol),
      fetchSentiment(symbol),
    ]);
  };

  // Trigger fresh sentiment analysis
  const analyzeSentiment = async () => {
    setAnalyzing(true);
    try {
      const baseSymbol = selectedSymbol.replace("USDT", "");
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ symbol: baseSymbol }),
      });
      const data = await res.json();
      if (data.score !== undefined) {
        setSentiment({
          score: data.score,
          label: getLabelFromScore(data.score),
          confidence: data.confidence,
          summary: data.summary,
          keyTopics: data.keyTopics,
          trend: data.trend,
        });
      }
    } catch (error) {
      console.error("Failed to analyze:", error);
    }
    setAnalyzing(false);
  };

  const getLabelFromScore = (score: number): string => {
    if (score <= -50) return "extreme_fear";
    if (score <= -25) return "fear";
    if (score <= 25) return "neutral";
    if (score <= 50) return "greed";
    return "extreme_greed";
  };

  // Get trading recommendation based on sentiment
  const getTradingRecommendation = () => {
    if (!sentiment) return null;

    const { score, label } = sentiment;

    if (label === "extreme_fear" || score <= -50) {
      return {
        action: "STRONG BUY",
        reason: "Extreme fear often marks market bottoms. Contrarian opportunity.",
        color: "text-green-400",
        bgColor: "bg-green-500/10 border-green-500/30",
      };
    }
    if (label === "fear" || score <= -25) {
      return {
        action: "BUY",
        reason: "Fear in the market. Consider accumulating.",
        color: "text-green-300",
        bgColor: "bg-green-500/5 border-green-500/20",
      };
    }
    if (label === "extreme_greed" || score >= 50) {
      return {
        action: "STRONG SELL",
        reason: "Extreme greed often precedes corrections. Consider taking profits.",
        color: "text-red-400",
        bgColor: "bg-red-500/10 border-red-500/30",
      };
    }
    if (label === "greed" || score >= 25) {
      return {
        action: "SELL",
        reason: "Greed is rising. Be cautious with new positions.",
        color: "text-red-300",
        bgColor: "bg-red-500/5 border-red-500/20",
      };
    }

    return {
      action: "HOLD",
      reason: "Neutral sentiment. Wait for clearer signals.",
      color: "text-gray-400",
      bgColor: "bg-gray-500/5 border-gray-500/20",
    };
  };

  const recommendation = getTradingRecommendation();
  const selectedTicker = tickers.find((t) => t.symbol === selectedSymbol);

  return (
    <div className="min-h-screen bg-black text-white p-6">
      {/* Header */}
      <header className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-3">
          <Activity className="w-8 h-8 text-blue-500" />
          <div>
            <h1 className="text-2xl font-bold">Bybit Trading Dashboard</h1>
            <p className="text-sm text-gray-500">AI-Powered Sentiment Analysis</p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          {lastUpdate && (
            <span className="text-sm text-gray-500">
              Updated: {lastUpdate.toLocaleTimeString()}
            </span>
          )}
          <Link
            href="/insights"
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 rounded-lg transition-colors text-sm"
          >
            <Target className="w-4 h-4" />
            Insights
          </Link>
          <button
            onClick={() => {
              fetchMarket();
              fetchCandles(selectedSymbol);
              setLastUpdate(new Date());
            }}
            className="flex items-center gap-2 px-4 py-2 bg-gray-800 hover:bg-gray-700 rounded-lg transition-colors"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </button>
        </div>
      </header>

      {/* Data Stats */}
      <section className="mb-8">
        <div className="flex items-center gap-2 mb-4">
          <Database className="w-5 h-5 text-blue-400" />
          <h2 className="text-lg font-semibold">Database Stats</h2>
        </div>
        <DataStats
          candleStats={candleStats}
          sentimentCount={sentimentCount}
          tradeCount={tradeCount}
        />
      </section>

      {/* Market Overview */}
      <section className="mb-8">
        <h2 className="text-lg font-semibold mb-4">Market Overview</h2>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          {tickers.map((ticker) => (
            <PriceCard
              key={ticker.symbol}
              symbol={ticker.symbol}
              price={ticker.price}
              change24h={ticker.change24h}
              volume24h={ticker.volume24h}
              selected={ticker.symbol === selectedSymbol}
              onClick={() => handleSymbolChange(ticker.symbol)}
            />
          ))}
        </div>
      </section>

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Price Chart */}
        <div className="lg:col-span-2 bg-gray-900/50 border border-gray-800 rounded-xl p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-lg font-semibold">
                {selectedSymbol.replace("USDT", "/USDT")}
              </h3>
              {selectedTicker && (
                <p className="text-2xl font-bold">
                  ${selectedTicker.price.toLocaleString(undefined, {
                    maximumFractionDigits: 2,
                  })}
                </p>
              )}
            </div>
            <div className="flex gap-2">
              {["1h", "4h", "1d"].map((interval) => (
                <button
                  key={interval}
                  className="px-3 py-1 text-sm bg-gray-800 hover:bg-gray-700 rounded transition-colors"
                  onClick={() =>
                    fetch(`/api/candles?symbol=${selectedSymbol}&interval=${interval}&limit=168`)
                      .then((r) => r.json())
                      .then((d) => d.candles && setCandles(d.candles))
                  }
                >
                  {interval}
                </button>
              ))}
            </div>
          </div>
          <PriceChart data={candles} symbol={selectedSymbol} />
        </div>

        {/* Sentiment Panel */}
        <div className="bg-gray-900/50 border border-gray-800 rounded-xl p-6">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-2">
              <Zap className="w-5 h-5 text-yellow-400" />
              <h3 className="text-lg font-semibold">X Sentiment</h3>
            </div>
            <button
              onClick={analyzeSentiment}
              disabled={analyzing}
              className="flex items-center gap-2 px-3 py-1.5 bg-blue-600 hover:bg-blue-500 disabled:bg-gray-700 rounded-lg text-sm transition-colors"
            >
              {analyzing ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  Analyzing...
                </>
              ) : (
                <>
                  <Zap className="w-4 h-4" />
                  Analyze Now
                </>
              )}
            </button>
          </div>

          {sentiment ? (
            <div className="space-y-6">
              <SentimentGauge
                score={sentiment.score}
                label={sentiment.label}
                confidence={sentiment.confidence}
              />

              {sentiment.summary && (
                <div className="p-3 bg-gray-800/50 rounded-lg">
                  <p className="text-sm text-gray-300">{sentiment.summary}</p>
                </div>
              )}

              {sentiment.keyTopics && sentiment.keyTopics.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {sentiment.keyTopics.map((topic, i) => (
                    <span
                      key={i}
                      className="px-2 py-1 text-xs bg-gray-800 rounded-full"
                    >
                      {topic}
                    </span>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-64 text-gray-500">
              <AlertTriangle className="w-12 h-12 mb-4" />
              <p>No sentiment data available</p>
              <p className="text-sm">Click "Analyze Now" to get fresh data</p>
            </div>
          )}
        </div>

        {/* Trade Form */}
        <TradeForm
          symbol={selectedSymbol}
          currentPrice={selectedTicker?.price || 0}
          balances={balances}
          onOrderPlaced={() => {
            fetchAccount();
            fetchOrders();
            fetchTrades();
          }}
        />
      </div>

      {/* Trading Recommendation */}
      {recommendation && (
        <section className="mt-6">
          <div
            className={`p-6 rounded-xl border ${recommendation.bgColor}`}
          >
            <div className="flex items-center justify-between">
              <div>
                <h3 className={`text-2xl font-bold ${recommendation.color}`}>
                  {recommendation.action}
                </h3>
                <p className="text-gray-400 mt-1">{recommendation.reason}</p>
              </div>
              <div className="text-right">
                <p className="text-sm text-gray-500">Contrarian Strategy</p>
                <p className="text-xs text-gray-600">
                  Based on market sentiment analysis
                </p>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* Portfolio & Orders Section */}
      <section className="mt-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Portfolio */}
          <Portfolio
            balances={balances}
            totalUsd={totalUsd}
            testnet={isTestnet}
            loading={accountLoading}
          />

          {/* Orders & Trades */}
          <div className="lg:col-span-2 bg-gray-900/50 border border-gray-800 rounded-xl p-6">
            {/* Tabs */}
            <div className="flex items-center gap-4 mb-6 border-b border-gray-800 pb-4">
              <button
                onClick={() => setActiveTab("open")}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors ${
                  activeTab === "open"
                    ? "bg-blue-600 text-white"
                    : "text-gray-400 hover:text-white hover:bg-gray-800"
                }`}
              >
                <Clock className="w-4 h-4" />
                Open Orders
                {openOrders.length > 0 && (
                  <span className="ml-1 px-2 py-0.5 text-xs bg-blue-500 rounded-full">
                    {openOrders.length}
                  </span>
                )}
              </button>
              <button
                onClick={() => setActiveTab("history")}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors ${
                  activeTab === "history"
                    ? "bg-blue-600 text-white"
                    : "text-gray-400 hover:text-white hover:bg-gray-800"
                }`}
              >
                <History className="w-4 h-4" />
                Order History
              </button>
              <button
                onClick={() => setActiveTab("trades")}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors ${
                  activeTab === "trades"
                    ? "bg-blue-600 text-white"
                    : "text-gray-400 hover:text-white hover:bg-gray-800"
                }`}
              >
                <Wallet className="w-4 h-4" />
                Trade History
              </button>
              <button
                onClick={() => {
                  fetchOrders();
                  fetchTrades();
                  fetchAccount();
                }}
                className="ml-auto p-2 text-gray-400 hover:text-white hover:bg-gray-800 rounded-lg transition-colors"
                title="Refresh"
              >
                <RefreshCw className="w-4 h-4" />
              </button>
            </div>

            {/* Tab Content */}
            {activeTab === "open" && (
              <OrdersTable
                orders={openOrders}
                type="open"
                onCancel={handleCancelOrder}
                loading={accountLoading}
              />
            )}
            {activeTab === "history" && (
              <OrdersTable
                orders={orderHistory}
                type="history"
                loading={accountLoading}
              />
            )}
            {activeTab === "trades" && (
              <TradesTable trades={tradeHistory} loading={accountLoading} />
            )}
          </div>
        </div>
      </section>

      {/* Recent Signals */}
      {signals.length > 0 && (
        <section className="mt-8">
          <h2 className="text-lg font-semibold mb-4">Recent Signals</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {signals.slice(0, 6).map((signal, i) => (
              <SignalCard
                key={i}
                action={signal.action}
                symbol={signal.symbol}
                confidence={signal.confidence}
                reasoning={signal.reasoning}
                timestamp={signal.time}
                sentimentScore={signal.sentiment_score}
                priceAtSignal={signal.price_at_signal}
              />
            ))}
          </div>
        </section>
      )}

      {/* Strategy Guide */}
      <section className="mt-8 p-6 bg-gray-900/30 border border-gray-800 rounded-xl">
        <h2 className="text-lg font-semibold mb-4">Contrarian Strategy Guide</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 text-sm">
          <div className="p-4 bg-green-500/10 border border-green-500/20 rounded-lg">
            <div className="text-green-400 font-semibold mb-2">Extreme Fear (-100 to -50)</div>
            <p className="text-gray-400">
              Maximum buying opportunity. Market is oversold and likely near a bottom.
            </p>
          </div>
          <div className="p-4 bg-lime-500/10 border border-lime-500/20 rounded-lg">
            <div className="text-lime-400 font-semibold mb-2">Fear (-50 to -25)</div>
            <p className="text-gray-400">
              Good accumulation zone. Start building positions gradually.
            </p>
          </div>
          <div className="p-4 bg-orange-500/10 border border-orange-500/20 rounded-lg">
            <div className="text-orange-400 font-semibold mb-2">Greed (+25 to +50)</div>
            <p className="text-gray-400">
              Exercise caution. Consider taking partial profits.
            </p>
          </div>
          <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-lg">
            <div className="text-red-400 font-semibold mb-2">Extreme Greed (+50 to +100)</div>
            <p className="text-gray-400">
              Maximum selling opportunity. Market is overbought and due for correction.
            </p>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="mt-8 pt-6 border-t border-gray-800 text-center text-sm text-gray-500">
        <p>Bybit AI Trading Agent - Powered by Grok Sentiment Analysis</p>
        <p className="mt-1">
          Data from TimescaleDB | {candleStats.length} symbol/interval combinations tracked
        </p>
      </footer>
    </div>
  );
}
