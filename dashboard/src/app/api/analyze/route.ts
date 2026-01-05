import { NextRequest, NextResponse } from "next/server";

// This endpoint triggers a fresh sentiment analysis
export async function POST(request: NextRequest) {
  try {
    const { symbol } = await request.json();

    if (!symbol) {
      return NextResponse.json({ error: "Symbol required" }, { status: 400 });
    }

    // Call xAI Grok for sentiment analysis
    const prompt = `Analyze the current X (Twitter) sentiment for "${symbol}" in the cryptocurrency market.

You must respond with ONLY a valid JSON object, no other text. Use this exact format:
{
  "score": <number from -100 to 100>,
  "confidence": <number from 0 to 100>,
  "summary": "<2-3 sentence summary>",
  "keyTopics": ["<topic1>", "<topic2>", "<topic3>"],
  "influencerSentiment": "<what influencers are saying>",
  "newsImpact": "<any breaking news>",
  "trend": "<rising/falling/stable>"
}`;

    const response = await fetch("https://api.x.ai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.XAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: "grok-2-1212",
        messages: [{ role: "user", content: prompt }],
        temperature: 0.3,
      }),
    });

    if (!response.ok) {
      throw new Error(`xAI API error: ${response.status}`);
    }

    const data = await response.json();
    const content = data.choices[0]?.message?.content || "{}";

    // Parse JSON from response
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error("No JSON found in response");
    }

    const sentiment = JSON.parse(jsonMatch[0]);

    return NextResponse.json({
      symbol,
      timestamp: new Date().toISOString(),
      ...sentiment,
    });
  } catch (error) {
    console.error("Analyze API error:", error);
    return NextResponse.json(
      { error: "Failed to analyze sentiment" },
      { status: 500 }
    );
  }
}
