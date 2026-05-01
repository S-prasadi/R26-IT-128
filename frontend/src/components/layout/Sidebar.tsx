"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon } from "@/components/piq/icon";
import { PiqAvatar } from "@/components/piq/avatar";
import { ROUTES } from "@/constants/routes";
import { useAuth } from "@/hooks/useAuth";

const PLATFORM_ITEMS = [
  { id: "dashboard", label: "Dashboard",          icon: "dashboard", href: ROUTES.DASHBOARD },
  { id: "users",     label: "Users",               icon: "users",     href: ROUTES.USERS    },
  { id: "roles",     label: "Roles & Permissions", icon: "shield",    href: ROUTES.ROLES    },
];

const SPACE_ITEMS = [
  { id: "profile",       label: "My Profile",       icon: "person", href: ROUTES.PROFILE       },
  { id: "progress",      label: "Progress Tracker",  icon: "trend",  href: ROUTES.PROGRESS      },
  { id: "notifications", label: "Notifications",     icon: "bell",   href: ROUTES.NOTIFICATIONS },
];

const MODULE_ITEMS = [
  { id: "skill",     label: "Skill Forecasting", icon: "trend",  color: "var(--amber)",  href: ROUTES.SKILL     },
  { id: "career",    label: "Career Paths",       icon: "career", color: "var(--teal)",   href: ROUTES.CAREER    },
  { id: "cv",        label: "CV Validator",        icon: "cv",     color: "var(--violet)", href: ROUTES.CV        },
  { id: "interview", label: "Interview Sim",       icon: "chat",   color: "var(--rose)",   href: ROUTES.INTERVIEW },
];

function NavButton({ label, icon, href, active, color, badge }: {
  label: string; icon: string; href: string; active: boolean; color?: string; badge?: boolean;
}) {
  const activeColor = color || "var(--accent)";
  return (
    <Link href={href} style={{
      display: "flex", alignItems: "center", gap: 10, padding: "8px 10px",
      borderRadius: "var(--radius)", textDecoration: "none",
      background: active ? (color ? `${color}22` : "var(--accentD)") : "transparent",
      color: active ? activeColor : "var(--text2)",
      fontSize: 13, fontWeight: active ? 600 : 400, transition: "all .12s",
    }}>
      <Icon n={icon} s={16} c={active ? activeColor : "var(--text3)"} />
      <span style={{ flex: 1 }}>{label}</span>
      {badge && <span style={{ width: 7, height: 7, borderRadius: "50%", background: "var(--rose)", flexShrink: 0 }} />}
    </Link>
  );
}

function SectionLabel({ label }: { label: string }) {
  return (
    <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text3)", letterSpacing: "0.08em", padding: "14px 10px 4px" }}>
      {label}
    </div>
  );
}

export function Sidebar() {
  const pathname = usePathname();
  const { user, isAdmin } = useAuth();
  const active = (href: string) => pathname === href || pathname.startsWith(href + "/");

  const displayName = user?.name ?? (isAdmin ? "Admin" : "Student");
  const displayRole = user?.role ?? "user";

  return (
    <div style={{
      width: "var(--piq-sidebar)", height: "100%", flexShrink: 0,
      background: "var(--surf)", borderRight: "1px solid var(--border)",
      display: "flex", flexDirection: "column", overflow: "hidden",
    }}>
      {/* Logo */}
      <div style={{ padding: "0 20px", height: "var(--header)", display: "flex", alignItems: "center", borderBottom: "1px solid var(--border)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
          <div style={{ width: 30, height: 30, borderRadius: 8, background: "linear-gradient(135deg, var(--accent), var(--teal))", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 17l4-8 4 4 4-6 4 6" />
              <circle cx="3" cy="17" r="1.5" fill="white" stroke="none" />
              <circle cx="19" cy="13" r="1.5" fill="white" stroke="none" />
            </svg>
          </div>
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, letterSpacing: "-0.01em", lineHeight: 1 }}>PathwayIQ</div>
            <div style={{ fontSize: 10, color: "var(--text3)", fontWeight: 400, letterSpacing: "0.04em", marginTop: 1 }}>
              {isAdmin ? "ADMIN PORTAL" : "CAREER NAVIGATOR"}
            </div>
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav style={{ flex: 1, overflowY: "auto", padding: "12px 10px", display: "flex", flexDirection: "column", gap: 2 }}>

        {/* Admin/Manager only */}
        {isAdmin && (
          <>
            <SectionLabel label="PLATFORM" />
            {PLATFORM_ITEMS.map((item) => (
              <NavButton key={item.id} {...item} active={active(item.href)} />
            ))}
          </>
        )}

        <SectionLabel label="MY SPACE" />
        {SPACE_ITEMS.map((item) => (
          <NavButton key={item.id} {...item} active={active(item.href)} badge={item.id === "notifications"} />
        ))}

        <SectionLabel label={isAdmin ? "AI MODULES" : "AI TOOLS"} />
        {MODULE_ITEMS.map((item) => (
          <NavButton key={item.id} {...item} active={active(item.href)} />
        ))}
      </nav>

      {/* User footer */}
      <div style={{ padding: "12px 10px", borderTop: "1px solid var(--border)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 10px", borderRadius: "var(--radius)" }}>
          <PiqAvatar name={displayName} size={28} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{displayName}</div>
            <div style={{ fontSize: 11, color: "var(--text3)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", textTransform: "capitalize" }}>{displayRole}</div>
          </div>
        </div>
      </div>
    </div>
  );
}
