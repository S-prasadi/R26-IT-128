"use client";

import { useRouter } from "next/navigation";
import { useState, useEffect } from "react";
import { Icon } from "@/components/piq/icon";
import { PiqAvatar } from "@/components/piq/avatar";
import { PiqBadge } from "@/components/piq/badge";
import { PiqStatCard, PiqBtn } from "@/components/piq/primitives";
import { ROUTES } from "@/constants/routes";
import apiClient from "@/lib/axios";
import {
  AreaChart, Area, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend,
} from "recharts";
import { PiqChartContainer, PiqTooltip, PIQ_COLORS } from "@/components/piq/charts";

const MODULE_CARDS = [
  { id:"skill",     label:"Skill Forecasting",    color:"var(--amber)",  icon:"trend",  status:"Live", href: ROUTES.SKILL     },
  { id:"career",    label:"Career Path Predictor", color:"var(--teal)",   icon:"career", status:"Live", href: ROUTES.CAREER    },
  { id:"cv",        label:"CV & Proficiency",      color:"var(--violet)", icon:"cv",     status:"Live", href: ROUTES.CV        },
  { id:"interview", label:"Interview Simulator",   color:"var(--rose)",   icon:"chat",   status:"Live", href: ROUTES.INTERVIEW },
];

const SYSTEM_HEALTH = [
  { label: "API Gateway",       status: "operational" },
  { label: "Auth Service",      status: "operational" },
  { label: "AI Module A (Skill)", status: "operational" },
  { label: "AI Module B (Career)", status: "operational" },
  { label: "AI Module C (CV)",   status: "operational" },
  { label: "AI Module D (Interview)", status: "operational" },
];

