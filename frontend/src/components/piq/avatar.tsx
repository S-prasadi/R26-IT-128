"use client";

const AVATAR_HUES = [232, 175, 75, 290, 25, 145, 15, 200];

function getHue(str: string): number {
  let h = 0;
  for (const ch of str) h = (h * 31 + ch.charCodeAt(0)) % AVATAR_HUES.length;
  return AVATAR_HUES[h];
}

function initials(name: string): string {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();
}

interface AvatarProps {
  name?: string;
  size?: number;
  style?: React.CSSProperties;
}

export function PiqAvatar({ name = "?", size = 32, style: st = {} }: AvatarProps) {
  const hue = getHue(name);
  const bg = `oklch(30% 0.08 ${hue})`;
  const fg = `oklch(82% 0.12 ${hue})`;
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        background: bg,
        color: fg,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontWeight: 600,
        fontSize: size * 0.36,
        flexShrink: 0,
        userSelect: "none",
        letterSpacing: "0.02em",
        ...st,
      }}
    >
      {initials(name)}
    </div>
  );
}
