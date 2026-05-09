"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { PiqAvatar } from "@/components/piq/avatar";
import { PiqBadge } from "@/components/piq/badge";
import { PiqStatCard, PiqBtn, PiqInput, PiqSpinner } from "@/components/piq/primitives";
import { Icon } from "@/components/piq/icon";
import { userService } from "@/services/user.service";
import { skillService } from "@/services/skill.service";
import { progressService } from "@/services/progress.service";
import { githubService } from "@/services/github.service";
import type { UserSkill, ProgressModule } from "@/types";

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

const MODULE_COLOR: Record<string, string> = {
  Interview: "var(--rose)",
  CV:        "var(--violet)",
  Career:    "var(--teal)",
  Skill:     "var(--amber)",
  Profile:   "var(--accent)",
};

const MODULE_ICON: Record<string, string> = {
  skill:     "trend",
  career:    "career",
  cv:        "cv",
  interview: "chat",
};

const scoreColor = (s: number) => s >= 80 ? "var(--green)" : s >= 65 ? "var(--accent)" : s >= 50 ? "var(--amber)" : "var(--rose)";

const proficiencyPct = (level: number) => Math.min(100, Math.round((level / 5) * 100));

function ProgressRing({ pct, color, size = 56 }: { pct: number; color: string; size?: number }) {
  const r = (size - 8) / 2;
  const circ = 2 * Math.PI * r;
  const dash = circ * (pct / 100);
  return (
    <svg width={size} height={size}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--surf3)" strokeWidth={5} />
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={5}
        strokeDasharray={`${dash} ${circ - dash}`} strokeLinecap="round"
        transform={`rotate(-90 ${size / 2} ${size / 2})`} />
      <text x="50%" y="50%" dominantBaseline="middle" textAnchor="middle" fontSize={11} fontWeight={700} fill={color}>{pct}%</text>
    </svg>
  );
}

