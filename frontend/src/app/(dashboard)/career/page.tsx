"use client";

import { useState, useEffect } from "react";
import { toast } from "sonner";
import { PiqBtn, PiqSpinner, PiqStatCard } from "@/components/piq/primitives";
import { PageHeader } from "@/components/common/PageHeader";
import { careerService } from "@/services/career.service";
import { skillService } from "@/services/skill.service";
import type { CareerGoal, RoadmapItem, CareerPrediction, UserSkill } from "@/types";
import { BarChart, Bar, RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { PiqChartContainer, PiqTooltip, PIQ_COLORS } from "@/components/piq/charts";

const STEPS = ["Career Goal", "Career Path", "Roadmap"] as const;
type Step = (typeof STEPS)[number];

const STATUS_COLORS: Record<string, string> = {
  pending:     "var(--text2)",
  in_progress: "var(--amber)",
  done:        "var(--teal)",
};

export default function CareerPage() {
  const [step, setStep]           = useState<Step>("Career Goal");
  const [goal, setGoal]           = useState<CareerGoal | null>(null);
  const [roadmap, setRoadmap]     = useState<RoadmapItem[]>([]);
  const [prediction, setPrediction] = useState<CareerPrediction | null>(null);
  const [userSkills, setUserSkills] = useState<UserSkill[]>([]);
  const [loading, setLoading]     = useState(true);
  const [saving, setSaving]       = useState(false);
  const [predicting, setPredicting] = useState(false);
  const [editGoal, setEditGoal]   = useState(false);

  const [form, setForm] = useState({ target_role: "", target_industry: "", target_date: "", notes: "" });
  const [newItem, setNewItem] = useState({ title: "", description: "", due_date: "" });
  const [showAddItem, setShowAddItem] = useState(false);

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const [goalRes, roadmapRes, skillsRes] = await Promise.all([
          careerService.getGoal(),
          careerService.getRoadmap(),
          skillService.getUserSkills(),
        ]);
        const g = goalRes.data.data;
        setGoal(g);
        if (g) setForm({ target_role: g.target_role, target_industry: g.target_industry ?? "", target_date: g.target_date ?? "", notes: g.notes ?? "" });
        setRoadmap(roadmapRes.data.data ?? []);
        setUserSkills(skillsRes.data.data ?? []);
      } catch {
        toast.error("Failed to load career data");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  async function handleSaveGoal() {
    if (!form.target_role.trim()) { toast.error("Target role is required"); return; }
    setSaving(true);
    try {
      const res = await careerService.upsertGoal({ target_role: form.target_role, target_industry: form.target_industry || undefined, target_date: form.target_date || undefined, notes: form.notes || undefined });
      setGoal(res.data.data);
      setEditGoal(false);
      toast.success("Career goal saved");
    } catch {
      toast.error("Failed to save goal");
    } finally {
      setSaving(false);
    }
  }

  async function handlePredict() {
    setPredicting(true);
    try {
      const res = await careerService.predictPath({ current_role: form.target_role });
      setPrediction(res.data.data);
      toast.success("Career path generated");
    } catch {
      toast.error("Failed to generate path");
    } finally {
      setPredicting(false);
    }
  }

  async function handleAddItem() {
    if (!newItem.title.trim()) return;
    try {
      const res = await careerService.addRoadmapItem({ title: newItem.title, description: newItem.description || undefined, due_date: newItem.due_date || undefined, order_index: roadmap.length });
      setRoadmap((prev) => [...prev, res.data.data]);
      setNewItem({ title: "", description: "", due_date: "" });
      setShowAddItem(false);
      toast.success("Item added");
    } catch {
      toast.error("Failed to add item");
    }
  }

  async function handleStatusChange(id: string, status: "pending" | "in_progress" | "done") {
    try {
      const res = await careerService.updateRoadmapItem(id, { status });
      setRoadmap((prev) => prev.map((r) => r.id === id ? { ...r, ...res.data.data } : r));
    } catch {
      toast.error("Failed to update status");
    }
  }

  async function handleDeleteItem(id: string) {
    try {
      await careerService.deleteRoadmapItem(id);
      setRoadmap((prev) => prev.filter((r) => r.id !== id));
      toast.success("Item removed");
    } catch {
      toast.error("Failed to remove item");
    }
  }

  const done = roadmap.filter((r) => r.status === "done").length;

  return (
    <div style={{ maxWidth: 960, margin: "0 auto" }}>
      <PageHeader title="Career Pathway" description="Set goals, predict your career path, track your roadmap" />

      {!loading && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 14, marginBottom: 24 }}>
          <PiqStatCard label="Career Goal" value={goal ? "Set" : "Not yet"} icon="target" color="var(--accent)" sub="Your target" />
          <PiqStatCard label="Roadmap Items" value={roadmap.length} icon="list" color="var(--teal)" sub="Total items" />
          <PiqStatCard label="Completed" value={done} icon="check" color="var(--violet)" sub="Done items" />
        </div>
      )}

      {/* Step tabs */}
      <div style={{ display: "flex", gap: 4, marginBottom: 24, borderBottom: "1px solid var(--border)" }}>
        {STEPS.map((s, i) => (
          <button key={s} onClick={() => setStep(s)} style={{
            padding: "8px 16px", fontSize: 14, border: "none", cursor: "pointer", background: "transparent",
            fontWeight: step === s ? 600 : 400, color: step === s ? "var(--accent)" : "var(--text2)",
            borderBottom: step === s ? "2px solid var(--accent)" : "2px solid transparent", marginBottom: -1,
            display: "flex", alignItems: "center", gap: 6,
          }}>
            <span style={{ width: 20, height: 20, borderRadius: "50%", background: step === s ? "var(--accent)" : "var(--surf3)", color: step === s ? "#fff" : "var(--text2)", fontSize: 12, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 600 }}>{i + 1}</span>
            {s}
          </button>
        ))}
        {/* Skill Gap tab */}
        <button onClick={() => setStep("Roadmap" as any)} style={{ padding: "8px 16px", fontSize: 14, border: "none", cursor: "pointer", background: "transparent", color: "var(--text2)", borderBottom: "2px solid transparent", marginBottom: -1, marginLeft: "auto" }}>
        </button>
      </div>

      {loading ? (
        <div style={{ display: "flex", justifyContent: "center", padding: 48 }}><PiqSpinner /></div>
      ) : (
        <>
          {/* Step 1: Career Goal */}
          {step === "Career Goal" && (
            <div style={{ maxWidth: 560 }}>
              {goal && !editGoal ? (
                <div style={{ background: "var(--surf2)", borderRadius: "var(--radius)", padding: 24, border: "1px solid var(--border)" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 16 }}>
                    <div style={{ fontWeight: 600, fontSize: 18 }}>{goal.target_role}</div>
                    <PiqBtn variant="secondary" size="sm" onClick={() => setEditGoal(true)}>Edit</PiqBtn>
                  </div>
                  {goal.target_industry && <Field label="Industry" value={goal.target_industry} />}
                  {goal.target_date && <Field label="Target Date" value={new Date(goal.target_date).toLocaleDateString()} />}
                  {goal.notes && <Field label="Notes" value={goal.notes} />}
                  <div style={{ marginTop: 20 }}>
                    <PiqBtn onClick={() => setStep("Career Path")}>Generate Career Path →</PiqBtn>
                  </div>
                </div>
              ) : (
                <div style={{ background: "var(--surf2)", borderRadius: "var(--radius)", padding: 24, border: "1px solid var(--border)" }}>
                  <div style={{ fontWeight: 600, fontSize: 16, marginBottom: 16 }}>{goal ? "Edit Goal" : "Set Your Career Goal"}</div>
                  <FormRow label="Target Role *">
                    <input value={form.target_role} onChange={(e) => setForm({ ...form, target_role: e.target.value })} placeholder="e.g. Senior Software Engineer" style={inputStyle} />
                  </FormRow>
                  <FormRow label="Target Industry">
                    <input value={form.target_industry} onChange={(e) => setForm({ ...form, target_industry: e.target.value })} placeholder="e.g. FinTech" style={inputStyle} />
                  </FormRow>
                  <FormRow label="Target Date">
                    <input type="date" value={form.target_date} onChange={(e) => setForm({ ...form, target_date: e.target.value })} style={inputStyle} />
                  </FormRow>
                  <FormRow label="Notes">
                    <textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={3} style={{ ...inputStyle, resize: "vertical" }} placeholder="Any notes or aspirations…" />
                  </FormRow>
                  <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                    {goal && <PiqBtn variant="secondary" onClick={() => setEditGoal(false)}>Cancel</PiqBtn>}
                    <PiqBtn onClick={handleSaveGoal} disabled={saving}>{saving ? "Saving…" : "Save Goal"}</PiqBtn>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Step 2: Career Path */}
          {step === "Career Path" && (
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
                <p style={{ color: "var(--text2)", fontSize: 14, margin: 0 }}>Module B analyses 1,400+ Sri Lankan IT career trajectories to predict your path.</p>
                <PiqBtn onClick={handlePredict} disabled={predicting}>{predicting ? "Generating…" : "Generate My Path"}</PiqBtn>
              </div>
              {predicting && <div style={{ display: "flex", justifyContent: "center", padding: 48 }}><PiqSpinner /></div>}
              {prediction && !predicting && (
                <div>
                  {prediction.paths.map((path) => (
                    <div key={path.id} style={{ background: "var(--surf2)", borderRadius: "var(--radius)", padding: 20, border: "1px solid var(--border)", marginBottom: 16 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 16 }}>
                        <span style={{ fontWeight: 600, fontSize: 15 }}>Path — {Math.round(path.probability * 100)}% probability</span>
                      </div>
                      <div style={{ display: "flex", gap: 0, overflowX: "auto", paddingBottom: 8 }}>
                        {path.transitions.map((t, i) => (
                          <div key={i} style={{ display: "flex", alignItems: "center", gap: 0 }}>
                            <div style={{ background: "var(--surf3)", borderRadius: "var(--radius)", padding: "10px 14px", minWidth: 160, border: "1px solid var(--border2)" }}>
                              <div style={{ fontWeight: 600, fontSize: 13 }}>{t.role}</div>
                              <div style={{ fontSize: 11, color: "var(--text2)", marginTop: 2 }}>{t.timeframe_months}m • {t.industry}</div>
                              <div style={{ fontSize: 11, color: "var(--accent)", marginTop: 4 }}>{Math.round(t.transition_probability * 100)}% likely</div>
                              {t.skill_gaps.length > 0 && (
                                <div style={{ marginTop: 6 }}>
                                  {t.skill_gaps.slice(0, 2).map((g) => (
                                    <span key={g} style={{ fontSize: 10, background: "var(--roseD)", color: "var(--rose)", padding: "1px 6px", borderRadius: 10, marginRight: 4 }}>-{g}</span>
                                  ))}
                                </div>
                              )}
                            </div>
                            {i < path.transitions.length - 1 && (
                              <div style={{ fontSize: 18, color: "var(--text3)", padding: "0 6px" }}>→</div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                  {/* Charts */}
                  <div style={{ marginTop: 24 }}>
                    <PiqChartContainer
                      title="Transition Probability by Role"
                      subtitle="Likelihood of each career move"
                      height={240}
                    >
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart
                          data={prediction.paths.flatMap((path) =>
                            path.transitions.map((t) => ({
                              role:        t.role.length > 16 ? t.role.slice(0, 16) + "…" : t.role,
                              probability: Math.round(t.transition_probability * 100),
                              timeframe:   t.timeframe_months,
                            }))
                          )}
                          margin={{ top: 4, right: 8, left: -16, bottom: 0 }}
                          barSize={28}
                        >
                          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                          <XAxis dataKey="role" tick={{ fontSize: 11, fill: "var(--text3)" }} axisLine={false} tickLine={false} />
                          <YAxis unit="%" domain={[0, 100]} tick={{ fontSize: 11, fill: "var(--text3)" }} axisLine={false} tickLine={false} />
                          <Tooltip content={<PiqTooltip />} cursor={{ fill: "var(--surf2)" }} />
                          <Bar dataKey="probability" name="Probability %" fill={PIQ_COLORS.teal} radius={[4, 4, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </PiqChartContainer>

                    {prediction.paths[0]?.transitions[0] && (
                      <div style={{ marginTop: 16 }}>
                        <PiqChartContainer
                          title="Skill Gap Analysis"
                          subtitle="First transition: required vs missing skills"
                          height={280}
                        >
                          <ResponsiveContainer width="100%" height="100%">
                            <RadarChart
                              data={[
                                ...prediction.paths[0].transitions[0].required_skills.map((s) => ({
                                  skill:    s.length > 14 ? s.slice(0, 14) + "…" : s,
                                  required: 100,
                                  gap:      prediction.paths[0].transitions[0].skill_gaps.includes(s) ? 30 : 85,
                                })),
                              ]}
                              margin={{ top: 8, right: 20, left: 20, bottom: 8 }}
                            >
                              <PolarGrid stroke="var(--border)" />
                              <PolarAngleAxis dataKey="skill" tick={{ fontSize: 11, fill: "var(--text3)" }} />
                              <PolarRadiusAxis domain={[0, 100]} tick={false} axisLine={false} />
                              <Radar name="Required" dataKey="required" stroke={PIQ_COLORS.teal}   fill={PIQ_COLORS.teal}   fillOpacity={0.15} />
                              <Radar name="Current"  dataKey="gap"      stroke={PIQ_COLORS.accent} fill={PIQ_COLORS.accent} fillOpacity={0.25} />
                              <Tooltip content={<PiqTooltip />} />
                            </RadarChart>
                          </ResponsiveContainer>
                        </PiqChartContainer>
                      </div>
                    )}
                  </div>

                  <div style={{ marginTop: 16 }}>
                    <PiqBtn variant="secondary" onClick={() => setStep("Roadmap")}>View My Roadmap →</PiqBtn>
                  </div>
                </div>
              )}
              {!prediction && !predicting && (
                <div style={{ textAlign: "center", padding: "48px 24px", color: "var(--text2)" }}>
                  <p style={{ fontSize: 14, margin: 0 }}>Click "Generate My Path" to see your predicted career trajectory.</p>
                </div>
              )}
            </div>
          )}

          {/* Step 3: Roadmap */}
          {step === "Roadmap" && (
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                <div>
                  <span style={{ fontWeight: 600, color: "var(--teal)" }}>{done}</span>
                  <span style={{ color: "var(--text2)", fontSize: 14 }}> of {roadmap.length} items completed</span>
                </div>
                <PiqBtn icon="plus" onClick={() => setShowAddItem(true)}>Add Item</PiqBtn>
              </div>

              {roadmap.length === 0 ? (
                <div style={{ textAlign: "center", padding: "48px 24px", color: "var(--text2)" }}>
                  <p style={{ fontSize: 14, margin: 0 }}>No roadmap items yet. Add items to track your progress.</p>
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {roadmap.map((item) => (
                    <div key={item.id} style={{ background: "var(--surf2)", borderRadius: "var(--radius)", padding: 16, border: "1px solid var(--border)", display: "flex", gap: 12, alignItems: "flex-start" }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: item.status === "done" ? 400 : 600, textDecoration: item.status === "done" ? "line-through" : "none", color: item.status === "done" ? "var(--text2)" : "var(--text)" }}>{item.title}</div>
                        {item.description && <div style={{ fontSize: 13, color: "var(--text2)", marginTop: 2 }}>{item.description}</div>}
                        {item.due_date && <div style={{ fontSize: 12, color: "var(--text3)", marginTop: 4 }}>Due: {new Date(item.due_date).toLocaleDateString()}</div>}
                      </div>
                      <select value={item.status} onChange={(e) => handleStatusChange(item.id, e.target.value as any)}
                        style={{ fontSize: 12, padding: "4px 8px", borderRadius: "var(--radius)", border: `1px solid ${STATUS_COLORS[item.status]}`, background: "var(--surf)", color: STATUS_COLORS[item.status], cursor: "pointer" }}>
                        <option value="pending">Pending</option>
                        <option value="in_progress">In Progress</option>
                        <option value="done">Done</option>
                      </select>
                      <button onClick={() => handleDeleteItem(item.id)} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text3)", fontSize: 18 }}>×</button>
                    </div>
                  ))}
                </div>
              )}

              {showAddItem && (
                <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100 }}>
                  <div style={{ background: "var(--surf)", borderRadius: "var(--radius)", padding: 24, width: 380, border: "1px solid var(--border2)" }}>
                    <div style={{ fontWeight: 600, fontSize: 16, marginBottom: 16 }}>Add Roadmap Item</div>
                    <FormRow label="Title *">
                      <input value={newItem.title} onChange={(e) => setNewItem({ ...newItem, title: e.target.value })} placeholder="e.g. Learn Docker" style={inputStyle} />
                    </FormRow>
                    <FormRow label="Description">
                      <input value={newItem.description} onChange={(e) => setNewItem({ ...newItem, description: e.target.value })} placeholder="Optional details" style={inputStyle} />
                    </FormRow>
                    <FormRow label="Due Date">
                      <input type="date" value={newItem.due_date} onChange={(e) => setNewItem({ ...newItem, due_date: e.target.value })} style={inputStyle} />
                    </FormRow>
                    <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 8 }}>
                      <PiqBtn variant="secondary" onClick={() => setShowAddItem(false)}>Cancel</PiqBtn>
                      <PiqBtn onClick={handleAddItem} disabled={!newItem.title.trim()}>Add</PiqBtn>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: "100%", padding: "8px 10px", borderRadius: "var(--radius)", border: "1px solid var(--border2)",
  background: "var(--surf3)", color: "var(--text)", fontSize: 14, boxSizing: "border-box",
};

function FormRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <label style={{ fontSize: 13, color: "var(--text2)", display: "block", marginBottom: 4 }}>{label}</label>
      {children}
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ marginBottom: 8 }}>
      <span style={{ fontSize: 12, color: "var(--text2)" }}>{label}: </span>
      <span style={{ fontSize: 14 }}>{value}</span>
    </div>
  );
}
