import type { SkillInsight } from "@/types";

// Shared between the Career page and its flow graph so a readiness score or
// market velocity always renders the same color/label regardless of which
// component is showing it.

export function readinessColor(score: number | undefined | null, fallback = "var(--surf3)"): string {
  if (score == null) return fallback;
  if (score >= 0.7) return "#14b8a6";
  if (score >= 0.4) return "#f59e0b";
  return "#ef4444";
}

export const VELOCITY_META: Record<SkillInsight["velocity"], { arrow: string; color: string; label: string }> = {
  rising:  { arrow: "▲", color: "#10b981", label: "rising" },
  stable:  { arrow: "▬", color: "#f59e0b", label: "stable" },
  falling: { arrow: "▼", color: "#ef4444", label: "falling" },
  unknown: { arrow: "•", color: "var(--text3)", label: "no data" },
};
