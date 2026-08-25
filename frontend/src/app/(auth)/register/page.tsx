"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { AxiosError } from "axios";
import { ROUTES } from "@/constants/routes";
import { authService } from "@/services/auth.service";
import { persistUser } from "@/hooks/useAuth";
import { Icon } from "@/components/piq/icon";
import { PiqInput, PiqBtn, PiqSpinner } from "@/components/piq/primitives";

const BENEFITS = [
  { icon: "trend",  color: "var(--amber)",  title: "Skill Gap Analysis",    desc: "Know exactly which skills to build — ranked by hiring demand" },
  { icon: "career", color: "var(--teal)",   title: "Career Roadmaps",       desc: "Step-by-step paths to your target role, from your current profile" },
  { icon: "cv",     color: "var(--violet)", title: "CV Score & Validation",  desc: "Evidence-based ratings backed by your GitHub contributions" },
  { icon: "chat",   color: "var(--rose)",   title: "AI Interview Coaching",  desc: "Emotion-aware mock sessions with instant performance feedback" },
];

export default function RegisterPage() {
  const router = useRouter();
  const [form, setForm]       = useState({ full_name: "", email: "", password: "", confirm: "" });
  const [errors, setErrors]   = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [agreed, setAgreed]   = useState(false);

  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  function validate() {
    const e: Record<string, string> = {};
    if (!form.full_name.trim()) e.full_name = "Name is required";
    if (!form.email.includes("@")) e.email = "Enter a valid email";
    if (form.password.length < 8) e.password = "Minimum 8 characters";
    if (form.password !== form.confirm) e.confirm = "Passwords do not match";
    if (!agreed) e.terms = "You must agree to the Terms of Service";
    return e;
  }

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const errs = validate();
    if (Object.keys(errs).length) { setErrors(errs); return; }
    setLoading(true);
    try {
      const response = await authService.register({ full_name: form.full_name, email: form.email, password: form.password });
      const { session, user } = response.data.data;
      if (session?.access_token) {
        localStorage.setItem("token", session.access_token);
        localStorage.setItem("refresh_token", session.refresh_token);
        persistUser({ id: user?.id ?? "", name: user?.name ?? form.full_name, email: user?.email ?? form.email, role: "user" });
        router.push(ROUTES.SKILL);
        return;
      }
      router.push(ROUTES.LOGIN);
    } catch (err) {
      const axiosError = err as AxiosError<{ message?: string }>;
      setErrors({ _: axiosError.response?.data?.message ?? "Unable to create account." });
    } finally {
      setLoading(false);
    }
  }

  const strength = (() => {
    const p = form.password;
    if (!p) return 0;
    let s = 0;
    if (p.length >= 8) s++;
    if (/[A-Z]/.test(p)) s++;
    if (/[0-9]/.test(p)) s++;
    if (/[^A-Za-z0-9]/.test(p)) s++;
    return s;
  })();

  const strengthLabel = ["", "Weak", "Fair", "Good", "Strong"][strength];
  const strengthColor = ["", "var(--rose)", "var(--amber)", "var(--teal)", "var(--teal)"][strength];

  return (
    <div style={{ display: "flex", height: "100vh", width: "100%", fontFamily: "var(--font-dm-sans), 'DM Sans', system-ui, sans-serif" }}>

      {/* ── Left panel ── */}
      <div style={{
        width: "44%", flexShrink: 0, position: "relative", overflow: "hidden",
        background: "linear-gradient(160deg, oklch(11% 0.022 175) 0%, oklch(9% 0.018 175) 100%)",
        display: "flex", flexDirection: "column", padding: "44px 52px",
      }}>
        {/* Background orbs */}
        <div style={{ position: "absolute", top: -160, left: -100, width: 500, height: 500, borderRadius: "50%", background: "oklch(66% 0.15 175 / 12%)", filter: "blur(100px)", pointerEvents: "none" }} />
        <div style={{ position: "absolute", bottom: -120, right: -60, width: 400, height: 400, borderRadius: "50%", background: "oklch(63% 0.19 232 / 10%)", filter: "blur(90px)", pointerEvents: "none" }} />
        <div style={{ position: "absolute", top: "40%", left: "50%", width: 160, height: 160, borderRadius: "50%", background: "oklch(65% 0.17 290 / 6%)", filter: "blur(50px)", pointerEvents: "none" }} />

        {/* Subtle grid */}
        <svg style={{ position: "absolute", inset: 0, opacity: 0.04, pointerEvents: "none" }} width="100%" height="100%">
          <defs>
            <pattern id="rgrid" width="48" height="48" patternUnits="userSpaceOnUse">
              <path d="M 48 0 L 0 0 0 48" fill="none" stroke="white" strokeWidth="0.6" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#rgrid)" />
        </svg>

        {/* Logo */}
        <div style={{ display: "flex", alignItems: "center", gap: 12, zIndex: 1 }}>
          <div style={{ width: 40, height: 40, borderRadius: 12, background: "linear-gradient(135deg, var(--accent), var(--teal))", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 4px 16px oklch(66% 0.15 175 / 35%)" }}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 17l4-8 4 4 4-6 4 6" />
              <circle cx="3" cy="17" r="1.5" fill="white" stroke="none" />
              <circle cx="19" cy="13" r="1.5" fill="white" stroke="none" />
            </svg>
          </div>
          <div>
            <div style={{ fontSize: 20, fontWeight: 700, letterSpacing: "-0.01em", color: "white" }}>PathwayIQ</div>
            <div style={{ fontSize: 10, color: "oklch(65% 0.06 175)", letterSpacing: "0.1em", fontWeight: 500 }}>YOUR INTELLIGENT CAREER NAVIGATOR</div>
          </div>
        </div>

        {/* Hero */}
        <div style={{ marginTop: "auto", zIndex: 1 }}>
          <div style={{ display: "inline-flex", alignItems: "center", gap: 7, padding: "6px 12px", borderRadius: 99, background: "oklch(66% 0.15 175 / 15%)", border: "1px solid oklch(66% 0.15 175 / 30%)", marginBottom: 20 }}>
            <div style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--teal)" }} />
            <span style={{ fontSize: 11, fontWeight: 600, color: "oklch(75% 0.10 175)", letterSpacing: "0.06em" }}>FREE FOR SLIIT STUDENTS</span>
          </div>

          <div style={{ fontSize: 34, fontWeight: 800, lineHeight: 1.2, letterSpacing: "-0.025em", marginBottom: 14, color: "white" }}>
            Start your<br />
            <span style={{ background: "linear-gradient(90deg, var(--teal) 0%, var(--accent) 60%)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
              career journey
            </span><br />
            today
          </div>
          <div style={{ fontSize: 15, color: "oklch(65% 0.04 175)", lineHeight: 1.65, marginBottom: 32, maxWidth: 340 }}>
            Join 1,200+ SLIIT IT undergraduates already using PathwayIQ to land their dream roles.
          </div>

          {/* Benefits */}
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {BENEFITS.map((b) => (
              <div key={b.title} style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
                <div style={{
                  width: 34, height: 34, borderRadius: 10, flexShrink: 0, marginTop: 1,
                  background: `oklch(from ${b.color} l c h / 15%)`,
                  border: `1px solid ${b.color}33`,
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}>
                  <Icon n={b.icon} s={15} c={b.color} />
                </div>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: "white", marginBottom: 1 }}>{b.title}</div>
                  <div style={{ fontSize: 11, color: "oklch(58% 0.04 175)", lineHeight: 1.45 }}>{b.desc}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

      </div>

      {/* ── Right panel ── */}
      <div className="piq-canvas" style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "40px 56px", position: "relative", overflowY: "auto" }}>
        {/* Top accent bar */}
        <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 3, background: "linear-gradient(90deg, var(--teal), var(--accent))" }} />

        <div className="anim-up" style={{ width: "100%", maxWidth: 420 }}>

          {/* Join badge */}
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 24, padding: "7px 14px", background: "oklch(66% 0.15 175 / 10%)", border: "1px solid oklch(66% 0.15 175 / 20%)", borderRadius: 99, width: "fit-content" }}>
            <Icon n="trend" s={13} c="var(--teal)" />
            <span style={{ fontSize: 12, fontWeight: 600, color: "var(--teal)", letterSpacing: "0.04em" }}>CREATE FREE ACCOUNT</span>
          </div>

          <div style={{ marginBottom: 28 }}>
            <div style={{ fontSize: 28, fontWeight: 800, letterSpacing: "-0.025em", lineHeight: 1.15, marginBottom: 8 }}>
              Get started
            </div>
            <div style={{ fontSize: 15, color: "var(--text2)", lineHeight: 1.5 }}>
              Create your PathwayIQ account — it&apos;s completely free for SLIIT students
            </div>
          </div>

          <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 15 }}>
            <PiqInput label="Full name" placeholder="e.g. Kavindu Rathnayake" icon="person"
              value={form.full_name} onChange={(e) => set("full_name", e.target.value)} error={errors.full_name} required />
            <PiqInput label="Email address" type="email" placeholder="you@students.sliit.lk" icon="email"
              value={form.email} onChange={(e) => set("email", e.target.value)} error={errors.email} required />

            <div>
              <PiqInput label="Password" type="password" placeholder="Min. 8 characters" icon="lock"
                value={form.password} onChange={(e) => set("password", e.target.value)} error={errors.password} required />
              {form.password && (
                <div style={{ marginTop: 8, display: "flex", alignItems: "center", gap: 8 }}>
                  <div style={{ flex: 1, height: 3, borderRadius: 99, background: "var(--border)", overflow: "hidden" }}>
                    <div style={{ width: `${(strength / 4) * 100}%`, height: "100%", borderRadius: 99, background: strengthColor, transition: "all .3s" }} />
                  </div>
                  <span style={{ fontSize: 11, fontWeight: 600, color: strengthColor, minWidth: 40, textAlign: "right" }}>{strengthLabel}</span>
                </div>
              )}
            </div>

            <PiqInput label="Confirm password" type="password" placeholder="Repeat password" icon="lock"
              value={form.confirm} onChange={(e) => set("confirm", e.target.value)} error={errors.confirm} required />

            {/* Terms */}
            <div>
              <label style={{ display: "flex", alignItems: "flex-start", gap: 10, fontSize: 13, color: "var(--text2)", cursor: "pointer" }}>
                <div
                  onClick={() => setAgreed(!agreed)}
                  style={{
                    width: 16, height: 16, borderRadius: 4, flexShrink: 0, marginTop: 1,
                    border: agreed ? "none" : "1.5px solid var(--border2)",
                    background: agreed ? "var(--accent)" : "transparent",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    cursor: "pointer", transition: "all .15s",
                  }}
                >
                  {agreed && (
                    <svg width="10" height="10" viewBox="0 0 12 12" fill="none">
                      <path d="M2 6l3 3 5-5" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  )}
                </div>
                <span style={{ lineHeight: 1.45 }}>
                  I agree to the{" "}
                  <span style={{ color: "var(--accent)", fontWeight: 500 }}>Terms of Service</span> and{" "}
                  <span style={{ color: "var(--accent)", fontWeight: 500 }}>Privacy Policy</span>
                </span>
              </label>
              {errors.terms && <div style={{ fontSize: 12, color: "var(--rose)", marginTop: 5 }}>{errors.terms}</div>}
            </div>

            {errors._ && (
              <div style={{
                padding: "11px 14px", background: "var(--roseD)",
                border: "1px solid oklch(63% 0.18 25 / 25%)", borderRadius: 10,
                fontSize: 13, color: "var(--rose)", lineHeight: 1.55,
                display: "flex", gap: 10, alignItems: "flex-start",
              }}>
                <Icon n="alert" s={15} c="var(--rose)" style={{ flexShrink: 0, marginTop: 1 }} />
                <span>{errors._}</span>
              </div>
            )}

            <PiqBtn type="submit" size="lg" disabled={loading} style={{ marginTop: 4, width: "100%", justifyContent: "center", height: 48, fontSize: 15, background: "linear-gradient(135deg, var(--teal), var(--accent))" }}>
              {loading ? <><PiqSpinner size={17} /> Creating account…</> : "Create my account"}
            </PiqBtn>
          </form>

          {/* Divider */}
          <div style={{ display: "flex", alignItems: "center", gap: 14, margin: "22px 0" }}>
            <div style={{ flex: 1, height: 1, background: "var(--border)" }} />
            <span style={{ fontSize: 12, color: "var(--text3)", whiteSpace: "nowrap" }}>already have an account?</span>
            <div style={{ flex: 1, height: 1, background: "var(--border)" }} />
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 10, textAlign: "center" }}>
            <a href={ROUTES.LOGIN} style={{
              display: "block", padding: "11px 16px", borderRadius: 10,
              border: "1px solid var(--border2)", background: "var(--surf)",
              fontSize: 14, fontWeight: 500, color: "var(--text)", textDecoration: "none",
            }}>
              Sign in to your account →
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
