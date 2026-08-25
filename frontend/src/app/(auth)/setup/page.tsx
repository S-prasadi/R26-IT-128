"use client";

import { FormEvent, useState } from "react";
import { ROUTES } from "@/constants/routes";
import { Icon } from "@/components/piq/icon";
import { PiqInput, PiqBtn, PiqSpinner } from "@/components/piq/primitives";
import apiClient from "@/lib/axios";
import { AxiosError } from "axios";

export default function SetupPage() {
  const [form, setForm]       = useState({ full_name: "", email: "", password: "", setup_key: "" });
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState("");
  const [done, setDone]       = useState(false);

  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    if (!form.full_name || !form.email || !form.password || !form.setup_key) {
      setError("All fields are required.");
      return;
    }
    setLoading(true);
    try {
      await apiClient.post("/auth/seed-admin", form);
      setDone(true);
    } catch (err) {
      const axiosError = err as AxiosError<{ message?: string }>;
      setError(axiosError.response?.data?.message ?? "Failed to create admin account.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="piq-canvas" style={{ display: "flex", height: "100vh", alignItems: "center", justifyContent: "center", fontFamily: "var(--font-dm-sans), 'DM Sans', system-ui, sans-serif" }}>
      <div style={{ width: "100%", maxWidth: 420, padding: "0 24px" }}>

        {/* Logo */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 32 }}>
          <div style={{ width: 36, height: 36, borderRadius: 10, background: "linear-gradient(135deg, oklch(63% 0.19 232), oklch(66% 0.15 175))", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 17l4-8 4 4 4-6 4 6" />
              <circle cx="3" cy="17" r="1.5" fill="white" stroke="none" />
              <circle cx="19" cy="13" r="1.5" fill="white" stroke="none" />
            </svg>
          </div>
          <span style={{ fontSize: 18, fontWeight: 700, letterSpacing: "-0.01em" }}>PathwayIQ</span>
        </div>

        {done ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div style={{ padding: "16px 18px", background: "var(--greenD)", border: "1px solid oklch(from var(--green) l c h / 30%)", borderRadius: 12, display: "flex", gap: 12, alignItems: "flex-start" }}>
              <Icon n="check" s={18} c="var(--green)" />
              <div>
                <div style={{ fontSize: 15, fontWeight: 600, color: "var(--green)", marginBottom: 4 }}>Admin account created</div>
                <div style={{ fontSize: 13, color: "var(--text2)", lineHeight: 1.5 }}>You can now sign in at the admin portal with your new credentials.</div>
              </div>
            </div>
            <a href={ROUTES.ADMIN_LOGIN} style={{ display: "block", padding: "12px 16px", borderRadius: 10, background: "var(--violet)", color: "white", textDecoration: "none", fontSize: 14, fontWeight: 600, textAlign: "center" }}>
              Go to Admin Portal →
            </a>
          </div>
        ) : (
          <>
            <div style={{ marginBottom: 28 }}>
              <div style={{ display: "inline-flex", alignItems: "center", gap: 7, padding: "5px 12px", borderRadius: 99, background: "var(--violetD)", border: "1px solid oklch(65% 0.17 290 / 22%)", marginBottom: 14 }}>
                <Icon n="shield" s={12} c="var(--violet)" />
                <span style={{ fontSize: 11, fontWeight: 600, color: "var(--violet)", letterSpacing: "0.05em" }}>ONE-TIME SETUP</span>
              </div>
              <div style={{ fontSize: 26, fontWeight: 800, letterSpacing: "-0.025em", lineHeight: 1.15, marginBottom: 8 }}>Create admin account</div>
              <div style={{ fontSize: 14, color: "var(--text2)", lineHeight: 1.55 }}>
                Bootstrap the first admin account. Requires the <code style={{ fontSize: 13, background: "var(--surf2)", padding: "1px 6px", borderRadius: 4 }}>ADMIN_SETUP_KEY</code> from your server environment.
              </div>
            </div>

            <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <PiqInput label="Full name" placeholder="e.g. Admin User" icon="person"
                value={form.full_name} onChange={(e) => set("full_name", e.target.value)} required />
              <PiqInput label="Email address" type="email" placeholder="admin@sliit.lk" icon="email"
                value={form.email} onChange={(e) => set("email", e.target.value)} required />
              <PiqInput label="Password" type="password" placeholder="Min. 8 characters" icon="lock"
                value={form.password} onChange={(e) => set("password", e.target.value)} required />
              <PiqInput label="Setup key" type="password" placeholder="ADMIN_SETUP_KEY value" icon="shield"
                value={form.setup_key} onChange={(e) => set("setup_key", e.target.value)} required />

              {error && (
                <div style={{ padding: "10px 14px", background: "var(--roseD)", border: "1px solid oklch(63% 0.18 25 / 25%)", borderRadius: 10, fontSize: 13, color: "var(--rose)", display: "flex", gap: 9, alignItems: "flex-start" }}>
                  <Icon n="alert" s={14} c="var(--rose)" style={{ flexShrink: 0, marginTop: 1 }} />
                  <span>{error}</span>
                </div>
              )}

              <PiqBtn type="submit" size="lg" disabled={loading} style={{ marginTop: 4, width: "100%", justifyContent: "center", height: 46, fontSize: 15, background: "var(--violet)" }}>
                {loading ? <><PiqSpinner size={16} /> Creating…</> : "Create admin account"}
              </PiqBtn>
            </form>

            <div style={{ marginTop: 20, textAlign: "center" }}>
              <a href={ROUTES.ADMIN_LOGIN} style={{ fontSize: 13, color: "var(--text3)", textDecoration: "none" }}>
                Already have an account? Admin portal →
              </a>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