export default function ProfilePage() {
  const [loading, setLoading]         = useState(true);
  const [saving, setSaving]           = useState(false);
  const [apiError, setApiError]       = useState<string | null>(null);
  const [toast, setToast]             = useState<string | null>(null);
  const [userId, setUserId]           = useState<string>("");
  const [editing, setEditing]         = useState(false);
  const [skills, setSkills]           = useState<UserSkill[]>([]);
  const [progress, setProgress]       = useState<ProgressModule[]>([]);

  const [info, setInfo] = useState({ email: "", role: "", joined: "", department: "", intake: "" });
  const [form, setForm] = useState({ full_name: "", bio: "", github: "", linkedin: "" });
  const [githubStatus, setGithubStatus] = useState<{ connected: boolean; github_username?: string } | null>(null);
  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(null), 2800); };

  useEffect(() => {
    setLoading(true);
    Promise.all([
      userService.getMe(),
      skillService.getUserSkills(),
      progressService.getModuleProgress(),
      githubService.getStatus(),
    ]).then(([meRes, skillsRes, progressRes, ghRes]) => {
      const me = meRes.data.data as ApiMe;
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
      setSkills((skillsRes.data.data as UserSkill[]) ?? []);
      setProgress((progressRes.data.data as ProgressModule[]) ?? []);
      setGithubStatus(ghRes.data.data);
    }).catch(() => setApiError("Failed to load profile. Please refresh."))
      .finally(() => setLoading(false));
  }, []);

  async function handleConnectGitHub() {
    try {
      const res = await githubService.getAuthUrl();
      window.location.href = res.data.data.url;
    } catch {
      showToast("Failed to get GitHub auth URL");
    }
  }

  async function handleDisconnectGitHub() {
    try {
      await githubService.disconnect();
      setGithubStatus({ connected: false });
      showToast("GitHub disconnected");
    } catch {
      showToast("Failed to disconnect GitHub");
    }
  }

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

  const overallPct = progress.length > 0
    ? Math.round(progress.reduce((sum, m) => sum + m.completion_pct, 0) / progress.length)
    : 0;

  const moduleColors: Record<string, string> = {
    skill:     "var(--amber)",
    career:    "var(--teal)",
    cv:        "var(--violet)",
    interview: "var(--rose)",
  };

  return (
    <div className="anim-up" style={{ display: "flex", flexDirection: "column", gap: 18 }}>

      {/* Stats */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 12 }}>
        <PiqStatCard label="Overall Progress"  value={`${overallPct}%`}    icon="trend"  color="var(--accent)" sub="Across all modules" />
        <PiqStatCard label="Skills Tracked"    value={skills.length}       icon="trend"  color="var(--teal)"   sub="In your skill profile" />
        <PiqStatCard label="GitHub Verified"   value={skills.filter((s) => s.github_verified).length} icon="cv" color="var(--green)" sub="Skills verified" />
        <PiqStatCard label="Advanced Skills"   value={skills.filter((s) => s.proficiency_level >= 4).length} icon="star" color="var(--amber)" sub="Level 4–5 proficiency" />
      </div>

      {/* Profile header + Progress */}
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

        {/* Module Progress */}
        <div style={{ background: "var(--surf)", border: "1px solid var(--border)", borderRadius: "var(--radiusLg)", overflow: "hidden" }}>
          <div style={{ padding: "14px 20px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div>
              <div style={{ fontSize: 15, fontWeight: 600 }}>Module Progress</div>
              <div style={{ fontSize: 13, color: "var(--text3)", marginTop: 1 }}>Your completion across all PathwayIQ modules</div>
            </div>
            <Link href="/progress" style={{ fontSize: 13, color: "var(--accent)", textDecoration: "none" }}>View details →</Link>
          </div>
          {progress.length === 0 ? (
            <div style={{ padding: 32, textAlign: "center", color: "var(--text3)", fontSize: 14 }}>No progress data yet. Start using the modules!</div>
          ) : (
            <div style={{ padding: "16px 20px", display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 14 }}>
              {progress.map((m) => (
                <div key={m.id} style={{ padding: "14px 16px", background: "var(--surf2)", borderRadius: "var(--radius)", border: "1px solid var(--border)", display: "flex", alignItems: "center", gap: 14 }}>
                  <ProgressRing pct={m.completion_pct} color={moduleColors[m.module_name] ?? "var(--accent)"} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 14, fontWeight: 600, textTransform: "capitalize" }}>{m.module_name}</div>
                    <div style={{ fontSize: 12, color: "var(--text3)", marginTop: 2 }}>
                      {m.last_activity_at
                        ? `Last active ${new Date(m.last_activity_at).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}`
                        : "Not started yet"}
                    </div>
                    <Link href={`/${m.module_name}`} style={{ fontSize: 11, color: moduleColors[m.module_name] ?? "var(--accent)", textDecoration: "none", marginTop: 4, display: "inline-block" }}>Open module →</Link>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Skills grid */}
      <div style={{ background: "var(--surf)", border: "1px solid var(--border)", borderRadius: "var(--radiusLg)", overflow: "hidden" }}>
        <div style={{ padding: "14px 20px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 600 }}>Skill Profile</div>
            <div style={{ fontSize: 13, color: "var(--text3)", marginTop: 1 }}>CV-extracted + GitHub-verified proficiency levels</div>
          </div>
          <Link href="/skill" style={{ fontSize: 13, color: "var(--accent)", textDecoration: "none" }}>Manage skills →</Link>
        </div>
        {skills.length === 0 ? (
          <div style={{ padding: "32px 20px", textAlign: "center" }}>
            <div style={{ fontSize: 14, color: "var(--text3)", marginBottom: 12 }}>No skills added yet.</div>
            <Link href="/skill">
              <PiqBtn variant="primary" size="sm" icon="trend">Add Your Skills</PiqBtn>
            </Link>
          </div>
        ) : (
          <div style={{ padding: "16px 20px", display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 14 }}>
            {skills.slice(0, 8).map((s) => {
              const pct = proficiencyPct(s.proficiency_level);
              return (
                <div key={s.id} style={{ padding: "12px 14px", background: "var(--surf2)", borderRadius: "var(--radius)", border: "1px solid var(--border)" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                    <span style={{ fontSize: 14, fontWeight: 600 }}>{s.skills?.name ?? s.skill_id}</span>
                    {s.github_verified && (
                      <span style={{ fontSize: 10, background: "var(--greenD)", color: "var(--green)", padding: "1px 6px", borderRadius: 10, fontWeight: 600 }}>✓ GH</span>
                    )}
                  </div>
                  <div style={{ height: 4, background: "var(--surf3)", borderRadius: 99, overflow: "hidden", marginBottom: 6 }}>
                    <div style={{ height: "100%", width: `${pct}%`, background: scoreColor(pct), borderRadius: 99 }} />
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span style={{ fontSize: 12, color: "var(--text3)" }}>{s.proficiency_label ?? `Level ${s.proficiency_level}`}</span>
                    <span style={{ fontSize: 12, fontWeight: 700, color: scoreColor(pct) }}>{pct}%</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
        {skills.length > 8 && (
          <div style={{ padding: "10px 20px", borderTop: "1px solid var(--border)", textAlign: "center" }}>
            <Link href="/skill" style={{ fontSize: 13, color: "var(--accent)", textDecoration: "none" }}>
              +{skills.length - 8} more skills — View all in Skill module →
            </Link>
          </div>
        )}
      </div>

      {/* Connected Accounts */}
      <div style={{ background: "var(--surf)", border: "1px solid var(--border)", borderRadius: "var(--radiusLg)", overflow: "hidden" }}>
        <div style={{ padding: "14px 20px", borderBottom: "1px solid var(--border)" }}>
          <div style={{ fontSize: 15, fontWeight: 600 }}>Connected Accounts</div>
          <div style={{ fontSize: 13, color: "var(--text3)", marginTop: 1 }}>Link external accounts for skill verification</div>
        </div>
        <div style={{ padding: "16px 20px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ width: 36, height: 36, borderRadius: "var(--radius)", background: "var(--surf2)", border: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18 }}>
              &#xe800;
            </div>
            <div>
              <div style={{ fontWeight: 600, fontSize: 14 }}>GitHub</div>
              <div style={{ fontSize: 12, color: "var(--text3)", marginTop: 1 }}>
                {githubStatus?.connected
                  ? `Connected as ${githubStatus.github_username}`
                  : "Not connected — connect to verify skills from your repos"}
              </div>
            </div>
          </div>
          <div>
            {githubStatus?.connected ? (
              <PiqBtn size="sm" variant="outline" onClick={handleDisconnectGitHub}>Disconnect</PiqBtn>
            ) : (
              <PiqBtn size="sm" onClick={handleConnectGitHub}>Connect GitHub</PiqBtn>
            )}
          </div>
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
