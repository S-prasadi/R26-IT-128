"use client";

import { useState } from "react";
import { Icon } from "@/components/piq/icon";
import { PiqBadge } from "@/components/piq/badge";
import { PiqBtn } from "@/components/piq/primitives";

type NotifType = "skill" | "career" | "cv" | "interview" | "system" | "achievement";

interface Notification {
  id: number;
  type: NotifType;
  title: string;
  body: string;
  time: string;
  read: boolean;
  cta?: string;
}

const INITIAL_NOTIFS: Notification[] = [
  { id: 1,  type: "skill",       title: "Skill Alert: Rust trending",          body: "Rust has crossed the 80-point demand threshold globally. Sri Lanka adoption expected in ~7 weeks.",       time: "2 hours ago",   read: false, cta: "View Forecast"  },
  { id: 2,  type: "interview",   title: "Session feedback ready",               body: "Your React Developer interview session from April 28 has been fully analysed. Score: 78%.",                time: "3 hours ago",   read: false, cta: "View Feedback"  },
  { id: 3,  type: "career",      title: "New career path match",                body: "Based on your updated skills, Full-Stack Developer now shows a 91% compatibility score.",                   time: "Yesterday",     read: false, cta: "Explore Path"   },
  { id: 4,  type: "cv",          title: "CV version 3 processed",               body: "BERT-NER extraction complete. Your overall CV score improved by 8 points to 79/100.",                      time: "2 days ago",    read: true,  cta: "View Analysis"  },
  { id: 5,  type: "achievement", title: "Milestone unlocked!",                  body: "You completed your first interview simulation. Keep practising to reach the 80% target.",                   time: "2 days ago",    read: true               },
  { id: 6,  type: "skill",       title: "LangChain demand spike",               body: "LangChain (+91% globally) now leads the Early Warning panel. Consider adding it to your learning plan.",   time: "3 days ago",    read: true,  cta: "View Forecast"  },
  { id: 7,  type: "system",      title: "GitHub account connected",             body: "Your GitHub profile has been linked. Code analysis across 4 repositories is now complete.",                time: "Apr 26",        read: true               },
  { id: 8,  type: "career",      title: "Roadmap step due",                     body: "Reminder: 'AWS Solutions Architect – Associate' certification was estimated to start this week.",          time: "Apr 25",        read: true,  cta: "View Roadmap"   },
  { id: 9,  type: "interview",   title: "Practice reminder",                    body: "You haven't run an interview simulation in 5 days. Consistent practice improves your score by 12% on average.", time: "Apr 23", read: true,  cta: "Start Session"  },
  { id: 10, type: "system",      title: "Weekly skill report available",        body: "Your personalised skill demand report for the week of April 22 is ready to view.",                          time: "Apr 22",        read: true,  cta: "View Report"    },
];

const TYPE_META: Record<NotifType, { color: string; icon: string; label: string }> = {
  skill:       { color: "var(--amber)",  icon: "trend",  label: "Skill"       },
  career:      { color: "var(--teal)",   icon: "career", label: "Career"      },
  cv:          { color: "var(--violet)", icon: "cv",     label: "CV"          },
  interview:   { color: "var(--rose)",   icon: "chat",   label: "Interview"   },
  system:      { color: "var(--accent)", icon: "shield", label: "System"      },
  achievement: { color: "var(--green)",  icon: "trend",  label: "Achievement" },
};

