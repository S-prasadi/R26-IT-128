"use client";

import { useState, useEffect, useRef } from "react";
import { Icon } from "./icon";

/* ─── Button ─────────────────────────────────────────────────────────────── */
type BtnVariant = "primary" | "secondary" | "ghost" | "danger" | "outline";
type BtnSize = "sm" | "md" | "lg";

interface BtnProps {
  children?: React.ReactNode;
  variant?: BtnVariant;
  size?: BtnSize;
  icon?: string;
  onClick?: () => void;
  disabled?: boolean;
  style?: React.CSSProperties;
  type?: "button" | "submit" | "reset";
}

export function PiqBtn({
  children,
  variant = "primary",
  size = "md",
  icon,
  onClick,
  disabled = false,
  style: st = {},
  type = "button",
}: BtnProps) {
  const [hov, setHov] = useState(false);
  const sizes = {
    sm: { padding: "5px 12px", fontSize: 14, gap: 5 },
    md: { padding: "8px 16px", fontSize: 15, gap: 6 },
    lg: { padding: "10px 20px", fontSize: 16, gap: 8 },
  };
  const variants = {
    primary:   { bg: hov ? "var(--accentH)" : "var(--accent)",  color: "#fff",             border: "none" },
    secondary: { bg: hov ? "var(--surf3)"   : "var(--surf2)",   color: "var(--text)",       border: "1px solid var(--border2)" },
    ghost:     { bg: hov ? "var(--surf2)"   : "transparent",    color: "var(--text2)",      border: "none" },
    danger:    { bg: hov ? "oklch(55% 0.18 25)" : "var(--roseD)", color: "var(--rose)",    border: "1px solid oklch(63% 0.18 25 / 30%)" },
    outline:   { bg: hov ? "var(--accentD)" : "transparent",    color: "var(--accent)",     border: "1px solid oklch(63% 0.19 232 / 40%)" },
  };
  const v = variants[variant];
  const sz = sizes[size];
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        gap: sz.gap,
        padding: sz.padding,
        borderRadius: "var(--radius)",
        border: v.border,
        background: v.bg,
        color: v.color,
        fontSize: sz.fontSize,
        fontWeight: 500,
        fontFamily: "inherit",
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.5 : 1,
        transition: "all .15s",
        whiteSpace: "nowrap",
        ...st,
      }}
    >
      {icon && <Icon n={icon} s={sz.fontSize + 2} c={v.color} />}
      {children}
    </button>
  );
}

/* ─── Input ──────────────────────────────────────────────────────────────── */
interface InputProps {
  label?: string;
  type?: string;
  placeholder?: string;
  value?: string;
  onChange?: (e: React.ChangeEvent<HTMLInputElement>) => void;
  icon?: string;
  error?: string;
  required?: boolean;
  autoFocus?: boolean;
  style?: React.CSSProperties;
}

export function PiqInput({
  label,
  type = "text",
  placeholder,
  value,
  onChange,
  icon,
  error,
  required = false,
  autoFocus = false,
  style: st = {},
}: InputProps) {
  const [focused, setFocused] = useState(false);
  const [showPw, setShowPw] = useState(false);
  const isPw = type === "password";
  const inputType = isPw ? (showPw ? "text" : "password") : type;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 5, ...st }}>
      {label && (
        <label style={{ fontSize: 14, fontWeight: 500, color: "var(--text2)", letterSpacing: "0.02em" }}>
          {label}
          {required && <span style={{ color: "var(--rose)", marginLeft: 2 }}>*</span>}
        </label>
      )}
      <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
        {icon && (
          <Icon
            n={icon}
            s={15}
            c="var(--text3)"
            style={{ position: "absolute", left: 12, pointerEvents: "none" }}
          />
        )}
        <input
          type={inputType}
          placeholder={placeholder}
          value={value}
          onChange={onChange}
          autoFocus={autoFocus}
          required={required}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          style={{
            width: "100%",
            padding: icon ? "9px 12px 9px 36px" : "9px 12px",
            paddingRight: isPw ? 40 : 12,
            background: "var(--surf2)",
            border: `1px solid ${focused ? "var(--accent)" : error ? "var(--rose)" : "var(--border2)"}`,
            borderRadius: "var(--radius)",
            color: "var(--text)",
            fontSize: 15,
            fontFamily: "inherit",
            outline: "none",
            transition: "border-color .15s",
          }}
        />
        {isPw && (
          <button
            type="button"
            onClick={() => setShowPw((s) => !s)}
            style={{
              position: "absolute",
              right: 10,
              background: "none",
              border: "none",
              cursor: "pointer",
              color: "var(--text3)",
              display: "flex",
              padding: 2,
            }}
          >
            <Icon n={showPw ? "eyeOff" : "eye"} s={16} c="var(--text3)" />
          </button>
        )}
      </div>
      {error && <span style={{ fontSize: 13, color: "var(--rose)" }}>{error}</span>}
    </div>
  );
}

