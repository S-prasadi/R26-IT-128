"use client";

import { useState, useEffect, useRef } from "react";
import { toast } from "sonner";
import { PiqBtn, PiqSpinner, PiqStatCard } from "@/components/piq/primitives";
import { PageHeader } from "@/components/common/PageHeader";
import { careerService } from "@/services/career.service";
import { skillService } from "@/services/skill.service";
import { cvService } from "@/services/cv.service";
import type { CareerGoal, GoalSkillSnapshot, RoadmapItem, CareerPrediction, CareerPredictionSnapshot, CareerPath, CareerGraphNode, SkillInsight, UserSkill, CV, ModelStatus } from "@/types";
import CareerFlowGraph from "./CareerFlowGraph";
import { BarChart, Bar, LineChart, Line, RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { PiqChartContainer, PiqTooltip, PIQ_COLORS } from "@/components/piq/charts";

const STEPS = ["Career Goal", "Career Path", "Roadmap"] as const;
type Step = (typeof STEPS)[number];

const STATUS_COLORS: Record<string, string> = {
  pending:     "var(--text2)",
  in_progress: "var(--amber)",
  done:        "var(--teal)",
};

// ─── Node Tree Component ────────────────────────────────────────────────────

function readinessColor(score: number | undefined) {
  if (score === undefined) return "var(--surf3)";
  if (score >= 0.7) return "#14b8a6";
  if (score >= 0.4) return "#f59e0b";
  return "#f43f5e";
}

// ─── Gap-skill market badge ───────────────────────────────────────────────

const VELOCITY_META: Record<SkillInsight["velocity"], { arrow: string; color: string; label: string }> = {
  rising:  { arrow: "▲", color: "#10b981", label: "rising" },
  stable:  { arrow: "▬", color: "#f59e0b", label: "stable" },
  falling: { arrow: "▼", color: "#ef4444", label: "falling" },
  unknown: { arrow: "•", color: "var(--text3)", label: "no data" },
};

function SkillInsightChip({ insight }: { insight: SkillInsight }) {
  const meta = VELOCITY_META[insight.velocity];
  return (
    <div style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "6px 10px", borderRadius: 999, border: "1px solid var(--border)", background: "var(--surf2)", fontSize: 12 }}>
      <span style={{ fontWeight: 600 }}>{insight.skill}</span>
      <span style={{ color: meta.color, fontWeight: 600 }}>
        {meta.arrow} {meta.label}
        {insight.velocity !== "unknown" && insight.change_pct !== 0 ? ` ${insight.change_pct > 0 ? "+" : ""}${insight.change_pct}%` : ""}
      </span>
      {insight.early_warning ? (
        <span title="Expected to spike in the local market" style={{ color: "var(--accent)", fontWeight: 600 }}>⚡ ~{insight.early_warning}w</span>
      ) : null}
    </div>
  );
}

// ─── Step-by-step path breakdown ──────────────────────────────────────────
// Surfaces the per-step detail the model already returns: time-to-reach
// (timeframe_months), gate skills (skill_gaps), readiness, and the per-role
// market trend (from the graph nodes), as a readable list alongside the graph.

