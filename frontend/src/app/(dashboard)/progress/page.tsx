"use client";

import { useState } from "react";
import { Icon } from "@/components/piq/icon";
import { PiqBadge } from "@/components/piq/badge";
import { PiqStatCard } from "@/components/piq/primitives";

const MODULES = [
  { id: "skill",     label: "Skill Forecasting",   color: "var(--amber)",  icon: "trend",  progress: 100, sessions: 12, last: "Today"    },
  { id: "career",    label: "Career Paths",         color: "var(--teal)",   icon: "career", progress: 80,  sessions: 4,  last: "2 days ago" },
  { id: "cv",        label: "CV & Proficiency",     color: "var(--violet)", icon: "cv",     progress: 65,  sessions: 3,  last: "4 days ago" },
  { id: "interview", label: "Interview Simulator",  color: "var(--rose)",   icon: "chat",   progress: 45,  sessions: 3,  last: "2 days ago" },
];

const MILESTONES = [
  { title: "First CV uploaded & analysed",         module: "CV",        done: true,  date: "Jan 15" },
  { title: "First career path explored",           module: "Career",    done: true,  date: "Jan 22" },
  { title: "Skill forecast report reviewed",       module: "Skill",     done: true,  date: "Feb 03" },
  { title: "First interview simulation completed", module: "Interview", done: true,  date: "Apr 15" },
  { title: "CV score above 80",                    module: "CV",        done: false, date: null     },
  { title: "Interview score above 80%",            module: "Interview", done: false, date: null     },
  { title: "Career path roadmap completed",        module: "Career",    done: false, date: null     },
  { title: "All skills verified via GitHub",       module: "Skill",     done: false, date: null     },
];

const SKILL_PROGRESS = [
  { skill: "React",      current: 85, target: 90, weeks_ago: 70 },
  { skill: "Python",     current: 78, target: 85, weeks_ago: 62 },
  { skill: "TypeScript", current: 72, target: 80, weeks_ago: 55 },
  { skill: "Docker",     current: 55, target: 70, weeks_ago: 40 },
  { skill: "AWS",        current: 40, target: 65, weeks_ago: 28 },
  { skill: "ML",         current: 60, target: 75, weeks_ago: 48 },
];

const WEEKLY_ACTIVITY = [10, 25, 15, 40, 30, 55, 45, 60, 35, 70, 50, 80];
const WEEKLY_LABELS   = ["Jan W3","Jan W4","Feb W1","Feb W2","Feb W3","Feb W4","Mar W1","Mar W2","Mar W3","Mar W4","Apr W3","Apr W4"];

const MODULE_COLOR: Record<string, string> = {
  CV:        "var(--violet)",
  Career:    "var(--teal)",
  Skill:     "var(--amber)",
  Interview: "var(--rose)",
};

const W = 580, H = 80, PL = 4, PR = 4, PT = 4, PB = 20;
const maxA = Math.max(...WEEKLY_ACTIVITY);
const actPts = WEEKLY_ACTIVITY.map((v, i) => [
  PL + (i / (WEEKLY_ACTIVITY.length - 1)) * (W - PL - PR),
  PT + (H - PT - PB) - (v / maxA) * (H - PT - PB),
]);
const actLine = actPts.map((p) => p.join(",")).join(" ");

