import { config } from "dotenv";

config();

export interface SentimentScore {
  score: number; // -100 (extreme fear/bearish) to +100 (extreme greed/bullish)
  label: "extreme_fear" | "fear" | "neutral" | "greed" | "extreme_greed";
  confidence: number; // 0-100
  summary: string;
  keyTopics: string[];
  influencerSentiment: string;
  newsImpact: string;
  timestamp: Date;
}

export interface SentimentHistory {
  symbol: string;
  scores: SentimentScore[];
  trend: "rising" | "falling" | "stable";
  avgScore24h: number;
  peakScore: number;
  peakTime: Date;
  troughScore: number;
  troughTime: Date;
}

export interface TradingSignal {
  action: "STRONG_BUY" | "BUY" | "HOLD" | "SELL" | "STRONG_SELL";
  reason: string;
  sentimentScore: number;
  priceContext: string;
  riskLevel: "low" | "medium" | "high";
}

// Sentiment thresholds for contrarian trading
const SENTIMENT_THRESHOLDS = {
  EXTREME_GREED: 75,    // Time to be cautious - potential top
  GREED: 50,            // Market is optimistic
  NEUTRAL_HIGH: 25,     // Slightly bullish
  NEUTRAL_LOW: -25,     // Slightly bearish
  FEAR: -50,            // Market is pessimistic - potential opportunity
  EXTREME_FEAR: -75,    // Strong buy signal - maximum fear = maximum opportunity
};

function getSentimentLabel(score: number): SentimentScore["label"] {
  if (score >= SENTIMENT_THRESHOLDS.EXTREME_GREED) return "extreme_greed";
  if (score >= SENTIMENT_THRESHOLDS.GREED) return "greed";
  if (score >= SENTIMENT_THRESHOLDS.NEUTRAL_LOW) return "neutral";
  if (score >= SENTIMENT_THRESHOLDS.FEAR) return "fear";
  return "extreme_fear";
}

export async function analyzeSentiment(query: string): Promise<SentimentScore> {
  const prompt = `Analyze the current X (Twitter) sentiment for "${query}" in the cryptocurrency market.

You must respond with ONLY a valid JSON object, no other text. Use this exact format:
{
  "score": <number from -100 to 100, where -100 is extreme bearish/fear, 0 is neutral, 100 is extreme bullish/greed>,
  "confidence": <number from 0 to 100 indicating how confident you are in this assessment>,
  "summary": "<2-3 sentence summary of the overall sentiment>",
  "keyTopics": ["<topic1>", "<topic2>", "<topic3>"],
  "influencerSentiment": "<what are prominent crypto influencers saying>",
  "newsImpact": "<any breaking news affecting sentiment>",
  "volumeOfDiscussion": "<low/medium/high - how much is this being discussed>",
  "sentimentShift": "<is sentiment shifting from recent days? rising/falling/stable>"
}

Consider:
1. Recent price action and how people are reacting
2. News events and their impact
3. Influencer opinions (whales, analysts, traders)
4. General retail sentiment (FOMO, FUD, etc.)
5. Meme activity and viral posts
6. Comparison to sentiment 24-48 hours ago

Be objective and contrarian-aware: extreme sentiment often precedes reversals.`;

  try {
    const response = await fetch("https://api.x.ai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.XAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: "grok-2-1212",
        messages: [{ role: "user", content: prompt }],
        temperature: 0.3, // Lower temperature for more consistent scoring
      }),
    });

    if (!response.ok) {
      throw new Error(`API error: ${response.status}`);
    }

    const data = await response.json();
    const content = data.choices[0]?.message?.content || "{}";

    // Parse JSON from response
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error("No JSON found in response");
    }

    const parsed = JSON.parse(jsonMatch[0]);

    return {
      score: Math.max(-100, Math.min(100, parsed.score || 0)),
      label: getSentimentLabel(parsed.score || 0),
      confidence: parsed.confidence || 50,
      summary: parsed.summary || "Unable to analyze sentiment",
      keyTopics: parsed.keyTopics || [],
      influencerSentiment: parsed.influencerSentiment || "Unknown",
      newsImpact: parsed.newsImpact || "No significant news",
      timestamp: new Date(),
    };
  } catch (error) {
    console.error("Sentiment analysis error:", error);
    return {
      score: 0,
      label: "neutral",
      confidence: 0,
      summary: "Error analyzing sentiment",
      keyTopics: [],
      influencerSentiment: "Unknown",
      newsImpact: "Unknown",
      timestamp: new Date(),
    };
  }
}