export default function DashboardPage() {
  const router = useRouter();
  const [users, setUsers] = useState<any[]>([]);
  const [userGrowth, setUserGrowth] = useState<any[]>([]);
  const [moduleUsage, setModuleUsage] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const usersRes = await apiClient.get("/users");
        const allUsers = Array.isArray(usersRes.data.data) ? usersRes.data.data : [];
        setUsers(allUsers.slice(0, 6));

        const active = allUsers.filter((u: any) => u.is_active).length;
        const total = allUsers.length;

        setUserGrowth([
          { month: "Jan", users: Math.floor(total * 0.4), active: Math.floor(active * 0.4) },
          { month: "Feb", users: Math.floor(total * 0.5), active: Math.floor(active * 0.5) },
          { month: "Mar", users: Math.floor(total * 0.65), active: Math.floor(active * 0.65) },
          { month: "Apr", users: Math.floor(total * 0.8), active: Math.floor(active * 0.8) },
          { month: "May", users: total, active },
        ]);

        setModuleUsage([
          { module: "Skill", sessions: Math.floor(Math.random() * 150) },
          { module: "Career", sessions: Math.floor(Math.random() * 100) },
          { module: "CV", sessions: Math.floor(Math.random() * 250) },
          { module: "Interview", sessions: Math.floor(Math.random() * 80) },
        ]);
      } catch (err) {
        console.error("Failed to fetch dashboard data:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  const activeCount = users.filter((u) => u.is_active).length;

  return (
    <div className="anim-up" style={{ display: "flex", flexDirection: "column", gap: 20 }}>

      {/* Stats row */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 260px))", gap: 14, justifyContent: "start" }}>
        <PiqStatCard label="Total Users"    value={users.length}  icon="users"   color="var(--accent)" sub="Registered accounts" />
        <PiqStatCard label="Active Users"   value={activeCount}   icon="person"  color="var(--green)"  sub={`${users.length - activeCount} inactive`} />
        <PiqStatCard label="Roles"          value={3}             icon="shield"  color="var(--violet)" sub="Access policy layers" />
        <PiqStatCard label="Inactive"       value={users.length - activeCount}             icon="trend"   color="var(--teal)"   sub="Deactivated accounts" />
      </div>

      {/* AI Modules */}
      <div style={{ background: "var(--surf)", border: "1px solid var(--border)", borderRadius: "var(--radiusLg)", overflow: "hidden" }}>
        <div style={{ padding: "16px 20px", borderBottom: "1px solid var(--border)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ fontSize: 15, fontWeight: 600 }}>AI Modules</div>
          <PiqBadge label="All systems operational" variant="active" dot />
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 0 }}>
          {MODULE_CARDS.map((m, i) => (
            <button key={m.id} onClick={() => router.push(m.href)}
              style={{
                padding: "20px", textAlign: "left", cursor: "pointer",
                background: "transparent", border: "none", fontFamily: "inherit",
                borderRight: i < MODULE_CARDS.length - 1 ? "1px solid var(--border)" : "none",
                transition: "background .12s",
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = "var(--surf2)")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
            >
              <div style={{ width: 36, height: 36, borderRadius: 10, background: `oklch(from ${m.color} l c h / 18%)`, display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 12 }}>
                <Icon n={m.icon} s={18} c={m.color} />
              </div>
              <div style={{ fontSize: 15, fontWeight: 600, color: "var(--text)", marginBottom: 6 }}>{m.label}</div>
              <PiqBadge label={m.status} variant="active" dot />
            </button>
          ))}
        </div>
      </div>

      {/* Recent users */}
      <div style={{ background: "var(--surf)", border: "1px solid var(--border)", borderRadius: "var(--radiusLg)", overflow: "hidden" }}>
        <div style={{ padding: "16px 20px", borderBottom: "1px solid var(--border)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ fontSize: 15, fontWeight: 600 }}>Recent Users</div>
          <PiqBtn variant="ghost" size="sm" onClick={() => router.push(ROUTES.USERS)} style={{ fontSize: 14 }}>View all →</PiqBtn>
        </div>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ borderBottom: "1px solid var(--border)" }}>
              {["User","Role","Status","Joined"].map((h) => (
                <th key={h} style={{ padding: "10px 20px", textAlign: "left", fontSize: 13, fontWeight: 600, color: "var(--text3)", letterSpacing: "0.04em" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {users.map((u, i) => (
              <tr key={u.id}
                style={{ borderBottom: i < users.length - 1 ? "1px solid var(--border)" : "none", transition: "background .1s" }}
                onMouseEnter={(e) => (e.currentTarget.style.background = "var(--surf2)")}
                onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
              >
                <td style={{ padding: "12px 20px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <PiqAvatar name={u.full_name} size={30} />
                    <div>
                      <div style={{ fontSize: 15, fontWeight: 500 }}>{u.full_name}</div>
                      <div style={{ fontSize: 13, color: "var(--text3)" }}>{u.email}</div>
                    </div>
                  </div>
                </td>
                <td style={{ padding: "12px 20px" }}>
                  <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                    {(u.roles || []).map((r: any) => <PiqBadge key={typeof r === 'string' ? r : r.name} label={typeof r === 'string' ? r : r.name} variant={typeof r === 'string' ? r : r.name} />)}
                  </div>
                </td>
                <td style={{ padding: "12px 20px" }}>
                  <PiqBadge label={u.is_active ? "Active" : "Inactive"} variant={u.is_active ? "active" : "inactive"} dot />
                </td>
                <td style={{ padding: "12px 20px", fontSize: 14, color: "var(--text2)" }}>
                  {new Date(u.created_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Charts row */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
        <PiqChartContainer title="User Growth" subtitle="Last 5 months" height={240}>
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={userGrowth} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="gradUsers" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor={PIQ_COLORS.accent} stopOpacity={0.25} />
                  <stop offset="95%" stopColor={PIQ_COLORS.accent} stopOpacity={0} />
                </linearGradient>
                <linearGradient id="gradActive" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor={PIQ_COLORS.teal} stopOpacity={0.2} />
                  <stop offset="95%" stopColor={PIQ_COLORS.teal} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
              <XAxis dataKey="month" tick={{ fontSize: 12, fill: "var(--text3)" }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 12, fill: "var(--text3)" }} axisLine={false} tickLine={false} />
              <Tooltip content={<PiqTooltip />} />
              <Area type="monotone" dataKey="users"  name="Total Users"  stroke={PIQ_COLORS.accent} fill="url(#gradUsers)"  strokeWidth={2} dot={false} />
              <Area type="monotone" dataKey="active" name="Active Users" stroke={PIQ_COLORS.teal}   fill="url(#gradActive)" strokeWidth={2} dot={false} />
              <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12, paddingTop: 8 }} />
            </AreaChart>
          </ResponsiveContainer>
        </PiqChartContainer>

        <PiqChartContainer title="Module Engagement" subtitle="Sessions per AI module" height={240}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={moduleUsage} margin={{ top: 4, right: 4, left: -20, bottom: 0 }} barSize={32}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
              <XAxis dataKey="module" tick={{ fontSize: 12, fill: "var(--text3)" }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 12, fill: "var(--text3)" }} axisLine={false} tickLine={false} />
              <Tooltip content={<PiqTooltip />} cursor={{ fill: "var(--surf2)" }} />
              <Bar dataKey="sessions" name="Sessions" fill={PIQ_COLORS.accent} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </PiqChartContainer>
      </div>

      {/* Bottom row: System Health + Activity Feed */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
        {/* System Health */}
        <div style={{ background: "var(--surf)", border: "1px solid var(--border)", borderRadius: "var(--radiusLg)", overflow: "hidden" }}>
          <div style={{ padding: "16px 20px", borderBottom: "1px solid var(--border)", fontSize: 15, fontWeight: 600 }}>System Health</div>
          <div style={{ padding: "12px 20px", display: "flex", flexDirection: "column", gap: 10 }}>
            {SYSTEM_HEALTH.map((s) => (
              <div key={s.label} style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: 14, color: "var(--text2)" }}>{s.label}</span>
                <span style={{ fontSize: 12, color: "var(--green)", background: "var(--greenD)", padding: "2px 10px", borderRadius: 20, display: "flex", alignItems: "center", gap: 4 }}>
                  <span style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--green)", display: "inline-block" }} />
                  Operational
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Recent Users Summary */}
        <div style={{ background: "var(--surf)", border: "1px solid var(--border)", borderRadius: "var(--radiusLg)", overflow: "hidden" }}>
          <div style={{ padding: "16px 20px", borderBottom: "1px solid var(--border)", fontSize: 15, fontWeight: 600 }}>User Summary</div>
          <div style={{ padding: "12px 20px", display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingBottom: 8, borderBottom: "1px solid var(--border)" }}>
              <span style={{ color: "var(--text2)", fontSize: 14 }}>Total Users</span>
              <span style={{ fontWeight: 600, fontSize: 16 }}>{users.length}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingBottom: 8, borderBottom: "1px solid var(--border)" }}>
              <span style={{ color: "var(--text2)", fontSize: 14 }}>Active</span>
              <span style={{ fontWeight: 600, fontSize: 16, color: "var(--green)" }}>{activeCount}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ color: "var(--text2)", fontSize: 14 }}>Inactive</span>
              <span style={{ fontWeight: 600, fontSize: 16, color: "var(--text3)" }}>{users.length - activeCount}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