/* ─── Modal ──────────────────────────────────────────────────────────────── */
interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  width?: number;
  footer?: React.ReactNode;
}

export function PiqModal({ open, onClose, title, children, width = 480, footer }: ModalProps) {
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div
      className="anim-in"
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "oklch(0% 0 0 / 65%)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1000,
        padding: 24,
      }}
    >
      <div
        className="anim-scale"
        onClick={(e) => e.stopPropagation()}
        style={{
          width: Math.min(width, typeof window !== "undefined" ? window.innerWidth - 48 : 480),
          background: "var(--surf)",
          borderRadius: "var(--radiusLg)",
          border: "1px solid var(--border2)",
          boxShadow: "0 24px 64px oklch(0% 0 0 / 50%)",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "18px 20px",
            borderBottom: "1px solid var(--border)",
          }}
        >
          <span style={{ fontSize: 17, fontWeight: 600 }}>{title}</span>
          <button
            onClick={onClose}
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              color: "var(--text3)",
              display: "flex",
              padding: 4,
              borderRadius: "var(--radius)",
            }}
          >
            <Icon n="close" s={18} c="var(--text3)" />
          </button>
        </div>
        <div style={{ padding: 20 }}>{children}</div>
        {footer && (
          <div
            style={{
              padding: "12px 20px",
              borderTop: "1px solid var(--border)",
              display: "flex",
              justifyContent: "flex-end",
              gap: 8,
            }}
          >
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}

/* ─── Spinner ────────────────────────────────────────────────────────────── */
export function PiqSpinner({ size = 20 }: { size?: number }) {
  return (
    <div
      style={{
        width: size,
        height: size,
        border: "2px solid var(--border2)",
        borderTopColor: "var(--accent)",
        borderRadius: "50%",
        animation: "spin .7s linear infinite",
      }}
    />
  );
}

/* ─── Toggle ─────────────────────────────────────────────────────────────── */
export function PiqToggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      onClick={() => onChange(!value)}
      type="button"
      style={{
        width: 40,
        height: 22,
        borderRadius: 99,
        border: "none",
        cursor: "pointer",
        background: value ? "var(--green)" : "var(--surf3)",
        padding: 2,
        transition: "background .2s",
        flexShrink: 0,
      }}
    >
      <div
        style={{
          width: 18,
          height: 18,
          borderRadius: "50%",
          background: "white",
          transform: value ? "translateX(18px)" : "translateX(0)",
          transition: "transform .2s",
          boxShadow: "0 1px 4px rgba(0,0,0,0.3)",
        }}
      />
    </button>
  );
}

/* ─── StatCard ───────────────────────────────────────────────────────────── */
interface StatCardProps {
  label: string;
  value: string | number;
  sub?: string;
  icon: string;
  color?: string;
  delta?: { up: boolean; label: string };
}

