"use client";

import { useState, useEffect } from "react";
import { PiqAvatar } from "@/components/piq/avatar";
import { PiqBadge } from "@/components/piq/badge";
import { PiqStatCard, PiqBtn, PiqInput, PiqSpinner } from "@/components/piq/primitives";
import { Icon } from "@/components/piq/icon";
import { userService } from "@/services/user.service";

type ApiMe = {
  id: string;
  name?: string;
  full_name?: string;
  email: string;
  role: string;
  bio?: string;
  github?: string;
  linkedin?: string;
  department?: string;
  intake?: string;
  createdAt?: string;
  created_at?: string;
};

const SKILLS = [
  { name: "React",            level: 85, cat: "Frontend"  },
  { name: "Python",           level: 78, cat: "Backend"   },
  { name: "TypeScript",       level: 72, cat: "Frontend"  },
  { name: "Node.js",          level: 70, cat: "Backend"   },
  { name: "Docker",           level: 55, cat: "DevOps"    },
  { name: "Machine Learning", level: 60, cat: "AI/ML"     },
  { name: "SQL",              level: 68, cat: "Database"  },
  { name: "AWS",              level: 40, cat: "Cloud"     },
];

const ACTIVITY = [
  { date: "2026-04-28", action: "Completed interview session",     module: "Interview",  icon: "chat" },
  { date: "2026-04-26", action: "Updated CV — version 3",          module: "CV",         icon: "cv" },
  { date: "2026-04-24", action: "Viewed Career Path: Full-Stack",  module: "Career",     icon: "career" },
  { date: "2026-04-22", action: "Reviewed Skill Forecast report",  module: "Skill",      icon: "trend" },
  { date: "2026-04-20", action: "Interview session completed",      module: "Interview",  icon: "chat" },
  { date: "2026-04-18", action: "Profile updated",                  module: "Profile",    icon: "person" },
];

const MODULE_COLOR: Record<string, string> = {
  Interview: "var(--rose)",
  CV:        "var(--violet)",
  Career:    "var(--teal)",
  Skill:     "var(--amber)",
  Profile:   "var(--accent)",
};

const scoreColor = (s: number) => s >= 80 ? "var(--green)" : s >= 65 ? "var(--accent)" : s >= 50 ? "var(--amber)" : "var(--rose)";

