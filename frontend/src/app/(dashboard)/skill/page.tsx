"use client";

import { useState, useEffect } from "react";
import { toast } from "sonner";
import { PiqBtn, PiqModal, PiqSpinner, PiqStatCard } from "@/components/piq/primitives";
import { PageHeader } from "@/components/common/PageHeader";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import { skillService } from "@/services/skill.service";
import { githubService } from "@/services/github.service";
import type { Skill, UserSkill, SkillForecast, SkillAssessment } from "@/types";
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { PiqChartContainer, PiqTooltip, PIQ_COLORS } from "@/components/piq/charts";

const TABS = ["My Skills", "Forecast", "Assessments", "Skill Catalog"] as const;
type Tab = (typeof TABS)[number];

const PROF_LABELS = ["Beginner", "Intermediate", "Advanced"] as const;
const PROF_COLORS: Record<string, string> = {
  Beginner:     "var(--amber)",
  Intermediate: "var(--teal)",
  Advanced:     "var(--accent)",
};
const VELOCITY_ICON: Record<string, string>  = { rising: "▲", stable: "→", falling: "▼" };
const VELOCITY_COLOR: Record<string, string> = { rising: "var(--teal)", stable: "var(--text2)", falling: "var(--rose)" };

// Skill catalog `type` axis (migration 0029) — independent of `category`.
const TYPE_FILTERS = ["All", "technology", "tool", "competency"] as const;
type TypeFilter = (typeof TYPE_FILTERS)[number];
const TYPE_LABELS: Record<string, string> = {
  All: "All types", technology: "Technologies", tool: "Tools", competency: "Competencies",
};

const ASSESSMENTS_PAGE_SIZE = 10;

/** Renders a stored timestamp, or an em dash if it isn't a usable date. */
function formatDate(value?: string): string {
  if (!value) return "—";
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString();
}

