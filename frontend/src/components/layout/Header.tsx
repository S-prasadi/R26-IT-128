"use client";

import { usePathname, useRouter } from "next/navigation";
import { Icon } from "@/components/piq/icon";
import { PiqBtn } from "@/components/piq/primitives";
import { ROUTES } from "@/constants/routes";
import { useTheme } from "./ThemeProvider";
import { clearAuth } from "@/hooks/useAuth";

const PAGE_TITLES: Record<string, { title: string; sub: string }> = {
  "/dashboard":     { title: "Dashboard",           sub: "Welcome back — here's your platform overview" },
  "/users":         { title: "User Management",      sub: "Manage accounts, roles and access" },
  "/roles":         { title: "Roles & Permissions",  sub: "Define access policies and permission sets" },
  "/skill":         { title: "Skill Forecasting",    sub: "3-month IT skill demand predictions — Module A" },
  "/career":        { title: "Career Paths",         sub: "Probabilistic career trajectory graphs — Module B" },
  "/cv":            { title: "CV Validator",         sub: "Evidence-based proficiency and job-fit scores — Module C" },
  "/interview":     { title: "Interview Simulator",  sub: "Emotion-aware mock interview sessions — Module D" },
  "/profile":       { title: "My Profile",           sub: "Skills, education, career preferences and CV history" },
  "/progress":      { title: "Progress Tracker",     sub: "Cross-module improvement scores and achievements" },
  "/notifications": { title: "Notifications",        sub: "Skill alerts, job matches and early warnings" },
};

export function Header() {
  const pathname = usePathname();
  const router = useRouter();
  const { theme, toggle } = useTheme();
  const info = PAGE_TITLES[pathname] || PAGE_TITLES["/dashboard"];

  function handleLogout() {
    clearAuth();
    router.push(ROUTES.LOGIN);
  }

  return (
    <div
      style={{
        height: "var(--header)",
        padding: "0 24px",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        borderBottom: "1px solid var(--border)",
        background: "var(--surf)",
        flexShrink: 0,
      }}
    >
      <div>
        <div style={{ fontSize: 18, fontWeight: 600 }}>{info.title}</div>
        <div style={{ fontSize: 13, color: "var(--text3)", marginTop: 1 }}>{info.sub}</div>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        {/* Theme toggle */}
        <button
          onClick={toggle}
          title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
          style={{
            background: "none", border: "1px solid var(--border2)", cursor: "pointer",
            display: "flex", alignItems: "center", justifyContent: "center",
            padding: 7, borderRadius: "var(--radius)", transition: "all .15s",
            color: "var(--text3)",
          }}
          onMouseEnter={(e) => (e.currentTarget.style.background = "var(--surf2)")}
          onMouseLeave={(e) => (e.currentTarget.style.background = "none")}
        >
          {theme === "dark" ? (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/>
            </svg>
          ) : (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
            </svg>
          )}
        </button>

        <button
          style={{
            background: "none", border: "none", cursor: "pointer",
            color: "var(--text3)", display: "flex", padding: 8,
            borderRadius: "var(--radius)", position: "relative",
          }}
          onClick={() => router.push(ROUTES.NOTIFICATIONS)}
        >
          <Icon n="bell" s={18} c="var(--text3)" />
          <span
            style={{
              position: "absolute", top: 6, right: 6,
              width: 7, height: 7, borderRadius: "50%",
              background: "var(--rose)", border: "1.5px solid var(--surf)",
            }}
          />
        </button>
        <PiqBtn variant="ghost" size="sm" icon="logout" onClick={handleLogout} style={{ color: "var(--text3)", fontSize: 14 }}>
          Sign out
        </PiqBtn>
      </div>
    </div>
  );
}