export function PiqStatCard({ label, value, sub, icon, color = "var(--accent)", delta }: StatCardProps) {
  return (
    <div
      style={{
        background: "var(--surf)",
        border: "1px solid var(--border)",
        borderRadius: "var(--radiusLg)",
        padding: "18px 20px",
        display: "flex",
        flexDirection: "column",
        gap: 12,
      }}
    >
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
        <div style={{ fontSize: 14, color: "var(--text2)", fontWeight: 500 }}>{label}</div>
        <div
          style={{
            width: 34,
            height: 34,
            borderRadius: "var(--radius)",
            background: `oklch(from ${color} l c h / 15%)`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Icon n={icon} s={17} c={color} />
        </div>
      </div>
      <div>
        <div style={{ fontSize: 30, fontWeight: 700, lineHeight: 1 }}>{value}</div>
        {sub && <div style={{ fontSize: 13, color: "var(--text3)", marginTop: 5 }}>{sub}</div>}
      </div>
      {delta && (
        <div
          style={{
            fontSize: 13,
            color: delta.up ? "var(--green)" : "var(--rose)",
            display: "flex",
            alignItems: "center",
            gap: 4,
          }}
        >
          <Icon n="trend" s={12} c={delta.up ? "var(--green)" : "var(--rose)"} />
          {delta.label}
        </div>
      )}
    </div>
  );
}

/* ─── Toast ──────────────────────────────────────────────────────────────── */
interface ToastProps {
  msg: string;
  type?: "success" | "error" | "info";
  onDone: () => void;
}

export function PiqToast({ msg, type = "success", onDone }: ToastProps) {
  useEffect(() => {
    const t = setTimeout(onDone, 2800);
    return () => clearTimeout(t);
  }, [onDone]);
  const colors: Record<string, [string, string]> = {
    success: ["var(--greenD)", "var(--green)"],
    error:   ["var(--roseD)",  "var(--rose)"],
    info:    ["var(--accentD)","var(--accent)"],
  };
  const [bg, fg] = colors[type] || colors.info;
  return (
    <div
      className="anim-up"
      style={{
        position: "fixed",
        bottom: 24,
        right: 24,
        zIndex: 2000,
        background: bg,
        border: `1px solid ${fg}40`,
        color: fg,
        padding: "10px 16px",
        borderRadius: "var(--radiusLg)",
        fontSize: 15,
        fontWeight: 500,
        display: "flex",
        alignItems: "center",
        gap: 8,
        boxShadow: "0 8px 24px oklch(0% 0 0 / 30%)",
      }}
    >
      <Icon n="check" s={15} c={fg} /> {msg}
    </div>
  );
}

/* ─── ActionBtn (icon button) ────────────────────────────────────────────── */
export function ActionBtn({
  icon,
  title,
  color,
  onClick,
}: {
  icon: string;
  title: string;
  color: string;
  onClick: () => void;
}) {
  const [hov, setHov] = useState(false);
  return (
    <button
      title={title}
      onClick={onClick}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        width: 30,
        height: 30,
        borderRadius: "var(--radius)",
        border: `1px solid ${hov ? color + "66" : "var(--border)"}`,
        background: hov ? `${color}20` : "transparent",
        cursor: "pointer",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        transition: "all .12s",
        flexShrink: 0,
      }}
    >
      <Icon n={icon} s={14} c={hov ? color : "var(--text3)"} />
    </button>
  );
}

/* ─── PageBtn (pagination) ────────────────────────────────────────────────── */
export function PageBtn({
  label,
  active = false,
  disabled = false,
  onClick,
}: {
  label: string | number;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        minWidth: 28,
        height: 28,
        padding: "0 6px",
        borderRadius: "var(--radius)",
        border: `1px solid ${active ? "var(--accent)" : "var(--border)"}`,
        background: active ? "var(--accentD)" : "transparent",
        color: active ? "var(--accent)" : disabled ? "var(--text3)" : "var(--text2)",
        fontSize: 14,
        cursor: disabled ? "not-allowed" : "pointer",
        fontFamily: "inherit",
        transition: "all .12s",
      }}
    >
      {label}
    </button>
  );
}