export default function ProfilePage() {
  const [loading, setLoading]   = useState(true);
  const [saving, setSaving]     = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);
  const [toast, setToast]       = useState<string | null>(null);
  const [userId, setUserId]     = useState<string>("");
  const [editing, setEditing]   = useState(false);

  const [info, setInfo] = useState({ email: "", role: "", joined: "", department: "", intake: "" });
  const [form, setForm] = useState({ full_name: "", bio: "", github: "", linkedin: "" });
  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(null), 2800); };

  useEffect(() => {
    setLoading(true);
    userService.getMe()
      .then((res) => {
        const me = res.data.data as ApiMe;
        setUserId(me.id);
        setInfo({
          email:      me.email,
          role:       me.role,
          joined:     me.created_at ?? me.createdAt ?? "",
          department: me.department ?? "Information Technology",
          intake:     me.intake ?? "",
        });
        setForm({
          full_name: me.full_name ?? me.name ?? "",
          bio:       me.bio ?? "",
          github:    me.github ?? "",
          linkedin:  me.linkedin ?? "",
        });
      })
      .catch(() => setApiError("Failed to load profile. Please refresh."))
      .finally(() => setLoading(false));
  }, []);

  async function handleSave() {
    if (!userId) return;
    setSaving(true);
    try {
      await userService.update(userId, {
        name:     form.full_name,
        bio:      form.bio,
        github:   form.github,
        linkedin: form.linkedin,
      } as never);
      setEditing(false);
      showToast("Profile saved");
    } catch {
      showToast("Failed to save — please try again");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: 300, gap: 12 }}>
        <PiqSpinner size={24} />
        <span style={{ fontSize: 15, color: "var(--text3)" }}>Loading profile…</span>
      </div>
    );
  }

  if (apiError) {
    return (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: 300, gap: 10 }}>
        <Icon n="alert" s={28} c="var(--rose)" />
        <div style={{ fontSize: 15, color: "var(--rose)" }}>{apiError}</div>
        <PiqBtn variant="secondary" size="sm" icon="refresh" onClick={() => window.location.reload()}>Retry</PiqBtn>
      </div>
    );
  }

  return (
    <div className="anim-up" style={{ display: "flex", flexDirection: "column", gap: 18 }}>

      {/* Stats */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 12 }}>
        <PiqStatCard label="CV Score"           value="79/100" icon="cv"     color="var(--accent)" sub="Last analysed Apr 26" />
        <PiqStatCard label="Career Match"       value="91%"    icon="career" color="var(--green)"  sub="Full-Stack Developer" delta={{ up: true, label: "Top match" }} />
        <PiqStatCard label="Interview Score"    value="78%"    icon="chat"   color="var(--rose)"   sub="Best session" />
        <PiqStatCard label="Skills Tracked"     value={SKILLS.length} icon="trend" color="var(--teal)" sub="Across 6 categories" />
      </div>

      {/* Profile header + Activity */}
      <div style={{ display: "grid", gridTemplateColumns: "340px 1fr", gap: 14 }}>

        {/* Profile card */}
        <div style={{ background: "var(--surf)", border: "1px solid var(--border)", borderRadius: "var(--radiusLg)", overflow: "hidden" }}>
          <div style={{ padding: "24px 20px", display: "flex", flexDirection: "column", alignItems: "center", gap: 12, borderBottom: "1px solid var(--border)", background: "linear-gradient(160deg, var(--accentD) 0%, transparent 60%)" }}>
            <PiqAvatar name={form.full_name || info.email} size={64} />
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: 18, fontWeight: 700 }}>{form.full_name || info.email}</div>
              <div style={{ fontSize: 14, color: "var(--text3)", marginTop: 3 }}>{info.email}</div>
              <div style={{ display: "flex", justifyContent: "center", gap: 6, marginTop: 8, flexWrap: "wrap" }}>
                <PiqBadge label={info.role} variant={info.role as "admin"} />
                {info.intake && <PiqBadge label={`Intake ${info.intake}`} variant="default" />}
              </div>
            </div>
          </div>

          <div style={{ padding: "16px 20px", display: "flex", flexDirection: "column", gap: 12 }}>
            {editing ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                <PiqInput label="Full name" value={form.full_name} onChange={(e) => set("full_name", e.target.value)} icon="person" />
                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  <label style={{ fontSize: 14, fontWeight: 500, color: "var(--text2)" }}>Bio</label>
                  <textarea value={form.bio} onChange={(e) => set("bio", e.target.value)}
                    style={{ padding: "8px 12px", background: "var(--surf2)", border: "1px solid var(--border2)", borderRadius: "var(--radius)", color: "var(--text)", fontSize: 14, fontFamily: "inherit", resize: "vertical", minHeight: 72, outline: "none" }} />
                </div>
                <PiqInput label="GitHub" value={form.github} onChange={(e) => set("github", e.target.value)} icon="cv" />
                <PiqInput label="LinkedIn" value={form.linkedin} onChange={(e) => set("linkedin", e.target.value)} icon="person" />
                <div style={{ display: "flex", gap: 8 }}>
                  <PiqBtn variant="primary" size="sm" onClick={handleSave} disabled={saving} style={{ flex: 1, justifyContent: "center" }}>
                    {saving ? <><PiqSpinner size={14} /> Saving…</> : "Save"}
                  </PiqBtn>
                  <PiqBtn variant="ghost" size="sm" onClick={() => setEditing(false)} style={{ flex: 1, justifyContent: "center" }}>Cancel</PiqBtn>
                </div>
              </div>
            ) : (
              <>
                {form.bio && <div style={{ fontSize: 14, color: "var(--text2)", lineHeight: 1.65 }}>{form.bio}</div>}
                {[
                  { label: "Email",      value: info.email },
                  { label: "Department", value: info.department },
                  ...(form.github   ? [{ label: "GitHub",   value: form.github   }] : []),
                  ...(form.linkedin ? [{ label: "LinkedIn", value: form.linkedin }] : []),
                  ...(info.joined   ? [{ label: "Joined",   value: new Date(info.joined).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" }) }] : []),
                ].map((r) => (
                  <div key={r.label} style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                    <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text3)", letterSpacing: "0.05em" }}>{r.label.toUpperCase()}</span>
                    <span style={{ fontSize: 14, color: "var(--text2)" }}>{r.value}</span>
                  </div>
                ))}
                <PiqBtn variant="secondary" size="sm" icon="person" onClick={() => setEditing(true)}>Edit Profile</PiqBtn>
              </>
            )}
          </div>
        </div>

        {/* Recent Activity */}
        <div style={{ background: "var(--surf)", border: "1px solid var(--border)", borderRadius: "var(--radiusLg)", overflow: "hidden" }}>
          <div style={{ padding: "14px 20px", borderBottom: "1px solid var(--border)" }}>
            <div style={{ fontSize: 15, fontWeight: 600 }}>Recent Activity</div>
            <div style={{ fontSize: 13, color: "var(--text3)", marginTop: 1 }}>Your interactions across all PathwayIQ modules</div>
          </div>
          <div style={{ padding: "8px 0" }}>
            {ACTIVITY.map((a, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 14, padding: "12px 20px", borderBottom: i < ACTIVITY.length - 1 ? "1px solid var(--border)" : "none" }}>
                <div style={{ width: 34, height: 34, borderRadius: 10, background: `oklch(from ${MODULE_COLOR[a.module] || "var(--accent)"} l c h / 12%)`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <span style={{ fontSize: 13, color: MODULE_COLOR[a.module] || "var(--accent)" }}>●</span>
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 15, fontWeight: 500 }}>{a.action}</div>
                  <div style={{ fontSize: 13, color: "var(--text3)", marginTop: 2 }}>
                    {new Date(a.date).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
                  </div>
                </div>
                <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 99, background: `oklch(from ${MODULE_COLOR[a.module] || "var(--accent)"} l c h / 12%)`, color: MODULE_COLOR[a.module] || "var(--accent)", fontWeight: 600 }}>{a.module}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Skills grid */}
      <div style={{ background: "var(--surf)", border: "1px solid var(--border)", borderRadius: "var(--radiusLg)", overflow: "hidden" }}>
        <div style={{ padding: "14px 20px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 600 }}>Skill Profile</div>
            <div style={{ fontSize: 13, color: "var(--text3)", marginTop: 1 }}>CV-extracted + GitHub-verified proficiency levels</div>
          </div>
          <PiqBtn variant="outline" size="sm" icon="cv">Update from CV</PiqBtn>
        </div>
        <div style={{ padding: "16px 20px", display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 14 }}>
          {SKILLS.map((s) => (
            <div key={s.name} style={{ padding: "12px 14px", background: "var(--surf2)", borderRadius: "var(--radius)", border: "1px solid var(--border)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                <span style={{ fontSize: 14, fontWeight: 600 }}>{s.name}</span>
                <span style={{ fontSize: 13, fontWeight: 700, color: scoreColor(s.level) }}>{s.level}%</span>
              </div>
              <div style={{ height: 4, background: "var(--surf3)", borderRadius: 99, overflow: "hidden", marginBottom: 6 }}>
                <div style={{ height: "100%", width: `${s.level}%`, background: scoreColor(s.level), borderRadius: 99 }} />
              </div>
              <span style={{ fontSize: 12, color: "var(--text3)" }}>{s.cat}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Toast */}
      {toast && (
        <div className="anim-up" style={{ position: "fixed", bottom: 24, right: 24, zIndex: 2000, background: "var(--greenD)", border: "1px solid var(--green)40", color: "var(--green)", padding: "10px 16px", borderRadius: "var(--radiusLg)", fontSize: 15, fontWeight: 500, display: "flex", alignItems: "center", gap: 8 }}>
          <Icon n="check" s={15} c="var(--green)" /> {toast}
        </div>
      )}
    </div>
  );
}
