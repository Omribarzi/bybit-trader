"use client";

import { format } from "date-fns";
import { X, Clock, CheckCircle, XCircle, AlertCircle } from "lucide-react";

interface Order {
  orderId: string;
  symbol: string;
  side: string;
  orderType: string;
  price: string;
  qty: string;
  cumExecQty?: string;
  cumExecValue?: string;
  avgPrice?: string;
  status: string;
  createdTime: string;
}

interface OrdersTableProps {
  orders: Order[];
  type: "open" | "history";
  onCancel?: (symbol: string, orderId: string) => void;
  loading?: boolean;
}

export function OrdersTable({ orders, type, onCancel, loading }: OrdersTableProps) {
  const getStatusIcon = (status: string) => {
    switch (status) {
      case "New":
      case "PartiallyFilled":
        return <Clock className="w-4 h-4 text-yellow-400" />;
      case "Filled":
        return <CheckCircle className="w-4 h-4 text-green-400" />;
      case "Cancelled":
      case "Rejected":
        return <XCircle className="w-4 h-4 text-red-400" />;
      default:
        return <AlertCircle className="w-4 h-4 text-gray-400" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "New":
      case "PartiallyFilled":
        return "text-yellow-400";
      case "Filled":
        return "text-green-400";
      case "Cancelled":
      case "Rejected":
        return "text-red-400";
      default:
        return "text-gray-400";
    }
  };

  if (loading) {
    return (
      <div className="animate-pulse space-y-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-12 bg-gray-800 rounded" />
        ))}
      </div>
    );
  }

  if (orders.length === 0) {
    return (
      <div className="text-center py-8 text-gray-500">
        {type === "open" ? (
          <>
            <Clock className="w-12 h-12 mx-auto mb-2 opacity-50" />
            <p>No open orders</p>
          </>
        ) : (
          <>
            <CheckCircle className="w-12 h-12 mx-auto mb-2 opacity-50" />
            <p>No order history</p>
          </>
        )}
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
            <th className="text-left py-2 px-2">Type</th>
            <th className="text-left py-2 px-2">Side</th>
            <th className="text-right py-2 px-2">Price</th>
            <th className="text-right py-2 px-2">Amount</th>
            <th className="text-right py-2 px-2">Filled</th>
            <th className="text-left py-2 px-2">Status</th>
            {type === "open" && <th className="text-right py-2 px-2">Action</th>}
          </tr>
        </thead>
        <tbody>
          {orders.map((order) => {
            const filledQty = parseFloat(order.cumExecQty || "0");
            const totalQty = parseFloat(order.qty);
            const fillPercent = totalQty > 0 ? (filledQty / totalQty) * 100 : 0;

            return (
              <tr
                key={order.orderId}
                className="border-b border-gray-800/50 hover:bg-gray-800/30"
              >
                <td className="py-3 px-2 text-gray-400">
                  {format(new Date(parseInt(order.createdTime)), "MMM d, HH:mm")}
                </td>
                <td className="py-3 px-2 font-medium">
                  {order.symbol.replace("USDT", "/USDT")}
                </td>
                <td className="py-3 px-2 text-gray-400">{order.orderType}</td>
                <td className="py-3 px-2">
                  <span
                    className={
                      order.side === "Buy" ? "text-green-400" : "text-red-400"
                    }
                  >
                    {order.side}
                  </span>
                </td>
                <td className="py-3 px-2 text-right font-mono">
                  {order.orderType === "Market"
                    ? order.avgPrice || "Market"
                    : parseFloat(order.price).toLocaleString()}
                </td>
                <td className="py-3 px-2 text-right font-mono">
                  {parseFloat(order.qty).toFixed(6)}
                </td>
                <td className="py-3 px-2 text-right">
                  <span className="font-mono">{fillPercent.toFixed(0)}%</span>
                </td>
                <td className="py-3 px-2">
                  <div className="flex items-center gap-1">
                    {getStatusIcon(order.status)}
                    <span className={getStatusColor(order.status)}>
                      {order.status}
                    </span>
                  </div>
                </td>
                {type === "open" && (
                  <td className="py-3 px-2 text-right">
                    <button
                      onClick={() => onCancel?.(order.symbol, order.orderId)}
                      className="p-1 hover:bg-red-500/20 rounded text-red-400 transition-colors"
                      title="Cancel order"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
