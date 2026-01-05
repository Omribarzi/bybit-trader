"use client";

import { useState, useMemo } from "react";
import { ArrowUpCircle, ArrowDownCircle, Loader2, AlertCircle, CheckCircle } from "lucide-react";

interface Balance {
  coin: string;
  free: string;
  locked: string;
  total: string;
  usdValue?: string;
}

interface TradeFormProps {
  symbol: string;
  currentPrice: number;
  balances: Balance[];
  onOrderPlaced?: () => void;
}

export function TradeForm({
  symbol,
  currentPrice,
  balances,
  onOrderPlaced,
}: TradeFormProps) {
  const [side, setSide] = useState<"Buy" | "Sell">("Buy");
  const [orderType, setOrderType] = useState<"Market" | "Limit">("Market");
  const [quantity, setQuantity] = useState("");
  const [price, setPrice] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const baseAsset = symbol.replace("USDT", "");
  const MIN_ORDER_VALUE = 5; // Bybit minimum order value in USDT

  // Get available balance based on side
  // Buy: need USDT to buy base asset
  // Sell: need base asset to sell for USDT
  const availableBalance = useMemo(() => {
    if (!balances || balances.length === 0) return 0;
    if (side === "Buy") {
      return parseFloat(balances.find((b) => b.coin === "USDT")?.free || "0");
    } else {
      return parseFloat(balances.find((b) => b.coin === baseAsset)?.free || "0");
    }
  }, [side, balances, baseAsset]);

  // Get the balance display currency
  const balanceCurrency = side === "Buy" ? "USDT" : baseAsset;

  // Calculate order value
  const orderPrice = orderType === "Market" ? currentPrice : parseFloat(price) || 0;
  const orderValue = (parseFloat(quantity) || 0) * orderPrice;
  const isBelowMinimum = orderValue > 0 && orderValue < MIN_ORDER_VALUE;

  // Check if quantity exceeds available balance (for sell orders)
  const exceedsBalance = side === "Sell" && parseFloat(quantity) > availableBalance;

  // Quick amount buttons (percentage of balance)
  const setPercentage = (pct: number) => {
    if (side === "Buy" && availableBalance > 0 && orderPrice > 0) {
      // For buy: calculate how much base asset we can buy with USDT balance
      const maxQty = (availableBalance * pct) / orderPrice;
      setQuantity(maxQty.toFixed(6));
    } else if (side === "Sell" && availableBalance > 0) {
      // For sell: use percentage of base asset balance directly
      const qty = availableBalance * pct;
      setQuantity(qty.toFixed(6));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (!quantity || parseFloat(quantity) <= 0) {
      setError("Please enter a valid quantity");
      return;
    }

    if (orderType === "Limit" && (!price || parseFloat(price) <= 0)) {
      setError("Please enter a valid price for limit order");
      return;
    }

    if (orderValue < MIN_ORDER_VALUE) {
      setError(`Minimum order value is $${MIN_ORDER_VALUE} USDT`);
      return;
    }

    // Check if sell quantity exceeds available balance
    if (side === "Sell" && parseFloat(quantity) > availableBalance) {
      setError(`Insufficient ${baseAsset} balance. You have ${availableBalance.toFixed(6)} ${baseAsset}`);
      return;
    }

    setLoading(true);

    try {
      const res = await fetch("/api/trade", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          symbol,
          side,
          orderType,
          qty: quantity,
          price: orderType === "Limit" ? price : undefined,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.message || data.error || "Order failed");
      }

      setSuccess(
        `${side} order placed! Order ID: ${data.orderId.slice(0, 8)}...`
      );
      setQuantity("");
      setPrice("");
      onOrderPlaced?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to place order");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-gray-900/50 border border-gray-800 rounded-xl p-6">
      <h3 className="text-lg font-semibold mb-4">Trade {baseAsset}</h3>

      {/* Buy/Sell Toggle */}
      <div className="flex gap-2 mb-4">
        <button
          type="button"
          onClick={() => setSide("Buy")}
          className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-lg font-semibold transition-colors ${
            side === "Buy"
              ? "bg-green-600 text-white"
              : "bg-gray-800 text-gray-400 hover:bg-gray-700"
          }`}
        >
          <ArrowUpCircle className="w-5 h-5" />
          Buy
        </button>
        <button
          type="button"
          onClick={() => setSide("Sell")}
          className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-lg font-semibold transition-colors ${
            side === "Sell"
              ? "bg-red-600 text-white"
              : "bg-gray-800 text-gray-400 hover:bg-gray-700"
          }`}
        >
          <ArrowDownCircle className="w-5 h-5" />
          Sell
        </button>
      </div>

      {/* Order Type */}
      <div className="flex gap-2 mb-4">
        <button
          type="button"
          onClick={() => setOrderType("Market")}
          className={`flex-1 py-2 text-sm rounded-lg transition-colors ${
            orderType === "Market"
              ? "bg-blue-600 text-white"
              : "bg-gray-800 text-gray-400 hover:bg-gray-700"
          }`}
        >
          Market
        </button>
        <button
          type="button"
          onClick={() => {
            setOrderType("Limit");
            if (!price) setPrice(currentPrice.toFixed(2));
          }}
          className={`flex-1 py-2 text-sm rounded-lg transition-colors ${
            orderType === "Limit"
              ? "bg-blue-600 text-white"
              : "bg-gray-800 text-gray-400 hover:bg-gray-700"
          }`}
        >
          Limit
        </button>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Price Input (Limit only) */}
        {orderType === "Limit" && (
          <div>
            <label className="block text-sm text-gray-400 mb-1">
              Price (USDT)
            </label>
            <input
              type="number"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              placeholder="0.00"
              step="any"
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-blue-500"
            />
          </div>
        )}

        {/* Current Price Display */}
        {orderType === "Market" && (
          <div className="p-3 bg-gray-800/50 rounded-lg">
            <span className="text-sm text-gray-400">Market Price: </span>
            <span className="font-mono font-semibold">
              ${currentPrice.toLocaleString(undefined, { maximumFractionDigits: 2 })}
            </span>
          </div>
        )}

        {/* Quantity Input */}
        <div>
          <label className="block text-sm text-gray-400 mb-1">
            Amount ({baseAsset})
          </label>
          <input
            type="number"
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
            placeholder="0.00"
            step="any"
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-blue-500"
          />
        </div>

        {/* Quick Amount Buttons */}
        <div className="flex gap-2">
          {[25, 50, 75, 100].map((pct) => (
            <button
              key={pct}
              type="button"
              onClick={() => setPercentage(pct / 100)}
              disabled={availableBalance === 0}
              className="flex-1 py-1 text-xs bg-gray-800 hover:bg-gray-700 disabled:bg-gray-800/50 disabled:text-gray-600 rounded transition-colors"
            >
              {pct}%
            </button>
          ))}
        </div>

        {/* Order Summary */}
        <div className="p-3 bg-gray-800/50 rounded-lg space-y-1">
          <div className="flex justify-between text-sm">
            <span className="text-gray-400">Order Value:</span>
            <span className={`font-mono ${isBelowMinimum ? "text-red-400" : ""}`}>
              ${orderValue.toLocaleString(undefined, { maximumFractionDigits: 2 })} USDT
              {isBelowMinimum && <span className="text-xs ml-1">(min $5)</span>}
            </span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-gray-400">Available:</span>
            <span className={`font-mono ${exceedsBalance ? "text-red-400" : ""}`}>
              {side === "Buy" ? (
                <>
                  ${availableBalance.toLocaleString(undefined, { maximumFractionDigits: 2 })} USDT
                </>
              ) : (
                <>
                  {availableBalance.toFixed(6)} {baseAsset}
                  {availableBalance > 0 && orderPrice > 0 && (
                    <span className="text-gray-500 ml-1">
                      (~${(availableBalance * orderPrice).toFixed(2)})
                    </span>
                  )}
                </>
              )}
              {exceedsBalance && <span className="text-xs ml-1">(insufficient)</span>}
            </span>
          </div>
          <div className="flex justify-between text-xs text-gray-500">
            <span>Min Order:</span>
            <span>$5 USDT</span>
          </div>
        </div>

        {/* Error Message */}
        {error && (
          <div className="flex items-center gap-2 p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-sm">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            {error}
          </div>
        )}

        {/* Success Message */}
        {success && (
          <div className="flex items-center gap-2 p-3 bg-green-500/10 border border-green-500/30 rounded-lg text-green-400 text-sm">
            <CheckCircle className="w-4 h-4 flex-shrink-0" />
            {success}
          </div>
        )}

        {/* Submit Button */}
        <button
          type="submit"
          disabled={loading || !quantity || isBelowMinimum || exceedsBalance}
          className={`w-full py-4 rounded-lg font-semibold transition-colors flex items-center justify-center gap-2 ${
            side === "Buy"
              ? "bg-green-600 hover:bg-green-500 disabled:bg-green-600/50"
              : "bg-red-600 hover:bg-red-500 disabled:bg-red-600/50"
          } disabled:cursor-not-allowed`}
        >
          {loading ? (
            <>
              <Loader2 className="w-5 h-5 animate-spin" />
              Placing Order...
            </>
          ) : (
            <>
              {side === "Buy" ? (
                <ArrowUpCircle className="w-5 h-5" />
              ) : (
                <ArrowDownCircle className="w-5 h-5" />
              )}
              {side} {baseAsset}
            </>
          )}
        </button>

        {/* Testnet Warning */}
        <p className="text-xs text-center text-yellow-500">
          Trading on TESTNET - Not real funds
        </p>
      </form>
    </div>
  );
}
