"use client";

import { useState, useEffect } from "react";
import { toast } from "sonner";
import { PiqSpinner } from "@/components/piq/primitives";
import { PageHeader } from "@/components/common/PageHeader";
import { progressService } from "@/services/progress.service";
import type { ProgressModule, Milestone } from "@/types";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { PiqChartContainer, PiqTooltip, PIQ_COLORS } from "@/components/piq/charts";

const MODULE_META: Record<string, { label: string; color: string; icon: string }> = {
  skill:     { label: "Skill Forecasting",  color: "var(--amber)",  icon: "📊" },
  career:    { label: "Career Pathway",      color: "var(--teal)",   icon: "🗺️" },
  cv:        { label: "CV & Proficiency",    color: "var(--violet)", icon: "📄" },
  interview: { label: "Interview Simulator", color: "var(--rose)",   icon: "🎙️" },
};

const ACTIVITY_TIMELINE = [
  { week: "W1", skill: 4, career: 2, cv: 1, interview: 0 },
  { week: "W2", skill: 2, career: 3, cv: 5, interview: 1 },
  { week: "W3", skill: 6, career: 1, cv: 2, interview: 3 },
  { week: "W4", skill: 3, career: 4, cv: 3, interview: 2 },
  { week: "W5", skill: 5, career: 2, cv: 7, interview: 4 },
  { week: "W6", skill: 4, career: 5, cv: 4, interview: 2 },
  { week: "W7", skill: 7, career: 3, cv: 2, interview: 5 },
  { week: "W8", skill: 5, career: 4, cv: 6, interview: 3 },
];

