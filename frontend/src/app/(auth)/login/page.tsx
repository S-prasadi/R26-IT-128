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

const FEATURES = [
  {
    icon: "trend",
    label: "Skill Forecasting",
    sub: "3-month IT skill demand predictions powered by real job market data",
    color: "var(--amber)",
    grad: "oklch(78% 0.17 80 / 15%)",
  },
  {
    icon: "career",
    label: "Career Path Predictor",
    sub: "Personalised roadmaps using Neo4j knowledge graphs",
    color: "var(--teal)",
    grad: "oklch(66% 0.15 175 / 15%)",
  },
  {
    icon: "cv",
    label: "CV Validator",
    sub: "Evidence-based proficiency scores backed by GitHub",
    color: "var(--violet)",
    grad: "oklch(65% 0.17 290 / 15%)",
  },
  {
    icon: "chat",
    label: "Interview Simulator",
    sub: "Emotion-aware AI mock sessions with real-time feedback",
    color: "var(--rose)",
    grad: "oklch(63% 0.18 25 / 15%)",
  },
];

export default function LoginPage() {
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

      if (role !== "user") {
        setError("This login is for students. Please use the Admin Login for staff accounts.");
        return;
      }

      localStorage.setItem("token", session.access_token);
      localStorage.setItem("refresh_token", session.refresh_token);
      persistUser({ id: user.id, name: user.name ?? user.email, email: user.email, role });
      toast.success("Successfully logged in", { description: `Welcome back, ${user.name ?? user.email}!` });
      router.push(ROUTES.SKILL);
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
        background: "linear-gradient(160deg, oklch(12% 0.025 245) 0%, oklch(10% 0.020 245) 100%)",
        display: "flex", flexDirection: "column", padding: "44px 52px",
      }}>
        {/* Background orbs */}
        <div style={{ position: "absolute", top: -160, left: -100, width: 500, height: 500, borderRadius: "50%", background: "oklch(63% 0.19 232 / 12%)", filter: "blur(100px)", pointerEvents: "none" }} />
        <div style={{ position: "absolute", bottom: -120, right: -80, width: 400, height: 400, borderRadius: "50%", background: "oklch(66% 0.15 175 / 10%)", filter: "blur(90px)", pointerEvents: "none" }} />
        <div style={{ position: "absolute", top: "45%", left: "35%", width: 200, height: 200, borderRadius: "50%", background: "oklch(65% 0.17 290 / 6%)", filter: "blur(60px)", pointerEvents: "none" }} />

        {/* Subtle grid */}
        <svg style={{ position: "absolute", inset: 0, opacity: 0.04, pointerEvents: "none" }} width="100%" height="100%">
          <defs>
            <pattern id="lg" width="48" height="48" patternUnits="userSpaceOnUse">
              <path d="M 48 0 L 0 0 0 48" fill="none" stroke="white" strokeWidth="0.6" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#lg)" />
        </svg>

        {/* Logo */}
        <div style={{ display: "flex", alignItems: "center", gap: 12, zIndex: 1 }}>
          <div style={{ width: 40, height: 40, borderRadius: 12, background: "linear-gradient(135deg, var(--accent), var(--teal))", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 4px 16px oklch(63% 0.19 232 / 35%)" }}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 17l4-8 4 4 4-6 4 6" />
              <circle cx="3" cy="17" r="1.5" fill="white" stroke="none" />
              <circle cx="19" cy="13" r="1.5" fill="white" stroke="none" />
            </svg>
          </div>
          <div>
            <div style={{ fontSize: 20, fontWeight: 700, letterSpacing: "-0.01em", color: "white" }}>PathwayIQ</div>
            <div style={{ fontSize: 10, color: "oklch(80% 0.04 245)", letterSpacing: "0.1em", fontWeight: 500 }}>INTELLIGENT CAREER NAVIGATOR</div>
          </div>
        </div>

        {/* Hero text */}
        <div style={{ marginTop: "auto", zIndex: 1 }}>
          <div style={{ display: "inline-flex", alignItems: "center", gap: 7, padding: "6px 12px", borderRadius: 99, background: "oklch(63% 0.19 232 / 15%)", border: "1px solid oklch(63% 0.19 232 / 25%)", marginBottom: 20 }}>
            <div style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--accent)" }} />
            <span style={{ fontSize: 11, fontWeight: 600, color: "oklch(80% 0.12 232)", letterSpacing: "0.06em" }}>BUILT FOR SLIIT IT UNDERGRADS</span>
          </div>

          <div style={{ fontSize: 36, fontWeight: 800, lineHeight: 1.2, letterSpacing: "-0.025em", marginBottom: 14, color: "white" }}>
            Your AI-powered<br />
            <span style={{ background: "linear-gradient(90deg, var(--accent) 0%, var(--teal) 60%)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
              career navigator
            </span>
          </div>
          <div style={{ fontSize: 15, color: "oklch(72% 0.04 245)", lineHeight: 1.65, marginBottom: 36, maxWidth: 340 }}>
            Close the skill-industry gap with real-time forecasting, personalised career roadmaps, and AI coaching.
          </div>

          {/* Feature cards */}
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {FEATURES.map((f) => (
              <div key={f.label} style={{
                display: "flex", alignItems: "center", gap: 14,
                padding: "12px 16px", borderRadius: 12,
                background: "oklch(100% 0 0 / 4%)",
                border: "1px solid oklch(100% 0 0 / 8%)",
                backdropFilter: "blur(8px)",
              }}>
                <div style={{
                  width: 36, height: 36, borderRadius: 10, flexShrink: 0,
                  background: f.grad,
                  border: `1px solid ${f.color}44`,
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}>
                  <Icon n={f.icon} s={16} c={f.color} />
                </div>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: "white", marginBottom: 1 }}>{f.label}</div>
                  <div style={{ fontSize: 11, color: "oklch(65% 0.04 245)", lineHeight: 1.4 }}>{f.sub}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

      </div>

      {/* ── Right panel ── */}
      <div className="piq-canvas" style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "48px 56px", position: "relative" }}>
        {/* Top accent bar */}
        <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 3, background: "linear-gradient(90deg, var(--accent), var(--teal))" }} />

        <div className="anim-up" style={{ width: "100%", maxWidth: 400 }}>

          {/* Welcome badge */}
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 28, padding: "7px 14px", background: "var(--accentD)", border: "1px solid oklch(63% 0.19 232 / 20%)", borderRadius: 99, width: "fit-content" }}>
            <Icon n="person" s={13} c="var(--accent)" />
            <span style={{ fontSize: 12, fontWeight: 600, color: "var(--accent)", letterSpacing: "0.04em" }}>STUDENT PORTAL</span>
          </div>

          <div style={{ marginBottom: 32 }}>
            <div style={{ fontSize: 28, fontWeight: 800, letterSpacing: "-0.025em", lineHeight: 1.15, marginBottom: 8 }}>
              Welcome back
            </div>
            <div style={{ fontSize: 15, color: "var(--text2)", lineHeight: 1.5 }}>
              Sign in to access your personalised career dashboard
            </div>
          </div>

          <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <PiqInput label="Email address" type="email" icon="email" placeholder="you@students.sliit.lk"
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
                  {error.includes("Admin Login") && (
                    <a href={ROUTES.ADMIN_LOGIN} style={{ color: "var(--rose)", fontWeight: 700, textDecoration: "underline" }}>Go to Admin Login →</a>
                  )}
                </span>
              </div>
            )}

            <PiqBtn type="submit" size="lg" disabled={loading} style={{ marginTop: 6, width: "100%", justifyContent: "center", height: 48, fontSize: 15 }}>
              {loading ? <><PiqSpinner size={17} /> Signing in…</> : "Sign in to PathwayIQ"}
            </PiqBtn>
          </form>

          {/* Divider */}
          <div style={{ display: "flex", alignItems: "center", gap: 14, margin: "24px 0" }}>
            <div style={{ flex: 1, height: 1, background: "var(--border)" }} />
            <span style={{ fontSize: 12, color: "var(--text3)", whiteSpace: "nowrap" }}>new to pathwayiq?</span>
            <div style={{ flex: 1, height: 1, background: "var(--border)" }} />
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 10, textAlign: "center" }}>
            <a href={ROUTES.REGISTER} style={{
              display: "block", padding: "11px 16px", borderRadius: 10,
              border: "1px solid var(--border2)", background: "var(--surf)",
              fontSize: 14, fontWeight: 500, color: "var(--text)", textDecoration: "none",
              transition: "all .15s",
            }}>
              Create a free student account →
            </a>
            <div style={{ fontSize: 13, color: "var(--text3)" }}>
              Admin or staff?{" "}
              <a href={ROUTES.ADMIN_LOGIN} style={{ color: "var(--text2)", textDecoration: "none", fontWeight: 600 }}>
                Admin portal →
              </a>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