export default function SkillPage() {
  const [tab, setTab]                         = useState<Tab>("My Skills");
  const [userSkills, setUserSkills]           = useState<UserSkill[]>([]);
  const [masterSkills, setMasterSkills]       = useState<Skill[]>([]);
  const [forecast, setForecast]               = useState<SkillForecast | null>(null);
  const [assessments, setAssessments]         = useState<SkillAssessment[]>([]);
  const [loading, setLoading]                 = useState(true);
  const [forecastLoading, setForecastLoading] = useState(false);
  const [showAddModal, setShowAddModal]       = useState(false);
  const [addSkillId, setAddSkillId]           = useState("");
  const [addProf, setAddProf]                 = useState<"Beginner" | "Intermediate" | "Advanced">("Beginner");
  const [assessmentSkillId, setAssessmentSkillId] = useState("");
  const [assessmentScore, setAssessmentScore] = useState("");
  const [assessmentNotes, setAssessmentNotes] = useState("");
  const [assessmentSaving, setAssessmentSaving] = useState(false);
  const [githubStatus, setGithubStatus]       = useState<{ connected: boolean; github_username?: string } | null>(null);
  const [githubVerifying, setGithubVerifying] = useState(false);
  const [catalogSearch, setCatalogSearch]     = useState("");
  const [catalogType, setCatalogType]         = useState<TypeFilter>("All");
  const [assessmentsShown, setAssessmentsShown] = useState(ASSESSMENTS_PAGE_SIZE);
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);
  const [disconnecting, setDisconnecting]     = useState(false);
  const [pendingRemoval, setPendingRemoval]   = useState<UserSkill | null>(null);
  const [removing, setRemoving]               = useState(false);

  useEffect(() => {
    async function load() {
      setLoading(true);
      // allSettled, not all: these four are independent, so one failing endpoint
      // shouldn't blank out the other three (and the user should be told which
      // one actually failed).
      const [userRes, masterRes, assessRes, ghRes] = await Promise.allSettled([
        skillService.getUserSkills(),
        skillService.listMaster(),
        skillService.getAssessments(),
        githubService.getStatus(),
      ]);

      const failed: string[] = [];
      if (userRes.status === "fulfilled") setUserSkills(userRes.value.data.data ?? []);
      else failed.push("your skills");
      if (masterRes.status === "fulfilled") setMasterSkills(masterRes.value.data.data ?? []);
      else failed.push("the skill catalog");
      if (assessRes.status === "fulfilled") setAssessments(assessRes.value.data.data ?? []);
      else failed.push("assessments");
      if (ghRes.status === "fulfilled") setGithubStatus(ghRes.value.data.data);
      else failed.push("GitHub status");

      if (failed.length) toast.error(`Couldn't load ${failed.join(", ")}. Other data loaded normally.`);
      setLoading(false);
    }
    load();
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const gh = params.get("github");
    if (gh === "connected") {
      toast.success("GitHub connected successfully");
      window.history.replaceState({}, "", window.location.pathname);
      githubService.getStatus().then((r) => setGithubStatus(r.data.data)).catch(() => {});
    } else if (gh === "error") {
      toast.error("GitHub connection failed. Try again.");
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, []);

  async function handleConnectGitHub() {
    try {
      const res = await githubService.getAuthUrl();
      window.location.href = res.data.data.url;
    } catch {
      toast.error("Failed to get GitHub auth URL");
    }
  }

  async function handleDisconnectGitHub() {
    setDisconnecting(true);
    try {
      await githubService.disconnect();
      setGithubStatus({ connected: false });
      // The backend clears github_verified/confidence_score on disconnect, so
      // mirror that locally instead of leaving stale "✓ GitHub" badges behind.
      setUserSkills((prev) =>
        prev.map((s) => ({ ...s, github_verified: false, confidence_score: undefined }))
      );
      setConfirmDisconnect(false);
      toast.success("GitHub disconnected — verification badges cleared");
    } catch {
      toast.error("Failed to disconnect GitHub");
    } finally {
      setDisconnecting(false);
    }
  }

  async function handleVerifySkills() {
    setGithubVerifying(true);
    try {
      const res = await githubService.verifySkills();
      const { updated } = res.data.data;
      toast.success(`${updated} skill(s) verified via GitHub`);
      const skillsRes = await skillService.getUserSkills();
      setUserSkills(skillsRes.data.data ?? []);
    } catch {
      toast.error("GitHub skill verification failed");
    } finally {
      setGithubVerifying(false);
    }
  }

  async function handleAddSkill() {
    if (!addSkillId) return;
    try {
      const profLevel = PROF_LABELS.indexOf(addProf) + 1;
      const res = await skillService.addUserSkill({ skill_id: addSkillId, proficiency_level: profLevel, proficiency_label: addProf });
      setUserSkills((prev) => [res.data.data, ...prev]);
      setShowAddModal(false);
      setAddSkillId("");
      toast.success("Skill added");
    } catch (error: unknown) {
      const apiError = error as { response?: { data?: { message?: string } } };
      toast.error(apiError.response?.data?.message ?? "Failed to add skill");
    }
  }

  async function handleUpdateProficiency(userSkillId: string, label: (typeof PROF_LABELS)[number]) {
    try {
      const level = PROF_LABELS.indexOf(label) + 1;
      await skillService.updateUserSkill(userSkillId, { proficiency_level: level, proficiency_label: label });
      setUserSkills((prev) => prev.map((s) => (s.id === userSkillId ? { ...s, proficiency_level: level, proficiency_label: label } : s)));
      toast.success("Proficiency updated");
    } catch {
      toast.error("Failed to update proficiency");
    }
  }

  async function handleRemoveSkill() {
    if (!pendingRemoval) return;
    const id = pendingRemoval.id;
    setRemoving(true);
    try {
      await skillService.deleteUserSkill(id);
      setUserSkills((prev) => prev.filter((s) => s.id !== id));
      setPendingRemoval(null);
      toast.success("Skill removed");
    } catch (error: unknown) {
      const apiError = error as { response?: { data?: { message?: string } } };
      toast.error(apiError.response?.data?.message ?? "Failed to remove skill");
    } finally {
      setRemoving(false);
    }
  }

  async function handleRunForecast() {
    setForecastLoading(true);
    try {
      const skillNames = userSkills.map((s) => s.skills?.name ?? "").filter(Boolean);
      const res = await skillService.runForecast(skillNames);
      setForecast(res.data.data as SkillForecast);
      toast.success("Forecast generated");
    } catch {
      toast.error("Failed to run forecast");
    } finally {
      setForecastLoading(false);
    }
  }

  async function handleLogAssessment(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const score = Number(assessmentScore);
    if (!assessmentSkillId) {
      toast.error("Select a skill to assess");
      return;
    }
    if (assessmentScore.trim() === "" || !Number.isFinite(score) || score < 0 || score > 100) {
      toast.error("Score must be between 0 and 100");
      return;
    }

    setAssessmentSaving(true);
    try {
      const res = await skillService.logAssessment(assessmentSkillId, {
        score,
        ...(assessmentNotes.trim() ? { notes: assessmentNotes.trim() } : {}),
      });
      const selectedSkill = masterSkills.find((skill) => skill.id === assessmentSkillId);
      const saved = res.data.data;
      setAssessments((prev) => [
        {
          ...saved,
          skills: selectedSkill
            ? { name: selectedSkill.name, category: selectedSkill.category }
            : undefined,
        },
        ...prev,
      ]);
      setAssessmentScore("");
      setAssessmentNotes("");
      toast.success("Assessment logged");
    } catch (error: unknown) {
      const apiError = error as { response?: { data?: { message?: string } } };
      toast.error(apiError.response?.data?.message ?? "Failed to log assessment");
    } finally {
      setAssessmentSaving(false);
    }
  }

  const addedIds    = new Set(userSkills.map((s) => s.skill_id));
  const available   = masterSkills.filter((s) => !addedIds.has(s.id));
  // Categories for the Add-Skill dropdown come from what's actually *available*,
  // otherwise a fully-added category renders as an empty <optgroup> header.
  const addableCategories = [...new Set(available.map((s) => s.category))].sort();

  const catalogQuery    = catalogSearch.trim().toLowerCase();
  const catalogFiltered = masterSkills.filter((s) => {
    if (catalogType !== "All" && s.type !== catalogType) return false;
    if (!catalogQuery) return true;
    return s.name.toLowerCase().includes(catalogQuery)
      || s.category.toLowerCase().includes(catalogQuery)
      || (s.description?.toLowerCase().includes(catalogQuery) ?? false);
  });
  const catalogCategories = [...new Set(catalogFiltered.map((s) => s.category))].sort();
  const visibleAssessments = assessments.slice(0, assessmentsShown);

  return (
    <div>
      <PageHeader title="Skill Intelligence" description="Track skills, forecast demand, log assessments" />

      {!loading && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 260px))", gap: 14, marginBottom: 24, justifyContent: "start" }}>
          <PiqStatCard label="Skills in Profile" value={userSkills.length} icon="skill" color="var(--accent)" sub="Tracked skills" />
          <PiqStatCard label="Verified via GitHub" value={userSkills.filter((s) => s.github_verified).length} icon="github" color="var(--teal)" sub="Confirmed skills" />
          <PiqStatCard label="Assessments Logged" value={assessments.length} icon="chart" color="var(--amber)" sub="Test scores" />
          <PiqStatCard label="Master Catalog" value={masterSkills.length} icon="list" color="var(--violet)" sub="Available skills" />
        </div>
      )}

      <div style={{ display: "flex", gap: 4, marginBottom: 24, borderBottom: "1px solid var(--border)" }}>
        {TABS.map((t) => (
          <button key={t} onClick={() => setTab(t)} style={{
            padding: "8px 16px", fontSize: 14, border: "none", cursor: "pointer", background: "transparent",
            fontWeight: tab === t ? 600 : 400, color: tab === t ? "var(--accent)" : "var(--text2)",
            borderBottom: tab === t ? "2px solid var(--accent)" : "2px solid transparent", marginBottom: -1,
          }}>{t}</button>
        ))}
      </div>

      {loading ? (
        <div style={{ display: "flex", justifyContent: "center", padding: 48 }}><PiqSpinner /></div>
      ) : (
        <>
          {/* Tab 1: My Skills */}
          {tab === "My Skills" && (
            <div>
              {/* GitHub connection panel */}
              <div style={{ background: "var(--surf2)", borderRadius: "var(--radius)", border: "1px solid var(--border)", padding: "14px 16px", marginBottom: 16, display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
                <div>
                  <div style={{ fontWeight: 600, fontSize: 14 }}>
                    {githubStatus?.connected ? `GitHub: ${githubStatus.github_username}` : "GitHub: Not Connected"}
                  </div>
                  <div style={{ fontSize: 12, color: "var(--text2)", marginTop: 2 }}>
                    {githubStatus?.connected
                      ? "Click 'Verify Skills' to update proficiency from your repositories"
                      : "Connect GitHub to auto-verify skills from your public repositories"}
                  </div>
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  {githubStatus?.connected ? (
                    <>
                      <PiqBtn size="sm" variant="secondary" onClick={handleVerifySkills} disabled={githubVerifying}>
                        {githubVerifying ? "Verifying…" : "Verify Skills"}
                      </PiqBtn>
                      <PiqBtn size="sm" variant="outline" onClick={() => setConfirmDisconnect(true)}>Disconnect</PiqBtn>
                    </>
                  ) : (
                    <PiqBtn size="sm" onClick={handleConnectGitHub}>Connect GitHub</PiqBtn>
                  )}
                </div>
              </div>

              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                <span style={{ color: "var(--text2)", fontSize: 14 }}>{userSkills.length} skill{userSkills.length !== 1 ? "s" : ""} in your profile</span>
                <PiqBtn icon="plus" onClick={() => setShowAddModal(true)}>Add Skill</PiqBtn>
              </div>
              {userSkills.length === 0 ? (
                <EmptyState text="No skills added yet. Add your first skill to get started." />
              ) : (
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px,1fr))", gap: 12 }}>
                  {userSkills.map((us) => (
                    <div key={us.id} style={{ background: "var(--surf2)", borderRadius: "var(--radius)", padding: 16, border: "1px solid var(--border)" }}>
                      <div style={{ display: "flex", justifyContent: "space-between" }}>
                        <div>
                          <div style={{ fontWeight: 600 }}>{us.skills?.name ?? "—"}</div>
                          <div style={{ fontSize: 12, color: "var(--text2)", marginTop: 2 }}>{us.skills?.category}</div>
                        </div>
                        <button onClick={() => setPendingRemoval(us)} title={`Remove ${us.skills?.name ?? "skill"}`} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text3)", fontSize: 18 }}>×</button>
                      </div>
                      <div style={{ marginTop: 10, display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
                        <select
                          value={us.proficiency_label}
                          onChange={(e) => handleUpdateProficiency(us.id, e.target.value as (typeof PROF_LABELS)[number])}
                          title="Change proficiency"
                          style={{
                            fontSize: 12, fontWeight: 600, cursor: "pointer", appearance: "none",
                            color: PROF_COLORS[us.proficiency_label], background: `${PROF_COLORS[us.proficiency_label]}20`,
                            padding: "2px 8px", borderRadius: 20, border: "none",
                          }}
                        >
                          {PROF_LABELS.map((p) => <option key={p} value={p}>{p}</option>)}
                        </select>
                        {us.github_verified && (
                          <span
                            title={
                              typeof us.confidence_score === "number"
                                ? `Verified from your GitHub repositories — ${Math.round(us.confidence_score * 100)}% of your analysed code`
                                : "Verified from your GitHub repositories"
                            }
                            style={{ fontSize: 11, color: "var(--teal)", background: "var(--tealD)", padding: "2px 8px", borderRadius: 20 }}
                          >
                            ✓ GitHub
                            {typeof us.confidence_score === "number" && ` · ${Math.round(us.confidence_score * 100)}%`}
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}

            </div>
          )}

          {/* Tab 2: Forecast */}
          {tab === "Forecast" && (
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
                <p style={{ color: "var(--text2)", fontSize: 14, margin: 0 }}>Module A forecasts weekly job-ad demand for the Sri Lankan IT market (12 weeks ahead).</p>
                <PiqBtn icon="trend" onClick={handleRunForecast} disabled={forecastLoading}>
                  {forecastLoading ? "Running…" : "Run Forecast"}
                </PiqBtn>
              </div>
              {forecastLoading && <div style={{ display: "flex", justifyContent: "center", padding: 48 }}><PiqSpinner /></div>}
              {forecast && !forecastLoading && (
                <div>
                  {!forecast.matched && (
                    <div style={{ background: "var(--amberD)", border: "1px solid oklch(85% 0.15 75 / 30%)", borderRadius: "var(--radius)", padding: "10px 14px", marginBottom: 16, fontSize: 13, color: "var(--amber)" }}>
                      None of your tracked skills have forecast data yet — showing the overall market top skills instead.
                    </div>
                  )}
                  {forecast.matched && forecast.matched_skills.length > 0 && (
                    <div style={{ fontSize: 13, color: "var(--text2)", marginBottom: 16 }}>
                      Forecast for {forecast.matched_skills.length} of your skills: {forecast.matched_skills.join(", ")}
                    </div>
                  )}
                  <SectionLabel>Established &amp; Growing — Predicted Weekly Job-Ad Demand (next 4 weeks)</SectionLabel>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(190px,1fr))", gap: 10, marginBottom: 20 }}>
                    {forecast.trending.established.map((item) => (
                      <div key={item.skill} style={{ background: "var(--surf2)", border: "1px solid var(--border)", borderRadius: "var(--radius)", padding: 14 }}>
                        <div style={{ fontWeight: 600 }}>{item.skill}</div>
                        <div style={{ fontSize: 12, color: "var(--text2)", marginTop: 2 }}>#{item.rank} {forecast.matched ? "of your skills" : "in market"}</div>
                        <div style={{ marginTop: 8, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                          <span style={{ fontSize: 22, fontWeight: 700, color: "var(--accent)" }}>{item.predicted_weekly_demand}</span>
                          <span style={{ fontSize: 13, color: VELOCITY_COLOR[item.velocity], fontWeight: 600 }}>
                            {VELOCITY_ICON[item.velocity]} {Math.abs(item.change_pct)}%
                          </span>
                        </div>
                        <div style={{ fontSize: 11, color: "var(--text3)", marginTop: 2 }}>job ads / week · now {item.current_weekly_demand}</div>
                      </div>
                    ))}
                  </div>

                  {forecast.trending.emerging.length > 0 && (
                    <>
                      <SectionLabel>Emerging — Small Now, Growing Fastest</SectionLabel>
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(190px,1fr))", gap: 10, marginBottom: 28 }}>
                        {forecast.trending.emerging.map((item) => (
                          <div key={item.skill} style={{ background: "var(--surf2)", border: "1px solid var(--border)", borderRadius: "var(--radius)", padding: 14 }}>
                            <div style={{ fontWeight: 600 }}>{item.skill}</div>
                            <div style={{ fontSize: 12, color: "var(--text2)", marginTop: 2 }}>#{item.rank} {forecast.matched ? "of your skills" : "in market"}</div>
                            <div style={{ marginTop: 8, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                              <span style={{ fontSize: 22, fontWeight: 700, color: "var(--accent)" }}>{item.predicted_weekly_demand}</span>
                              <span style={{ fontSize: 13, color: VELOCITY_COLOR[item.velocity], fontWeight: 600 }}>
                                {VELOCITY_ICON[item.velocity]} {Math.abs(item.change_pct)}%
                              </span>
                            </div>
                            <div style={{ fontSize: 11, color: "var(--text3)", marginTop: 2 }}>job ads / week · now {item.current_weekly_demand}</div>
                          </div>
                        ))}
                      </div>
                    </>
                  )}

                  <SectionLabel>Early Warnings — Global Trends Reach Sri Lanka Later</SectionLabel>
                  <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                    {forecast.early_warnings.map((w) => (
                      <div key={w.skill} style={{ background: "var(--amberD)", border: "1px solid oklch(85% 0.15 75 / 30%)", borderRadius: "var(--radius)", padding: 14, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <div>
                          <span style={{ fontWeight: 600, color: "var(--amber)" }}>⚠ {w.skill}</span>
                          <span style={{ fontSize: 13, color: "var(--text2)", marginLeft: 12 }}>
                            Global demand leads the local market by ~{w.weeks_ahead} week{w.weeks_ahead !== 1 ? "s" : ""} (correlation {w.correlation})
                          </span>
                          {w.interpretation && (
                            <div style={{ fontSize: 12, color: "var(--text3)", marginTop: 4 }}>{w.interpretation}</div>
                          )}
                        </div>
                        <span style={{ fontSize: 13, color: "var(--amber)", padding: "2px 10px", borderRadius: 20, border: "1px solid oklch(85% 0.15 75 / 30%)", whiteSpace: "nowrap" }}>
                          ~{w.weeks_ahead} weeks lead
                        </span>
                      </div>
                    ))}
                  </div>

                  {/* Chart: current vs predicted weekly demand */}
                  <div style={{ marginTop: 28 }}>
                    <SectionLabel>Current vs Predicted Weekly Demand (job ads / week)</SectionLabel>
                    <PiqChartContainer height={240}>
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart
                          data={[...forecast.trending.established, ...forecast.trending.emerging].map((item) => ({
                            skill:    item.skill.length > 12 ? item.skill.slice(0, 12) + "…" : item.skill,
                            current:  item.current_weekly_demand,
                            forecast: item.predicted_weekly_demand,
                          }))}
                          margin={{ top: 4, right: 8, left: -20, bottom: 0 }}
                          barGap={4}
                          barCategoryGap="30%"
                        >
                          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                          <XAxis dataKey="skill" tick={{ fontSize: 11, fill: "var(--text3)" }} axisLine={false} tickLine={false} />
                          <YAxis tick={{ fontSize: 11, fill: "var(--text3)" }} axisLine={false} tickLine={false} />
                          <Tooltip content={<PiqTooltip />} cursor={{ fill: "var(--surf2)" }} />
                          <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12, paddingTop: 8 }} />
                          <Bar dataKey="current"  name="Current Demand"   fill={PIQ_COLORS.text3}  radius={[3, 3, 0, 0]} />
                          <Bar dataKey="forecast" name="Predicted (4 wk)" fill={PIQ_COLORS.accent} radius={[3, 3, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </PiqChartContainer>
                  </div>

                  {/* Chart: forecast_chart LineChart */}
                  {forecast.forecast_chart && forecast.forecast_chart.length > 0 && (
                    <div style={{ marginTop: 20 }}>
                      <SectionLabel>Demand Trend Over Time</SectionLabel>
                      <PiqChartContainer height={240}>
                        <ResponsiveContainer width="100%" height="100%">
                          <LineChart
                            data={forecast.forecast_chart}
                            margin={{ top: 4, right: 8, left: -20, bottom: 0 }}
                          >
                            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                            <XAxis
                              dataKey={Object.keys(forecast.forecast_chart[0] ?? {})[0]}
                              tick={{ fontSize: 11, fill: "var(--text3)" }}
                              axisLine={false}
                              tickLine={false}
                            />
                            <YAxis tick={{ fontSize: 11, fill: "var(--text3)" }} axisLine={false} tickLine={false} />
                            <Tooltip content={<PiqTooltip />} />
                            {Object.keys(forecast.forecast_chart[0] ?? {})
                              .filter((k) => k !== Object.keys(forecast.forecast_chart[0])[0])
                              .map((key, i) => (
                                <Line
                                  key={key}
                                  type="monotone"
                                  dataKey={key}
                                  name={key}
                                  stroke={[PIQ_COLORS.accent, PIQ_COLORS.teal, PIQ_COLORS.amber, PIQ_COLORS.violet][i % 4]}
                                  strokeWidth={2}
                                  dot={false}
                                />
                              ))}
                            <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12, paddingTop: 8 }} />
                          </LineChart>
                        </ResponsiveContainer>
                      </PiqChartContainer>
                    </div>
                  )}
                </div>
              )}
              {!forecast && !forecastLoading && (
                <EmptyState text="Click 'Run Forecast' to see predicted demand for your skills over the next 12 weeks." />
              )}
            </div>
          )}

          {/* Tab 3: Assessments */}
          {tab === "Assessments" && (
            <div>
              <form
                onSubmit={handleLogAssessment}
                style={{ background: "var(--surf2)", border: "1px solid var(--border)", borderRadius: "var(--radius)", padding: 16, marginBottom: 20 }}
              >
                <SectionLabel>Log a Self-Assessment</SectionLabel>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 10, alignItems: "end" }}>
                  <label style={{ display: "flex", flexDirection: "column", gap: 5, fontSize: 12, color: "var(--text2)" }}>
                    Skill
                    <select
                      value={assessmentSkillId}
                      onChange={(e) => setAssessmentSkillId(e.target.value)}
                      required
                      disabled={assessmentSaving || userSkills.length === 0}
                      style={{ padding: "8px 10px", minHeight: 36, borderRadius: "var(--radius)", border: "1px solid var(--border2)", background: "var(--surf)", color: "var(--text)", fontSize: 14 }}
                    >
                      <option value="">Select a tracked skill…</option>
                      {userSkills.map((userSkill) => (
                        <option key={userSkill.skill_id} value={userSkill.skill_id}>
                          {userSkill.skills?.name ?? "Unknown skill"}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label style={{ display: "flex", flexDirection: "column", gap: 5, fontSize: 12, color: "var(--text2)" }}>
                    Score (0–100)
                    <input
                      type="number"
                      min="0"
                      max="100"
                      step="0.1"
                      value={assessmentScore}
                      onChange={(e) => setAssessmentScore(e.target.value)}
                      required
                      disabled={assessmentSaving || userSkills.length === 0}
                      placeholder="85"
                      style={{ padding: "8px 10px", minHeight: 36, borderRadius: "var(--radius)", border: "1px solid var(--border2)", background: "var(--surf)", color: "var(--text)", fontSize: 14 }}
                    />
                  </label>
                  <label style={{ display: "flex", flexDirection: "column", gap: 5, fontSize: 12, color: "var(--text2)" }}>
                    Notes (optional)
                    <input
                      type="text"
                      value={assessmentNotes}
                      onChange={(e) => setAssessmentNotes(e.target.value)}
                      disabled={assessmentSaving || userSkills.length === 0}
                      placeholder="What did you assess?"
                      style={{ padding: "8px 10px", minHeight: 36, borderRadius: "var(--radius)", border: "1px solid var(--border2)", background: "var(--surf)", color: "var(--text)", fontSize: 14 }}
                    />
                  </label>
                  <PiqBtn type="submit" disabled={assessmentSaving || userSkills.length === 0}>
                    {assessmentSaving ? "Saving…" : "Log Assessment"}
                  </PiqBtn>
                </div>
                {userSkills.length === 0 && (
                  <p style={{ margin: "10px 0 0", fontSize: 12, color: "var(--amber)" }}>
                    Add a skill to your profile before logging an assessment.
                  </p>
                )}
              </form>
              {assessments.length === 0 ? (
                <EmptyState text="No assessments yet. Use the form above to log your first score." />
              ) : (
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
                  <thead>
                    <tr style={{ borderBottom: "1px solid var(--border)", color: "var(--text2)" }}>
                      {["Skill", "Category", "Score", "Date", "Notes"].map((h) => (
                        <th key={h} style={{ padding: "8px 12px", textAlign: "left", fontWeight: 500 }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {visibleAssessments.map((a) => (
                      <tr key={a.id} style={{ borderBottom: "1px solid var(--border2)" }}>
                        <td style={{ padding: "10px 12px", fontWeight: 500 }}>{a.skills?.name ?? "—"}</td>
                        <td style={{ padding: "10px 12px", color: "var(--text2)" }}>{a.skills?.category}</td>
                        <td style={{ padding: "10px 12px" }}>
                          <span style={{ fontWeight: 700, color: a.score >= 80 ? "var(--teal)" : a.score >= 60 ? "var(--amber)" : "var(--rose)" }}>{a.score}</span>
                          <span style={{ color: "var(--text3)", fontSize: 12 }}>/100</span>
                        </td>
                        <td style={{ padding: "10px 12px", color: "var(--text2)" }}>{formatDate(a.assessed_at)}</td>
                        <td style={{ padding: "10px 12px", color: "var(--text2)" }}>{a.notes ?? "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              {assessments.length > visibleAssessments.length && (
                <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: 12, marginTop: 14 }}>
                  <span style={{ fontSize: 12, color: "var(--text3)" }}>
                    Showing {visibleAssessments.length} of {assessments.length}
                  </span>
                  <PiqBtn size="sm" variant="secondary" onClick={() => setAssessmentsShown((n) => n + ASSESSMENTS_PAGE_SIZE)}>
                    Show more
                  </PiqBtn>
                </div>
              )}
            </div>
          )}

          {/* Tab 4: Skill Catalog */}
          {tab === "Skill Catalog" && (
            <div>
              <div style={{ display: "flex", gap: 10, marginBottom: 18, flexWrap: "wrap", alignItems: "center" }}>
                <input
                  type="search"
                  value={catalogSearch}
                  onChange={(e) => setCatalogSearch(e.target.value)}
                  placeholder="Search skills…"
                  aria-label="Search the skill catalog"
                  style={{ flex: "1 1 220px", padding: "8px 12px", borderRadius: "var(--radius)", border: "1px solid var(--border2)", background: "var(--surf2)", color: "var(--text)", fontSize: 14 }}
                />
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {TYPE_FILTERS.map((t) => (
                    <button
                      key={t}
                      onClick={() => setCatalogType(t)}
                      style={{
                        padding: "6px 12px", borderRadius: 20, cursor: "pointer", fontSize: 13,
                        border: `1px solid ${catalogType === t ? "var(--accent)" : "var(--border)"}`,
                        background: catalogType === t ? "var(--accentD)" : "transparent",
                        color: catalogType === t ? "var(--accent)" : "var(--text2)",
                      }}
                    >{TYPE_LABELS[t]}</button>
                  ))}
                </div>
              </div>

              {masterSkills.length === 0 ? (
                <EmptyState text="The skill catalog is empty or couldn't be loaded." />
              ) : catalogFiltered.length === 0 ? (
                <EmptyState text="No skills match your search or filter." />
              ) : (
                catalogCategories.map((cat) => (
                  <div key={cat} style={{ marginBottom: 20 }}>
                    <SectionLabel>{cat}</SectionLabel>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                      {catalogFiltered.filter((s) => s.category === cat).map((s) => {
                        const added = addedIds.has(s.id);
                        return (
                          <div key={s.id} title={s.description ?? undefined} style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 12px", borderRadius: 20, border: `1px solid ${added ? "var(--accent)" : "var(--border)"}`, background: added ? "var(--accentD)" : "var(--surf2)", fontSize: 13 }}>
                            <span style={{ color: added ? "var(--accent)" : "var(--text)" }}>{s.name}</span>
                            {added ? (
                              <span style={{ fontSize: 11, color: "var(--accent)" }}>✓</span>
                            ) : (
                              // Opens the shared Add-Skill modal in place — no
                              // longer yanks the user over to the My Skills tab.
                              <button onClick={() => { setAddSkillId(s.id); setShowAddModal(true); }}
                                title={`Add ${s.name}`}
                                style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text3)", fontSize: 16, lineHeight: 1 }}>+</button>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </>
      )}

      {/* Page-level so it can be opened from either My Skills or Skill Catalog. */}
      <PiqModal
        open={showAddModal}
        onClose={() => setShowAddModal(false)}
        title="Add Skill"
        width={380}
        footer={
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <PiqBtn variant="secondary" onClick={() => setShowAddModal(false)}>Cancel</PiqBtn>
            <PiqBtn onClick={handleAddSkill} disabled={!addSkillId}>Add</PiqBtn>
          </div>
        }
      >
        <label style={{ fontSize: 13, color: "var(--text2)", display: "block", marginBottom: 4 }}>Skill</label>
        <select value={addSkillId} onChange={(e) => setAddSkillId(e.target.value)}
          style={{ width: "100%", padding: "8px 10px", borderRadius: "var(--radius)", border: "1px solid var(--border2)", background: "var(--surf2)", color: "var(--text)", fontSize: 14, marginBottom: 14 }}>
          <option value="">Select a skill…</option>
          {addableCategories.map((cat) => (
            <optgroup key={cat} label={cat}>
              {available.filter((s) => s.category === cat).map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </optgroup>
          ))}
        </select>
        <label style={{ fontSize: 13, color: "var(--text2)", display: "block", marginBottom: 6 }}>Proficiency</label>
        <div style={{ display: "flex", gap: 8 }}>
          {PROF_LABELS.map((p) => (
            <button key={p} onClick={() => setAddProf(p)} style={{
              flex: 1, padding: "6px 0", borderRadius: "var(--radius)", cursor: "pointer",
              border: `1px solid ${addProf === p ? PROF_COLORS[p] : "var(--border)"}`,
              background: addProf === p ? `${PROF_COLORS[p]}20` : "transparent",
              color: addProf === p ? PROF_COLORS[p] : "var(--text2)", fontSize: 13,
            }}>{p}</button>
          ))}
        </div>
      </PiqModal>

      <ConfirmDialog
        open={confirmDisconnect}
        title="Disconnect GitHub?"
        message="Your GitHub account will be unlinked and every skill verified from it will lose its verification badge. You can reconnect and re-verify at any time."
        confirmLabel="Disconnect"
        destructive
        busy={disconnecting}
        onConfirm={handleDisconnectGitHub}
        onCancel={() => setConfirmDisconnect(false)}
      />

      <ConfirmDialog
        open={pendingRemoval !== null}
        title="Remove skill?"
        message={`"${pendingRemoval?.skills?.name ?? "This skill"}" will be removed from your profile. Assessments you've already logged against it are kept.`}
        confirmLabel="Remove"
        destructive
        busy={removing}
        onConfirm={handleRemoveSkill}
        onCancel={() => setPendingRemoval(null)}
      />
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text2)", marginBottom: 10, textTransform: "uppercase", letterSpacing: "0.06em" }}>{children}</div>;
}

function EmptyState({ text }: { text: string }) {
  return (
    <div style={{ textAlign: "center", padding: "48px 24px", color: "var(--text2)" }}>
      <p style={{ fontSize: 14, margin: 0 }}>{text}</p>
    </div>
  );
}
