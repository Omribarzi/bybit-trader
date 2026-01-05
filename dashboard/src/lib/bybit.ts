import crypto from "crypto";

const apiKey = process.env.BYBIT_API_KEY || "";
const apiSecret = process.env.BYBIT_API_SECRET || "";
const useTestnet = process.env.BYBIT_TESTNET === "true";
const baseUrl = useTestnet
  ? "https://api-testnet.bybit.com"
  : "https://api.bybit.com";
const recvWindow = 5000;

function generateSignature(
  timestamp: string,
  params: Record<string, string | number | undefined>,
  method: "GET" | "POST"
): string {
  const filteredParams = Object.fromEntries(
    Object.entries(params).filter(([, v]) => v !== undefined)
  ) as Record<string, string | number>;

  let paramString: string;
  if (method === "POST") {
    paramString = JSON.stringify(filteredParams);
  } else {
    paramString = Object.keys(filteredParams)
      .sort()
      .map((key) => `${key}=${filteredParams[key]}`)
      .join("&");
  }

  const signStr = `${timestamp}${apiKey}${recvWindow}${paramString}`;

  return crypto
    .createHmac("sha256", apiSecret)
    .update(signStr)
    .digest("hex");
}

async function request<T>(
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
    headers["X-BAPI-API-KEY"] = apiKey;
    headers["X-BAPI-TIMESTAMP"] = timestamp;
    headers["X-BAPI-RECV-WINDOW"] = recvWindow.toString();
    headers["X-BAPI-SIGN"] = generateSignature(timestamp, params, method);
  }

  let url = `${baseUrl}${endpoint}`;

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

export interface BalanceData {
  coin: string;
  free: string;
  locked: string;
  total: string;
  usdValue?: string;
}

export interface OrderData {
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
  updatedTime?: string;
}

export interface TradeData {
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

export async function getWalletBalance(): Promise<BalanceData[]> {
  const result = await request<{
    list: {
      totalEquity?: string;
      coin: {
        coin: string;
        walletBalance: string;
        locked: string;
        availableToWithdraw: string;
        usdValue?: string;
      }[];
    }[];
  }>("GET", "/v5/account/wallet-balance", { accountType: "UNIFIED" }, true);

  if (!result.list?.[0]?.coin) {
    return [];
  }

  return result.list[0].coin
    .filter((c) => parseFloat(c.walletBalance) > 0)
    .map((c) => ({
      coin: c.coin,
      free: c.availableToWithdraw || c.walletBalance,
      locked: c.locked || "0",
      total: c.walletBalance,
      usdValue: c.usdValue,
    }));
}

export async function getOpenOrders(symbol?: string): Promise<OrderData[]> {
  const result = await request<{ list: OrderData[] }>(
    "GET",
    "/v5/order/realtime",
    { category: "spot", symbol },
    true
  );
  return result.list || [];
}

export async function getOrderHistory(
  symbol?: string,
  limit = 50
): Promise<OrderData[]> {
  const result = await request<{ list: OrderData[] }>(
    "GET",
    "/v5/order/history",
    { category: "spot", symbol, limit },
    true
  );
  return result.list || [];
}

export async function getTradeHistory(
  symbol?: string,
  limit = 50
): Promise<TradeData[]> {
  const result = await request<{ list: TradeData[] }>(
    "GET",
    "/v5/execution/list",
    { category: "spot", symbol, limit },
    true
  );
  return result.list || [];
}

export async function cancelOrder(
  symbol: string,
  orderId: string
): Promise<{ orderId: string }> {
  return request<{ orderId: string }>(
    "POST",
    "/v5/order/cancel",
    { category: "spot", symbol, orderId },
    true
  );
}

export interface PlaceOrderParams {
  symbol: string;
  side: "Buy" | "Sell";
  orderType: "Market" | "Limit";
  qty: string;
  price?: string;
}

export interface PlaceOrderResult {
  orderId: string;
  orderLinkId: string;
}

export async function placeOrder(params: PlaceOrderParams): Promise<PlaceOrderResult> {
  const orderParams: Record<string, string | number | undefined> = {
    category: "spot",
    symbol: params.symbol,
    side: params.side,
    orderType: params.orderType,
    qty: params.qty,
    // marketUnit is required for spot market orders to specify quantity is in base coin (e.g., BTC)
    marketUnit: params.orderType === "Market" ? "baseCoin" : undefined,
    timeInForce: params.orderType === "Limit" ? "GTC" : undefined,
    price: params.orderType === "Limit" ? params.price : undefined,
  };

  return request<PlaceOrderResult>(
    "POST",
    "/v5/order/create",
    orderParams,
    true
  );
}

export async function getTicker(symbol: string): Promise<{
  symbol: string;
  lastPrice: string;
  bid1Price: string;
  ask1Price: string;
}> {
  const result = await request<{ list: any[] }>(
    "GET",
    "/v5/market/tickers",
    { category: "spot", symbol }
  );
  return result.list[0];
}

export interface InstrumentInfo {
  symbol: string;
  baseCoin: string;
  quoteCoin: string;
  minOrderQty: string;
  maxOrderQty: string;
  minOrderAmt: string;
  maxOrderAmt: string;
  tickSize: string;
  basePrecision: string;
  quotePrecision: string;
}

export async function getInstrumentInfo(symbol: string): Promise<InstrumentInfo> {
  const result = await request<{ list: InstrumentInfo[] }>(
    "GET",
    "/v5/market/instruments-info",
    { category: "spot", symbol }
  );
  return result.list[0];
}
