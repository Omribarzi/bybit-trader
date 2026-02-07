import crypto from "crypto";
import { config } from "dotenv";

config();

// ============================================
// TYPES
// ============================================

export interface FuturesPosition {
  symbol: string;
  side: "Buy" | "Sell";
  size: string;
  avgPrice: string;
  positionValue: string;
  leverage: string;
  liqPrice: string;
  markPrice: string;
  unrealisedPnl: string;
  cumRealisedPnl: string;
  takeProfit: string;
  stopLoss: string;
  positionIdx: number; // 0=one-way, 1=buy-side hedge, 2=sell-side hedge
  createdTime: string;
  updatedTime: string;
}

export interface FuturesOrderParams {
  symbol: string;
  side: "Buy" | "Sell";
  orderType: "Market" | "Limit";
  qty: string;
  price?: string;
  timeInForce?: "GTC" | "IOC" | "FOK" | "PostOnly";
  positionIdx?: number;  // 0=one-way (default), 1=buy hedge, 2=sell hedge
  stopLoss?: string;
  takeProfit?: string;
  reduceOnly?: boolean;
  closeOnTrigger?: boolean;
}

export interface FundingRate {
  symbol: string;
  fundingRate: string;
  fundingRateTimestamp: string;
}

export interface FundingHistory {
  symbol: string;
  fundingRate: string;
  fundingRateTimestamp: string;
}

export interface InstrumentInfo {
  symbol: string;
  contractType: string;
  status: string;
  baseCoin: string;
  quoteCoin: string;
  settleCoin: string;
  launchTime: string;
  priceScale: string;
  leverageFilter: {
    minLeverage: string;
    maxLeverage: string;
    leverageStep: string;
  };
  lotSizeFilter: {
    maxOrderQty: string;
    minOrderQty: string;
    qtyStep: string;
  };
  priceFilter: {
    minPrice: string;
    maxPrice: string;
    tickSize: string;
  };
  fundingInterval: number;
}

export interface FuturesTickerData {
  symbol: string;
  lastPrice: string;
  indexPrice: string;
  markPrice: string;
  highPrice24h: string;
  lowPrice24h: string;
  volume24h: string;
  turnover24h: string;
  price24hPcnt: string;
  fundingRate: string;
  nextFundingTime: string;
  openInterest: string;
  openInterestValue: string;
}

// ============================================
// FUTURES CLIENT
// ============================================

export class FuturesClient {
  private apiKey: string;
  private apiSecret: string;
  private baseUrl: string;
  private recvWindow = 5000;

  constructor(config?: { apiKey?: string; apiSecret?: string; testnet?: boolean }) {
    this.apiKey = config?.apiKey || process.env.BYBIT_API_KEY || "";
    this.apiSecret = config?.apiSecret || process.env.BYBIT_API_SECRET || "";
    const useTestnet = config?.testnet ?? process.env.BYBIT_TESTNET === "true";
    this.baseUrl = useTestnet
      ? "https://api-testnet.bybit.com"
      : "https://api.bybit.com";
  }

  private generateSignature(
    timestamp: string,
    params: Record<string, string | number | boolean | undefined>,
    method: "GET" | "POST"
  ): string {
    const filteredParams = Object.fromEntries(
      Object.entries(params).filter(([, v]) => v !== undefined)
    ) as Record<string, string | number | boolean>;

    let paramString: string;
    if (method === "POST") {
      paramString = JSON.stringify(filteredParams);
    } else {
      paramString = Object.keys(filteredParams)
        .sort()
        .map((key) => `${key}=${filteredParams[key]}`)
        .join("&");
    }

    const signStr = `${timestamp}${this.apiKey}${this.recvWindow}${paramString}`;
    return crypto
      .createHmac("sha256", this.apiSecret)
      .update(signStr)
      .digest("hex");
  }

  private async request<T>(
    method: "GET" | "POST",
    endpoint: string,
    params: Record<string, string | number | boolean | undefined> = {},
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
      headers["X-BAPI-SIGN"] = this.generateSignature(timestamp, params, method);
    }

    let url = `${this.baseUrl}${endpoint}`;
    const fetchOptions: RequestInit = { method, headers };

