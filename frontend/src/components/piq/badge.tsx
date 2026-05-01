"use client";

const BADGE_VARIANTS: Record<string, { bg: string; color: string }> = {
  admin:   { bg: "var(--accentD)",  color: "var(--accent)"  },
  manager: { bg: "var(--violetD)", color: "var(--violet)"  },
  user:    { bg: "var(--surf3)",    color: "var(--text2)"   },
  active:  { bg: "var(--greenD)",   color: "var(--green)"   },
  inactive:{ bg: "var(--roseD)",    color: "var(--rose)"    },
  system:  { bg: "var(--amberD)",   color: "var(--amber)"   },
  default: { bg: "var(--surf3)",    color: "var(--text2)"   },
};

interface BadgeProps {
  label: string;
  variant?: string;
  dot?: boolean;
  style?: React.CSSProperties;
}

export function PiqBadge({ label, variant, dot = false, style: st = {} }: BadgeProps) {
  const v =
    BADGE_VARIANTS[variant ?? ""] ||
    BADGE_VARIANTS[label?.toLowerCase()] ||
    BADGE_VARIANTS.default;
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 5,
        padding: "3px 8px",
        borderRadius: 99,
        fontSize: 13,
        fontWeight: 600,
        letterSpacing: "0.04em",
        background: v.bg,
        color: v.color,
        ...st,
      }}
    >
      {dot && (
        <span
          style={{
            width: 5,
            height: 5,
            borderRadius: "50%",
            background: v.color,
          }}
        />
      )}
      {label}
    </span>
  );
}