export default function ProgressPage() {
  const [activeModule, setActiveModule] = useState<string | null>(null);

  const done = MILESTONES.filter((m) => m.done).length;
  const total = MILESTONES.length;
  const overallPct = Math.round((done / total) * 100);

  return (
    <div className="anim-up" style={{ display: "flex", flexDirection: "column", gap: 18 }}>

      {/* Stats */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 12 }}>
        <PiqStatCard label="Overall Progress" value={`${overallPct}%`} icon="trend"   color="var(--accent)" sub="Across all modules"    delta={{ up: true, label: "4 of 8 milestones" }} />
        <PiqStatCard label="Modules Active"   value={MODULES.length}  icon="shield"  color="var(--teal)"   sub="All AI modules in use" />
        <PiqStatCard label="Total Sessions"   value={MODULES.reduce((s, m) => s + m.sessions, 0)} icon="refresh" color="var(--violet)" sub="Platform interactions" />
        <PiqStatCard label="Streak"           value="7 days"          icon="person"  color="var(--green)"  sub="Active learning streak" delta={{ up: true, label: "Personal best" }} />
      </div>

      {/* Module progress + Milestones */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 320px", gap: 14 }}>

        {/* Module cards */}
        <div style={{ background: "var(--surf)", border: "1px solid var(--border)", borderRadius: "var(--radiusLg)", overflow: "hidden" }}>
          <div style={{ padding: "14px 20px", borderBottom: "1px solid var(--border)" }}>
            <div style={{ fontSize: 15, fontWeight: 600 }}>Module Progress</div>
            <div style={{ fontSize: 13, color: "var(--text3)", marginTop: 1 }}>Click to filter skill progress below</div>
          </div>
          <div style={{ padding: "14px 16px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            {MODULES.map((m) => {
              const active = activeModule === m.id;
              return (
                <button key={m.id} onClick={() => setActiveModule(active ? null : m.id)}
                  style={{ padding: "16px", background: active ? `oklch(from ${m.color} l c h / 10%)` : "var(--surf2)", border: `1px solid ${active ? `oklch(from ${m.color} l c h / 30%)` : "var(--border)"}`, borderRadius: "var(--radius)", cursor: "pointer", textAlign: "left", fontFamily: "inherit", transition: "all .15s" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
                    <div style={{ width: 30, height: 30, borderRadius: 8, background: `oklch(from ${m.color} l c h / 15%)`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <Icon n={m.icon} s={14} c={m.color} />
                    </div>
                    <span style={{ fontSize: 14, fontWeight: 600, color: active ? m.color : "var(--text)" }}>{m.label}</span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                    <span style={{ fontSize: 13, color: "var(--text3)" }}>{m.sessions} sessions</span>
                    <span style={{ fontSize: 15, fontWeight: 700, color: m.color }}>{m.progress}%</span>
                  </div>
                  <div style={{ height: 5, background: "var(--surf3)", borderRadius: 99, overflow: "hidden", marginBottom: 6 }}>
                    <div style={{ height: "100%", width: `${m.progress}%`, background: m.color, borderRadius: 99, transition: "width .5s" }} />
                  </div>
                  <div style={{ fontSize: 12, color: "var(--text3)" }}>Last: {m.last}</div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Milestones */}
        <div style={{ background: "var(--surf)", border: "1px solid var(--border)", borderRadius: "var(--radiusLg)", overflow: "hidden" }}>
          <div style={{ padding: "14px 18px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ fontSize: 15, fontWeight: 600 }}>Milestones</div>
            <span style={{ fontSize: 13, fontWeight: 600, color: "var(--green)" }}>{done}/{total} done</span>
          </div>
          <div style={{ padding: "8px 0" }}>
            {MILESTONES.map((m, i) => (
              <div key={i} style={{ display: "flex", gap: 12, padding: "10px 18px", borderBottom: i < MILESTONES.length - 1 ? "1px solid var(--border)" : "none", opacity: m.done ? 1 : 0.7 }}>
                <span style={{ fontSize: 16, color: m.done ? "var(--green)" : "var(--border2)", flexShrink: 0, marginTop: 1 }}>{m.done ? "✓" : "○"}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: m.done ? 500 : 400, color: m.done ? "var(--text)" : "var(--text2)", textDecoration: m.done ? "none" : "none", lineHeight: 1.4 }}>{m.title}</div>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 4 }}>
                    <span style={{ fontSize: 11, padding: "1px 6px", borderRadius: 99, background: `oklch(from ${MODULE_COLOR[m.module] || "var(--accent)"} l c h / 12%)`, color: MODULE_COLOR[m.module] || "var(--accent)", fontWeight: 600 }}>{m.module}</span>
                    {m.date && <span style={{ fontSize: 12, color: "var(--text3)" }}>{m.date}</span>}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Skill progress chart */}
      <div style={{ background: "var(--surf)", border: "1px solid var(--border)", borderRadius: "var(--radiusLg)", overflow: "hidden" }}>
        <div style={{ padding: "14px 20px", borderBottom: "1px solid var(--border)" }}>
          <div style={{ fontSize: 15, fontWeight: 600 }}>Skill Growth (4-week change)</div>
          <div style={{ fontSize: 13, color: "var(--text3)", marginTop: 1 }}>Proficiency level progression based on CV + interview + GitHub analysis</div>
        </div>
        <div style={{ padding: "16px 20px", display: "flex", flexDirection: "column", gap: 10 }}>
          {SKILL_PROGRESS.map((s) => {
            const gain = s.current - s.weeks_ago;
            const remaining = s.target - s.current;
            return (
              <div key={s.skill} style={{ display: "flex", alignItems: "center", gap: 14 }}>
                <span style={{ fontSize: 14, fontWeight: 500, width: 100, flexShrink: 0 }}>{s.skill}</span>
                <div style={{ flex: 1, position: "relative", height: 8, background: "var(--surf2)", borderRadius: 99, overflow: "hidden" }}>
                  <div style={{ position: "absolute", left: 0, top: 0, height: "100%", width: `${s.weeks_ago}%`, background: "var(--surf3)", borderRadius: 99 }} />
                  <div style={{ position: "absolute", left: 0, top: 0, height: "100%", width: `${s.current}%`, background: "var(--accent)", borderRadius: 99, transition: "width .5s" }} />
                  <div style={{ position: "absolute", left: 0, top: 0, height: "100%", width: `${s.target}%`, background: "transparent", borderRight: "2px dashed var(--text3)", borderRadius: 0 }} />
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0, minWidth: 80 }}>
                  <span style={{ fontSize: 14, fontWeight: 700, color: "var(--accent)" }}>{s.current}%</span>
                  <span style={{ fontSize: 13, color: "var(--green)", fontWeight: 600 }}>+{gain}</span>
                  <span style={{ fontSize: 12, color: "var(--text3)" }}>→{s.target}</span>
                </div>
              </div>
            );
          })}
          <div style={{ display: "flex", gap: 18, marginTop: 6 }}>
            {[
              { color: "var(--surf3)",  label: "4 weeks ago" },
              { color: "var(--accent)", label: "Current"     },
              { color: "transparent",   label: "Target",  dash: true },
            ].map((l) => (
              <div key={l.label} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                {l.dash
                  ? <svg width="14" height="8"><line x1="0" y1="4" x2="14" y2="4" stroke="var(--text3)" strokeWidth="1.5" strokeDasharray="3,2" /></svg>
                  : <div style={{ width: 14, height: 6, borderRadius: 99, background: l.color }} />
                }
                <span style={{ fontSize: 13, color: "var(--text3)" }}>{l.label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Weekly activity chart */}
      <div style={{ background: "var(--surf)", border: "1px solid var(--border)", borderRadius: "var(--radiusLg)", overflow: "hidden" }}>
        <div style={{ padding: "14px 20px", borderBottom: "1px solid var(--border)" }}>
          <div style={{ fontSize: 15, fontWeight: 600 }}>Weekly Activity</div>
          <div style={{ fontSize: 13, color: "var(--text3)", marginTop: 1 }}>Platform engagement score across all modules</div>
        </div>
        <div style={{ padding: "16px 20px 12px" }}>
          <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", display: "block" }}>
            <defs>
              <linearGradient id="actGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.25" />
                <stop offset="100%" stopColor="var(--accent)" stopOpacity="0" />
              </linearGradient>
            </defs>
            <path d={`M ${actPts[0][0]},${H - PB} ` + actPts.map((p) => `L ${p[0]},${p[1]}`).join(" ") + ` L ${actPts[actPts.length - 1][0]},${H - PB} Z`} fill="url(#actGrad)" />
            <polyline points={actLine} fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
            {actPts.map(([x, y], i) => (
              <circle key={i} cx={x} cy={y} r="3" fill="var(--accent)" />
            ))}
            {WEEKLY_LABELS.map((label, i) => {
              const x = PL + (i / (WEEKLY_LABELS.length - 1)) * (W - PL - PR);
              return i % 3 === 0 ? <text key={label} x={x} y={H - 4} fontSize="10" fill="var(--text3)" textAnchor="middle">{label}</text> : null;
            })}
          </svg>
        </div>
      </div>

    </div>
  );
}
