import crypto from "crypto";
import { config } from "dotenv";

config();

export interface BybitConfig {
  apiKey: string;
  apiSecret: string;
  testnet?: boolean;
}

export interface OrderParams {
  symbol: string;
  side: "Buy" | "Sell";
  orderType: "Market" | "Limit";
  qty: string;
  price?: string;
  timeInForce?: "GTC" | "IOC" | "FOK";
}

export interface TickerData {
  symbol: string;
  lastPrice: string;
  highPrice24h: string;
  lowPrice24h: string;
  volume24h: string;
  turnover24h: string;
  price24hPcnt: string;
}

export interface OrderBookData {
  symbol: string;
  bids: [string, string][];
  asks: [string, string][];
  timestamp: number;
}

export interface BalanceData {
  coin: string;
  free: string;
  locked: string;
  total: string;
}

export interface OrderResult {
  orderId: string;
  orderLinkId: string;
  symbol: string;
  side: string;
  orderType: string;
  price: string;
  qty: string;
  status: string;
}

export class BybitClient {
  private apiKey: string;
  private apiSecret: string;
  private baseUrl: string;
  private recvWindow = 5000;

  constructor(config?: Partial<BybitConfig>) {
    this.apiKey = config?.apiKey || process.env.BYBIT_API_KEY || "";
    this.apiSecret = config?.apiSecret || process.env.BYBIT_API_SECRET || "";
    this.baseUrl = config?.testnet
      ? "https://api-testnet.bybit.com"
      : "https://api.bybit.com";
  }

  private generateSignature(
    timestamp: string,
    params: Record<string, string | number | undefined>
  ): string {
    const filteredParams = Object.fromEntries(
      Object.entries(params).filter(([, v]) => v !== undefined)
    ) as Record<string, string | number>;

    const sortedParams = Object.keys(filteredParams)
      .sort()
      .map((key) => `${key}=${filteredParams[key]}`)
      .join("&");

    const signStr = `${timestamp}${this.apiKey}${this.recvWindow}${sortedParams}`;
    return crypto
      .createHmac("sha256", this.apiSecret)
      .update(signStr)
      .digest("hex");
  }

  private async request<T>(
    method: "GET" | "POST",
    endpoint: string,
    params: Record<string, string | number | undefined> = {},
    signed = false
  ): Promise<T> {
    const timestamp = Date.now().toString();
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };

    if (signed) {
      headers["X-BAPI-API-KEY"] = this.apiKey;
      headers["X-BAPI-TIMESTAMP"] = timestamp;
      headers["X-BAPI-RECV-WINDOW"] = this.recvWindow.toString();
      headers["X-BAPI-SIGN"] = this.generateSignature(timestamp, params);
    }

    let url = `${this.baseUrl}${endpoint}`;

    const fetchOptions: RequestInit = {
      method,
      headers,
    };

    if (method === "GET" && Object.keys(params).length > 0) {
      const filteredParams = Object.fromEntries(
        Object.entries(params).filter(([, v]) => v !== undefined)
      );
      const queryString = new URLSearchParams(
        filteredParams as Record<string, string>
      ).toString();
      url += `?${queryString}`;
    } else if (method === "POST") {
      fetchOptions.body = JSON.stringify(params);
    }

    const response = await fetch(url, fetchOptions);
    const data = await response.json();

    if (data.retCode !== 0) {
      throw new Error(`Bybit API Error: ${data.retMsg} (code: ${data.retCode})`);
    }

    return data.result as T;
  }

  // Market Data APIs (Public)

  async getTicker(symbol: string): Promise<TickerData> {
    const result = await this.request<{ list: TickerData[] }>(
      "GET",
      "/v5/market/tickers",
      { category: "spot", symbol }
    );
    return result.list[0];
  }

  async getAllTickers(): Promise<TickerData[]> {
    const result = await this.request<{ list: TickerData[] }>(
      "GET",
      "/v5/market/tickers",
      { category: "spot" }
    );
    return result.list;
  }

  async getOrderBook(symbol: string, limit = 25): Promise<OrderBookData> {
    const result = await this.request<OrderBookData>(
      "GET",
      "/v5/market/orderbook",
      { category: "spot", symbol, limit }
    );
    return result;
  }

  async getKlines(
    symbol: string,
    interval: string = "60",
    limit = 100
  ): Promise<string[][]> {
    const result = await this.request<{ list: string[][] }>(
      "GET",
      "/v5/market/kline",
      { category: "spot", symbol, interval, limit }
    );
    return result.list;
  }

  // Account APIs (Private)

  async getWalletBalance(): Promise<BalanceData[]> {
    const result = await this.request<{
      list: { coin: { coin: string; free: string; locked: string }[] }[];
    }>("GET", "/v5/account/wallet-balance", { accountType: "UNIFIED" }, true);

    if (!result.list?.[0]?.coin) {
      return [];
    }

    return result.list[0].coin.map((c) => ({
      coin: c.coin,
      free: c.free,
      locked: c.locked,
      total: (parseFloat(c.free) + parseFloat(c.locked)).toString(),
    }));
  }

  async getCoinBalance(coin: string): Promise<BalanceData | null> {
    const balances = await this.getWalletBalance();
    return balances.find((b) => b.coin === coin) || null;
  }

  // Trading APIs (Private)

  async placeOrder(params: OrderParams): Promise<OrderResult> {
    const orderParams = {
      category: "spot",
      symbol: params.symbol,
      side: params.side,
      orderType: params.orderType,
      qty: params.qty,
      price: params.price,
      timeInForce: params.timeInForce || "GTC",
    };

    return this.request<OrderResult>("POST", "/v5/order/create", orderParams, true);
  }

  async cancelOrder(symbol: string, orderId: string): Promise<OrderResult> {
    return this.request<OrderResult>(
      "POST",
      "/v5/order/cancel",
      { category: "spot", symbol, orderId },
      true
    );
  }

  async getOpenOrders(symbol?: string): Promise<OrderResult[]> {
    const result = await this.request<{ list: OrderResult[] }>(
      "GET",
      "/v5/order/realtime",
      { category: "spot", symbol },
      true
    );
    return result.list;
  }

  async getOrderHistory(symbol?: string, limit = 50): Promise<OrderResult[]> {
    const result = await this.request<{ list: OrderResult[] }>(
      "GET",
      "/v5/order/history",
      { category: "spot", symbol, limit },
      true
    );
    return result.list;
  }

  // Utility methods

  async getServerTime(): Promise<number> {
    const result = await this.request<{ timeSecond: string }>(
      "GET",
      "/v5/market/time"
    );
    return parseInt(result.timeSecond) * 1000;
  }
}

export const bybitClient = new BybitClient();
