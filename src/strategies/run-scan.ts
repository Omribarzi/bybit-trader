import { config } from "dotenv";
import { scanMarketWithSentiment, analyzeCoin } from "./sentiment-strategy.js";
import type { CombinedSignal } from "./sentiment-strategy.js";

config();

function formatSignal(signal: CombinedSignal): void {
  const actionEmoji = {
    STRONG_BUY: "🟢🟢",
    BUY: "🟢",
    HOLD: "⚪",
    SELL: "🔴",
    STRONG_SELL: "🔴🔴",
  };

  console.log("\n" + "─".repeat(60));
  console.log(`${signal.symbol} | ${actionEmoji[signal.finalAction]} ${signal.finalAction}`);
  console.log("─".repeat(60));

  console.log(`\nPrice: $${signal.currentPrice.toLocaleString()} (${signal.priceChange24h > 0 ? "+" : ""}${signal.priceChange24h.toFixed(2)}% 24h)`);

  // Sentiment
  console.log(`\n📊 SENTIMENT`);
  console.log(`   Score: ${signal.sentimentScore} (${signal.sentimentLabel})`);
  console.log(`   Signal: ${signal.sentimentSignal.action} - ${signal.sentimentSignal.reason}`);

  // Technical
  console.log(`\n📈 TECHNICAL`);
  console.log(`   Signal: ${signal.technicalSignal}`);
  console.log(`   ${signal.technicalReason}`);

  // Combined
  console.log(`\n🎯 COMBINED SIGNAL`);
  console.log(`   Action: ${signal.finalAction}`);
  console.log(`   Confidence: ${signal.confidence}%`);
  console.log(`   ${signal.reasoning}`);

  // Risk management
  if (signal.suggestedPositionSize > 0) {
    console.log(`\n💰 POSITION SIZING`);
    console.log(`   Suggested allocation: ${signal.suggestedPositionSize}% of portfolio`);
    if (signal.stopLoss) {
      console.log(`   Stop Loss: $${signal.stopLoss.toLocaleString()} (${((signal.stopLoss / signal.currentPrice - 1) * 100).toFixed(1)}%)`);
    }
    if (signal.takeProfit) {
      console.log(`   Take Profit: $${signal.takeProfit.toLocaleString()} (+${((signal.takeProfit / signal.currentPrice - 1) * 100).toFixed(1)}%)`);
    }
  }
}

async function runScan() {
  console.log("=".repeat(60));
  console.log("  SENTIMENT + TECHNICAL MARKET SCANNER");
  console.log("=".repeat(60));
  console.log("\nThis scanner combines:");
  console.log("  1. Real-time X sentiment analysis (via Grok)");
  console.log("  2. Technical indicators (SMA, RSI, EMA)");
  console.log("  3. Contrarian logic (extreme sentiment = opportunity)");
  console.log("\nScanning top coins...\n");

  const signals = await scanMarketWithSentiment(["BTC", "ETH", "SOL"]);

  for (const signal of signals) {
    formatSignal(signal);
  }

  // Summary
  console.log("\n" + "=".repeat(60));
  console.log("  SUMMARY - TOP OPPORTUNITIES");
  console.log("=".repeat(60));

  const actionEmoji = {
    STRONG_BUY: "🟢🟢",
    BUY: "🟢",
    HOLD: "⚪",
    SELL: "🔴",
    STRONG_SELL: "🔴🔴",
  };

  console.log("\n");
  signals.forEach((s, i) => {
    console.log(`${i + 1}. ${actionEmoji[s.finalAction]} ${s.symbol.padEnd(10)} ${s.finalAction.padEnd(12)} Confidence: ${s.confidence}%`);
  });

  // Best opportunity
  const best = signals.find(s => s.finalAction === "STRONG_BUY" || s.finalAction === "BUY");
  if (best) {
    console.log("\n" + "─".repeat(60));
    console.log(`Best Opportunity: ${best.symbol}`);
    console.log(`Action: ${best.finalAction} with ${best.confidence}% confidence`);
    console.log(`Entry: $${best.currentPrice.toLocaleString()}`);
    if (best.stopLoss) console.log(`Stop Loss: $${best.stopLoss.toLocaleString()}`);
    if (best.takeProfit) console.log(`Take Profit: $${best.takeProfit.toLocaleString()}`);
    console.log("─".repeat(60));
  } else {
    console.log("\n⚪ No clear buy opportunities at this time. Wait for better entry.");
  }

  console.log("\n⚠️  DISCLAIMER: This is for educational purposes on testnet.");
  console.log("   Always do your own research before trading real funds.\n");
}

// If running directly
runScan().catch(console.error);