export default function NotificationsPage() {
  const [notifs, setNotifs] = useState<Notification[]>(INITIAL_NOTIFS);
  const [filter, setFilter] = useState<"all" | "unread" | NotifType>("all");

  const unreadCount = notifs.filter((n) => !n.read).length;

  const markAllRead = () => setNotifs((ns) => ns.map((n) => ({ ...n, read: true })));
  const markRead = (id: number) => setNotifs((ns) => ns.map((n) => n.id === id ? { ...n, read: true } : n));
  const dismiss = (id: number) => setNotifs((ns) => ns.filter((n) => n.id !== id));

  const filtered = notifs.filter((n) => {
    if (filter === "all") return true;
    if (filter === "unread") return !n.read;
    return n.type === filter;
  });

  const FILTERS: { id: "all" | "unread" | NotifType; label: string }[] = [
    { id: "all",       label: "All" },
    { id: "unread",    label: `Unread${unreadCount ? ` (${unreadCount})` : ""}` },
    { id: "skill",     label: "Skill" },
    { id: "career",    label: "Career" },
    { id: "cv",        label: "CV" },
    { id: "interview", label: "Interview" },
    { id: "system",    label: "System" },
  ];

  const filterBtnStyle = (active: boolean) => ({
    padding: "4px 12px", borderRadius: 6, fontSize: 13, fontWeight: 500, border: "none", cursor: "pointer",
    background: active ? "var(--accent)" : "transparent", color: active ? "white" : "var(--text3)",
    transition: "all .15s", fontFamily: "inherit",
  });

  return (
    <div className="anim-up" style={{ display: "flex", flexDirection: "column", gap: 18 }}>

      {/* Header bar */}
      <div style={{ background: "var(--surf)", border: "1px solid var(--border)", borderRadius: "var(--radiusLg)", padding: "14px 20px", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10 }}>
        <div>
          <div style={{ fontSize: 17, fontWeight: 700 }}>Notifications</div>
          <div style={{ fontSize: 14, color: "var(--text3)", marginTop: 2 }}>{unreadCount > 0 ? `${unreadCount} unread` : "All caught up"}</div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          {unreadCount > 0 && (
            <PiqBtn variant="ghost" size="sm" onClick={markAllRead}>Mark all read</PiqBtn>
          )}
          <PiqBtn variant="secondary" size="sm" icon="shield">Notification settings</PiqBtn>
        </div>
      </div>

      {/* Filters */}
      <div style={{ display: "flex", background: "var(--surf)", border: "1px solid var(--border)", borderRadius: "var(--radiusLg)", padding: "6px 8px", gap: 2, flexWrap: "wrap" }}>
        {FILTERS.map((f) => (
          <button key={f.id} onClick={() => setFilter(f.id)} style={filterBtnStyle(filter === f.id)}>{f.label}</button>
        ))}
      </div>

      {/* Notification list */}
      <div style={{ background: "var(--surf)", border: "1px solid var(--border)", borderRadius: "var(--radiusLg)", overflow: "hidden" }}>
        {filtered.length === 0 ? (
          <div style={{ padding: "48px 20px", display: "flex", flexDirection: "column", alignItems: "center", gap: 10 }}>
            <Icon n="bell" s={28} c="var(--text3)" />
            <div style={{ fontSize: 15, color: "var(--text3)" }}>No notifications in this category</div>
          </div>
        ) : (
          filtered.map((n, i) => {
            const meta = TYPE_META[n.type];
            return (
              <div key={n.id}
                style={{ display: "flex", gap: 14, padding: "14px 20px", borderBottom: i < filtered.length - 1 ? "1px solid var(--border)" : "none", background: n.read ? "transparent" : `oklch(from ${meta.color} l c h / 4%)`, transition: "background .15s", cursor: n.read ? "default" : "pointer" }}
                onClick={() => !n.read && markRead(n.id)}
              >
                {/* Icon */}
                <div style={{ position: "relative", flexShrink: 0, marginTop: 2 }}>
                  <div style={{ width: 38, height: 38, borderRadius: 10, background: `oklch(from ${meta.color} l c h / 15%)`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <Icon n={meta.icon} s={16} c={meta.color} />
                  </div>
                  {!n.read && (
                    <span style={{ position: "absolute", top: -2, right: -2, width: 8, height: 8, borderRadius: "50%", background: "var(--rose)", border: "2px solid var(--surf)" }} />
                  )}
                </div>

                {/* Content */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10, marginBottom: 4 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                      <span style={{ fontSize: 15, fontWeight: n.read ? 500 : 600 }}>{n.title}</span>
                      <PiqBadge label={meta.label} variant="default" style={{ fontSize: 11 }} />
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
                      <span style={{ fontSize: 13, color: "var(--text3)", whiteSpace: "nowrap" }}>{n.time}</span>
                    </div>
                  </div>
                  <p style={{ fontSize: 14, color: "var(--text2)", lineHeight: 1.6, margin: "0 0 8px" }}>{n.body}</p>
                  <div style={{ display: "flex", gap: 8 }}>
                    {n.cta && (
                      <button style={{ fontSize: 13, fontWeight: 600, color: meta.color, background: "none", border: "none", cursor: "pointer", padding: 0, fontFamily: "inherit" }}>
                        {n.cta} →
                      </button>
                    )}
                    <button onClick={(e) => { e.stopPropagation(); dismiss(n.id); }} style={{ fontSize: 13, color: "var(--text3)", background: "none", border: "none", cursor: "pointer", padding: 0, fontFamily: "inherit", marginLeft: "auto" }}>
                      Dismiss
                    </button>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Settings panel */}
      <div style={{ background: "var(--surf)", border: "1px solid var(--border)", borderRadius: "var(--radiusLg)", overflow: "hidden" }}>
        <div style={{ padding: "14px 20px", borderBottom: "1px solid var(--border)" }}>
          <div style={{ fontSize: 15, fontWeight: 600 }}>Notification Preferences</div>
          <div style={{ fontSize: 13, color: "var(--text3)", marginTop: 1 }}>Choose which events you want to be notified about</div>
        </div>
        <div style={{ padding: "14px 20px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          {[
            { label: "Skill demand alerts",         sub: "When skills cross demand thresholds",        on: true  },
            { label: "Interview session results",   sub: "Score & emotion analysis feedback",           on: true  },
            { label: "Career path updates",         sub: "New role matches and roadmap reminders",      on: true  },
            { label: "CV analysis complete",        sub: "When your CV is processed or re-scored",     on: true  },
            { label: "Weekly skill report",         sub: "Summary digest every Monday",                 on: false },
            { label: "Early warning panel",         sub: "Global skill trends entering alert zone",     on: true  },
            { label: "System announcements",        sub: "Platform updates and maintenance notices",    on: false },
            { label: "Achievement unlocks",         sub: "Milestone and badge notifications",           on: true  },
          ].map((p, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 14px", background: "var(--surf2)", borderRadius: "var(--radius)", border: "1px solid var(--border)" }}>
              <div>
                <div style={{ fontSize: 14, fontWeight: 500 }}>{p.label}</div>
                <div style={{ fontSize: 13, color: "var(--text3)", marginTop: 2 }}>{p.sub}</div>
              </div>
              <div style={{ width: 34, height: 18, borderRadius: 99, background: p.on ? "var(--accent)" : "var(--surf3)", border: "1px solid var(--border2)", flexShrink: 0, position: "relative", cursor: "pointer", transition: "background .2s" }}>
                <div style={{ position: "absolute", top: 2, left: p.on ? 16 : 2, width: 12, height: 12, borderRadius: "50%", background: "white", transition: "left .2s", boxShadow: "0 1px 3px oklch(0% 0 0 / 20%)" }} />
              </div>
            </div>
          ))}
        </div>
      </div>

    </div>
  );
}
