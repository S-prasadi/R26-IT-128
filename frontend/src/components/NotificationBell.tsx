"use client";

import { useState } from "react";
import { useNotifications } from "@/hooks/useNotifications";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";

export function NotificationBell() {
  const {
    notifications,
    unreadCount,
    loading,
    markAsRead,
    markAllAsRead,
    deleteNotification,
  } = useNotifications();

  const [isOpen, setIsOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<{ id: string; title: string } | null>(null);
  const [deleting, setDeleting] = useState(false);

  const getIconForType = (type: string) => {
    switch (type) {
      case "success":
        return "✅";
      case "warning":
        return "⚠️";
      case "error":
        return "❌";
      default:
        return "ℹ️";
    }
  };

  const getColorForType = (type: string) => {
    switch (type) {
      case "success":
        return "bg-green-50 border-green-200";
      case "warning":
        return "bg-yellow-50 border-yellow-200";
      case "error":
        return "bg-red-50 border-red-200";
      default:
        return "bg-blue-50 border-blue-200";
    }
  };

  const handleMarkAsRead = async (notificationId: string) => {
    await markAsRead(notificationId);
    toast.success("Notification marked as read");
  };

  const handleDelete = async () => {
    if (!confirmDelete) return;
    setDeleting(true);
    try {
      await deleteNotification(confirmDelete.id);
      setConfirmDelete(null);
      toast.success("Notification deleted");
    } finally {
      setDeleting(false);
    }
  };

  const handleMarkAllAsRead = async () => {
    await markAllAsRead();
    toast.success("All notifications marked as read");
  };

  return (
    <div style={{ position: "relative" }}>
      {/* Bell Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        style={{
          position: "relative",
          padding: "8px",
          borderRadius: "8px",
          border: "none",
          background: "transparent",
          cursor: "pointer",
          transition: "background 0.2s",
        }}
        onMouseEnter={(e) => (e.currentTarget.style.background = "var(--surf2)")}
        onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
        aria-label="Notifications"
      >
        <svg
          style={{ width: "24px", height: "24px", color: "var(--text2)" }}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
          />
        </svg>

        {/* Unread Badge */}
        {unreadCount > 0 && (
          <span
            style={{
              position: "absolute",
              top: "0",
              right: "0",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              paddingLeft: "8px",
              paddingRight: "8px",
              paddingTop: "4px",
              paddingBottom: "4px",
              fontSize: "12px",
              fontWeight: "bold",
              color: "white",
              transform: "translate(50%, -50%)",
              background: "var(--rose)",
              borderRadius: "9999px",
            }}
          >
            {unreadCount}
          </span>
        )}
      </button>

      {/* Notification Dropdown */}
      {isOpen && (
        <div
          style={{
            position: "absolute",
            right: "0",
            marginTop: "8px",
            width: "384px",
            background: "var(--surf)",
            borderRadius: "8px",
            boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.1)",
            border: "1px solid var(--border)",
            zIndex: 50,
          }}
        >
          {/* Header */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "16px",
              borderBottom: "1px solid var(--border)",
            }}
          >
            <h3 style={{ fontWeight: "600", color: "var(--text)" }}>Notifications</h3>
            {unreadCount > 0 && (
              <button
                onClick={handleMarkAllAsRead}
                style={{
                  fontSize: "12px",
                  color: "var(--accent)",
                  fontWeight: "500",
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                }}
                onMouseEnter={(e) => (e.currentTarget.style.opacity = "0.8")}
                onMouseLeave={(e) => (e.currentTarget.style.opacity = "1")}
              >
                Mark all as read
              </button>
            )}
          </div>

          {/* Notifications List */}
          <div style={{ maxHeight: "384px", overflowY: "auto" }}>
            {loading && (
              <div
                style={{
                  padding: "16px",
                  textAlign: "center",
                  color: "var(--text3)",
                }}
              >
                <p>Loading notifications...</p>
              </div>
            )}

            {!loading && notifications.length === 0 && (
              <div
                style={{
                  padding: "32px",
                  textAlign: "center",
                  color: "var(--text3)",
                }}
              >
                <p>No notifications yet</p>
              </div>
            )}

            {!loading &&
              notifications.map((notification, index) => (
                <div
                  key={notification.id}
                  style={{
                    padding: "16px",
                    borderBottom: index !== notifications.length - 1 ? "1px solid var(--border)" : "none",
                    background: !notification.read ? "var(--surf2)" : "transparent",
                    transition: "background 0.2s",
                  }}
                >
                  <div style={{ display: "flex", gap: "12px" }}>
                    {/* Icon */}
                    <div style={{ flexShrink: 0, fontSize: "18px" }}>
                      {notification.icon || getIconForType(notification.type)}
                    </div>

                    {/* Content */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div
                        style={{
                          display: "flex",
                          alignItems: "flex-start",
                          justifyContent: "space-between",
                          gap: "8px",
                        }}
                      >
                        <div style={{ flex: 1 }}>
                          <p
                            style={{
                              fontWeight: "600",
                              color: "var(--text)",
                              fontSize: "14px",
                              margin: 0,
                            }}
                          >
                            {notification.title}
                          </p>
                          <p
                            style={{
                              color: "var(--text2)",
                              fontSize: "14px",
                              marginTop: "4px",
                              marginBottom: 0,
                              display: "-webkit-box",
                              WebkitLineClamp: 2,
                              WebkitBoxOrient: "vertical",
                              overflow: "hidden",
                            }}
                          >
                            {notification.message}
                          </p>
                        </div>

                        {!notification.read && (
                          <div
                            style={{
                              flexShrink: 0,
                              width: "8px",
                              height: "8px",
                              background: "var(--accent)",
                              borderRadius: "50%",
                              marginTop: "8px",
                            }}
                          />
                        )}
                      </div>

                      {/* Timestamp */}
                      <p
                        style={{
                          fontSize: "12px",
                          color: "var(--text3)",
                          marginTop: "8px",
                          margin: "8px 0 0 0",
                        }}
                      >
                        {new Date(notification.created_at).toLocaleDateString()}{" "}
                        {new Date(notification.created_at).toLocaleTimeString()}
                      </p>

                      {/* Actions */}
                      <div style={{ display: "flex", gap: "8px", marginTop: "8px" }}>
                        {!notification.read && (
                          <button
                            onClick={() => handleMarkAsRead(notification.id)}
                            style={{
                              fontSize: "12px",
                              color: "var(--accent)",
                              fontWeight: "500",
                              background: "none",
                              border: "none",
                              cursor: "pointer",
                            }}
                            onMouseEnter={(e) => (e.currentTarget.style.opacity = "0.8")}
                            onMouseLeave={(e) => (e.currentTarget.style.opacity = "1")}
                          >
                            Mark as read
                          </button>
                        )}
                        <button
                          onClick={() => setConfirmDelete({ id: notification.id, title: notification.title })}
                          style={{
                            fontSize: "12px",
                            color: "var(--rose)",
                            fontWeight: "500",
                            background: "none",
                            border: "none",
                            cursor: "pointer",
                          }}
                          onMouseEnter={(e) => (e.currentTarget.style.opacity = "0.8")}
                          onMouseLeave={(e) => (e.currentTarget.style.opacity = "1")}
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
          </div>

          {/* Footer */}
          <div
            style={{
              padding: "12px",
              borderTop: "1px solid var(--border)",
              textAlign: "center",
            }}
          >
            <a
              href="/notifications"
              style={{
                fontSize: "14px",
                color: "var(--accent)",
                fontWeight: "500",
                textDecoration: "none",
              }}
              onMouseEnter={(e) => (e.currentTarget.style.opacity = "0.8")}
              onMouseLeave={(e) => (e.currentTarget.style.opacity = "1")}
            >
              View all notifications
            </a>
          </div>
        </div>
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
