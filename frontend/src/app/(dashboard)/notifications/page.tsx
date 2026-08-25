"use client";

import { useState, useEffect } from "react";
import { useNotifications } from "@/hooks/useNotifications";
import { notificationService } from "@/services/notification.service";
import { toast } from "sonner";
import { PageHeader } from "@/components/common/PageHeader";
import { PiqSpinner } from "@/components/piq/primitives";
import { PiqBtn } from "@/components/piq/primitives";
import { PiqToggle } from "@/components/piq/primitives";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";

type NotifType = "skill" | "career" | "cv" | "interview" | "system";

const TYPE_COLORS: Record<NotifType, string> = {
  skill: "var(--amber)",
  career: "var(--teal)",
  cv: "var(--violet)",
  interview: "var(--rose)",
  system: "var(--text2)",
};

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

interface NotificationPreferences {
  skill_alerts: boolean;
  career_updates: boolean;
  cv_feedback: boolean;
  interview_reminders: boolean;
  system_notices: boolean;
}

export default function NotificationsPage() {
  const {
    notifications,
    unreadCount,
    loading: notificationsLoading,
    markAsRead,
    markAllAsRead,
    deleteNotification,
  } = useNotifications();

  const [activeTab, setActiveTab] = useState<"feed" | "preferences">("feed");
  const [filter, setFilter] = useState<"all" | NotifType>("all");
  const [prefs, setPrefs] = useState<NotificationPreferences | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<{ id: string; title: string } | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    async function loadPreferences() {
      try {
        const res = await notificationService.getPreferences();
        setPrefs(res.data.data);
      } catch {
        toast.error("Failed to load preferences");
      } finally {
        setLoading(false);
      }
    }
    loadPreferences();
  }, []);

  async function handleSavePrefs() {
    if (!prefs) return;
    setSaving(true);
    try {
      const res = await notificationService.updatePreferences({
        skill_alerts: prefs.skill_alerts,
        career_updates: prefs.career_updates,
        cv_feedback: prefs.cv_feedback,
        interview_reminders: prefs.interview_reminders,
        system_notices: prefs.system_notices,
      });
      setPrefs(res.data.data);
      toast.success("Preferences saved");
    } catch {
      toast.error("Failed to save preferences");
    } finally {
      setSaving(false);
    }
  }

  function markRead(id: string) {
    markAsRead(id);
  }

  async function handleDelete() {
    if (!confirmDelete) return;
    setDeleting(true);
    try {
      await deleteNotification(confirmDelete.id);
      setConfirmDelete(null);
      toast.success("Notification deleted");
    } finally {
      setDeleting(false);
    }
  }

  const filtered =
    filter === "all"
      ? notifications
      : notifications.filter((n) => n.type === (filter as NotifType));
  const unread = notifications.filter((n) => !n.read).length;

  return (
    <div>
      <PageHeader
        title="Notifications"
        description="Stay updated on skills, career paths, CV analysis and interview results"
      />

      <div
        style={{
          display: "flex",
          gap: 16,
          marginBottom: 24,
          borderBottom: "1px solid var(--border)",
        }}
      >
        {(["feed", "preferences"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setActiveTab(t)}
            style={{
              padding: "8px 16px",
              fontSize: 14,
              border: "none",
              cursor: "pointer",
              background: "transparent",
              fontWeight: activeTab === t ? 600 : 400,
              color: activeTab === t ? "var(--accent)" : "var(--text2)",
              borderBottom:
                activeTab === t
                  ? "2px solid var(--accent)"
                  : "2px solid transparent",
              marginBottom: -1,
              textTransform: "capitalize",
            }}
          >
            {t === "feed" ? `Notifications${unread > 0 ? ` (${unread})` : ""}` : "Preferences"}
          </button>
        ))}
      </div>

      {notificationsLoading && activeTab === "feed" ? (
        <div
          style={{
            display: "flex",
            justifyContent: "center",
            padding: 48,
          }}
        >
          <PiqSpinner />
        </div>
      ) : (
        <>
          {activeTab === "feed" && (
            <div>
              <div
                style={{
                  display: "flex",
                  gap: 8,
                  alignItems: "center",
                  marginBottom: 16,
                  flexWrap: "wrap",
                }}
              >
                {(["all", "skill", "career", "cv", "interview", "system"] as const).map(
                  (f) => (
                    <button
                      key={f}
                      onClick={() =>
                        setFilter(f === "system" ? ("system" as NotifType) : f)
                      }
                      style={{
                        padding: "4px 12px",
                        fontSize: 13,
                        borderRadius: 20,
                        border: "1px solid",
                        borderColor:
                          filter === f
                            ? f === "all"
                              ? "var(--accent)"
                              : TYPE_COLORS[f as NotifType]
                            : "var(--border)",
                        background:
                          filter === f
                            ? f === "all"
                              ? "var(--accentD)"
                              : `${TYPE_COLORS[f as NotifType]}20`
                            : "transparent",
                        color:
                          filter === f
                            ? f === "all"
                              ? "var(--accent)"
                              : TYPE_COLORS[f as NotifType]
                            : "var(--text2)",
                        cursor: "pointer",
                        textTransform: "capitalize",
                      }}
                    >
                      {f}
                    </button>
                  )
                )}
                {unread > 0 && (
                  <button
                    onClick={() => markAllAsRead()}
                    style={{
                      marginLeft: "auto",
                      fontSize: 13,
                      color: "var(--accent)",
                      background: "none",
                      border: "none",
                      cursor: "pointer",
                    }}
                  >
                    Mark all read
                  </button>
                )}
              </div>

              {filtered.length === 0 ? (
                <div
                  style={{
                    textAlign: "center",
                    padding: "48px 24px",
                    color: "var(--text2)",
                  }}
                >
                  <p style={{ fontSize: 14, margin: 0 }}>
                    No notifications in this category.
                  </p>
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {filtered.map((n) => (
                    <div
                      key={n.id}
                      style={{
                        background: n.read ? "var(--surf2)" : "var(--surf3)",
                        borderRadius: "var(--radius)",
                        padding: 16,
                        border: `1px solid ${n.read ? "var(--border)" : TYPE_COLORS[n.type as NotifType]}40`,
                        display: "flex",
                        gap: 12,
                        alignItems: "flex-start",
                      }}
                    >
                      <div
                        style={{
                          width: 8,
                          height: 8,
                          borderRadius: "50%",
                          background: n.read
                            ? "transparent"
                            : TYPE_COLORS[n.type as NotifType],
                          marginTop: 4,
                          flexShrink: 0,
                        }}
                      />
                      <div style={{ flex: 1 }}>
                        <div
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "flex-start",
                            gap: 8,
                          }}
                        >
                          <div>
                            <span
                              style={{
                                fontSize: 12,
                                color: TYPE_COLORS[n.type as NotifType],
                                fontWeight: 600,
                                textTransform: "capitalize",
                                marginRight: 8,
                              }}
                            >
                              {n.type}
                            </span>
                            <span
                              style={{
                                fontWeight: n.read ? 400 : 600,
                                fontSize: 14,
                              }}
                            >
                              {n.title}
                            </span>
                          </div>
                          <span
                            style={{
                              fontSize: 12,
                              color: "var(--text3)",
                              whiteSpace: "nowrap",
                            }}
                          >
                            {timeAgo(n.created_at)}
                          </span>
                        </div>
                        <p
                          style={{
                            fontSize: 13,
                            color: "var(--text2)",
                            margin: "4px 0 0",
                          }}
                        >
                          {n.message}
                        </p>
                      </div>
                      <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
                        {!n.read && (
                          <button
                            onClick={() => markRead(n.id)}
                            style={{
                              fontSize: 11,
                              color: "var(--accent)",
                              background: "none",
                              border: "1px solid var(--accent)",
                              borderRadius: 10,
                              padding: "2px 8px",
                              cursor: "pointer",
                            }}
                          >
                            Read
                          </button>
                        )}
                        <button
                          onClick={() => setConfirmDelete({ id: n.id, title: n.title })}
                          style={{
                            background: "none",
                            border: "none",
                            cursor: "pointer",
                            color: "var(--text3)",
                            fontSize: 16,
                          }}
                        >
                          ×
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {activeTab === "preferences" && (
            <>
              {loading ? (
                <div
                  style={{
                    display: "flex",
                    justifyContent: "center",
                    padding: 48,
                  }}
                >
                  <PiqSpinner />
                </div>
              ) : prefs ? (
                <div style={{ maxWidth: 480 }}>
                  <div
                    style={{
                      background: "var(--surf2)",
                      borderRadius: "var(--radius)",
                      padding: 24,
                      border: "1px solid var(--border)",
                    }}
                  >
                    <div
                      style={{
                        fontWeight: 600,
                        fontSize: 15,
                        marginBottom: 20,
                      }}
                    >
                      Notification Preferences
                    </div>
                    {(
                      [
                        {
                          key: "skill_alerts",
                          label: "Skill Alerts",
                          desc: "Early warnings when new skills trend globally",
                        },
                        {
                          key: "career_updates",
                          label: "Career Updates",
                          desc: "New career path data and transition probabilities",
                        },
                        {
                          key: "cv_feedback",
                          label: "CV Feedback",
                          desc: "Notify when CV analysis is complete",
                        },
                        {
                          key: "interview_reminders",
                          label: "Interview Reminders",
                          desc: "Reminders to practice and session results",
                        },
                        {
                          key: "system_notices",
                          label: "System Notices",
                          desc: "Platform updates and announcements",
                        },
                      ] as const
                    ).map((item) => (
                      <div
                        key={item.key}
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                          padding: "12px 0",
                          borderBottom: "1px solid var(--border2)",
                        }}
                      >
                        <div>
                          <div style={{ fontWeight: 500, fontSize: 14 }}>
                            {item.label}
                          </div>
                          <div
                            style={{
                              fontSize: 12,
                              color: "var(--text2)",
                            }}
                          >
                            {item.desc}
                          </div>
                        </div>
                        <PiqToggle
                          value={prefs[item.key]}
                          onChange={(val) =>
                            setPrefs({ ...prefs, [item.key]: val })
                          }
                        />
                      </div>
                    ))}
                    <div style={{ marginTop: 20 }}>
                      <PiqBtn
                        onClick={handleSavePrefs}
                        disabled={saving}
                      >
                        {saving ? "Saving…" : "Save Preferences"}
                      </PiqBtn>
                    </div>
                  </div>
                </div>
              ) : null}
            </>
          )}
        </>
      )}

      <ConfirmDialog
        open={confirmDelete !== null}
        title="Delete notification?"
        message={`"${confirmDelete?.title ?? "This notification"}" will be permanently deleted.`}
        confirmLabel="Delete"
        destructive
        busy={deleting}
        onConfirm={handleDelete}
        onCancel={() => setConfirmDelete(null)}
      />
    </div>
  );
}
