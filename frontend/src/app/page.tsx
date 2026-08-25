"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ROUTES } from "@/constants/routes";
import { getStoredUser } from "@/hooks/useAuth";

const MODULES = [
  {
    icon: "📈", color: "#f59e0b", bg: "oklch(78% 0.17 80 / 10%)", border: "oklch(78% 0.17 80 / 20%)",
    title: "Skill Forecasting",
    desc: "3-month ahead IT skill demand predictions powered by real job posting analysis. Know what to learn before the market demands it.",
    tag: "Module A",
  },
  {
    icon: "🗺️", color: "#14b8a6", bg: "oklch(66% 0.15 175 / 10%)", border: "oklch(66% 0.15 175 / 20%)",
    title: "Career Path Predictor",
    desc: "Probabilistic career trajectory graphs built on a Neo4j knowledge graph of real SLIIT graduate paths.",
    tag: "Module B",
  },
  {
    icon: "📄", color: "#8b5cf6", bg: "oklch(65% 0.17 290 / 10%)", border: "oklch(65% 0.17 290 / 20%)",
    title: "CV Validator",
    desc: "Evidence-based proficiency scoring backed by your GitHub activity and automated job-fit matching.",
    tag: "Module C",
  },
  {
    icon: "🎤", color: "#f43f5e", bg: "oklch(63% 0.18 25 / 10%)", border: "oklch(63% 0.18 25 / 20%)",
    title: "Interview Simulator",
    desc: "Emotion-aware AI mock interview sessions with real-time facial & vocal feedback and targeted coaching.",
    tag: "Module D",
  },
];

const STATS = [
  { value: "1,200+", label: "Active students" },
  { value: "4",      label: "AI modules live" },
  { value: "81%",    label: "Forecast accuracy" },
  { value: "15k+",   label: "Jobs analysed" },
];

const STEPS = [
  { n: "01", title: "Create your account",   desc: "Register in under 60 seconds with your email. No credit card required." },
  { n: "02", title: "Upload your CV",         desc: "Drop in your PDF — our AI extracts your skills, projects, and scores your profile." },
  { n: "03", title: "Get your roadmap",       desc: "Receive personalised career predictions, skill gap analysis, and a learning plan." },
];

