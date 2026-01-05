import { config } from "dotenv";
import * as readline from "readline";
import { tradingAgent } from "./agents/trading-agent.js";

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

async function main() {
  console.log("=".repeat(60));
  console.log("  Bybit Trading Agent - Powered by Mastra & Claude");
  console.log("=".repeat(60));
  console.log("\nCommands:");
  console.log("  - Type your question or command");
  console.log("  - Type 'exit' or 'quit' to end the session");
  console.log("  - Type 'clear' to clear conversation history");
  console.log("\nExamples:");
  console.log("  - What's the current price of BTC?");
  console.log("  - Show me the top 5 gainers today");
  console.log("  - Check my wallet balance");
  console.log("  - Analyze ETHUSDT for potential entry");
  console.log("=".repeat(60));

  const messages: { role: "user" | "assistant"; content: string }[] = [];

  while (true) {
    const userInput = await prompt("\nYou: ");

    if (!userInput.trim()) continue;

    if (["exit", "quit", "q"].includes(userInput.toLowerCase())) {
      console.log("\nGoodbye! Trade safely.");
      rl.close();
      break;
    }

    if (userInput.toLowerCase() === "clear") {
      messages.length = 0;
      console.log("\n[Conversation cleared]");
      continue;
    }

    messages.push({ role: "user", content: userInput });

    try {
      console.log("\nAgent: ");

      const response = await tradingAgent.stream(messages);

      let fullResponse = "";
      for await (const chunk of response.textStream) {
        process.stdout.write(chunk);
        fullResponse += chunk;
      }
      console.log();

      messages.push({ role: "assistant", content: fullResponse });
    } catch (error) {
      console.error(
        "\nError:",
        error instanceof Error ? error.message : "Unknown error"
      );
      messages.pop(); // Remove the failed user message
    }
  }
}

main().catch(console.error);