// In-memory sentiment history (in production, use a database)
const sentimentHistoryStore: Map<string, SentimentScore[]> = new Map();

export function recordSentiment(symbol: string, score: SentimentScore): void {
  const history = sentimentHistoryStore.get(symbol) || [];
  history.push(score);

  // Keep last 168 entries (7 days if checking hourly)
  if (history.length > 168) {
    history.shift();
  }

  sentimentHistoryStore.set(symbol, history);
}

export function getSentimentHistory(symbol: string): SentimentHistory | null {
  const scores = sentimentHistoryStore.get(symbol);
  if (!scores || scores.length === 0) return null;

  // Calculate metrics
  const now = Date.now();
  const last24h = scores.filter(s => now - s.timestamp.getTime() < 24 * 60 * 60 * 1000);
  const avgScore24h = last24h.length > 0
    ? last24h.reduce((sum, s) => sum + s.score, 0) / last24h.length
    : scores[scores.length - 1].score;

  // Find peak and trough
  let peakScore = -Infinity, troughScore = Infinity;
  let peakTime = new Date(), troughTime = new Date();

  for (const s of scores) {
    if (s.score > peakScore) {
      peakScore = s.score;
      peakTime = s.timestamp;
    }
    if (s.score < troughScore) {
      troughScore = s.score;
      troughTime = s.timestamp;
    }
  }

  // Determine trend (last 6 readings)
  const recent = scores.slice(-6);
  let trend: "rising" | "falling" | "stable" = "stable";
  if (recent.length >= 2) {
    const firstHalf = recent.slice(0, Math.floor(recent.length / 2));
    const secondHalf = recent.slice(Math.floor(recent.length / 2));
    const firstAvg = firstHalf.reduce((sum, s) => sum + s.score, 0) / firstHalf.length;
    const secondAvg = secondHalf.reduce((sum, s) => sum + s.score, 0) / secondHalf.length;

    if (secondAvg - firstAvg > 10) trend = "rising";
    else if (firstAvg - secondAvg > 10) trend = "falling";
  }

  return {
    symbol,
    scores,
    trend,
    avgScore24h,
    peakScore,
    peakTime,
    troughScore,
    troughTime,
  };
}

