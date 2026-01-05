import { config } from "dotenv";
import { bybitClient } from "./api/bybit-client.js";

config();

async function testTrade() {
  console.log("=".repeat(50));
  console.log("Testing Trading on Testnet");
  console.log("=".repeat(50));

  try {
    // Check current balance first
    console.log("\n1. Checking wallet balance...");
    const balances = await bybitClient.getWalletBalance();
    const usdtBalance = balances.find(b => b.coin === "USDT");
    const btcBalance = balances.find(b => b.coin === "BTC");

    console.log(`   USDT: ${usdtBalance?.total || "0"}`);
    console.log(`   BTC: ${btcBalance?.total || "0"}`);

    if (!usdtBalance || parseFloat(usdtBalance.free) < 10) {
      console.log("\n⚠️  Insufficient USDT balance for trading test");
      console.log("   Please fund your testnet account at: https://testnet.bybit.com");
      console.log("   You can get free testnet USDT from the faucet");
      return;
    }

    // Get current BTC price
    console.log("\n2. Getting current BTC price...");
    const ticker = await bybitClient.getTicker("BTCUSDT");
    const currentPrice = parseFloat(ticker.lastPrice);
    console.log(`   Current BTC price: $${currentPrice.toLocaleString()}`);

    // Calculate a small order - buy $10 worth of BTC
    const orderValue = 10; // $10 USD worth
    const btcQty = (orderValue / currentPrice).toFixed(6);
    console.log(`   Will buy ${btcQty} BTC (~$${orderValue})`);

    // Place a limit order below market (so it doesn't execute immediately)
    const limitPrice = (currentPrice * 0.95).toFixed(2); // 5% below market
    console.log(`\n3. Placing limit buy order at $${limitPrice}...`);

    const order = await bybitClient.placeOrder({
      symbol: "BTCUSDT",
      side: "Buy",
      orderType: "Limit",
      qty: btcQty,
      price: limitPrice,
      timeInForce: "GTC",
    });

    console.log(`   ✓ Order placed!`);
    console.log(`   Order ID: ${order.orderId}`);
    console.log(`   Symbol: ${order.symbol}`);
    console.log(`   Side: ${order.side}`);
    console.log(`   Qty: ${order.qty}`);

    // Check open orders
    console.log("\n4. Checking open orders...");
    const openOrders = await bybitClient.getOpenOrders("BTCUSDT");
    console.log(`   Open orders: ${openOrders.length}`);
    openOrders.forEach(o => {
      console.log(`   - ${o.orderId}: ${o.side} ${o.qty} @ $${o.price} (${o.status})`);
    });

    // Cancel the order
    console.log("\n5. Cancelling test order...");
    await bybitClient.cancelOrder("BTCUSDT", order.orderId);
    console.log(`   ✓ Order ${order.orderId} cancelled`);

    // Verify cancellation
    console.log("\n6. Verifying cancellation...");
    const remainingOrders = await bybitClient.getOpenOrders("BTCUSDT");
    console.log(`   Open orders remaining: ${remainingOrders.length}`);

    console.log("\n" + "=".repeat(50));
    console.log("Trading test completed successfully!");
    console.log("=".repeat(50));

  } catch (error) {
    console.error("\n❌ Trading test failed:", error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

testTrade();
