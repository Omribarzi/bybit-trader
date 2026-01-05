import { config } from "dotenv";
import * as readline from "readline";
import { z } from "zod";
import { bybitClient } from "./api/bybit-client.js";

config();

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

function prompt(question: string): Promise<string> {
  return new Promise((resolve) => {
    rl.question(question, resolve);
  });
}

const systemPrompt = `You are an expert cryptocurrency trading assistant specialized in spot trading on Bybit, powered by Grok with access to real-time X (Twitter) data.

## Your Capabilities
- Analyze market data (prices, order books, candlesticks, volume)
- Scan the market for opportunities (top gainers, losers, high volume)
- Check wallet balances and portfolio status
- Place market and limit orders for spot trading
- Search X (Twitter) for real-time sentiment and news about cryptocurrencies

## Available Tools

### Market Data
1. getTicker(symbol) - Get price and 24h stats (e.g., "BTCUSDT")
2. scanMarket(sortBy, limit) - Find top gainers/losers/volume
3. getOrderBook(symbol) - Get bid/ask depth
4. getBalance(coin?) - Check wallet balance

### Trading
5. placeMarketOrder(symbol, side, quantity) - Execute immediately at market price
   - side: "Buy" or "Sell"
   - quantity: Amount of base asset (e.g., 0.001 for BTC)
6. placeLimitOrder(symbol, side, quantity, price) - Place order at specific price
7. getOpenOrders(symbol?) - View pending orders
8. cancelOrder(symbol, orderId) - Cancel an order

### Sentiment Analysis
9. searchX(query) - Search X/Twitter for crypto sentiment, news, influencer posts

## Trading Guidelines
- ALWAYS confirm with user before executing trades
- Warn about risks (volatility, liquidity, pump-and-dump)
- Use X sentiment to identify trending narratives
- Never suggest putting all funds in one trade

## Response Style
- Be concise but thorough
- Support analysis with data
- Highlight both opportunities AND risks
- Include relevant X sentiment when available`;

