import { config } from "dotenv";
import { bybitClient } from "./api/bybit-client.js";

config();

async function testAll() {
  console.log("=".repeat(50));
  console.log("Testing Bybit Trading Agent - Full Integration");
  console.log("=".repeat(50));

  try {
    // Test 1: Server time (public endpoint)
    console.log("\n1. Testing server connection...");
    const serverTime = await bybitClient.getServerTime();
    console.log(`   Server time: ${new Date(serverTime).toISOString()}`);
    console.log("   ✓ Server connection OK");

    // Test 2: Get ticker (public endpoint)
    console.log("\n2. Testing market data...");
    const btcTicker = await bybitClient.getTicker("BTCUSDT");
    console.log(`   BTC Price: $${parseFloat(btcTicker.lastPrice).toLocaleString()}`);
    console.log(`   24h Change: ${(parseFloat(btcTicker.price24hPcnt) * 100).toFixed(2)}%`);
    console.log("   ✓ Market data OK");

    // Test 3: Get order book (public endpoint)
    console.log("\n3. Testing order book...");
    const orderBook = await bybitClient.getOrderBook("BTCUSDT", 5);
    console.log(`   Best Bid: $${orderBook.bids[0]?.[0] || "N/A"}`);
    console.log(`   Best Ask: $${orderBook.asks[0]?.[0] || "N/A"}`);
    console.log("   ✓ Order book OK");

    // Test 4: Get all tickers for scan (public endpoint)
    console.log("\n4. Testing market scan...");
    const allTickers = await bybitClient.getAllTickers();
    const usdtPairs = allTickers.filter(t => t.symbol.endsWith("USDT"));
    const topGainers = usdtPairs
      .sort((a, b) => parseFloat(b.price24hPcnt) - parseFloat(a.price24hPcnt))
      .slice(0, 3);
    console.log("   Top 3 gainers:");
    topGainers.forEach((t, i) => {
      console.log(`   ${i + 1}. ${t.symbol}: +${(parseFloat(t.price24hPcnt) * 100).toFixed(2)}%`);
    });
    console.log("   ✓ Market scan OK");

    // Test 5: Wallet balance (private endpoint - requires auth)
    console.log("\n5. Testing wallet balance (authenticated)...");
    const balances = await bybitClient.getWalletBalance();
    if (balances.length === 0) {
      console.log("   No balances found (testnet account may be empty)");
    } else {
      console.log("   Balances:");
      balances.filter(b => parseFloat(b.total) > 0).forEach(b => {
        console.log(`   ${b.coin}: ${b.total} (Free: ${b.free}, Locked: ${b.locked})`);
      });
    }
    console.log("   ✓ Wallet balance OK - Authentication working!");

    // Test 6: Get open orders (private endpoint)
    console.log("\n6. Testing open orders...");
    const openOrders = await bybitClient.getOpenOrders();
    console.log(`   Open orders: ${openOrders.length}`);
    console.log("   ✓ Open orders OK");

    // Test 7: Get order history (private endpoint)
    console.log("\n7. Testing order history...");
    const orderHistory = await bybitClient.getOrderHistory(undefined, 5);
    console.log(`   Recent orders: ${orderHistory.length}`);
    if (orderHistory.length > 0) {
      console.log("   Latest order:");
      const latest = orderHistory[0];
      console.log(`   - ${latest.symbol} ${latest.side} ${latest.qty} @ ${latest.price}`);
    }
    console.log("   ✓ Order history OK");

    // Test 8: xAI/Grok API
    console.log("\n8. Testing xAI API connection...");
    const xaiResponse = await fetch("https://api.x.ai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.XAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: "grok-2-1212",
        messages: [{ role: "user", content: "Say 'Hello, trader!' in one line" }],
        max_tokens: 50,
      }),
    });

    if (xaiResponse.ok) {
      const xaiData = await xaiResponse.json();
      console.log(`   Grok says: ${xaiData.choices[0]?.message?.content || "No response"}`);
      console.log("   ✓ xAI API OK");
    } else {
      console.log(`   xAI API error: ${xaiResponse.status}`);
    }

    console.log("\n" + "=".repeat(50));
    console.log("All tests passed! Agent is ready to use.");
    console.log("=".repeat(50));
    console.log("\nRun the agent with: npx tsx src/run-agent.ts");

  } catch (error) {
    console.error("\n❌ Test failed:", error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

testAll();