function CareerStepList({ prediction, paths, goal = false }: { prediction: CareerPrediction; paths?: CareerPath[]; goal?: boolean }) {
  const marketByRole = new Map((prediction.graph_nodes ?? []).map((n) => [n.label, n.meta?.market]));
  const readyByRole  = new Map((prediction.graph_nodes ?? []).map((n) => [n.label, n.meta?.readiness]));
  const list = paths ?? prediction.paths;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {list.map((p, pi) => {
        const steps = p.career_steps ?? [];
        const current = steps[0] ?? "Current";
        const target = steps[steps.length - 1] ?? "?";
        const confPct = Math.round((p.confidence_relative ?? p.probability) * 100);
        return (
          <div key={p.id ?? pi} style={{ background: "var(--surf)", borderRadius: "var(--radius)", padding: 16, border: goal ? "1px solid #f59e0b66" : "1px solid var(--border)" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 12 }}>
              <div style={{ fontWeight: 700, fontSize: 14 }}>{goal ? <>🎯 Goal · {target}</> : <>Path {pi + 1} · {target}</>}</div>
              <span style={{ fontSize: 12, color: "var(--text2)", whiteSpace: "nowrap" }}>{goal ? `skills point here ${confPct}%` : `${confPct}% confidence`}</span>
            </div>

            {/* Starting point */}
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
              <span style={{ width: 10, height: 10, borderRadius: "50%", background: "var(--text3)", flexShrink: 0 }} />
              <span style={{ fontSize: 13 }}><span style={{ color: "var(--text3)" }}>You are here · </span><b>{current}</b></span>
            </div>

            {(p.transitions ?? []).map((t, i) => {
              const isFinal = i === (p.transitions?.length ?? 0) - 1;
              const ready = isFinal ? p.readiness_score : readyByRole.get(t.role);
              const rc = readinessColor(ready);
              const market = marketByRole.get(t.role);
              const vm = market ? VELOCITY_META[market.velocity] : null;
              return (
                <div key={i} style={{ display: "flex", gap: 10, paddingLeft: 4, marginBottom: 8 }}>
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "center", flexShrink: 0 }}>
                    <span style={{ color: "var(--text3)", fontSize: 14, lineHeight: 1 }}>↓</span>
                    <span style={{ width: 10, height: 10, borderRadius: "50%", background: isFinal ? rc : "var(--accent)" }} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                      <b style={{ fontSize: 13 }}>{t.role}</b>
                      <span style={{ fontSize: 11, color: "var(--text2)" }}>~{t.timeframe_months} months to reach</span>
                      {ready != null && (
                        <span style={{ fontSize: 11, fontWeight: 600, color: rc }}>{Math.round(ready * 100)}% ready</span>
                      )}
                      {vm && market!.velocity !== "unknown" && (
                        <span style={{ fontSize: 11, fontWeight: 600, color: vm.color }}>
                          {vm.arrow} {vm.label}{market!.demand_index ? ` · index ${market!.demand_index}` : ""}
                        </span>
                      )}
                    </div>
                    {(t.skill_gaps?.length ?? 0) > 0 && (
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 5 }}>
                        <span style={{ fontSize: 10, color: "var(--text3)", marginRight: 2 }}>Skills to unlock:</span>
                        {t.skill_gaps.map((s) => (
                          <span key={s} style={{ fontSize: 10, padding: "2px 7px", borderRadius: 10, background: "var(--surf2)", border: "1px solid var(--border)", color: "var(--text2)" }}>{s}</span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}

// ─── Main Page ──────────────────────────────────────────────────────────────

export default function CareerPage() {
  const [step, setStep]           = useState<Step>("Career Goal");
  const [goal, setGoal]           = useState<CareerGoal | null>(null);
  const [roadmap, setRoadmap]     = useState<RoadmapItem[]>([]);
  const [prediction, setPrediction] = useState<CareerPrediction | null>(null);
  const [history, setHistory]     = useState<CareerPredictionSnapshot[]>([]);
  const [userSkills, setUserSkills] = useState<UserSkill[]>([]);
  const [loading, setLoading]     = useState(true);
  const [saving, setSaving]       = useState(false);
  const [predicting, setPredicting] = useState(false);
  const [generatingRoadmap, setGeneratingRoadmap] = useState(false);

  // Interactive graph + what-if simulator
  const [selectedNode, setSelectedNode] = useState<CareerGraphNode | null>(null);
  const [whatIfSkills, setWhatIfSkills] = useState<string[]>([]);
  const [whatIfAdd, setWhatIfAdd] = useState("");
  const [simulating, setSimulating] = useState(false);
  const [simResult, setSimResult] = useState<CareerPrediction | null>(null);
  const [editGoal, setEditGoal]   = useState(false);

  const [cvs, setCvs] = useState<CV[]>([]);
  const [selectedSkills, setSelectedSkills] = useState<Set<string>>(new Set());
  const [selectedCvId, setSelectedCvId] = useState<string | null>(null);

  const [form, setForm] = useState({ target_role: "", target_industry: "", target_date: "", notes: "" });
  const [newItem, setNewItem] = useState({ title: "", description: "", due_date: "" });
  const [showAddItem, setShowAddItem] = useState(false);
  const [currentRole, setCurrentRole] = useState("");
  const [expMonths, setExpMonths] = useState(0);
  const [numProjects, setNumProjects] = useState(0);

  // Skills the user feeds the model for a prediction (pre-filled from tracked
  // skills, but fully editable — mirrors the model's own demo UI).
  const [predictSkills, setPredictSkills] = useState<string[]>([]);
  const [predictSkillInput, setPredictSkillInput] = useState("");

  // Career model health — drives the online/offline badge + pauses predictions.
  const [modelStatus, setModelStatus] = useState<ModelStatus | null>(null);

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
        const [goalRes, roadmapRes, skillsRes, cvsRes, historyRes] = await Promise.all([
          careerService.getGoal(),
          careerService.getRoadmap(),
          skillService.getUserSkills(),
          cvService.listCVs(),
          careerService.getPredictions(),
        ]);
        const g = goalRes.data.data;
        setGoal(g);
        if (g) {
          setForm({ target_role: g.target_role, target_industry: g.target_industry ?? "", target_date: g.target_date ?? "", notes: g.notes ?? "" });
          setSelectedSkills(new Set((g.skills_snapshot ?? []).map((s) => s.skill_id)));
          setSelectedCvId(g.cv_id ?? null);
        }
        setRoadmap(roadmapRes.data.data ?? []);
        const us = skillsRes.data.data ?? [];
        setUserSkills(us);
        const trackedNames = us.map((u) => u.skills?.name ?? "").filter(Boolean);
        setWhatIfSkills(trackedNames);
        setPredictSkills(trackedNames);
        setCvs(cvsRes.data.data ?? []);
        setHistory(historyRes.data.data ?? []);
        // Model health is non-critical to the page load — fetch best-effort.
        careerService.getModelStatus()
          .then((r) => setModelStatus(r.data.data))
          .catch(() => setModelStatus({ module_b: { online: false }, module_a: { online: false } }));
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
    if (predictSkills.length === 0) { toast.error("Add at least one skill to predict your path"); return; }
    setPredicting(true);
    try {
      const res = await careerService.predictPath({
        current_role:      currentRole.trim() || "Student",
        experience_months: expMonths,
        num_projects:      numProjects,
        skills:            predictSkills,
      });
      setPrediction(res.data.data);
      setSimResult(null);
      // Reset the what-if simulator to the same skill set this prediction used.
      setWhatIfSkills(predictSkills);
      toast.success("Career path generated");
      try {
        const h = await careerService.getPredictions();
        setHistory(h.data.data ?? []);
      } catch { /* history is non-critical */ }
    } catch (err) {
      // 503 = career model offline — reflect it in the badge and pause predictions.
      if ((err as { response?: { status?: number } })?.response?.status === 503) {
        setModelStatus((s) => ({ module_a: s?.module_a ?? { online: false }, module_b: { ...(s?.module_b ?? {}), online: false } }));
        toast.error("The career model is offline — predictions are paused");
      } else {
        toast.error("Failed to generate path");
      }
    } finally {
      setPredicting(false);
    }
  }

  async function handleGenerateRoadmap() {
    const pathId = prediction?.paths[0]?.id;
    if (!pathId) return;
    setGeneratingRoadmap(true);
    try {
      const res = await careerService.generateRoadmap(pathId);
      const created = res.data.data.created;
      if (created > 0) {
        const r = await careerService.getRoadmap();
        setRoadmap(r.data.data ?? []);
        toast.success(`Added ${created} skill${created === 1 ? "" : "s"} to your roadmap`);
        setStep("Roadmap");
      } else {
        toast.success("Roadmap already covers these skills");
      }
    } catch {
      toast.error("Failed to generate roadmap");
    } finally {
      setGeneratingRoadmap(false);
    }
  }

  async function handleSimulate() {
    setSimulating(true);
    try {
      // The what-if chip list *is* the simulated skill set — send it directly as
      // the explicit base (not persisted). Delta vs `prediction` is shown below.
      const res = await careerService.predictPath({
        current_role: currentRole.trim() || "Student",
        experience_months: expMonths,
        num_projects: numProjects,
        skills: whatIfSkills,
        simulate: true,
      });
      setSimResult(res.data.data);
      toast.success("Simulation ready");
    } catch (err) {
      if ((err as { response?: { status?: number } })?.response?.status === 503) {
        toast.error("The career model is offline — simulation paused");
      } else {
        toast.error("Simulation failed");
      }
    } finally {
      setSimulating(false);
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

  // Real proficiency (1–5 → 0–100) for the skill-gap radar; matched-via-CV
  // skills the user hasn't explicitly rated fall back to a moderate value.
  const profPct = (skill: string): number => {
    const lvl = userSkills.find((u) => (u.skills?.name ?? "").toLowerCase() === skill.toLowerCase())?.proficiency_level;
    return lvl ? lvl * 20 : 60;
  };

  return (
    <div style={{ maxWidth: 960, margin: "0 auto" }}>
      <style>{`
        @keyframes piq-done-pop {
          0%   { opacity: 0; transform: scale(0.5); }
          60%  { opacity: 1; transform: scale(1.15); }
          100% { opacity: 1; transform: scale(1); }
        }
        .piq-done-badge { animation: piq-done-pop 0.35s ease forwards; }
        @keyframes piq-done-fade {
          0%   { opacity: 1; }
          100% { opacity: 0; }
        }
        .piq-done-badge-fade { animation: piq-done-fade 0.4s ease 0.8s forwards; }
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
                    {goal.cv_id && (() => { const cv = cvs.find((c) => c.id === goal.cv_id); return cv ? (
                      <div style={{ marginTop: 14, padding: "8px 12px", background: "var(--surf3)", borderRadius: "var(--radius)", border: "1px solid var(--border2)", display: "flex", alignItems: "center", gap: 8 }}>
                        <span style={{ fontSize: 16 }}>📄</span>
                        <span style={{ fontSize: 13, color: "var(--text2)" }}>Attached CV:</span>
                        <span style={{ fontSize: 13, fontWeight: 600 }}>{cv.title}</span>
                        {cv.ats_score != null && <span style={{ fontSize: 11, marginLeft: "auto", color: "var(--teal)" }}>ATS {cv.ats_score}%</span>}
                      </div>
                    ) : null; })()}
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
              {/* Prediction inputs */}
              <div style={{ background: "var(--surf2)", borderRadius: "var(--radius)", padding: 16, border: "1px solid var(--border)", marginBottom: 20 }}>
                {/* Header + model status badge */}
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
                  <div style={{ fontWeight: 600, fontSize: 14 }}>Predict your career path</div>
                  {modelStatus && (
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 11, padding: "4px 9px", borderRadius: 999, border: "1px solid var(--border)", background: "var(--surf)", color: "var(--text2)" }}>
                      <span style={{ width: 7, height: 7, borderRadius: "50%", background: modelStatus.module_b.online ? "var(--teal)" : "#ef4444" }} />
                      {modelStatus.module_b.online
                        ? `Model online${modelStatus.module_b.best_model ? ` · ${modelStatus.module_b.best_model}` : ""}${modelStatus.module_b.num_roles ? ` · ${modelStatus.module_b.num_roles} roles` : ""}`
                        : "Model offline"}
                    </span>
                  )}
                </div>

                {/* Offline banner */}
                {modelStatus?.module_b.online === false && (
                  <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 12px", borderRadius: "var(--radius)", background: "#ef444415", border: "1px solid #ef444455", color: "#ef4444", fontSize: 13, marginBottom: 14 }}>
                    <span style={{ fontSize: 15 }}>⚠️</span>
                    <span>The career model is offline — predictions are paused. Start Module B (port 8002) and reload.</span>
                  </div>
                )}

                {/* Skills tag-box (fed to the model, pre-filled from your tracked skills) */}
                <div style={{ marginBottom: 14 }}>
                  <label style={{ fontSize: 12, color: "var(--text2)", display: "block", marginBottom: 4 }}>
                    Skills <span style={{ color: "var(--text3)" }}>· edit the list the model uses to predict</span>
                  </label>
                  <div
                    onClick={() => document.getElementById("predict-skill-input")?.focus()}
                    style={{ minHeight: 44, display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center", padding: 8, borderRadius: "var(--radius)", border: "1px solid var(--border2)", background: "var(--surf3)", cursor: "text" }}
                  >
                    {predictSkills.map((s) => (
                      <span key={s} style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "3px 8px", borderRadius: 999, background: "var(--accentD)", color: "var(--accent)", fontSize: 12, fontWeight: 500 }}>
                        {s}
                        <button onClick={(e) => { e.stopPropagation(); setPredictSkills((prev) => prev.filter((x) => x !== s)); }} style={{ border: "none", background: "transparent", cursor: "pointer", color: "var(--accent)", fontSize: 13, lineHeight: 1, padding: 0 }}>✕</button>
                      </span>
                    ))}
                    <input
                      id="predict-skill-input"
                      value={predictSkillInput}
                      onChange={(e) => setPredictSkillInput(e.target.value)}
                      onKeyDown={(e) => {
                        const v = predictSkillInput.trim();
                        if ((e.key === "Enter" || e.key === ",") && v) {
                          e.preventDefault();
                          setPredictSkills((prev) => prev.some((x) => x.toLowerCase() === v.toLowerCase()) ? prev : [...prev, v]);
                          setPredictSkillInput("");
                        } else if (e.key === "Backspace" && !predictSkillInput && predictSkills.length) {
                          setPredictSkills((prev) => prev.slice(0, -1));
                        }
                      }}
                      placeholder={predictSkills.length ? "Add a skill…" : "Type a skill and press Enter (e.g. react, python, docker)…"}
                      style={{ flex: "1 1 160px", minWidth: 140, border: "none", outline: "none", background: "transparent", color: "var(--text)", fontSize: 13 }}
                    />
                  </div>
                </div>

                {/* Role / experience / projects / predict */}
                <div style={{ display: "flex", gap: 16, flexWrap: "wrap", alignItems: "flex-end" }}>
                  <div style={{ flex: "1 1 200px" }}>
                    <label style={{ fontSize: 12, color: "var(--text2)", display: "block", marginBottom: 4 }}>Your Current Role</label>
                    <input
                      value={currentRole}
                      onChange={(e) => setCurrentRole(e.target.value)}
                      placeholder="e.g. Student, Junior Developer…"
                      style={inputStyle}
                    />
                  </div>
                  <div style={{ flex: "0 1 140px" }}>
                    <label style={{ fontSize: 12, color: "var(--text2)", display: "block", marginBottom: 4 }}>Experience (months)</label>
                    <input
                      type="number"
                      min={0}
                      max={600}
                      value={expMonths}
                      onChange={(e) => setExpMonths(Number(e.target.value))}
                      style={inputStyle}
                    />
                  </div>
                  <div style={{ flex: "0 1 120px" }}>
                    <label style={{ fontSize: 12, color: "var(--text2)", display: "block", marginBottom: 4 }}>Projects</label>
                    <input
                      type="number"
                      min={0}
                      max={50}
                      value={numProjects}
                      onChange={(e) => setNumProjects(Number(e.target.value))}
                      style={inputStyle}
                    />
                  </div>
                  <PiqBtn onClick={handlePredict} disabled={predicting || modelStatus?.module_b.online === false}>
                    {predicting ? "Analysing 347 IT roles…" : "Generate My Path"}
                  </PiqBtn>
                </div>
              </div>

              {history.length > 0 && (
                <div style={{ background: "var(--surf2)", borderRadius: "var(--radius)", padding: "12px 16px", border: "1px solid var(--border)", marginBottom: 20 }}>
                  <div style={{ fontSize: 12, color: "var(--text2)", marginBottom: 8 }}>Your prediction history — track how your readiness changes over time</div>
                  {history.length > 1 && (
                    <div style={{ height: 120, marginBottom: 10 }}>
                      <ResponsiveContainer width="100%" height="100%" minHeight={100}>
                        <LineChart
                          data={[...history].reverse().map((h) => ({
                            date: new Date(h.created_at).toLocaleDateString(undefined, { month: "short", day: "numeric" }),
                            readiness: h.top_readiness != null ? Math.round(h.top_readiness * 100) : 0,
                          }))}
                          margin={{ top: 4, right: 8, left: -20, bottom: 0 }}
                        >
                          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                          <XAxis dataKey="date" tick={{ fontSize: 11, fill: "var(--text3)" }} axisLine={false} tickLine={false} />
                          <YAxis unit="%" domain={[0, 100]} tick={{ fontSize: 11, fill: "var(--text3)" }} axisLine={false} tickLine={false} />
                          <Tooltip content={<PiqTooltip />} />
                          <Line type="monotone" dataKey="readiness" name="Top-path readiness %" stroke={PIQ_COLORS.teal} strokeWidth={2} dot={{ r: 3 }} />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  )}
                  <div style={{ display: "flex", gap: 10, overflowX: "auto", paddingBottom: 4 }}>
                    {history.map((h) => (
                      <div key={h.id} style={{ flex: "0 0 auto", minWidth: 150, padding: "8px 12px", borderRadius: 10, border: "1px solid var(--border)", background: "var(--surf)" }}>
                        <div style={{ fontSize: 11, color: "var(--text3)" }}>{new Date(h.created_at).toLocaleDateString()}</div>
                        <div style={{ fontSize: 13, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: 160 }}>{h.top_target_role ?? "—"}</div>
                        <div style={{ fontSize: 12, color: "var(--teal)" }}>
                          readiness {h.top_readiness != null ? Math.round(h.top_readiness * 100) : "—"}%
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {predicting && <div style={{ display: "flex", justifyContent: "center", padding: 48 }}><PiqSpinner /></div>}

              {prediction && !predicting && (
                <div>
                  {/* Interactive career graph */}
                  <div style={{ background: "var(--surf2)", borderRadius: "var(--radius)", padding: 20, border: "1px solid var(--border)", marginBottom: 20 }}>
                    <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 4 }}>Career Journey Map</div>
                    <div style={{ fontSize: 12, color: "var(--text2)", marginBottom: 16 }}>
                      {prediction.paths.length} predicted paths · drag to pan, scroll to zoom · <b>click a role</b> for skills & market · node colour = readiness
                    </div>
                    <CareerFlowGraph prediction={prediction} onSelect={setSelectedNode} />
                  </div>

                  {/* Path to your goal */}
                  {prediction.goal_path && (
                    <div style={{ background: "var(--surf2)", borderRadius: "var(--radius)", padding: 20, border: "1px solid #f59e0b44", marginBottom: 20 }}>
                      <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 4 }}>🎯 Path to your goal{goal?.target_role ? ` · ${goal.target_role}` : ""}</div>
                      <div style={{ fontSize: 12, color: "var(--text2)", marginBottom: 16 }}>
                        Your skills-predicted paths above may not end at the goal you set — this is the route that does, with the skills to close the gap.
                      </div>
                      <CareerStepList prediction={prediction} paths={[prediction.goal_path]} goal />
                    </div>
                  )}

                  {/* Step-by-step breakdown */}
                  <div style={{ background: "var(--surf2)", borderRadius: "var(--radius)", padding: 20, border: "1px solid var(--border)", marginBottom: 20 }}>
                    <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 4 }}>Step-by-step path</div>
                    <div style={{ fontSize: 12, color: "var(--text2)", marginBottom: 16 }}>
                      Each step shows time-to-reach, the skills that unlock it, readiness, and the role's live market trend.
                    </div>
                    <CareerStepList prediction={prediction} />
                  </div>

                  {/* What-if simulator */}
                  <div style={{ background: "var(--surf2)", borderRadius: "var(--radius)", padding: 20, border: "1px solid var(--border)", marginBottom: 20 }}>
                    <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 4 }}>What-if Simulator</div>
                    <div style={{ fontSize: 12, color: "var(--text2)", marginBottom: 12 }}>
                      Add or remove skills to see how your paths and readiness change — nothing is saved.
                    </div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 10 }}>
                      {whatIfSkills.map((s) => (
                        <span key={s} style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "5px 10px", borderRadius: 999, border: "1px solid var(--border)", background: "var(--surf)", fontSize: 12 }}>
                          {s}
                          <button onClick={() => setWhatIfSkills((prev) => prev.filter((x) => x !== s))} style={{ border: "none", background: "transparent", cursor: "pointer", color: "var(--text3)", fontSize: 13, lineHeight: 1 }}>✕</button>
                        </span>
                      ))}
                    </div>
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                      <input
                        value={whatIfAdd}
                        onChange={(e) => setWhatIfAdd(e.target.value)}
                        onKeyDown={(e) => { if (e.key === "Enter" && whatIfAdd.trim()) { setWhatIfSkills((prev) => Array.from(new Set([...prev, whatIfAdd.trim()]))); setWhatIfAdd(""); } }}
                        placeholder="Add a skill (e.g. tensorflow)…"
                        style={{ ...inputStyle, flex: "1 1 220px" }}
                      />
                      <PiqBtn onClick={handleSimulate} disabled={simulating}>{simulating ? "Simulating…" : "Simulate"}</PiqBtn>
                      {simResult && <PiqBtn variant="secondary" onClick={() => setSimResult(null)}>Reset</PiqBtn>}
                    </div>
                    {simResult && (
                      <div style={{ marginTop: 12, fontSize: 13 }}>
                        {(() => {
                          const base = prediction.paths[0]?.readiness_score ?? 0;
                          const sim = simResult.paths[0]?.readiness_score ?? 0;
                          const delta = Math.round((sim - base) * 100);
                          const baseRoles = new Set(prediction.paths.map((p) => p.career_steps?.[p.career_steps.length - 1]));
                          const unlocked = simResult.paths.map((p) => p.career_steps?.[p.career_steps.length - 1]).filter((r) => r && !baseRoles.has(r));
                          return (
                            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                              <div>Top-path readiness: <b>{Math.round(sim * 100)}%</b> <span style={{ color: delta >= 0 ? "var(--teal)" : "#ef4444", fontWeight: 600 }}>({delta >= 0 ? "+" : ""}{delta} pts)</span></div>
                              {unlocked.length > 0 && <div>Newly surfaced roles: <b>{unlocked.join(", ")}</b></div>}
                            </div>
                          );
                        })()}
                      </div>
                    )}
                  </div>

                  {/* Charts */}
                  <div style={{ marginTop: 24 }}>
                    <PiqChartContainer
                      title="Relative Confidence by Path"
                      subtitle="Share of model confidence across your top predicted paths"
                      height={220}
                    >
                      <ResponsiveContainer width="100%" height="100%" minHeight={180}>
                        <BarChart
                          data={prediction.paths.map((p, i) => ({
                            path:       `Path ${i + 1}`,
                            confidence: Math.round((p.confidence_relative ?? p.probability) * 100),
                            role:       p.career_steps?.[p.career_steps.length - 1] ?? "",
                          }))}
                          margin={{ top: 4, right: 8, left: -16, bottom: 0 }}
                          barSize={40}
                        >
                          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                          <XAxis dataKey="path" tick={{ fontSize: 12, fill: "var(--text3)" }} axisLine={false} tickLine={false} />
                          <YAxis unit="%" domain={[0, 100]} tick={{ fontSize: 11, fill: "var(--text3)" }} axisLine={false} tickLine={false} />
                          <Tooltip content={<PiqTooltip />} cursor={{ fill: "var(--surf2)" }} />
                          <Bar dataKey="confidence" name="Relative confidence %" fill={PIQ_COLORS.teal} radius={[4, 4, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </PiqChartContainer>

                    {prediction.paths[0]?.skills_needed && prediction.paths[0].skills_needed.length > 0 && (
                      <div style={{ marginTop: 16 }}>
                        <PiqChartContainer
                          title="Skill Gap — Top Path"
                          subtitle="Skills you have vs skills needed for your top predicted role"
                          height={280}
                        >
                          <ResponsiveContainer width="100%" height="100%" minHeight={220}>
                            <RadarChart
                              data={[
                                ...(prediction.paths[0].skills_matched ?? []).map((s) => ({ skill: s.length > 14 ? s.slice(0, 13) + "…" : s, current: profPct(s), needed: 100 })),
                                ...(prediction.paths[0].skills_needed ?? []).slice(0, 5).map((s) => ({ skill: s.length > 14 ? s.slice(0, 13) + "…" : s, current: 0, needed: 100 })),
                              ]}
                              margin={{ top: 8, right: 20, left: 20, bottom: 8 }}
                            >
                              <PolarGrid stroke="var(--border)" />
                              <PolarAngleAxis dataKey="skill" tick={{ fontSize: 10, fill: "var(--text3)" }} />
                              <PolarRadiusAxis domain={[0, 100]} tick={false} axisLine={false} />
                              <Radar name="Required" dataKey="needed"  stroke={PIQ_COLORS.teal}   fill={PIQ_COLORS.teal}   fillOpacity={0.15} />
                              <Radar name="Current"  dataKey="current" stroke={PIQ_COLORS.accent} fill={PIQ_COLORS.accent} fillOpacity={0.25} />
                              <Tooltip content={<PiqTooltip />} />
                            </RadarChart>
                          </ResponsiveContainer>
                        </PiqChartContainer>
                      </div>
                    )}
                  </div>

                  {(prediction.paths[0]?.skill_insights?.length ?? 0) > 0 && (
                    <div style={{ marginTop: 16, background: "var(--surf2)", borderRadius: "var(--radius)", padding: 20, border: "1px solid var(--border)" }}>
                      <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 4 }}>Gap Skills — Market Priority</div>
                      <div style={{ fontSize: 12, color: "var(--text2)", marginBottom: 14 }}>
                        Skills to gain for your top path, ranked by market demand (live forecast). Learn the rising ones first.
                      </div>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                        {prediction.paths[0]!.skill_insights!.map((ins) => (
                          <SkillInsightChip key={ins.skill} insight={ins} />
                        ))}
                      </div>
                    </div>
                  )}

                  <div style={{ marginTop: 16, display: "flex", gap: 12, flexWrap: "wrap" }}>
                    <PiqBtn onClick={handleGenerateRoadmap} disabled={generatingRoadmap}>
                      {generatingRoadmap ? "Generating…" : "Generate roadmap from this path"}
                    </PiqBtn>
                    <PiqBtn variant="secondary" onClick={() => setStep("Roadmap")}>View My Roadmap →</PiqBtn>
                  </div>
                </div>
              )}

              {!prediction && !predicting && (
                <div style={{ textAlign: "center", padding: "48px 24px", color: "var(--text2)" }}>
                  <p style={{ fontSize: 14, margin: 0 }}>Enter your current role and click "Generate My Path" to see your predicted career trajectory.</p>
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

      {/* Node detail drawer */}
      {selectedNode && (
        <>
          <div onClick={() => setSelectedNode(null)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.35)", zIndex: 40 }} />
          <div style={{ position: "fixed", top: 0, right: 0, bottom: 0, width: 360, maxWidth: "90vw", background: "var(--surf)", borderLeft: "1px solid var(--border)", zIndex: 41, padding: 20, overflowY: "auto", boxShadow: "-4px 0 16px rgba(0,0,0,0.12)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
              <div>
                <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: 0.5, color: "var(--text3)" }}>{selectedNode.type === "current" ? "You are here" : "Role"}</div>
                <div style={{ fontSize: 18, fontWeight: 700 }}>{selectedNode.label}</div>
              </div>
              <button onClick={() => setSelectedNode(null)} style={{ border: "none", background: "transparent", fontSize: 20, cursor: "pointer", color: "var(--text3)" }}>✕</button>
            </div>

            {selectedNode.meta?.readiness != null && (
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 12, color: "var(--text2)", marginBottom: 4 }}>Readiness</div>
                <div style={{ height: 8, borderRadius: 999, background: "var(--surf2)", overflow: "hidden" }}>
                  <div style={{ width: `${Math.round(selectedNode.meta.readiness * 100)}%`, height: "100%", background: readinessColor(selectedNode.meta.readiness) }} />
                </div>
                <div style={{ fontSize: 12, marginTop: 4, fontWeight: 600 }}>{Math.round(selectedNode.meta.readiness * 100)}% ready{selectedNode.meta.eta_months ? ` · ~${selectedNode.meta.eta_months} months to reach` : ""}</div>
              </div>
            )}

            {(selectedNode.meta?.gate_skills?.length ?? 0) > 0 && (
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>Skills to unlock this role</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {selectedNode.meta!.gate_skills!.map((s) => (
                    <span key={s} style={{ padding: "5px 10px", borderRadius: 999, border: "1px solid var(--border)", background: "var(--surf2)", fontSize: 12 }}>{s}</span>
                  ))}
                </div>
              </div>
            )}

            {selectedNode.meta?.market && (
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>Market signal</div>
                {(() => {
                  const m = selectedNode.meta!.market!;
                  const meta = VELOCITY_META[m.velocity];
                  return (
                    <div style={{ fontSize: 13 }}>
                      <div style={{ marginBottom: 4 }}>
                        Demand trend: <span style={{ color: meta.color, fontWeight: 600 }}>{meta.arrow} {meta.label}</span>
                        {m.demand_index ? <span style={{ color: "var(--text2)" }}> · index {m.demand_index}</span> : null}
                      </div>
                      {m.top_rising.length > 0 && <div style={{ color: "var(--text2)" }}>Rising skills here: <b>{m.top_rising.join(", ")}</b></div>}
                    </div>
                  );
                })()}
              </div>
            )}

            {!selectedNode.meta?.market && !selectedNode.meta?.gate_skills?.length && selectedNode.type !== "current" && (
              <div style={{ fontSize: 13, color: "var(--text2)" }}>No additional market data for this role yet.</div>
            )}
          </div>
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
