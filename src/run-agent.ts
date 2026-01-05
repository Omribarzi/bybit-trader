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

## Available Tools
You have access to the following tools:

1. getTicker(symbol: string) - Get current price and 24h statistics for a trading pair
   - symbol: Trading pair like "BTCUSDT", "ETHUSDT", "SOLUSDT"

2. scanMarket(sortBy: "gainers"|"losers"|"volume", limit?: number) - Scan market for top coins
   - sortBy: How to sort results
   - limit: Number of results (default 10)

3. getBalance(coin?: string) - Get wallet balance
   - coin: Optional specific coin like "BTC", "USDT"

4. getOrderBook(symbol: string) - Get order book for a trading pair

## Response Style
- Be concise but thorough in your analysis
- Use data to support your observations
- Highlight both opportunities and risks

When users ask about prices or market data, always use the appropriate tool.`;

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
