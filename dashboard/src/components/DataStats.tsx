"use client";

import { Database, BarChart3, MessageSquare, ArrowUpDown } from "lucide-react";

interface DataStatsProps {
  candleStats: Array<{
    symbol: string;
    interval: string;
    count: number;
  }>;
  sentimentCount: number;
  tradeCount: number;
}

export function DataStats({ candleStats, sentimentCount, tradeCount }: DataStatsProps) {
  const totalCandles = candleStats.reduce((sum, s) => sum + parseInt(String(s.count)), 0);

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      <div className="bg-gray-900/50 border border-gray-800 rounded-lg p-4">
        <div className="flex items-center gap-2 text-blue-400 mb-2">
          <Database className="w-5 h-5" />
          <span className="text-sm">Candles</span>
        </div>
        <div className="text-2xl font-bold">{totalCandles.toLocaleString()}</div>
        <div className="text-xs text-gray-500">Historical data points</div>
      </div>

      <div className="bg-gray-900/50 border border-gray-800 rounded-lg p-4">
        <div className="flex items-center gap-2 text-purple-400 mb-2">
          <MessageSquare className="w-5 h-5" />
          <span className="text-sm">Sentiment</span>
        </div>
        <div className="text-2xl font-bold">{sentimentCount.toLocaleString()}</div>
        <div className="text-xs text-gray-500">Sentiment readings</div>
      </div>

      <div className="bg-gray-900/50 border border-gray-800 rounded-lg p-4">
        <div className="flex items-center gap-2 text-green-400 mb-2">
          <ArrowUpDown className="w-5 h-5" />
          <span className="text-sm">Trades</span>
        </div>
        <div className="text-2xl font-bold">{tradeCount.toLocaleString()}</div>
        <div className="text-xs text-gray-500">Executed trades</div>
      </div>

      <div className="bg-gray-900/50 border border-gray-800 rounded-lg p-4">
        <div className="flex items-center gap-2 text-orange-400 mb-2">
          <BarChart3 className="w-5 h-5" />
          <span className="text-sm">Symbols</span>
        </div>
        <div className="text-2xl font-bold">
          {new Set(candleStats.map((s) => s.symbol)).size}
        </div>
        <div className="text-xs text-gray-500">Tracked assets</div>
      </div>
    </div>
  );
}
