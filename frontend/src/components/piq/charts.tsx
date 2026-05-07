"use client";

import { ReactNode } from "react";
import type { TooltipProps } from "recharts";

type ValueType = number | string | (number | string)[];
type NameType = number | string;

export const PIQ_COLORS = {
  accent:  "oklch(55% 0.19 232)",
  teal:    "oklch(52% 0.15 175)",
  amber:   "oklch(62% 0.14 75)",
  violet:  "oklch(55% 0.17 290)",
  rose:    "oklch(55% 0.18 25)",
  green:   "oklch(52% 0.15 145)",
  text3:   "oklch(58% 0.008 245)",
  border:  "oklch(0% 0 0 / 8%)",
  surf2:   "oklch(94% 0.006 245)",
} as const;

export const PIQ_SERIES_COLORS = [
  PIQ_COLORS.accent,
  PIQ_COLORS.teal,
  PIQ_COLORS.amber,
  PIQ_COLORS.violet,
  PIQ_COLORS.rose,
  PIQ_COLORS.green,
] as const;

interface ChartContainerProps {
  children: ReactNode;
  title?: string;
  subtitle?: string;
  height?: number;
  style?: React.CSSProperties;
}

export function PiqChartContainer({
  children,
  title,
  subtitle,
  height = 260,
  style,
}: ChartContainerProps) {
  return (
    <div
      style={{
        background: "var(--surf)",
        border: "1px solid var(--border)",
        borderRadius: "var(--radiusLg)",
        padding: "20px",
        ...style,
      }}
    >
      {(title || subtitle) && (
        <div style={{ marginBottom: 16 }}>
          {title && (
            <div style={{ fontSize: 14, fontWeight: 600, color: "var(--text)", marginBottom: 2 }}>
              {title}
            </div>
          )}
          {subtitle && (
            <div style={{ fontSize: 12, color: "var(--text3)" }}>{subtitle}</div>
          )}
        </div>
      )}
      <div style={{ height, position: "relative", minWidth: 0, overflow: "hidden" }}>{children}</div>
    </div>
  );
}

interface PiqTooltipPayloadItem {
  name: string;
  value: number | string;
  color?: string;
}

export function PiqTooltip(props: any) {
  const { active, payload, label } = props;
  if (!active || !payload?.length) return null;
  return (
    <div
      style={{
        background: "var(--surf)",
        border: "1px solid var(--border)",
        borderRadius: "var(--radius)",
        padding: "10px 14px",
        color: "var(--text)",
        fontSize: 13,
        boxShadow: "0 4px 16px oklch(0% 0 0 / 20%)",
      }}
    >
      {label != null && (
        <div style={{ fontWeight: 600, marginBottom: 6, color: "var(--text2)" }}>{String(label)}</div>
      )}
      {payload.map((p: any, i: number) => (
        <div
          key={i}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            marginBottom: i < payload.length - 1 ? 4 : 0,
          }}
        >
          <div
            style={{
              width: 8,
              height: 8,
              borderRadius: "50%",
              background: p.color ?? PIQ_COLORS.accent,
              flexShrink: 0,
            }}
          />
          <span style={{ color: "var(--text3)" }}>{p.name}:</span>
          <span style={{ fontWeight: 600, color: "var(--text)" }}>{p.value}</span>
        </div>
      ))}
    </div>
  );
}
