import apiClient from "@/lib/axios";
import type { ApiResponse, NotificationPreferences } from "@/types";

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

export const notificationService = {
  getPreferences: () =>
    apiClient.get<ApiResponse<NotificationPreferences>>("/notifications/preferences"),

  updatePreferences: (data: Partial<Omit<NotificationPreferences, "id" | "updated_at">>) =>
    apiClient.patch<ApiResponse<NotificationPreferences>>("/notifications/preferences", data),

  saveFCMToken: (token: string, device_name?: string) =>
    apiClient.post<ApiResponse<{ id: string; token: string }>>("/notifications/fcm-token", { token, device_name }),

  getAll: (limit = 50, unreadOnly = false) => {
    const params = { limit };
    if (unreadOnly) Object.assign(params, { unread: true });
    return apiClient.get<ApiResponse<Notification[]>>("/notifications", { params });
  },

  getUnreadCount: () =>
    apiClient.get<ApiResponse<{ count: number }>>("/notifications/unread/count"),

  markAsRead: (notificationId: string) =>
    apiClient.patch<ApiResponse<Notification>>(`/notifications/${notificationId}/read`),

  markAllAsRead: () =>
    apiClient.patch<ApiResponse<Notification[]>>("/notifications/read/all"),

  delete: (notificationId: string) =>
    apiClient.delete<ApiResponse<null>>(`/notifications/${notificationId}`),
};
