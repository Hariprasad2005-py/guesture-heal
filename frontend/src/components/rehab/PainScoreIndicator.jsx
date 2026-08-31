import React from "react";

/**
 * Comfort/pain score indicator. Emoji + word + number are always shown
 * together — color is never the only signal. Labeled "Comfort" to stay
 * encouraging; the underlying PAPS score is unchanged.
 */

function scoreToVisual(score) {
  if (score <= 2) return { emoji: "😊", word: "Comfortable", bg: "#EAFAF1", border: "#ABEBC6", text: "#1E7D46" };
  if (score <= 5) return { emoji: "😐", word: "Some discomfort", bg: "#FEF5E7", border: "#F8D48A", text: "#9C640C" };
  return { emoji: "😰", word: "High discomfort", bg: "#FADBD8", border: "#F1948A", text: "#943126" };
}

export default function PainScoreIndicator({ papsScore = 0, threshold = 7 }) {
  const score = Math.max(0, Math.min(10, Math.round(papsScore || 0)));
  const visual = scoreToVisual(score);
  const isAlert = score > threshold;

  return (
    <div
      className="flex items-center gap-3 rounded-2xl border-2 px-4 py-2.5 min-h-[52px]"
      style={{ backgroundColor: visual.bg, borderColor: isAlert ? "#E74C3C" : visual.border }}
      role="status"
      aria-live={isAlert ? "assertive" : "off"}
      aria-label={`Comfort level: ${visual.word}, score ${score} out of 10`}
    >
      <span className="text-3xl leading-none" aria-hidden="true">{visual.emoji}</span>
      <div className="flex flex-col leading-tight">
        <span className="text-lg font-semibold" style={{ color: visual.text }}>{visual.word}</span>
        <span className="text-sm text-[#5D6D7E]">Comfort {score}/10</span>
      </div>
      {isAlert && (
        <span className="ml-1 text-sm font-semibold text-[#E74C3C] border border-[#E74C3C] rounded-full px-2 py-0.5">
          Check-in
        </span>
      )}
    </div>
  );
}