"use client";

import { useState, useEffect } from "react";
import { toast } from "sonner";
import { PiqBtn, PiqSpinner, PiqStatCard } from "@/components/piq/primitives";
import { Icon } from "@/components/piq/icon";
import { PageHeader } from "@/components/common/PageHeader";
import { skillService } from "@/services/skill.service";
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

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const [userRes, masterRes, assessRes] = await Promise.all([
          skillService.getUserSkills(),
          skillService.listMaster(),
          skillService.getAssessments(),
        ]);
        setUserSkills(userRes.data.data ?? []);
        setMasterSkills(masterRes.data.data ?? []);
        setAssessments(assessRes.data.data ?? []);
      } catch {
        toast.error("Failed to load skills");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  async function handleAddSkill() {
    if (!addSkillId) return;
    try {
      const profLevel = PROF_LABELS.indexOf(addProf) + 1;
      const res = await skillService.addUserSkill({ skill_id: addSkillId, proficiency_level: profLevel, proficiency_label: addProf });
      setUserSkills((prev) => [res.data.data, ...prev]);
      setShowAddModal(false);
      setAddSkillId("");
      toast.success("Skill added");
    } catch (e: any) {
      toast.error(e?.response?.data?.message ?? "Failed to add skill");
    }
  }

  async function handleRemoveSkill(id: string) {
    try {
      await skillService.deleteUserSkill(id);
      setUserSkills((prev) => prev.filter((s) => s.id !== id));
      toast.success("Skill removed");
    } catch {
      toast.error("Failed to remove skill");
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

  const addedIds    = new Set(userSkills.map((s) => s.skill_id));
  const available   = masterSkills.filter((s) => !addedIds.has(s.id));
  const categories  = [...new Set(masterSkills.map((s) => s.category))].sort();

  return (
    <div style={{ maxWidth: 960, margin: "0 auto" }}>
      <PageHeader title="Skill Intelligence" description="Track skills, forecast demand, log assessments" />

      {!loading && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 14, marginBottom: 24 }}>
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
                        <button onClick={() => handleRemoveSkill(us.id)} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text3)", fontSize: 18 }}>×</button>
                      </div>
                      <div style={{ marginTop: 10, display: "flex", gap: 6, flexWrap: "wrap" }}>
                        <span style={{ fontSize: 12, fontWeight: 600, color: PROF_COLORS[us.proficiency_label], background: `${PROF_COLORS[us.proficiency_label]}20`, padding: "2px 8px", borderRadius: 20 }}>
                          {us.proficiency_label}
                        </span>
                        {us.github_verified && (
                          <span style={{ fontSize: 11, color: "var(--teal)", background: "var(--tealD)", padding: "2px 8px", borderRadius: 20 }}>✓ GitHub</span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {showAddModal && (
                <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100 }}>
                  <div style={{ background: "var(--surf)", borderRadius: "var(--radius)", padding: 24, width: 360, border: "1px solid var(--border2)" }}>
                    <div style={{ fontWeight: 600, fontSize: 16, marginBottom: 16 }}>Add Skill</div>
                    <label style={{ fontSize: 13, color: "var(--text2)", display: "block", marginBottom: 4 }}>Skill</label>
                    <select value={addSkillId} onChange={(e) => setAddSkillId(e.target.value)}
                      style={{ width: "100%", padding: "8px 10px", borderRadius: "var(--radius)", border: "1px solid var(--border2)", background: "var(--surf2)", color: "var(--text)", fontSize: 14, marginBottom: 14 }}>
                      <option value="">Select a skill…</option>
                      {categories.map((cat) => (
                        <optgroup key={cat} label={cat}>
                          {available.filter((s) => s.category === cat).map((s) => (
                            <option key={s.id} value={s.id}>{s.name}</option>
                          ))}
                        </optgroup>
                      ))}
                    </select>
                    <label style={{ fontSize: 13, color: "var(--text2)", display: "block", marginBottom: 6 }}>Proficiency</label>
                    <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
                      {PROF_LABELS.map((p) => (
                        <button key={p} onClick={() => setAddProf(p)} style={{
                          flex: 1, padding: "6px 0", borderRadius: "var(--radius)", cursor: "pointer",
                          border: `1px solid ${addProf === p ? PROF_COLORS[p] : "var(--border)"}`,
                          background: addProf === p ? `${PROF_COLORS[p]}20` : "transparent",
                          color: addProf === p ? PROF_COLORS[p] : "var(--text2)", fontSize: 13,
                        }}>{p}</button>
                      ))}
                    </div>
                    <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                      <PiqBtn variant="secondary" onClick={() => setShowAddModal(false)}>Cancel</PiqBtn>
                      <PiqBtn onClick={handleAddSkill} disabled={!addSkillId}>Add</PiqBtn>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Tab 2: Forecast */}
          {tab === "Forecast" && (
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
                <p style={{ color: "var(--text2)", fontSize: 14, margin: 0 }}>Module A generates 3-month skill demand forecasts for the Sri Lankan IT market.</p>
                <PiqBtn icon="trend" onClick={handleRunForecast} disabled={forecastLoading}>
                  {forecastLoading ? "Running…" : "Run Forecast"}
                </PiqBtn>
              </div>
              {forecastLoading && <div style={{ display: "flex", justifyContent: "center", padding: 48 }}><PiqSpinner /></div>}
              {forecast && !forecastLoading && (
                <div>
                  <SectionLabel>Trending Skills — 3-Month Forecast</SectionLabel>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(190px,1fr))", gap: 10, marginBottom: 28 }}>
                    {forecast.trending.map((item) => (
                      <div key={item.skill} style={{ background: "var(--surf2)", border: "1px solid var(--border)", borderRadius: "var(--radius)", padding: 14 }}>
                        <div style={{ fontWeight: 600 }}>{item.skill}</div>
                        <div style={{ fontSize: 12, color: "var(--text2)", marginTop: 2 }}>Rank #{item.current_rank}</div>
                        <div style={{ marginTop: 8, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                          <span style={{ fontSize: 22, fontWeight: 700, color: "var(--accent)" }}>{item.forecast_3m}</span>
                          <span style={{ fontSize: 13, color: VELOCITY_COLOR[item.velocity], fontWeight: 600 }}>
                            {VELOCITY_ICON[item.velocity]} {Math.abs(item.change_pct)}%
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                  <SectionLabel>Early Warnings — Global Trends</SectionLabel>
                  <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                    {forecast.early_warnings.map((w) => (
                      <div key={w.skill} style={{ background: "var(--amberD)", border: "1px solid oklch(85% 0.15 75 / 30%)", borderRadius: "var(--radius)", padding: 14, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <div>
                          <span style={{ fontWeight: 600, color: "var(--amber)" }}>⚠ {w.skill}</span>
                          <span style={{ fontSize: 13, color: "var(--text2)", marginLeft: 12 }}>Trending globally since {w.global_trend_date}</span>
                        </div>
                        <span style={{ fontSize: 13, color: "var(--amber)", padding: "2px 10px", borderRadius: 20, border: "1px solid oklch(85% 0.15 75 / 30%)", whiteSpace: "nowrap" }}>
                          ~{w.weeks_ahead} weeks ahead
                        </span>
                      </div>
                    ))}
                  </div>

                  {/* Chart: Current rank vs 3-month forecast */}
                  <div style={{ marginTop: 28 }}>
                    <SectionLabel>Current vs 3-Month Demand Forecast</SectionLabel>
                    <PiqChartContainer height={240}>
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart
                          data={forecast.trending.map((item) => ({
                            skill:    item.skill.length > 12 ? item.skill.slice(0, 12) + "…" : item.skill,
                            current:  item.current_rank,
                            forecast: item.forecast_3m,
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
                          <Bar dataKey="current"  name="Current Rank"    fill={PIQ_COLORS.text3}  radius={[3, 3, 0, 0]} />
                          <Bar dataKey="forecast" name="3-Month Forecast" fill={PIQ_COLORS.accent} radius={[3, 3, 0, 0]} />
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
                <EmptyState text="Click 'Run Forecast' to generate your personalised 3-month skill demand forecast." />
              )}
            </div>
          )}

          {/* Tab 3: Assessments */}
          {tab === "Assessments" && (
            <div>
              {assessments.length === 0 ? (
                <EmptyState text="No assessments yet. These are logged automatically after CV analysis or skill tests." />
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
                    {assessments.map((a) => (
                      <tr key={a.id} style={{ borderBottom: "1px solid var(--border2)" }}>
                        <td style={{ padding: "10px 12px", fontWeight: 500 }}>{a.skills?.name ?? "—"}</td>
                        <td style={{ padding: "10px 12px", color: "var(--text2)" }}>{a.skills?.category}</td>
                        <td style={{ padding: "10px 12px" }}>
                          <span style={{ fontWeight: 700, color: a.score >= 80 ? "var(--teal)" : a.score >= 60 ? "var(--amber)" : "var(--rose)" }}>{a.score}</span>
                          <span style={{ color: "var(--text3)", fontSize: 12 }}>/100</span>
                        </td>
                        <td style={{ padding: "10px 12px", color: "var(--text2)" }}>{new Date(a.assessed_at).toLocaleDateString()}</td>
                        <td style={{ padding: "10px 12px", color: "var(--text2)" }}>{a.notes ?? "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}

          {/* Tab 4: Skill Catalog */}
          {tab === "Skill Catalog" && (
            <div>
              {categories.map((cat) => (
                <div key={cat} style={{ marginBottom: 20 }}>
                  <SectionLabel>{cat}</SectionLabel>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                    {masterSkills.filter((s) => s.category === cat).map((s) => {
                      const added = addedIds.has(s.id);
                      return (
                        <div key={s.id} style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 12px", borderRadius: 20, border: `1px solid ${added ? "var(--accent)" : "var(--border)"}`, background: added ? "var(--accentD)" : "var(--surf2)", fontSize: 13 }}>
                          <span style={{ color: added ? "var(--accent)" : "var(--text)" }}>{s.name}</span>
                          {added ? (
                            <span style={{ fontSize: 11, color: "var(--accent)" }}>✓</span>
                          ) : (
                            <button onClick={() => { setAddSkillId(s.id); setShowAddModal(true); setTab("My Skills"); }}
                              style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text3)", fontSize: 16, lineHeight: 1 }}>+</button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
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