// Generate trading signal based on sentiment
export function generateSentimentSignal(
  sentiment: SentimentScore,
  history: SentimentHistory | null,
  currentPriceChange24h: number // percentage
): TradingSignal {
  const { score, confidence } = sentiment;
  const trend = history?.trend || "stable";

  // Contrarian logic:
  // - Extreme fear + price already down = potential bottom (BUY)
  // - Extreme greed + price already up = potential top (SELL)
  // - Sentiment divergence from price = early signal

  let action: TradingSignal["action"] = "HOLD";
  let reason = "";
  let riskLevel: TradingSignal["riskLevel"] = "medium";

  // EXTREME FEAR scenarios
  if (score <= SENTIMENT_THRESHOLDS.EXTREME_FEAR) {
    if (currentPriceChange24h < -5) {
      // Price crashed AND sentiment is extreme fear - classic bottom signal
      action = "STRONG_BUY";
      reason = "Extreme fear with significant price drop - potential capitulation bottom";
      riskLevel = "high"; // High risk but high reward
    } else if (trend === "falling") {
      // Sentiment still falling - wait for stabilization
      action = "BUY";
      reason = "Extreme fear but sentiment still declining - accumulate cautiously";
      riskLevel = "medium";
    } else {
      // Sentiment stabilizing at extreme fear
      action = "STRONG_BUY";
      reason = "Extreme fear with stabilizing sentiment - high probability reversal zone";
      riskLevel = "medium";
    }
  }

  // FEAR scenarios
  else if (score <= SENTIMENT_THRESHOLDS.FEAR) {
    if (currentPriceChange24h > 0 && trend === "rising") {
      // Price up but sentiment still fearful - bullish divergence
      action = "BUY";
      reason = "Bullish divergence: price recovering while sentiment still fearful";
      riskLevel = "low";
    } else if (trend === "falling") {
      action = "HOLD";
      reason = "Fear increasing - wait for sentiment to stabilize";
      riskLevel = "medium";
    } else {
      action = "BUY";
      reason = "Fear zone with stable sentiment - good entry opportunity";
      riskLevel = "medium";
    }
  }

  // NEUTRAL scenarios
  else if (score <= SENTIMENT_THRESHOLDS.GREED) {
    if (trend === "rising" && currentPriceChange24h > 0) {
      action = "HOLD";
      reason = "Neutral-positive sentiment with uptrend - ride the trend";
      riskLevel = "low";
    } else if (trend === "falling") {
      action = "HOLD";
      reason = "Sentiment cooling - monitor for entry on further weakness";
      riskLevel = "low";
    } else {
      action = "HOLD";
      reason = "Neutral sentiment - no clear edge";
      riskLevel = "low";
    }
  }

  // GREED scenarios
  else if (score <= SENTIMENT_THRESHOLDS.EXTREME_GREED) {
    if (currentPriceChange24h > 5 && trend === "rising") {
      // Price pumping and greed rising - getting risky
      action = "SELL";
      reason = "Greed rising with strong price pump - consider taking profits";
      riskLevel = "medium";
    } else if (trend === "falling") {
      // Greed cooling - healthy
      action = "HOLD";
      reason = "Greed cooling naturally - healthy consolidation";
      riskLevel = "low";
    } else {
      action = "HOLD";
      reason = "Elevated greed - be cautious with new positions";
      riskLevel = "medium";
    }
  }

  // EXTREME GREED scenarios
  else {
    if (currentPriceChange24h > 10) {
      // Parabolic move with extreme greed - top signal
      action = "STRONG_SELL";
      reason = "Extreme greed with parabolic price action - high probability top";
      riskLevel = "high";
    } else if (trend === "rising") {
      action = "STRONG_SELL";
      reason = "Extreme greed still rising - market euphoria, exit positions";
      riskLevel = "high";
    } else {
      action = "SELL";
      reason = "Extreme greed zone - take profits, don't be greedy";
      riskLevel = "medium";
    }
  }

  // Adjust for confidence
  if (confidence < 30) {
    if (action === "STRONG_BUY") action = "BUY";
    if (action === "STRONG_SELL") action = "SELL";
    reason += " (low confidence - smaller position size recommended)";
  }

  return {
    action,
    reason,
    sentimentScore: score,
    priceContext: `24h change: ${currentPriceChange24h > 0 ? "+" : ""}${currentPriceChange24h.toFixed(2)}%`,
    riskLevel,
  };
}

// Main function to get full sentiment analysis with trading signal
export async function getFullSentimentAnalysis(
  symbol: string,
  currentPriceChange24h: number
): Promise<{
  sentiment: SentimentScore;
  history: SentimentHistory | null;
  signal: TradingSignal;
}> {
  // Get fresh sentiment
  const sentiment = await analyzeSentiment(symbol);

  // Record it
  recordSentiment(symbol, sentiment);

  // Get history
  const history = getSentimentHistory(symbol);

  // Generate signal
  const signal = generateSentimentSignal(sentiment, history, currentPriceChange24h);

  return { sentiment, history, signal };
}
