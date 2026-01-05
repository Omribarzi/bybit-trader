"use client";

import { format } from "date-fns";
import { ArrowUpRight, ArrowDownRight } from "lucide-react";

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

interface TradesTableProps {
  trades: Trade[];
  loading?: boolean;
}

export function TradesTable({ trades, loading }: TradesTableProps) {
  if (loading) {
    return (
      <div className="animate-pulse space-y-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-12 bg-gray-800 rounded" />
        ))}
      </div>
    );
  }

  if (trades.length === 0) {
    return (
      <div className="text-center py-8 text-gray-500">
        <ArrowUpRight className="w-12 h-12 mx-auto mb-2 opacity-50" />
        <p>No trades yet</p>
        <p className="text-sm">Your executed trades will appear here</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-gray-500 text-xs border-b border-gray-800">
            <th className="text-left py-2 px-2">Time</th>
            <th className="text-left py-2 px-2">Pair</th>
            <th className="text-left py-2 px-2">Side</th>
            <th className="text-right py-2 px-2">Price</th>
            <th className="text-right py-2 px-2">Amount</th>
            <th className="text-right py-2 px-2">Value</th>
            <th className="text-right py-2 px-2">Fee</th>
          </tr>
        </thead>
        <tbody>
          {trades.map((trade) => (
            <tr
              key={trade.execId}
              className="border-b border-gray-800/50 hover:bg-gray-800/30"
            >
              <td className="py-3 px-2 text-gray-400">
                {format(new Date(parseInt(trade.execTime)), "MMM d, HH:mm:ss")}
              </td>
              <td className="py-3 px-2 font-medium">
                {trade.symbol.replace("USDT", "/USDT")}
              </td>
              <td className="py-3 px-2">
                <div className="flex items-center gap-1">
                  {trade.side === "Buy" ? (
                    <ArrowUpRight className="w-4 h-4 text-green-400" />
                  ) : (
                    <ArrowDownRight className="w-4 h-4 text-red-400" />
                  )}
                  <span
                    className={
                      trade.side === "Buy" ? "text-green-400" : "text-red-400"
                    }
                  >
                    {trade.side}
                  </span>
                </div>
              </td>
              <td className="py-3 px-2 text-right font-mono">
                ${parseFloat(trade.execPrice).toLocaleString(undefined, {
                  maximumFractionDigits: 2,
                })}
              </td>
              <td className="py-3 px-2 text-right font-mono">
                {parseFloat(trade.execQty).toFixed(6)}
              </td>
              <td className="py-3 px-2 text-right font-mono">
                ${parseFloat(trade.execValue).toLocaleString(undefined, {
                  maximumFractionDigits: 2,
                })}
              </td>
              <td className="py-3 px-2 text-right font-mono text-gray-500">
                ${parseFloat(trade.execFee).toFixed(4)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
