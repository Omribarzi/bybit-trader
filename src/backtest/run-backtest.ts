import { config } from "dotenv";
import {
  Backtester,
  fetchHistoricalData,
  smaCrossoverStrategy,
  rsiStrategy,
  macdStrategy,
  combinedStrategy,
} from "./backtester.js";
import type { BacktestResult } from "./backtester.js";

config();

function formatResult(result: BacktestResult): void {
  console.log("\n" + "=".repeat(60));
  console.log(`Strategy: ${result.strategy}`);
  console.log(`Symbol: ${result.symbol}`);
  console.log("=".repeat(60));
  console.log(`Period: ${result.startDate.toLocaleDateString()} - ${result.endDate.toLocaleDateString()}`);
  console.log(`Initial Balance: $${result.initialBalance.toLocaleString()}`);
  console.log(`Final Balance: $${result.finalBalance.toLocaleString()}`);
  console.log(`Total Return: $${result.totalReturn.toLocaleString()} (${result.totalReturnPercent.toFixed(2)}%)`);
  console.log(`Total Trades: ${result.totalTrades}`);
  console.log(`Winning Trades: ${result.winningTrades}`);
  console.log(`Losing Trades: ${result.losingTrades}`);
  console.log(`Win Rate: ${result.winRate.toFixed(1)}%`);
  console.log(`Max Drawdown: $${result.maxDrawdown.toLocaleString()} (${result.maxDrawdownPercent.toFixed(2)}%)`);

  if (result.trades.length > 0) {
    console.log("\nRecent Trades:");
    result.trades.slice(-6).forEach((t) => {
      const date = new Date(t.timestamp).toLocaleDateString();
      console.log(`  ${date} ${t.type.padEnd(4)} ${t.quantity.toFixed(6)} @ $${t.price.toFixed(2)} = $${t.value.toFixed(2)}`);
    });
  }
}

async function runBacktests() {
  console.log("=".repeat(60));
  console.log("  BYBIT TRADING STRATEGY BACKTESTER");
  console.log("=".repeat(60));

  const symbols = ["BTCUSDT", "ETHUSDT"];
  const strategies = [
    { name: "SMA Crossover (10/20)", fn: smaCrossoverStrategy(10, 20) },
    { name: "SMA Crossover (20/50)", fn: smaCrossoverStrategy(20, 50) },
    { name: "RSI (30/70)", fn: rsiStrategy(30, 70) },
    { name: "RSI (25/75)", fn: rsiStrategy(25, 75) },
    { name: "MACD", fn: macdStrategy() },
    { name: "Combined (SMA+RSI)", fn: combinedStrategy() },
  ];

  const backtester = new Backtester(10000); // Start with $10,000
  const allResults: BacktestResult[] = [];

  for (const symbol of symbols) {
    console.log(`\nFetching historical data for ${symbol}...`);

    try {
      // Fetch 200 hourly candles (about 8 days of data)
      const candles = await fetchHistoricalData(symbol, "60", 200);
      console.log(`Loaded ${candles.length} candles from ${new Date(candles[0].timestamp).toLocaleDateString()} to ${new Date(candles[candles.length - 1].timestamp).toLocaleDateString()}`);

      for (const strategy of strategies) {
        const result = backtester.run(candles, strategy.fn, symbol, strategy.name);
        allResults.push(result);
        formatResult(result);
      }
    } catch (error) {
      console.error(`Error fetching data for ${symbol}:`, error);
    }
  }

  // Summary comparison
  console.log("\n" + "=".repeat(60));
  console.log("  STRATEGY COMPARISON SUMMARY");
  console.log("=".repeat(60));
  console.log("\nRanked by Total Return:\n");

  const sorted = [...allResults].sort((a, b) => b.totalReturnPercent - a.totalReturnPercent);
  sorted.forEach((r, i) => {
    const returnStr = r.totalReturnPercent >= 0
      ? `+${r.totalReturnPercent.toFixed(2)}%`
      : `${r.totalReturnPercent.toFixed(2)}%`;
    const emoji = r.totalReturnPercent > 0 ? "🟢" : r.totalReturnPercent < 0 ? "🔴" : "⚪";
    console.log(`${i + 1}. ${emoji} ${r.symbol} ${r.strategy.padEnd(25)} ${returnStr.padStart(10)} (${r.totalTrades} trades, ${r.winRate.toFixed(0)}% win rate)`);
  });

  // Best strategy recommendation
  const best = sorted[0];
  if (best.totalReturnPercent > 0) {
    console.log("\n" + "=".repeat(60));
    console.log("  RECOMMENDATION");
    console.log("=".repeat(60));
    console.log(`\nBest performing strategy: ${best.strategy} on ${best.symbol}`);
    console.log(`Return: ${best.totalReturnPercent.toFixed(2)}% with ${best.winRate.toFixed(0)}% win rate`);
    console.log(`\nNote: Past performance does not guarantee future results.`);
    console.log(`Always use proper risk management and start with small positions.`);
  }
}

runBacktests().catch(console.error);