// Tool definitions
const tools = [
  {
    type: "function" as const,
    function: {
      name: "getTicker",
      description: "Get current price and 24h statistics for a trading pair on Bybit",
      parameters: {
        type: "object",
        properties: {
          symbol: {
            type: "string",
            description: "Trading pair symbol like BTCUSDT, ETHUSDT, SOLUSDT",
          },
        },
        required: ["symbol"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "scanMarket",
      description: "Scan all trading pairs to find top gainers, losers, or highest volume",
      parameters: {
        type: "object",
        properties: {
          sortBy: {
            type: "string",
            enum: ["gainers", "losers", "volume"],
            description: "How to sort: gainers, losers, or volume",
          },
          limit: {
            type: "number",
            description: "Number of results (default 10)",
          },
        },
        required: ["sortBy"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "getBalance",
      description: "Get wallet balance for all coins or a specific coin",
      parameters: {
        type: "object",
        properties: {
          coin: {
            type: "string",
            description: "Specific coin like BTC, ETH, USDT. Leave empty for all.",
          },
        },
        required: [],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "getOrderBook",
      description: "Get order book (bids and asks) for a trading pair",
      parameters: {
        type: "object",
        properties: {
          symbol: {
            type: "string",
            description: "Trading pair symbol like BTCUSDT",
          },
        },
        required: ["symbol"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "placeMarketOrder",
      description: "Place a market order to buy or sell immediately at current market price. ALWAYS confirm with user first!",
      parameters: {
        type: "object",
        properties: {
          symbol: {
            type: "string",
            description: "Trading pair symbol like BTCUSDT",
          },
          side: {
            type: "string",
            enum: ["Buy", "Sell"],
            description: "Order side: Buy or Sell",
          },
          quantity: {
            type: "string",
            description: "Amount of base asset to trade (e.g., '0.001' for 0.001 BTC)",
          },
        },
        required: ["symbol", "side", "quantity"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "placeLimitOrder",
      description: "Place a limit order at a specific price. Order executes when market reaches the price.",
      parameters: {
        type: "object",
        properties: {
          symbol: {
            type: "string",
            description: "Trading pair symbol like BTCUSDT",
          },
          side: {
            type: "string",
            enum: ["Buy", "Sell"],
            description: "Order side: Buy or Sell",
          },
          quantity: {
            type: "string",
            description: "Amount of base asset to trade",
          },
          price: {
            type: "string",
            description: "Limit price for the order",
          },
        },
        required: ["symbol", "side", "quantity", "price"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "getOpenOrders",
      description: "Get all currently open/pending orders",
      parameters: {
        type: "object",
        properties: {
          symbol: {
            type: "string",
            description: "Optional: filter by trading pair",
          },
        },
        required: [],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "cancelOrder",
      description: "Cancel an open order by its ID",
      parameters: {
        type: "object",
        properties: {
          symbol: {
            type: "string",
            description: "Trading pair symbol of the order",
          },
          orderId: {
            type: "string",
            description: "The order ID to cancel",
          },
        },
        required: ["symbol", "orderId"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "searchX",
      description: "Search X (Twitter) for real-time sentiment, news, and discussions about a cryptocurrency or topic",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "Search query (e.g., 'Bitcoin price', 'ETH news', '$SOL')",
          },
        },
        required: ["query"],
      },
    },
  },
];

// Tool execution
async function executeTool(name: string, args: Record<string, unknown>): Promise<unknown> {
  switch (name) {
    case "getTicker": {
      const symbol = (args.symbol as string) || "BTCUSDT";
      const ticker = await bybitClient.getTicker(symbol.toUpperCase());
      return {
        symbol: ticker.symbol,
        lastPrice: ticker.lastPrice,
        highPrice24h: ticker.highPrice24h,
        lowPrice24h: ticker.lowPrice24h,
        volume24h: ticker.volume24h,
        priceChange24hPercent: (parseFloat(ticker.price24hPcnt) * 100).toFixed(2) + "%",
      };
    }
    case "scanMarket": {
      const sortBy = (args.sortBy as string) || "gainers";
      const limit = (args.limit as number) || 10;
      const tickers = await bybitClient.getAllTickers();
      let filtered = tickers.filter((t) => t.symbol.endsWith("USDT"));

      switch (sortBy) {
        case "gainers":
          filtered.sort((a, b) => parseFloat(b.price24hPcnt) - parseFloat(a.price24hPcnt));
          break;
        case "losers":
          filtered.sort((a, b) => parseFloat(a.price24hPcnt) - parseFloat(b.price24hPcnt));
          break;
        case "volume":
          filtered.sort((a, b) => parseFloat(b.turnover24h) - parseFloat(a.turnover24h));
          break;
      }

      return filtered.slice(0, limit).map((t) => ({
        symbol: t.symbol,
        price: t.lastPrice,
        change24h: (parseFloat(t.price24hPcnt) * 100).toFixed(2) + "%",
        volume24h: "$" + parseFloat(t.turnover24h).toLocaleString(),
      }));
    }
    case "getBalance": {
      const coin = args.coin as string | undefined;
      if (coin) {
        const balance = await bybitClient.getCoinBalance(coin);
        return balance || { error: `No balance found for ${coin}` };
      }
      const balances = await bybitClient.getWalletBalance();
      return balances.filter((b) => parseFloat(b.total) > 0);
    }
    case "getOrderBook": {
      const symbol = (args.symbol as string) || "BTCUSDT";
      const orderBook = await bybitClient.getOrderBook(symbol, 10);
      const bestBid = orderBook.bids[0]?.[0] || "0";
      const bestAsk = orderBook.asks[0]?.[0] || "0";
      return {
        symbol,
        bestBid,
        bestAsk,
        spread: (parseFloat(bestAsk) - parseFloat(bestBid)).toFixed(8),
        spreadPercent: ((parseFloat(bestAsk) - parseFloat(bestBid)) / parseFloat(bestBid) * 100).toFixed(4) + "%",
      };
    }
    case "placeMarketOrder": {
      const symbol = args.symbol as string;
      const side = args.side as "Buy" | "Sell";
      const quantity = args.quantity as string;

      if (!symbol || !side || !quantity) {
        return { error: "Missing required parameters: symbol, side, quantity" };
      }

      try {
        const result = await bybitClient.placeOrder({
          symbol: symbol.toUpperCase(),
          side,
          orderType: "Market",
          qty: quantity,
        });
        return {
          success: true,
          orderId: result.orderId,
          symbol: result.symbol,
          side: result.side,
          quantity: result.qty,
          status: result.status,
          message: `Market ${side.toLowerCase()} order placed successfully`,
        };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : "Order failed",
        };
      }
    }
    case "placeLimitOrder": {
      const symbol = args.symbol as string;
      const side = args.side as "Buy" | "Sell";
      const quantity = args.quantity as string;
      const price = args.price as string;

      if (!symbol || !side || !quantity || !price) {
        return { error: "Missing required parameters: symbol, side, quantity, price" };
      }

      try {
        const result = await bybitClient.placeOrder({
          symbol: symbol.toUpperCase(),
          side,
          orderType: "Limit",
          qty: quantity,
          price,
        });
        return {
          success: true,
          orderId: result.orderId,
          symbol: result.symbol,
          side: result.side,
          quantity: result.qty,
          price: result.price,
          status: result.status,
          message: `Limit ${side.toLowerCase()} order placed at ${price}`,
        };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : "Order failed",
        };
      }
    }
    case "getOpenOrders": {
      const symbol = args.symbol as string | undefined;
      const orders = await bybitClient.getOpenOrders(symbol?.toUpperCase());
      return {
        count: orders.length,
        orders: orders.map((o) => ({
          orderId: o.orderId,
          symbol: o.symbol,
          side: o.side,
          type: o.orderType,
          price: o.price,
          quantity: o.qty,
          status: o.status,
        })),
      };
    }
    case "cancelOrder": {
      const symbol = args.symbol as string;
      const orderId = args.orderId as string;

      if (!symbol || !orderId) {
        return { error: "Missing required parameters: symbol, orderId" };
      }

      try {
        const result = await bybitClient.cancelOrder(symbol.toUpperCase(), orderId);
        return {
          success: true,
          orderId: result.orderId,
          message: "Order cancelled successfully",
        };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : "Cancel failed",
        };
      }
    }
    case "searchX": {
      const query = args.query as string;
      if (!query) {
        return { error: "Missing required parameter: query" };
      }

      // Use Grok's built-in X search capability via a separate API call
      try {
        const response = await fetch("https://api.x.ai/v1/chat/completions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${process.env.XAI_API_KEY}`,
          },
          body: JSON.stringify({
            model: "grok-2-1212",
            messages: [
              {
                role: "user",
                content: `Search X (Twitter) for recent posts about "${query}" in the cryptocurrency/trading context. Summarize the sentiment, key opinions from influencers, and any breaking news. Focus on the last 24 hours.`,
              },
            ],
          }),
        });

        if (!response.ok) {
          throw new Error(`X search failed: ${response.status}`);
        }

        const data = await response.json();
        return {
          query,
          sentiment: data.choices[0]?.message?.content || "No results found",
        };
      } catch (error) {
        return {
          error: error instanceof Error ? error.message : "X search failed",
        };
      }
    }
    default:
      return { error: `Unknown tool: ${name}` };
  }
}

// Call xAI API directly
async function callGrok(messages: Array<{ role: string; content: string; tool_call_id?: string; name?: string }>) {
  const response = await fetch("https://api.x.ai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.XAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: "grok-2-1212",
      messages: [
        { role: "system", content: systemPrompt },
        ...messages,
      ],
      tools,
      tool_choice: "auto",
    }),
  });

  if (!response.ok) {
    throw new Error(`API error: ${response.status} ${response.statusText}`);
  }

  return response.json();
}

async function chat(userMessage: string, history: Array<{ role: string; content: string; tool_call_id?: string; name?: string }>) {
  history.push({ role: "user", content: userMessage });

  let response = await callGrok(history);
  let choice = response.choices[0];

  // Handle tool calls
  while (choice.message.tool_calls && choice.message.tool_calls.length > 0) {
    // Add assistant message with tool calls
    history.push({
      role: "assistant",
      content: choice.message.content || "",
      ...choice.message,
    });

    // Execute each tool call
    for (const toolCall of choice.message.tool_calls) {
      const args = JSON.parse(toolCall.function.arguments || "{}");
      console.log(`[Calling ${toolCall.function.name}(${JSON.stringify(args)})]`);

      try {
        const result = await executeTool(toolCall.function.name, args);
        history.push({
          role: "tool",
          tool_call_id: toolCall.id,
          name: toolCall.function.name,
          content: JSON.stringify(result),
        });
      } catch (error) {
        history.push({
          role: "tool",
          tool_call_id: toolCall.id,
          name: toolCall.function.name,
          content: JSON.stringify({ error: error instanceof Error ? error.message : "Tool execution failed" }),
        });
      }
    }

    // Get next response
    response = await callGrok(history);
    choice = response.choices[0];
  }

  // Add final assistant message
  const assistantMessage = choice.message.content || "";
  history.push({ role: "assistant", content: assistantMessage });

  return assistantMessage;
}

async function main() {
  console.log("=".repeat(60));
  console.log("  Bybit Trading Agent - Powered by Grok");
  console.log("=".repeat(60));
  console.log("\nCommands:");
  console.log("  - Type your question or command");
  console.log("  - Type 'exit' or 'quit' to end the session");
  console.log("  - Type 'clear' to clear conversation history");
  console.log("\nExamples:");
  console.log("  - What's the current price of BTC?");
  console.log("  - Show me the top 5 gainers today");
  console.log("  - Check my wallet balance");
  console.log("  - What's the X sentiment on Solana?");
  console.log("  - Buy 0.001 BTC at market price");
  console.log("=".repeat(60));

  const history: Array<{ role: string; content: string; tool_call_id?: string; name?: string }> = [];

  while (true) {
    const userInput = await prompt("\nYou: ");

    if (!userInput.trim()) continue;

    if (["exit", "quit", "q"].includes(userInput.toLowerCase())) {
      console.log("\nGoodbye! Trade safely.");
      rl.close();
      break;
    }

    if (userInput.toLowerCase() === "clear") {
      history.length = 0;
      console.log("\n[Conversation cleared]");
      continue;
    }

    try {
      const response = await chat(userInput, history);
      console.log("\nAgent:", response);
    } catch (error) {
      console.error("\nError:", error instanceof Error ? error.message : "Unknown error");
    }
  }
}

main().catch(console.error);
