"use client";

import { useState, useEffect, useRef } from "react";
import { toast } from "sonner";
import { PiqBtn, PiqSpinner, PiqStatCard } from "@/components/piq/primitives";
import { PageHeader } from "@/components/common/PageHeader";
import { careerService } from "@/services/career.service";
import { skillService } from "@/services/skill.service";
import { cvService } from "@/services/cv.service";
import type { CareerGoal, GoalSkillSnapshot, RoadmapItem, CareerPrediction, UserSkill, CV } from "@/types";
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

  const [cvs, setCvs] = useState<CV[]>([]);
  const [selectedSkills, setSelectedSkills] = useState<Set<string>>(new Set());
  const [selectedCvId, setSelectedCvId] = useState<string | null>(null);

  const [form, setForm] = useState({ target_role: "", target_industry: "", target_date: "", notes: "" });
  const [newItem, setNewItem] = useState({ title: "", description: "", due_date: "" });
  const [showAddItem, setShowAddItem] = useState(false);

  // Inline editing
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState("");
  const editInputRef = useRef<HTMLInputElement>(null);

  // Drag-to-reorder
  const dragIndex = useRef<number | null>(null);

  // Completion celebration
  const [recentlyDone, setRecentlyDone] = useState<Set<string>>(new Set());

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const [goalRes, roadmapRes, skillsRes, cvsRes] = await Promise.all([
          careerService.getGoal(),
          careerService.getRoadmap(),
          skillService.getUserSkills(),
          cvService.listCVs(),
        ]);
        const g = goalRes.data.data;
        setGoal(g);
        if (g) {
          setForm({ target_role: g.target_role, target_industry: g.target_industry ?? "", target_date: g.target_date ?? "", notes: g.notes ?? "" });
          setSelectedSkills(new Set((g.skills_snapshot ?? []).map((s) => s.skill_id)));
          setSelectedCvId(g.cv_id ?? null);
        }
        setRoadmap(roadmapRes.data.data ?? []);
        setUserSkills(skillsRes.data.data ?? []);
        setCvs(cvsRes.data.data ?? []);
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
      const skills_snapshot: GoalSkillSnapshot[] = userSkills
        .filter((us) => selectedSkills.has(us.skill_id))
        .map((us) => ({ skill_id: us.skill_id, name: us.skills?.name ?? us.skill_id, proficiency_label: us.proficiency_label }));
      const res = await careerService.upsertGoal({
        target_role:     form.target_role,
        target_industry: form.target_industry || undefined,
        target_date:     form.target_date     || undefined,
        notes:           form.notes           || undefined,
        skills_snapshot: skills_snapshot.length ? skills_snapshot : undefined,
        cv_id:           selectedCvId,
      });
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
      if (status === "done") {
        setRecentlyDone((prev) => new Set(prev).add(id));
        setTimeout(() => setRecentlyDone((prev) => { const s = new Set(prev); s.delete(id); return s; }), 1200);
      }
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

  function startEditing(item: RoadmapItem) {
    setEditingId(item.id);
    setEditingTitle(item.title);
    setTimeout(() => editInputRef.current?.focus(), 0);
  }

  async function commitEdit(id: string) {
    const title = editingTitle.trim();
    if (!title) { setEditingId(null); return; }
    setEditingId(null);
    try {
      const res = await careerService.updateRoadmapItem(id, { title });
      setRoadmap((prev) => prev.map((r) => r.id === id ? { ...r, ...res.data.data } : r));
    } catch {
      toast.error("Failed to save title");
    }
  }

  function handleDragStart(index: number) {
    dragIndex.current = index;
  }

  function handleDragOver(e: React.DragEvent, index: number) {
    e.preventDefault();
    if (dragIndex.current === null || dragIndex.current === index) return;
    setRoadmap((prev) => {
      const next = [...prev];
      const [moved] = next.splice(dragIndex.current!, 1);
      next.splice(index, 0, moved);
      dragIndex.current = index;
      return next;
    });
  }

  async function handleDragEnd() {
    dragIndex.current = null;
    // Persist new order_index for all items
    const updates = roadmap.map((item, i) =>
      item.order_index !== i ? careerService.updateRoadmapItem(item.id, { order_index: i }) : null
    ).filter(Boolean);
    if (updates.length) {
      try {
        await Promise.all(updates);
        setRoadmap((prev) => prev.map((item, i) => ({ ...item, order_index: i })));
      } catch {
        toast.error("Failed to save order");
      }
    }
  }

  const done = roadmap.filter((r) => r.status === "done").length;

  return (
    <div style={{ maxWidth: 960, margin: "0 auto" }}>
      <style>{`
        @keyframes piq-done-pop {
          0%   { opacity: 0; transform: scale(0.5); }
          60%  { opacity: 1; transform: scale(1.15); }
          100% { opacity: 1; transform: scale(1); }
        }
        .piq-done-badge {
          animation: piq-done-pop 0.35s ease forwards;
        }
        @keyframes piq-done-fade {
          0%   { opacity: 1; }
          100% { opacity: 0; }
        }
        .piq-done-badge-fade {
          animation: piq-done-fade 0.4s ease 0.8s forwards;
        }
        [draggable=true] { cursor: grab; }
        [draggable=true]:active { cursor: grabbing; }
        .piq-roadmap-item-edit { outline: none; }
      `}</style>
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
            <div style={{ maxWidth: 640 }}>
              {goal && !editGoal ? (
                <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                  {/* Summary card */}
                  <div style={{ background: "var(--surf2)", borderRadius: "var(--radius)", padding: 24, border: "1px solid var(--border)" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 }}>
                      <div>
                        <div style={{ fontWeight: 700, fontSize: 20 }}>{goal.target_role}</div>
                        {goal.target_industry && <div style={{ fontSize: 13, color: "var(--text2)", marginTop: 2 }}>{goal.target_industry}</div>}
                      </div>
                      <PiqBtn variant="secondary" size="sm" onClick={() => setEditGoal(true)}>Edit</PiqBtn>
                    </div>
                    <div style={{ display: "flex", gap: 24, flexWrap: "wrap" }}>
                      {goal.target_date && <Field label="Target Date" value={new Date(goal.target_date).toLocaleDateString()} />}
                      {goal.notes && <Field label="Notes" value={goal.notes} />}
                    </div>
                    {/* Attached CV */}
                    {goal.cv_id && (() => { const cv = cvs.find((c) => c.id === goal.cv_id); return cv ? (
                      <div style={{ marginTop: 14, padding: "8px 12px", background: "var(--surf3)", borderRadius: "var(--radius)", border: "1px solid var(--border2)", display: "flex", alignItems: "center", gap: 8 }}>
                        <span style={{ fontSize: 16 }}>📄</span>
                        <span style={{ fontSize: 13, color: "var(--text2)" }}>Attached CV:</span>
                        <span style={{ fontSize: 13, fontWeight: 600 }}>{cv.title}</span>
                        {cv.ats_score != null && <span style={{ fontSize: 11, marginLeft: "auto", color: "var(--teal)" }}>ATS {cv.ats_score}%</span>}
                      </div>
                    ) : null; })()}
                    {/* Skills snapshot */}
                    {goal.skills_snapshot && goal.skills_snapshot.length > 0 && (
                      <div style={{ marginTop: 14 }}>
                        <div style={{ fontSize: 12, color: "var(--text2)", marginBottom: 6 }}>Skills attached to this goal</div>
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                          {goal.skills_snapshot.map((s) => (
                            <span key={s.skill_id} style={{ fontSize: 12, padding: "3px 10px", borderRadius: 12, background: "var(--accentD)", color: "var(--accent)", fontWeight: 500 }}>
                              {s.name} · {s.proficiency_label}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                    <div style={{ marginTop: 20 }}>
                      <PiqBtn onClick={() => setStep("Career Path")}>Generate Career Path →</PiqBtn>
                    </div>
                  </div>
                </div>
              ) : (
                <div style={{ background: "var(--surf2)", borderRadius: "var(--radius)", padding: 24, border: "1px solid var(--border)" }}>
                  <div style={{ fontWeight: 600, fontSize: 16, marginBottom: 20 }}>{goal ? "Edit Goal" : "Set Your Career Goal"}</div>

                  {/* Basic fields */}
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
                    <textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={2} style={{ ...inputStyle, resize: "vertical" }} placeholder="Any notes or aspirations…" />
                  </FormRow>

                  {/* CV selector */}
                  <FormRow label="Attach a CV">
                    {cvs.length === 0 ? (
                      <p style={{ fontSize: 13, color: "var(--text3)", margin: 0 }}>No CVs found — upload one in the CV section first.</p>
                    ) : (
                      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                        <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "var(--text2)", cursor: "pointer" }}>
                          <input type="radio" name="cv_select" checked={selectedCvId === null} onChange={() => setSelectedCvId(null)} />
                          None
                        </label>
                        {cvs.map((cv) => (
                          <label key={cv.id} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, cursor: "pointer", padding: "6px 10px", borderRadius: "var(--radius)", background: selectedCvId === cv.id ? "var(--accentD)" : "transparent", border: `1px solid ${selectedCvId === cv.id ? "var(--accent)" : "var(--border2)"}` }}>
                            <input type="radio" name="cv_select" checked={selectedCvId === cv.id} onChange={() => setSelectedCvId(cv.id)} style={{ accentColor: "var(--accent)" }} />
                            <span style={{ flex: 1, fontWeight: selectedCvId === cv.id ? 600 : 400 }}>{cv.title}</span>
                            {cv.ats_score != null && <span style={{ fontSize: 11, color: "var(--teal)" }}>ATS {cv.ats_score}%</span>}
                          </label>
                        ))}
                      </div>
                    )}
                  </FormRow>

                  {/* Skills picker */}
                  <FormRow label={`Select Skills from Your Profile${selectedSkills.size ? ` (${selectedSkills.size} selected)` : ""}`}>
                    {userSkills.length === 0 ? (
                      <p style={{ fontSize: 13, color: "var(--text3)", margin: 0 }}>No skills found — add skills in the Skills section first.</p>
                    ) : (
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, maxHeight: 180, overflowY: "auto", padding: 4 }}>
                        {userSkills.map((us) => {
                          const selected = selectedSkills.has(us.skill_id);
                          return (
                            <button
                              key={us.skill_id}
                              type="button"
                              onClick={() => setSelectedSkills((prev) => {
                                const next = new Set(prev);
                                selected ? next.delete(us.skill_id) : next.add(us.skill_id);
                                return next;
                              })}
                              style={{
                                padding: "4px 12px", borderRadius: 12, fontSize: 12, cursor: "pointer", border: "1px solid",
                                borderColor: selected ? "var(--accent)" : "var(--border2)",
                                background:  selected ? "var(--accentD)" : "var(--surf3)",
                                color:       selected ? "var(--accent)"  : "var(--text2)",
                                fontWeight:  selected ? 600 : 400,
                                display: "flex", alignItems: "center", gap: 4,
                              }}
                            >
                              {us.skills?.name ?? us.skill_id}
                              {us.github_verified && <span title="GitHub verified" style={{ fontSize: 10 }}>✓</span>}
                              <span style={{ opacity: 0.6 }}>· {us.proficiency_label}</span>
                            </button>
                          );
                        })}
                      </div>
                    )}
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
                  {roadmap.map((item, index) => (
                    <div
                      key={item.id}
                      draggable
                      onDragStart={() => handleDragStart(index)}
                      onDragOver={(e) => handleDragOver(e, index)}
                      onDragEnd={handleDragEnd}
                      style={{ background: "var(--surf2)", borderRadius: "var(--radius)", padding: 16, border: "1px solid var(--border)", display: "flex", gap: 12, alignItems: "flex-start", userSelect: "none" }}
                    >
                      {/* Drag handle */}
                      <div style={{ color: "var(--text3)", fontSize: 16, paddingTop: 2, cursor: "grab", flexShrink: 0 }} title="Drag to reorder">⠿</div>

                      <div style={{ flex: 1, minWidth: 0 }}>
                        {editingId === item.id ? (
                          <input
                            ref={editInputRef}
                            className="piq-roadmap-item-edit"
                            value={editingTitle}
                            onChange={(e) => setEditingTitle(e.target.value)}
                            onBlur={() => commitEdit(item.id)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") commitEdit(item.id);
                              if (e.key === "Escape") setEditingId(null);
                            }}
                            style={{ ...inputStyle, fontWeight: 600, padding: "2px 6px", width: "100%" }}
                          />
                        ) : (
                          <div
                            onClick={() => startEditing(item)}
                            title="Click to edit"
                            style={{ fontWeight: item.status === "done" ? 400 : 600, textDecoration: item.status === "done" ? "line-through" : "none", color: item.status === "done" ? "var(--text2)" : "var(--text)", cursor: "text", display: "flex", alignItems: "center", gap: 6 }}
                          >
                            {item.title}
                            {recentlyDone.has(item.id) && (
                              <span className="piq-done-badge piq-done-badge-fade" style={{ fontSize: 11, background: "var(--teal)", color: "#fff", borderRadius: 10, padding: "1px 7px", fontWeight: 600, flexShrink: 0 }}>✓ Done!</span>
                            )}
                          </div>
                        )}
                        {item.description && <div style={{ fontSize: 13, color: "var(--text2)", marginTop: 2 }}>{item.description}</div>}
                        {item.due_date && <div style={{ fontSize: 12, color: "var(--text3)", marginTop: 4 }}>Due: {new Date(item.due_date).toLocaleDateString()}</div>}
                      </div>
                      <select value={item.status} onChange={(e) => handleStatusChange(item.id, e.target.value as any)}
                        style={{ fontSize: 12, padding: "4px 8px", borderRadius: "var(--radius)", border: `1px solid ${STATUS_COLORS[item.status]}`, background: "var(--surf)", color: STATUS_COLORS[item.status], cursor: "pointer", flexShrink: 0 }}>
                        <option value="pending">Pending</option>
                        <option value="in_progress">In Progress</option>
                        <option value="done">Done</option>
                      </select>
                      <button onClick={() => handleDeleteItem(item.id)} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text3)", fontSize: 18, flexShrink: 0 }}>×</button>
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
