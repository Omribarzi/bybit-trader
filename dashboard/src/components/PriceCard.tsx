"use client";

import { TrendingUp, TrendingDown } from "lucide-react";

interface PriceCardProps {
  symbol: string;
  price: number;
  change24h: string;
  volume24h: number;
  onClick?: () => void;
  selected?: boolean;
}

export function PriceCard({
  symbol,
  price,
  change24h,
  volume24h,
  onClick,
  selected,
}: PriceCardProps) {
  const isPositive = parseFloat(change24h) >= 0;
  const baseSymbol = symbol.replace("USDT", "");

  return (
    <div
      onClick={onClick}
      className={`p-4 rounded-xl cursor-pointer transition-all ${
        selected
          ? "bg-blue-600/20 border-2 border-blue-500"
          : "bg-gray-900/50 border border-gray-800 hover:border-gray-700"
      }`}
    >
      <div className="flex items-center justify-between mb-2">
        <span className="text-lg font-semibold">{baseSymbol}</span>
        <div
          className={`flex items-center gap-1 text-sm ${
            isPositive ? "text-green-400" : "text-red-400"
          }`}
        >
          {isPositive ? (
            <TrendingUp className="w-4 h-4" />
          ) : (
            <TrendingDown className="w-4 h-4" />
          )}
          {isPositive ? "+" : ""}
          {change24h}%
        </div>
      </div>
      <div className="text-2xl font-bold mb-1">
        ${price.toLocaleString(undefined, { maximumFractionDigits: 2 })}
      </div>
      <div className="text-xs text-gray-500">
        Vol: ${(volume24h / 1e6).toFixed(1)}M
      </div>
    </div>
  );
}
