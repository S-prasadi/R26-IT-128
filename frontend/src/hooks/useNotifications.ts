"use client";

import { useEffect, useState, useCallback } from "react";
import apiClient from "@/lib/axios";

export interface Notification {
  id: string;
  user_id: string;
  title: string;
  message: string;
  type: "info" | "success" | "warning" | "error" | "skill" | "career" | "cv" | "interview" | "system";
  icon?: string;
  data?: Record<string, any>;
  read: boolean;
  created_at: string;
  updated_at: string;
}

export function useNotifications() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch all notifications
  const fetchNotifications = useCallback(async (unreadOnly = false) => {
    try {
      setLoading(true);
      setError(null);

      const params = unreadOnly ? { unread: true } : {};
      const response = await apiClient.get("/notifications", { params });
      setNotifications(response.data.data || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
      console.error("Failed to fetch notifications:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  // Fetch unread count
  const fetchUnreadCount = useCallback(async () => {
    try {
      const response = await apiClient.get("/notifications/unread/count");
      setUnreadCount(response.data.data?.count || 0);
    } catch (err) {
      console.error("Failed to fetch unread count:", err);
    }
  }, []);

  // Mark notification as read
  const markAsRead = useCallback(
    async (notificationId: string) => {
      try {
        await apiClient.patch(`/notifications/${notificationId}/read`);
        setNotifications((prev) =>
          prev.map((n) => (n.id === notificationId ? { ...n, read: true } : n))
        );
        fetchUnreadCount();
      } catch (err) {
        console.error("Failed to mark notification as read:", err);
      }
    },
    [fetchUnreadCount]
  );

  // Mark all notifications as read
  const markAllAsRead = useCallback(async () => {
    try {
      await apiClient.patch("/notifications/read/all");
      setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
      setUnreadCount(0);
    } catch (err) {
      console.error("Failed to mark all as read:", err);
    }
  }, []);

  // Delete notification
  const deleteNotification = useCallback(
    async (notificationId: string) => {
      try {
        await apiClient.delete(`/notifications/${notificationId}`);
        setNotifications((prev) => prev.filter((n) => n.id !== notificationId));
        fetchUnreadCount();
      } catch (err) {
        console.error("Failed to delete notification:", err);
      }
    },
    [fetchUnreadCount]
  );

  // Initial load and polling
  useEffect(() => {
    // Initial fetch
    fetchNotifications();
    fetchUnreadCount();

    // Poll for new notifications every 10 seconds
    const interval = setInterval(() => {
      fetchNotifications();
      fetchUnreadCount();
    }, 10000);

    return () => clearInterval(interval);
  }, [fetchNotifications, fetchUnreadCount]);

  return {
    notifications,
    unreadCount,
    loading,
    error,
    fetchNotifications,
    fetchUnreadCount,
    markAsRead,
    markAllAsRead,
    deleteNotification,
  };
}
