"use client";

import { useRouter } from "next/navigation";
import { Icon } from "@/components/piq/icon";
import { PiqAvatar } from "@/components/piq/avatar";
import { PiqBadge } from "@/components/piq/badge";
import { PiqStatCard, PiqBtn } from "@/components/piq/primitives";
import { ROUTES } from "@/constants/routes";

const USERS = [
  { id:"1",  full_name:"Kavindu Rathnayake",       email:"kavindu.r@sliit.lk",          is_active:true,  roles:["admin"],          created_at:"2026-01-08" },
  { id:"2",  full_name:"Sashini Alphonso",          email:"sashini.a@students.sliit.lk", is_active:true,  roles:["manager"],        created_at:"2026-01-14" },
  { id:"3",  full_name:"Prasadi Rajapaksha",        email:"prasadi.r@students.sliit.lk", is_active:true,  roles:["user"],           created_at:"2026-01-20" },
  { id:"4",  full_name:"Dimantha Gunawardena",      email:"dimantha.g@students.sliit.lk",is_active:true,  roles:["user"],           created_at:"2026-01-27" },
  { id:"5",  full_name:"Dr. Chaminda Perera",       email:"chaminda.p@sliit.lk",         is_active:true,  roles:["manager"],        created_at:"2026-02-03" },
  { id:"6",  full_name:"Tharushi Bandara",          email:"tharushi.b@students.sliit.lk",is_active:false, roles:["user"],           created_at:"2026-02-10" },
];

const MODULE_CARDS = [
  { id:"skill",     label:"Skill Forecasting",    sub:"BERTopic + ARIMA · 3-month forecasts",        color:"var(--amber)",  icon:"trend",  status:"Live", owner:"Rathnayake K.D.V",         href: ROUTES.SKILL     },
  { id:"career",    label:"Career Path Predictor", sub:"Neo4j + Transformers · Probabilistic graphs", color:"var(--teal)",   icon:"career", status:"Live", owner:"Alphonso S.R.P.A.M.D.N",   href: ROUTES.CAREER    },
  { id:"cv",        label:"CV & Proficiency",      sub:"BERT-NER + SVM + GitHub AST analysis",        color:"var(--violet)", icon:"cv",     status:"Live", owner:"Prasadi R.D.S",             href: ROUTES.CV        },
  { id:"interview", label:"Interview Simulator",   sub:"Gemini LLM + MediaPipe emotion detection",    color:"var(--rose)",   icon:"chat",   status:"Live", owner:"Kavindu D.M.G",             href: ROUTES.INTERVIEW },
];

const MONTHS  = ["Nov","Dec","Jan","Feb","Mar","Apr"];
const COUNTS  = [3, 5, 8, 7, 12, 6];
const W = 260, H = 64, PAD = 4;
const maxV = Math.max(...COUNTS);
const pts = COUNTS.map((v, i) => [
  PAD + (i / (COUNTS.length - 1)) * (W - PAD * 2),
  H - PAD - ((v / maxV) * (H - PAD * 2)),
]);
const polyline = pts.map((p) => p.join(",")).join(" ");
const area = `M ${pts[0][0]},${H - PAD} ` + pts.map((p) => `L ${p[0]},${p[1]}`).join(" ") + ` L ${pts[pts.length - 1][0]},${H - PAD} Z`;

