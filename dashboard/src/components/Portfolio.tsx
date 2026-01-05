"use client";

import { Wallet, TrendingUp, TrendingDown } from "lucide-react";

interface Balance {
  coin: string;
  free: string;
  locked: string;
  total: string;
  usdValue?: string;
}

interface PortfolioProps {
  balances: Balance[];
  totalUsd: number;
  testnet: boolean;
  loading?: boolean;
}

export function Portfolio({ balances, totalUsd, testnet, loading }: PortfolioProps) {
  if (loading) {
    return (
      <div className="bg-gray-900/50 border border-gray-800 rounded-xl p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-6 bg-gray-800 rounded w-1/3" />
          <div className="h-12 bg-gray-800 rounded w-1/2" />
          <div className="space-y-2">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-10 bg-gray-800 rounded" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-gray-900/50 border border-gray-800 rounded-xl p-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Wallet className="w-5 h-5 text-green-400" />
          <h3 className="text-lg font-semibold">Portfolio</h3>
        </div>
        {testnet && (
          <span className="px-2 py-1 text-xs bg-yellow-500/20 text-yellow-400 rounded">
            TESTNET
          </span>
        )}
      </div>

      <div className="mb-6">
        <p className="text-sm text-gray-500">Total Value</p>
        <p className="text-3xl font-bold text-green-400">
          ${totalUsd.toLocaleString(undefined, { maximumFractionDigits: 2 })}
        </p>
      </div>

      {balances.length === 0 ? (
        <div className="text-center py-8 text-gray-500">
          <Wallet className="w-12 h-12 mx-auto mb-2 opacity-50" />
          <p>No assets found</p>
          <p className="text-sm">Deposit funds to start trading</p>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="grid grid-cols-4 text-xs text-gray-500 pb-2 border-b border-gray-800">
            <span>Asset</span>
            <span className="text-right">Available</span>
            <span className="text-right">Locked</span>
            <span className="text-right">USD Value</span>
          </div>
          {balances.map((balance) => (
            <div
              key={balance.coin}
              className="grid grid-cols-4 items-center py-2 hover:bg-gray-800/30 rounded px-1 -mx-1"
            >
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-full bg-gray-800 flex items-center justify-center text-xs font-bold">
                  {balance.coin.slice(0, 2)}
                </div>
                <span className="font-medium">{balance.coin}</span>
              </div>
              <span className="text-right font-mono text-sm">
                {parseFloat(balance.free).toFixed(6)}
              </span>
              <span className="text-right font-mono text-sm text-gray-500">
                {parseFloat(balance.locked) > 0
                  ? parseFloat(balance.locked).toFixed(6)
                  : "-"}
              </span>
              <span className="text-right font-mono text-sm">
                ${parseFloat(balance.usdValue || "0").toLocaleString(undefined, {
                  maximumFractionDigits: 2,
                })}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
