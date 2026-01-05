import { config } from "dotenv";
import { bybitClient } from "../api/bybit-client.js";
import {
  analyzeSentiment,
  getFullSentimentAnalysis,
  recordSentiment,
  getSentimentHistory,
} from "./sentiment-engine.js";

config();

async function testSentiment() {
  console.log("=".repeat(60));
  console.log("  SENTIMENT ANALYSIS ENGINE TEST");
  console.log("=".repeat(60));

  const symbols = ["BTC", "ETH"];

  for (const symbol of symbols) {
    console.log(`\n${"=".repeat(60)}`);
    console.log(`  Analyzing ${symbol} Sentiment`);
    console.log("=".repeat(60));

    // Get current price data
    const ticker = await bybitClient.getTicker(`${symbol}USDT`);
    const priceChange24h = parseFloat(ticker.price24hPcnt) * 100;

    console.log(`\nCurrent Price: $${parseFloat(ticker.lastPrice).toLocaleString()}`);
    console.log(`24h Change: ${priceChange24h > 0 ? "+" : ""}${priceChange24h.toFixed(2)}%`);

    // Get full sentiment analysis
    console.log("\nAnalyzing X sentiment...");
    const { sentiment, signal } = await getFullSentimentAnalysis(symbol, priceChange24h);

    // Display sentiment
    console.log("\n--- SENTIMENT SCORE ---");
    console.log(`Score: ${sentiment.score} (${sentiment.label.toUpperCase()})`);
    console.log(`Confidence: ${sentiment.confidence}%`);
    console.log(`\nSummary: ${sentiment.summary}`);
    console.log(`\nKey Topics: ${sentiment.keyTopics.join(", ")}`);
    console.log(`Influencer Sentiment: ${sentiment.influencerSentiment}`);
    console.log(`News Impact: ${sentiment.newsImpact}`);

    // Display trading signal
    console.log("\n--- TRADING SIGNAL ---");
    const signalEmoji = {
      STRONG_BUY: "🟢🟢",
      BUY: "🟢",
      HOLD: "⚪",
      SELL: "🔴",
      STRONG_SELL: "🔴🔴",
    };
    console.log(`Action: ${signalEmoji[signal.action]} ${signal.action}`);
    console.log(`Reason: ${signal.reason}`);
    console.log(`Risk Level: ${signal.riskLevel.toUpperCase()}`);
    console.log(`Price Context: ${signal.priceContext}`);

    // Visual sentiment meter
    console.log("\n--- SENTIMENT METER ---");
    const meterWidth = 40;
    const position = Math.round(((sentiment.score + 100) / 200) * meterWidth);
    const meter = "─".repeat(position) + "●" + "─".repeat(meterWidth - position);
    console.log(`FEAR [${meter}] GREED`);
    console.log(`     -100                    0                    +100`);
  }

  // Explain the contrarian approach
  console.log("\n" + "=".repeat(60));
  console.log("  CONTRARIAN SENTIMENT STRATEGY EXPLAINED");
  console.log("=".repeat(60));
  console.log(`
The sentiment engine uses a CONTRARIAN approach:

📈 EXTREME GREED (75-100): "Be fearful when others are greedy"
   - Market euphoria often signals tops
   - Everyone is bullish = who's left to buy?
   - Signal: SELL / Take profits

📊 NEUTRAL (−25 to +50): "No clear edge"
   - Wait for extreme readings
   - Follow the trend if one exists
   - Signal: HOLD / Monitor

📉 EXTREME FEAR (−75 to −100): "Be greedy when others are fearful"
   - Capitulation often signals bottoms
   - Everyone selling = who's left to sell?
   - Signal: BUY / Accumulate

Key insight: The BEST time to enter is when:
1. Sentiment is in extreme fear
2. Price has already dropped significantly
3. Sentiment is starting to STABILIZE (not still falling)

The WORST time to enter is when:
1. Sentiment is in extreme greed
2. Price has already pumped significantly
3. Everyone on X is talking about "to the moon"
`);
}

testSentiment().catch(console.error);