export default function DashboardPage() {
  const router = useRouter();
  const activeCount = USERS.filter((u) => u.is_active).length;
  const roleCount = (r: string) => USERS.filter((u) => u.roles.includes(r)).length;

  return (
    <div className="anim-up" style={{ display: "flex", flexDirection: "column", gap: 20 }}>

      {/* Stats row */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 14 }}>
        <PiqStatCard label="Total Users"    value={USERS.length}  icon="users"   color="var(--accent)" sub="Registered accounts"    delta={{ up: true, label: "+6 this month" }} />
        <PiqStatCard label="Active Users"   value={activeCount}   icon="person"  color="var(--green)"  sub={`${USERS.length - activeCount} inactive`} />
        <PiqStatCard label="Roles"          value={3}             icon="shield"  color="var(--violet)" sub="Access policy layers" />
        <PiqStatCard label="New This Month" value={6}             icon="trend"   color="var(--teal)"   sub="April 2026"             delta={{ up: true, label: "+2 vs last month" }} />
      </div>

      {/* Middle row */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 320px", gap: 14 }}>

        {/* AI Modules */}
        <div style={{ background: "var(--surf)", border: "1px solid var(--border)", borderRadius: "var(--radiusLg)", overflow: "hidden" }}>
          <div style={{ padding: "16px 20px", borderBottom: "1px solid var(--border)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <div style={{ fontSize: 15, fontWeight: 600 }}>AI Module Status</div>
              <div style={{ fontSize: 13, color: "var(--text3)", marginTop: 2 }}>4 integrated processing pipelines</div>
            </div>
            <PiqBadge label="All systems operational" variant="active" dot />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 0 }}>
            {MODULE_CARDS.map((m, i) => (
              <button key={m.id} onClick={() => router.push(m.href)}
                style={{
                  padding: "16px 20px", textAlign: "left", cursor: "pointer",
                  background: "transparent", border: "none", fontFamily: "inherit",
                  borderRight: i % 2 === 0 ? "1px solid var(--border)" : "none",
                  borderBottom: i < 2 ? "1px solid var(--border)" : "none",
                  transition: "background .12s",
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = "var(--surf2)")}
                onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
                  <div style={{ width: 32, height: 32, borderRadius: 8, background: `oklch(from ${m.color} l c h / 18%)`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                    <Icon n={m.icon} s={16} c={m.color} />
                  </div>
                  <PiqBadge label={m.status} variant="active" dot />
                </div>
                <div style={{ fontSize: 15, fontWeight: 600, color: "var(--text)", marginBottom: 3 }}>{m.label}</div>
                <div style={{ fontSize: 13, color: "var(--text3)", lineHeight: 1.5, marginBottom: 6 }}>{m.sub}</div>
                <div style={{ fontSize: 12, color: "var(--text3)" }}>Module owner: <span style={{ color: "var(--text2)" }}>{m.owner}</span></div>
              </button>
            ))}
          </div>
        </div>

        {/* Right column */}
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {/* Signups chart */}
          <div style={{ background: "var(--surf)", border: "1px solid var(--border)", borderRadius: "var(--radiusLg)", padding: "16px 20px" }}>
            <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 2 }}>Monthly Signups</div>
            <div style={{ fontSize: 13, color: "var(--text3)", marginBottom: 14 }}>Last 6 months</div>
            <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{ overflow: "visible", display: "block", width: "100%" }}>
              <defs>
                <linearGradient id="chartGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.25" />
                  <stop offset="100%" stopColor="var(--accent)" stopOpacity="0" />
                </linearGradient>
              </defs>
              <path d={area} fill="url(#chartGrad)" />
              <polyline points={polyline} fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
              {pts.map(([x, y], i) => <circle key={i} cx={x} cy={y} r="3" fill="var(--accent)" />)}
            </svg>
            <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8 }}>
              {MONTHS.map((m, i) => (
                <div key={m} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text2)" }}>{COUNTS[i]}</span>
                  <span style={{ fontSize: 11, color: "var(--text3)" }}>{m}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Role distribution */}
          <div style={{ background: "var(--surf)", border: "1px solid var(--border)", borderRadius: "var(--radiusLg)", padding: "16px 20px", flex: 1 }}>
            <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 12 }}>Role Distribution</div>
            {[
              { role: "admin",   color: "var(--accent)",  icon: "shield" },
              { role: "manager", color: "var(--violet)",  icon: "person" },
              { role: "user",    color: "var(--teal)",    icon: "users"  },
            ].map((r) => {
              const cnt = roleCount(r.role);
              const pct = Math.round((cnt / USERS.length) * 100);
              return (
                <div key={r.role} style={{ marginBottom: 12 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <Icon n={r.icon} s={12} c={r.color} />
                      <span style={{ fontSize: 14, fontWeight: 500, textTransform: "capitalize" }}>{r.role}</span>
                    </div>
                    <span style={{ fontSize: 13, color: "var(--text3)" }}>{cnt} ({pct}%)</span>
                  </div>
                  <div style={{ height: 4, background: "var(--surf2)", borderRadius: 99, overflow: "hidden" }}>
                    <div style={{ height: "100%", width: `${pct}%`, background: r.color, borderRadius: 99, transition: "width .5s ease" }} />
                  </div>
                </div>
              );
            })}
          </div>
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
            {USERS.map((u, i) => (
              <tr key={u.id}
                style={{ borderBottom: i < USERS.length - 1 ? "1px solid var(--border)" : "none", transition: "background .1s" }}
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
                    {u.roles.map((r) => <PiqBadge key={r} label={r} variant={r} />)}
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
    </div>
  );
}