export default function HomePage() {
  const router = useRouter();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (token) {
      const user = getStoredUser();
      const isAdmin = user?.role === "admin" || user?.role === "manager";
      router.replace(isAdmin ? ROUTES.DASHBOARD : ROUTES.SKILL);
      return;
    }
    setReady(true);
  }, [router]);

  if (!ready) return null;

  return (
    <div className="piq-canvas" style={{ fontFamily: "var(--font-dm-sans), 'DM Sans', system-ui, sans-serif", color: "var(--text)", minHeight: "100vh" }}>

      {/* ── Navbar ── */}
      <nav style={{
        position: "sticky", top: 0, zIndex: 100,
        background: "var(--surf)", borderBottom: "1px solid var(--border)",
        padding: "0 48px", height: 60, display: "flex", alignItems: "center", justifyContent: "space-between",
        backdropFilter: "blur(10px)",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 32, height: 32, borderRadius: 9, background: "linear-gradient(135deg, oklch(63% 0.19 232), oklch(66% 0.15 175))", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 17l4-8 4 4 4-6 4 6" />
              <circle cx="3" cy="17" r="1.5" fill="white" stroke="none" />
              <circle cx="19" cy="13" r="1.5" fill="white" stroke="none" />
            </svg>
          </div>
          <span style={{ fontSize: 17, fontWeight: 700, letterSpacing: "-0.01em" }}>PathwayIQ</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <a href={ROUTES.LOGIN} style={{ padding: "8px 18px", fontSize: 14, fontWeight: 500, color: "var(--text2)", textDecoration: "none", borderRadius: 8, border: "1px solid var(--border2)", background: "transparent" }}>
            Sign in
          </a>
          <a href={ROUTES.REGISTER} style={{ padding: "8px 18px", fontSize: 14, fontWeight: 600, color: "white", textDecoration: "none", borderRadius: 8, background: "oklch(63% 0.19 232)" }}>
            Get started →
          </a>
        </div>
      </nav>

      {/* ── Hero ── */}
      <section style={{ position: "relative", overflow: "hidden", padding: "100px 48px 80px", textAlign: "center" }}>
        <div style={{ position: "absolute", top: -200, left: "50%", transform: "translateX(-50%)", width: 700, height: 700, borderRadius: "50%", background: "oklch(63% 0.19 232 / 6%)", filter: "blur(120px)", pointerEvents: "none" }} />
        <div style={{ position: "absolute", top: 0, left: "20%", width: 400, height: 400, borderRadius: "50%", background: "oklch(66% 0.15 175 / 5%)", filter: "blur(80px)", pointerEvents: "none" }} />

        <div style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "6px 14px", borderRadius: 99, background: "oklch(63% 0.19 232 / 10%)", border: "1px solid oklch(63% 0.19 232 / 20%)", marginBottom: 24 }}>
          <div style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--accent)" }} />
          <span style={{ fontSize: 12, fontWeight: 600, color: "var(--accent)", letterSpacing: "0.06em" }}>AI-POWERED CAREER PLATFORM</span>
        </div>

        <h1 style={{ fontSize: "clamp(36px, 6vw, 68px)", fontWeight: 800, lineHeight: 1.1, letterSpacing: "-0.03em", marginBottom: 20, maxWidth: 780, margin: "0 auto 20px" }}>
          Navigate your IT career<br />
          <span style={{ background: "linear-gradient(90deg, oklch(63% 0.19 232), oklch(66% 0.15 175))", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
            with confidence
          </span>
        </h1>
        <p style={{ fontSize: "clamp(16px, 2vw, 20px)", color: "var(--text2)", lineHeight: 1.65, maxWidth: 560, margin: "0 auto 40px" }}>
          PathwayIQ bridges the gap between your university skills and what Sri Lanka's IT industry actually needs — with four integrated AI modules.
        </p>
        <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
          <a href={ROUTES.REGISTER} style={{ padding: "14px 32px", fontSize: 16, fontWeight: 700, color: "white", textDecoration: "none", borderRadius: 10, background: "oklch(63% 0.19 232)", letterSpacing: "-0.01em" }}>
            Start for free →
          </a>
          <a href={ROUTES.LOGIN} style={{ padding: "14px 32px", fontSize: 16, fontWeight: 500, color: "var(--text)", textDecoration: "none", borderRadius: 10, border: "1px solid var(--border2)", background: "var(--surf)" }}>
            Sign in
          </a>
        </div>
      </section>

      {/* ── Stats bar ── */}
      <section style={{ borderTop: "1px solid var(--border)", borderBottom: "1px solid var(--border)", background: "var(--surf)" }}>
        <div style={{ maxWidth: 900, margin: "0 auto", padding: "0 48px", display: "grid", gridTemplateColumns: "repeat(4, 1fr)" }}>
          {STATS.map((s) => (
            <div key={s.value} style={{ padding: "28px 24px", textAlign: "center", borderRight: "1px solid var(--border)" }}>
              <div style={{ fontSize: 32, fontWeight: 800, letterSpacing: "-0.025em", color: "var(--accent)", marginBottom: 4 }}>{s.value}</div>
              <div style={{ fontSize: 14, color: "var(--text3)", fontWeight: 500 }}>{s.label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ── Features ── */}
      <section style={{ padding: "80px 48px", maxWidth: 1100, margin: "0 auto" }}>
        <div style={{ textAlign: "center", marginBottom: 52 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: "var(--accent)", letterSpacing: "0.1em", marginBottom: 12 }}>FOUR AI MODULES</div>
          <h2 style={{ fontSize: "clamp(28px, 4vw, 44px)", fontWeight: 800, letterSpacing: "-0.025em", lineHeight: 1.15, marginBottom: 14 }}>
            Everything you need to land<br />your first IT role
          </h2>
          <p style={{ fontSize: 17, color: "var(--text2)", maxWidth: 500, margin: "0 auto", lineHeight: 1.6 }}>
            Each module tackles a distinct stage of your career journey — from skill forecasting to interview coaching.
          </p>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 18 }}>
          {MODULES.map((m) => (
            <div key={m.title} style={{
              padding: "28px 28px", borderRadius: 16,
              background: "var(--surf)", border: `1px solid var(--border)`,
              transition: "border-color .15s, transform .15s",
            }}
              onMouseEnter={(e) => { e.currentTarget.style.borderColor = m.border; e.currentTarget.style.transform = "translateY(-2px)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.borderColor = "var(--border)"; e.currentTarget.style.transform = "none"; }}
            >
              <div style={{ display: "flex", alignItems: "flex-start", gap: 16, marginBottom: 14 }}>
                <div style={{ width: 44, height: 44, borderRadius: 12, background: m.bg, border: `1px solid ${m.border}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20, flexShrink: 0 }}>
                  {m.icon}
                </div>
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontSize: 17, fontWeight: 700 }}>{m.title}</span>
                    <span style={{ fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 99, background: m.bg, color: m.color, border: `1px solid ${m.border}` }}>{m.tag}</span>
                  </div>
                </div>
              </div>
              <p style={{ fontSize: 14, color: "var(--text2)", lineHeight: 1.65, margin: 0 }}>{m.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── How it works ── */}
      <section style={{ padding: "80px 48px", background: "var(--surf)", borderTop: "1px solid var(--border)", borderBottom: "1px solid var(--border)" }}>
        <div style={{ maxWidth: 860, margin: "0 auto" }}>
          <div style={{ textAlign: "center", marginBottom: 52 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: "var(--teal)", letterSpacing: "0.1em", marginBottom: 12 }}>HOW IT WORKS</div>
            <h2 style={{ fontSize: "clamp(26px, 4vw, 40px)", fontWeight: 800, letterSpacing: "-0.025em", lineHeight: 1.15 }}>
              From sign-up to roadmap in minutes
            </h2>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 24 }}>
            {STEPS.map((s, i) => (
              <div key={s.n} style={{ position: "relative", padding: "28px 24px", borderRadius: 14, background: "var(--surf2)", border: "1px solid var(--border)" }}>
                {i < STEPS.length - 1 && (
                  <div style={{ position: "absolute", top: 38, right: -13, width: 26, height: 2, background: "var(--border2)" }} />
                )}
                <div style={{ fontSize: 28, fontWeight: 800, color: "var(--accent)", opacity: 0.4, marginBottom: 14, letterSpacing: "-0.02em" }}>{s.n}</div>
                <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 8 }}>{s.title}</div>
                <div style={{ fontSize: 14, color: "var(--text2)", lineHeight: 1.6 }}>{s.desc}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA banner ── */}
      <section style={{ padding: "80px 48px", textAlign: "center", position: "relative", overflow: "hidden" }}>
        <div style={{ position: "absolute", inset: 0, background: "linear-gradient(135deg, oklch(63% 0.19 232 / 4%), oklch(66% 0.15 175 / 4%))", pointerEvents: "none" }} />
        <h2 style={{ fontSize: "clamp(28px, 4vw, 46px)", fontWeight: 800, letterSpacing: "-0.025em", lineHeight: 1.15, marginBottom: 16 }}>
          Ready to take control of<br />your career path?
        </h2>
        <p style={{ fontSize: 17, color: "var(--text2)", marginBottom: 36, maxWidth: 480, margin: "0 auto 36px" }}>
          Join thousands of students already using PathwayIQ to close the skill gap and land their dream IT roles.
        </p>
        <a href={ROUTES.REGISTER} style={{ display: "inline-block", padding: "15px 40px", fontSize: 16, fontWeight: 700, color: "white", textDecoration: "none", borderRadius: 10, background: "linear-gradient(135deg, oklch(63% 0.19 232), oklch(66% 0.15 175))", letterSpacing: "-0.01em" }}>
          Create free account →
        </a>
      </section>

      {/* ── Footer ── */}
      <footer style={{ borderTop: "1px solid var(--border)", background: "var(--surf)", padding: "24px 48px", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ width: 24, height: 24, borderRadius: 7, background: "linear-gradient(135deg, oklch(63% 0.19 232), oklch(66% 0.15 175))", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 17l4-8 4 4 4-6 4 6" />
              <circle cx="3" cy="17" r="1.5" fill="white" stroke="none" />
              <circle cx="19" cy="13" r="1.5" fill="white" stroke="none" />
            </svg>
          </div>
          <span style={{ fontSize: 14, fontWeight: 600 }}>PathwayIQ</span>
          <span style={{ fontSize: 13, color: "var(--text3)" }}>© 2026</span>
        </div>
        <div style={{ display: "flex", gap: 20 }}>
          <a href={ROUTES.LOGIN} style={{ fontSize: 13, color: "var(--text3)", textDecoration: "none" }}>Sign in</a>
          <a href={ROUTES.REGISTER} style={{ fontSize: 13, color: "var(--text3)", textDecoration: "none" }}>Register</a>
          <a href={ROUTES.ADMIN_LOGIN} style={{ fontSize: 13, color: "var(--text3)", textDecoration: "none" }}>Admin portal</a>
        </div>
      </footer>
    </div>
  );
}