export default function ProgressPage() {
  const [modules, setModules]     = useState<ProgressModule[]>([]);
  const [milestones, setMilestones] = useState<Milestone[]>([]);
  const [loading, setLoading]     = useState(true);

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const [modRes, milRes] = await Promise.all([
          progressService.getModuleProgress(),
          progressService.getMilestones(),
        ]);
        setModules(modRes.data.data ?? []);
        setMilestones(milRes.data.data ?? []);
      } catch {
        toast.error("Failed to load progress");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  async function handleAchieve(id: string) {
    try {
      const res = await progressService.achieveMilestone(id);
      setMilestones((prev) => prev.map((m) => m.id === id ? { ...m, ...res.data.data } : m));
      toast.success("Milestone achieved! 🎉");
    } catch {
      toast.error("Failed to update milestone");
    }
  }

  const overall = modules.length > 0 ? Math.round(modules.reduce((s, m) => s + m.completion_pct, 0) / modules.length) : 0;
  const achievedCount = milestones.filter((m) => !!m.achieved_at).length;

  return (
    <div>
      <PageHeader title="Progress Tracker" description="Track your journey across all four PathwayIQ modules" />

      {loading ? (
        <div style={{ display: "flex", justifyContent: "center", padding: 48 }}><PiqSpinner /></div>
      ) : (
        <>
          {/* Overall progress */}
          <div style={{ background: "var(--surf2)", borderRadius: "var(--radius)", padding: 24, border: "1px solid var(--border)", marginBottom: 24, display: "flex", alignItems: "center", gap: 24 }}>
            <div style={{ position: "relative", width: 80, height: 80, flexShrink: 0 }}>
              <svg width="80" height="80" viewBox="0 0 80 80">
                <circle cx="40" cy="40" r="34" fill="none" stroke="var(--surf3)" strokeWidth="8" />
                <circle cx="40" cy="40" r="34" fill="none" stroke="var(--accent)" strokeWidth="8"
                  strokeDasharray={`${2 * Math.PI * 34 * overall / 100} ${2 * Math.PI * 34}`}
                  strokeLinecap="round" transform="rotate(-90 40 40)" />
              </svg>
              <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 16 }}>{overall}%</div>
            </div>
            <div>
              <div style={{ fontWeight: 600, fontSize: 18, marginBottom: 4 }}>Overall Progress</div>
              <div style={{ fontSize: 14, color: "var(--text2)" }}>{achievedCount} of {milestones.length} milestones achieved</div>
            </div>
          </div>

          {/* Module rings */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px,1fr))", gap: 12, marginBottom: 28 }}>
            {modules.map((m) => {
              const meta = MODULE_META[m.module_name] ?? { label: m.module_name, color: "var(--accent)", icon: "📦" };
              const pct  = m.completion_pct;
              const r    = 28;
              const circ = 2 * Math.PI * r;
              return (
                <div key={m.id} style={{ background: "var(--surf2)", borderRadius: "var(--radius)", padding: 16, border: "1px solid var(--border)", display: "flex", alignItems: "center", gap: 14 }}>
                  <div style={{ position: "relative", width: 64, height: 64, flexShrink: 0 }}>
                    <svg width="64" height="64" viewBox="0 0 64 64">
                      <circle cx="32" cy="32" r={r} fill="none" stroke="var(--surf3)" strokeWidth="6" />
                      <circle cx="32" cy="32" r={r} fill="none" stroke={meta.color} strokeWidth="6"
                        strokeDasharray={`${circ * pct / 100} ${circ}`}
                        strokeLinecap="round" transform="rotate(-90 32 32)" />
                    </svg>
                    <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700 }}>{pct}%</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600 }}>{meta.label}</div>
                    {m.last_activity_at && <div style={{ fontSize: 11, color: "var(--text2)", marginTop: 2 }}>Last: {new Date(m.last_activity_at).toLocaleDateString()}</div>}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Milestones */}
          <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text2)", marginBottom: 10, textTransform: "uppercase", letterSpacing: "0.06em" }}>Milestones</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {milestones.map((m) => (
              <div key={m.id} style={{ background: "var(--surf2)", borderRadius: "var(--radius)", padding: 14, border: "1px solid var(--border)", display: "flex", alignItems: "center", gap: 12 }}>
                <div style={{ width: 24, height: 24, borderRadius: "50%", background: m.achieved_at ? "var(--teal)" : "var(--surf3)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, fontSize: 13 }}>
                  {m.achieved_at ? "✓" : "○"}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: m.achieved_at ? 400 : 500, textDecoration: m.achieved_at ? "line-through" : "none", color: m.achieved_at ? "var(--text2)" : "var(--text)" }}>{m.title}</div>
                  {m.description && <div style={{ fontSize: 12, color: "var(--text3)", marginTop: 1 }}>{m.description}</div>}
                </div>
                <div style={{ textAlign: "right" }}>
                  {m.achieved_at ? (
                    <span style={{ fontSize: 12, color: "var(--teal)" }}>{new Date(m.achieved_at).toLocaleDateString()}</span>
                  ) : (
                    <button onClick={() => handleAchieve(m.id)} style={{ fontSize: 12, color: "var(--accent)", background: "none", border: "1px solid var(--accent)", borderRadius: 10, padding: "2px 10px", cursor: "pointer" }}>
                      Mark done
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Activity Timeline AreaChart */}
          <div style={{ marginTop: 28 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text2)", marginBottom: 10, textTransform: "uppercase", letterSpacing: "0.06em" }}>Weekly Activity</div>
            <PiqChartContainer subtitle="Actions per module per week (last 8 weeks)" height={240}>
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={ACTIVITY_TIMELINE} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                  <defs>
                    {([
                      ["gradSkill",    PIQ_COLORS.amber],
                      ["gradCareer",   PIQ_COLORS.teal],
                      ["gradCV",       PIQ_COLORS.violet],
                      ["gradInterview",PIQ_COLORS.rose],
                    ] as const).map(([id, color]) => (
                      <linearGradient key={id} id={id} x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%"  stopColor={color} stopOpacity={0.3} />
                        <stop offset="95%" stopColor={color} stopOpacity={0} />
                      </linearGradient>
                    ))}
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                  <XAxis dataKey="week" tick={{ fontSize: 12, fill: "var(--text3)" }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 12, fill: "var(--text3)" }} axisLine={false} tickLine={false} />
                  <Tooltip content={<PiqTooltip />} />
                  <Area type="monotone" dataKey="skill"     name="Skill"     stroke={PIQ_COLORS.amber}  fill="url(#gradSkill)"     strokeWidth={2} dot={false} stackId="1" />
                  <Area type="monotone" dataKey="career"    name="Career"    stroke={PIQ_COLORS.teal}   fill="url(#gradCareer)"    strokeWidth={2} dot={false} stackId="1" />
                  <Area type="monotone" dataKey="cv"        name="CV"        stroke={PIQ_COLORS.violet} fill="url(#gradCV)"        strokeWidth={2} dot={false} stackId="1" />
                  <Area type="monotone" dataKey="interview" name="Interview" stroke={PIQ_COLORS.rose}   fill="url(#gradInterview)" strokeWidth={2} dot={false} stackId="1" />
                  <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12, paddingTop: 8 }} />
                </AreaChart>
              </ResponsiveContainer>
            </PiqChartContainer>
          </div>
        </>
      )}
    </div>
  );
}
