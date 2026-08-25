"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { AxiosError } from "axios";
import { toast } from "sonner";
import { ROUTES } from "@/constants/routes";
import { authService } from "@/services/auth.service";
import { persistUser } from "@/hooks/useAuth";
import { Icon } from "@/components/piq/icon";
import { PiqInput, PiqBtn, PiqSpinner } from "@/components/piq/primitives";

const PLATFORM_STATS = [
  { value: "1,247",  label: "Active students", icon: "users",   color: "var(--teal)"   },
  { value: "4",      label: "Live AI modules",  icon: "trend",   color: "var(--accent)" },
  { value: "15.6k",  label: "Jobs analysed",    icon: "career",  color: "var(--amber)"  },
  { value: "81.4%",  label: "Forecast accuracy", icon: "cv",     color: "var(--violet)" },
];

const CAPABILITIES = [
  { icon: "users",  label: "User & Role Management",  sub: "Create, suspend and assign roles to accounts" },
  { icon: "shield", label: "Access Control",           sub: "Fine-grained permission policies per role" },
  { icon: "trend",  label: "Platform Analytics",       sub: "Module usage, engagement and accuracy KPIs" },
];

export default function AdminLoginPage() {
  const router = useRouter();
  const [email, setEmail]       = useState("");
  const [password, setPassword] = useState("");
  const [error, setError]       = useState("");
  const [loading, setLoading]   = useState(false);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    if (!email || !password) { setError("Please fill in all fields."); return; }
    setLoading(true);
    try {
      const response = await authService.login({ email, password });
      const { session, user } = response.data.data;
      if (!session?.access_token) { setError("Login succeeded but no session was returned."); return; }

      const role = user?.role ?? "user";

      if (role === "user") {
        setError("This login is for staff only. Please use the Student Login for student accounts.");
        return;
      }

      localStorage.setItem("token", session.access_token);
      localStorage.setItem("refresh_token", session.refresh_token);
      persistUser({ id: user.id, name: user.name ?? user.email, email: user.email, role });
      toast.success("Successfully logged in", { description: `Welcome back, ${user.name ?? user.email}!` });
      router.push(ROUTES.DASHBOARD);
    } catch (err) {
      const axiosError = err as AxiosError<{ message?: string }>;
      setError(axiosError.response?.data?.message ?? "Unable to sign in.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ display: "flex", height: "100vh", width: "100%", fontFamily: "var(--font-dm-sans), 'DM Sans', system-ui, sans-serif" }}>

      {/* ── Left panel ── */}
      <div style={{
        width: "48%", flexShrink: 0, position: "relative", overflow: "hidden",
        background: "linear-gradient(160deg, oklch(11% 0.028 290) 0%, oklch(9% 0.022 290) 100%)",
        display: "flex", flexDirection: "column", padding: "44px 52px",
      }}>
        {/* Background orbs */}
        <div style={{ position: "absolute", top: -160, left: -100, width: 500, height: 500, borderRadius: "50%", background: "oklch(65% 0.17 290 / 15%)", filter: "blur(100px)", pointerEvents: "none" }} />
        <div style={{ position: "absolute", bottom: -100, right: -60, width: 380, height: 380, borderRadius: "50%", background: "oklch(63% 0.19 232 / 10%)", filter: "blur(90px)", pointerEvents: "none" }} />
        <div style={{ position: "absolute", top: "50%", left: "30%", width: 180, height: 180, borderRadius: "50%", background: "oklch(78% 0.17 80 / 6%)", filter: "blur(50px)", pointerEvents: "none" }} />

        {/* Subtle grid */}
        <svg style={{ position: "absolute", inset: 0, opacity: 0.04, pointerEvents: "none" }} width="100%" height="100%">
          <defs>
            <pattern id="agrid" width="48" height="48" patternUnits="userSpaceOnUse">
              <path d="M 48 0 L 0 0 0 48" fill="none" stroke="white" strokeWidth="0.6" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#agrid)" />
        </svg>

        {/* Logo */}
        <div style={{ display: "flex", alignItems: "center", gap: 12, zIndex: 1 }}>
          <div style={{ width: 40, height: 40, borderRadius: 12, background: "linear-gradient(135deg, var(--violet), var(--accent))", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 4px 16px oklch(65% 0.17 290 / 35%)" }}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 17l4-8 4 4 4-6 4 6" />
              <circle cx="3" cy="17" r="1.5" fill="white" stroke="none" />
              <circle cx="19" cy="13" r="1.5" fill="white" stroke="none" />
            </svg>
          </div>
          <div>
            <div style={{ fontSize: 20, fontWeight: 700, letterSpacing: "-0.01em", color: "white" }}>PathwayIQ</div>
            <div style={{ fontSize: 10, color: "oklch(70% 0.04 290)", letterSpacing: "0.1em", fontWeight: 500 }}>ADMIN &amp; STAFF PORTAL</div>
          </div>
        </div>

        {/* Hero text */}
        <div style={{ marginTop: "auto", zIndex: 1 }}>
          <div style={{ display: "inline-flex", alignItems: "center", gap: 7, padding: "6px 12px", borderRadius: 99, background: "oklch(65% 0.17 290 / 15%)", border: "1px solid oklch(65% 0.17 290 / 30%)", marginBottom: 20 }}>
            <Icon n="shield" s={12} c="var(--violet)" />
            <span style={{ fontSize: 11, fontWeight: 600, color: "oklch(75% 0.12 290)", letterSpacing: "0.06em" }}>RESTRICTED ACCESS</span>
          </div>

          <div style={{ fontSize: 36, fontWeight: 800, lineHeight: 1.2, letterSpacing: "-0.025em", marginBottom: 14, color: "white" }}>
            Platform<br />
            <span style={{ background: "linear-gradient(90deg, var(--violet) 0%, var(--accent) 70%)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
              administration
            </span>
          </div>
          <div style={{ fontSize: 15, color: "oklch(68% 0.04 290)", lineHeight: 1.65, marginBottom: 32, maxWidth: 340 }}>
            Manage users, control access policies, and monitor AI module performance across the platform.
          </div>

          {/* Platform stats grid */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 28 }}>
            {PLATFORM_STATS.map((s) => (
              <div key={s.value} style={{
                padding: "14px 16px", borderRadius: 12,
                background: "oklch(100% 0 0 / 4%)",
                border: "1px solid oklch(100% 0 0 / 8%)",
              }}>
                <div style={{ fontSize: 22, fontWeight: 800, color: s.color, letterSpacing: "-0.02em", marginBottom: 3 }}>{s.value}</div>
                <div style={{ fontSize: 11, color: "oklch(60% 0.04 290)", lineHeight: 1.3 }}>{s.label}</div>
              </div>
            ))}
          </div>

          {/* Capabilities */}
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {CAPABILITIES.map((c) => (
              <div key={c.label} style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <div style={{ width: 28, height: 28, borderRadius: 8, background: "oklch(65% 0.17 290 / 15%)", border: "1px solid oklch(65% 0.17 290 / 20%)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <Icon n={c.icon} s={13} c="var(--violet)" />
                </div>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: "white" }}>{c.label}</div>
                  <div style={{ fontSize: 11, color: "oklch(58% 0.04 290)" }}>{c.sub}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

      </div>

      {/* ── Right panel ── */}
      <div className="piq-canvas" style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "48px 56px", position: "relative" }}>
        {/* Top accent bar */}
        <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 3, background: "linear-gradient(90deg, var(--violet), var(--accent))" }} />

        <div className="anim-up" style={{ width: "100%", maxWidth: 400 }}>

          {/* Staff badge */}
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 28, padding: "7px 14px", background: "var(--violetD)", border: "1px solid oklch(65% 0.17 290 / 22%)", borderRadius: 99, width: "fit-content" }}>
            <Icon n="shield" s={13} c="var(--violet)" />
            <span style={{ fontSize: 12, fontWeight: 600, color: "var(--violet)", letterSpacing: "0.04em" }}>STAFF ACCESS ONLY</span>
          </div>

          <div style={{ marginBottom: 32 }}>
            <div style={{ fontSize: 28, fontWeight: 800, letterSpacing: "-0.025em", lineHeight: 1.15, marginBottom: 8 }}>
              Admin sign in
            </div>
            <div style={{ fontSize: 15, color: "var(--text2)", lineHeight: 1.5 }}>
              Access the management portal with your staff credentials
            </div>
          </div>

          <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <PiqInput label="Email address" type="email" icon="email" placeholder="you@sliit.lk"
              value={email} onChange={(e) => setEmail(e.target.value)} required />
            <PiqInput label="Password" type="password" icon="lock" placeholder="Enter your password"
              value={password} onChange={(e) => setPassword(e.target.value)} required />

            {error && (
              <div style={{
                padding: "11px 14px", background: "var(--roseD)",
                border: "1px solid oklch(63% 0.18 25 / 25%)", borderRadius: 10,
                fontSize: 13, color: "var(--rose)", lineHeight: 1.55,
                display: "flex", gap: 10, alignItems: "flex-start",
              }}>
                <Icon n="alert" s={15} c="var(--rose)" style={{ flexShrink: 0, marginTop: 1 }} />
                <span>
                  {error}{" "}
                  {error.includes("Student Login") && (
                    <a href={ROUTES.LOGIN} style={{ color: "var(--rose)", fontWeight: 700, textDecoration: "underline" }}>Go to Student Login →</a>
                  )}
                </span>
              </div>
            )}

            <PiqBtn type="submit" size="lg" disabled={loading} style={{ marginTop: 6, width: "100%", justifyContent: "center", height: 48, fontSize: 15, background: "var(--violet)" }}>
              {loading ? <><PiqSpinner size={17} /> Signing in…</> : "Sign in to Admin Portal"}
            </PiqBtn>
          </form>

          {/* Divider */}
          <div style={{ display: "flex", alignItems: "center", gap: 14, margin: "24px 0" }}>
            <div style={{ flex: 1, height: 1, background: "var(--border)" }} />
            <span style={{ fontSize: 12, color: "var(--text3)", whiteSpace: "nowrap" }}>not a staff member?</span>
            <div style={{ flex: 1, height: 1, background: "var(--border)" }} />
          </div>

          <div style={{ textAlign: "center" }}>
            <a href={ROUTES.LOGIN} style={{
              display: "block", padding: "11px 16px", borderRadius: 10,
              border: "1px solid var(--border2)", background: "var(--surf)",
              fontSize: 14, fontWeight: 500, color: "var(--text)", textDecoration: "none",
            }}>
              Go to Student Login →
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
