"use client";

interface SentimentGaugeProps {
  score: number;
  label: string;
  confidence: number;
}

export function SentimentGauge({ score, label, confidence }: SentimentGaugeProps) {
  // Map score (-100 to 100) to rotation (-90 to 90 degrees)
  const rotation = (score / 100) * 90;

  const getColor = () => {
    if (score <= -50) return "text-red-500";
    if (score <= -25) return "text-orange-500";
    if (score <= 25) return "text-yellow-500";
    if (score <= 50) return "text-lime-500";
    return "text-green-500";
  };

  const getLabelText = () => {
    switch (label) {
      case "extreme_fear":
        return "Extreme Fear";
      case "fear":
        return "Fear";
      case "neutral":
        return "Neutral";
      case "greed":
        return "Greed";
      case "extreme_greed":
        return "Extreme Greed";
      default:
        return label;
    }
  };

  return (
    <div className="flex flex-col items-center">
      {/* Gauge */}
      <div className="relative w-48 h-24 overflow-hidden">
        {/* Background arc */}
        <div className="absolute inset-0 flex items-end justify-center">
          <div className="w-48 h-48 rounded-full border-8 border-gray-800 border-t-red-500 border-r-yellow-500 border-b-transparent rotate-[-90deg]" />
        </div>

        {/* Gradient background */}
        <div
          className="absolute bottom-0 left-0 right-0 h-24 rounded-t-full"
          style={{
            background:
              "linear-gradient(90deg, #ef4444 0%, #f97316 25%, #eab308 50%, #84cc16 75%, #22c55e 100%)",
            opacity: 0.2,
          }}
        />

        {/* Needle */}
        <div
          className="absolute bottom-0 left-1/2 w-1 h-20 bg-white origin-bottom transition-transform duration-500"
          style={{ transform: `translateX(-50%) rotate(${rotation}deg)` }}
        />

        {/* Center dot */}
        <div className="absolute bottom-0 left-1/2 w-4 h-4 -translate-x-1/2 translate-y-1/2 rounded-full bg-white" />
      </div>

      {/* Score */}
      <div className={`text-4xl font-bold mt-2 ${getColor()}`}>{score}</div>

      {/* Label */}
      <div className="text-lg font-medium text-gray-400">{getLabelText()}</div>

      {/* Confidence */}
      <div className="text-sm text-gray-500">
        {confidence}% confidence
      </div>

      {/* Scale labels */}
      <div className="flex justify-between w-48 text-xs text-gray-500 mt-2">
        <span>-100</span>
        <span>0</span>
        <span>+100</span>
      </div>
    </div>
  );
}
