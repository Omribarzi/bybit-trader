"use client";

import { format } from "date-fns";

interface SignalCardProps {
  action: string;
  symbol: string;
  confidence: number;
  reasoning: string;
  timestamp: string;
  sentimentScore?: number;
  priceAtSignal?: number;
}

export function SignalCard({
  action,
  symbol,
  confidence,
  reasoning,
  timestamp,
  sentimentScore,
  priceAtSignal,
}: SignalCardProps) {
  const getActionStyle = () => {
    switch (action) {
      case "STRONG_BUY":
        return "bg-green-500/20 border-green-500 text-green-400";
      case "BUY":
        return "bg-green-500/10 border-green-600 text-green-500";
      case "HOLD":
        return "bg-gray-500/10 border-gray-600 text-gray-400";
      case "SELL":
        return "bg-red-500/10 border-red-600 text-red-500";
      case "STRONG_SELL":
        return "bg-red-500/20 border-red-500 text-red-400";
      default:
        return "bg-gray-500/10 border-gray-600 text-gray-400";
    }
  };

  const getActionEmoji = () => {
    switch (action) {
      case "STRONG_BUY":
        return "🟢🟢";
      case "BUY":
        return "🟢";
      case "HOLD":
        return "⚪";
      case "SELL":
        return "🔴";
      case "STRONG_SELL":
        return "🔴🔴";
      default:
        return "⚪";
    }
  };

  return (
    <div className={`p-4 rounded-lg border ${getActionStyle()}`}>
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="text-xl">{getActionEmoji()}</span>
          <span className="font-bold text-lg">{symbol}</span>
        </div>
        <span className="text-sm opacity-70">
          {format(new Date(timestamp), "MMM d, HH:mm")}
        </span>
      </div>

      <div className="flex items-center gap-4 mb-2">
        <span className="font-semibold">{action.replace("_", " ")}</span>
        <span className="text-sm">Confidence: {confidence}%</span>
      </div>

      <p className="text-sm opacity-80 mb-2">{reasoning}</p>

      <div className="flex gap-4 text-xs opacity-60">
        {sentimentScore !== undefined && (
          <span>Sentiment: {sentimentScore}</span>
        )}
        {priceAtSignal && (
          <span>Price: ${priceAtSignal.toLocaleString()}</span>
        )}
      </div>
    </div>
  );
}