    if (method === "GET" && Object.keys(params).length > 0) {
      const filteredParams = Object.fromEntries(
        Object.entries(params).filter(([, v]) => v !== undefined)
      );
      const queryString = new URLSearchParams(
        filteredParams as Record<string, string>
      ).toString();
      url += `?${queryString}`;
    } else if (method === "POST") {
      const filteredParams = Object.fromEntries(
        Object.entries(params).filter(([, v]) => v !== undefined)
      );
      fetchOptions.body = JSON.stringify(filteredParams);
    }

    const response = await fetch(url, fetchOptions);
    const data = await response.json();

    if (data.retCode !== 0) {
      throw new Error(`Bybit Futures API Error: ${data.retMsg} (code: ${data.retCode})`);
    }

    return data.result as T;
  }

  // ============================================
  // MARKET DATA (Public)
  // ============================================

  async getTicker(symbol: string): Promise<FuturesTickerData> {
    const result = await this.request<{ list: FuturesTickerData[] }>(
      "GET",
      "/v5/market/tickers",
      { category: "linear", symbol }
    );
    return result.list[0];
  }

  async getAllTickers(): Promise<FuturesTickerData[]> {
    const result = await this.request<{ list: FuturesTickerData[] }>(
      "GET",
      "/v5/market/tickers",
      { category: "linear" }
    );
    return result.list;
  }

  async getKlines(
    symbol: string,
    interval: string = "60",
    limit = 200
  ): Promise<string[][]> {
    const result = await this.request<{ list: string[][] }>(
      "GET",
      "/v5/market/kline",
      { category: "linear", symbol, interval, limit }
    );
    return result.list;
  }

  async getInstrumentInfo(symbol: string): Promise<InstrumentInfo> {
    const result = await this.request<{ list: InstrumentInfo[] }>(
      "GET",
      "/v5/market/instruments-info",
      { category: "linear", symbol }
    );
    return result.list[0];
  }

  // ============================================
  // FUNDING RATES
  // ============================================

  async getFundingRate(symbol: string): Promise<FundingRate> {
    const ticker = await this.getTicker(symbol);
    return {
      symbol: ticker.symbol,
      fundingRate: ticker.fundingRate,
      fundingRateTimestamp: ticker.nextFundingTime,
    };
  }

  async getFundingHistory(
    symbol: string,
    limit = 200
  ): Promise<FundingHistory[]> {
    const result = await this.request<{ list: FundingHistory[] }>(
      "GET",
      "/v5/market/funding/history",
      { category: "linear", symbol, limit }
    );
    return result.list;
  }

  /**
   * Get current funding rates for multiple symbols.
   * Returns sorted by absolute funding rate (highest first).
   */
  async getTopFundingRates(
    symbols: string[] = ["BTCUSDT", "ETHUSDT", "SOLUSDT", "XRPUSDT", "DOGEUSDT",
                          "AVAXUSDT", "ADAUSDT", "DOTUSDT", "LINKUSDT", "MATICUSDT"]
  ): Promise<{ symbol: string; rate: number; annualizedPct: number }[]> {
    const tickers = await this.getAllTickers();
    const filtered = tickers
      .filter((t) => symbols.includes(t.symbol))
      .map((t) => {
        const rate = parseFloat(t.fundingRate);
        return {
          symbol: t.symbol,
          rate,
          // 3 funding periods per day * 365 days
          annualizedPct: rate * 3 * 365 * 100,
        };
      })
      .sort((a, b) => Math.abs(b.rate) - Math.abs(a.rate));

    return filtered;
  }

  // ============================================
  // POSITION MANAGEMENT (Private)
  // ============================================

  async getPositions(symbol?: string): Promise<FuturesPosition[]> {
    const params: Record<string, string | number | undefined> = {
      category: "linear",
      symbol,
      settleCoin: symbol ? undefined : "USDT",
    };

    const result = await this.request<{ list: FuturesPosition[] }>(
      "GET",
      "/v5/position/list",
      params,
      true
    );
    return result.list.filter((p) => parseFloat(p.size) > 0);
  }

  async setLeverage(symbol: string, buyLeverage: string, sellLeverage: string): Promise<void> {
    await this.request(
      "POST",
      "/v5/position/set-leverage",
      { category: "linear", symbol, buyLeverage, sellLeverage },
      true
    );
  }

  async setTpSl(
    symbol: string,
    takeProfit?: string,
    stopLoss?: string,
    positionIdx: number = 0
  ): Promise<void> {
    await this.request(
      "POST",
      "/v5/position/trading-stop",
      {
        category: "linear",
        symbol,
        takeProfit,
        stopLoss,
        positionIdx,
      },
      true
    );
  }

  // ============================================
  // ORDER MANAGEMENT (Private)
  // ============================================

  async placeOrder(params: FuturesOrderParams): Promise<{ orderId: string; orderLinkId: string }> {
    const orderParams: Record<string, string | number | boolean | undefined> = {
      category: "linear",
      symbol: params.symbol,
      side: params.side,
      orderType: params.orderType,
      qty: params.qty,
      price: params.price,
      timeInForce: params.timeInForce || (params.orderType === "Market" ? "IOC" : "GTC"),
      positionIdx: params.positionIdx ?? 0,
      stopLoss: params.stopLoss,
      takeProfit: params.takeProfit,
      reduceOnly: params.reduceOnly,
      closeOnTrigger: params.closeOnTrigger,
    };

    return this.request<{ orderId: string; orderLinkId: string }>(
      "POST",
      "/v5/order/create",
      orderParams,
      true
    );
  }

  async cancelOrder(symbol: string, orderId: string): Promise<void> {
    await this.request(
      "POST",
      "/v5/order/cancel",
      { category: "linear", symbol, orderId },
      true
    );
  }

  async cancelAllOrders(symbol: string): Promise<void> {
    await this.request(
      "POST",
      "/v5/order/cancel-all",
      { category: "linear", symbol },
      true
    );
  }

  async getOpenOrders(symbol?: string): Promise<any[]> {
    const result = await this.request<{ list: any[] }>(
      "GET",
      "/v5/order/realtime",
      { category: "linear", symbol },
      true
    );
    return result.list;
  }

  // ============================================
  // ACCOUNT (Private)
  // ============================================

  async getWalletBalance(): Promise<{
    totalEquity: string;
    totalAvailableBalance: string;
    totalMarginBalance: string;
    totalInitialMargin: string;
    totalMaintenanceMargin: string;
    coins: { coin: string; equity: string; availableToWithdraw: string; walletBalance: string }[];
  }> {
    const result = await this.request<{
      list: {
        totalEquity: string;
        totalAvailableBalance: string;
        totalMarginBalance: string;
        totalInitialMargin: string;
        totalMaintenanceMargin: string;
        coin: { coin: string; equity: string; availableToWithdraw: string; walletBalance: string }[];
      }[];
    }>("GET", "/v5/account/wallet-balance", { accountType: "UNIFIED" }, true);

    const account = result.list[0];
    return {
      totalEquity: account.totalEquity,
      totalAvailableBalance: account.totalAvailableBalance,
      totalMarginBalance: account.totalMarginBalance,
      totalInitialMargin: account.totalInitialMargin,
      totalMaintenanceMargin: account.totalMaintenanceMargin,
      coins: account.coin,
    };
  }

  // ============================================
  // EMERGENCY: CLOSE ALL
  // ============================================

  /**
   * Emergency close: cancel all orders and close all positions.
   * Used by the kill switch in risk management.
   */
  async closeAllPositions(): Promise<{ closed: string[]; errors: string[] }> {
    const closed: string[] = [];
    const errors: string[] = [];

    try {
      const positions = await this.getPositions();

      for (const pos of positions) {
        try {
          // Cancel any open orders for this symbol first
          await this.cancelAllOrders(pos.symbol).catch(() => {});

          // Close the position with a market order
          const closeSide = pos.side === "Buy" ? "Sell" : "Buy";
          await this.placeOrder({
            symbol: pos.symbol,
            side: closeSide,
            orderType: "Market",
            qty: pos.size,
            reduceOnly: true,
          });

          closed.push(`${pos.symbol} ${pos.side} ${pos.size}`);
        } catch (error) {
          errors.push(`${pos.symbol}: ${error}`);
        }
      }
    } catch (error) {
      errors.push(`Failed to fetch positions: ${error}`);
    }

    return { closed, errors };
  }
}

export const futuresClient = new FuturesClient();
