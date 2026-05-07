import type { Response } from "express";
import { notificationService } from "../services/notification.service";
import { sendSuccess } from "../utils/response";
import type { AuthRequest } from "../types";

function getNotificationId(params: AuthRequest["params"]): string {
  const notificationId = params.id;
  return Array.isArray(notificationId) ? notificationId[0] : notificationId;
}

export const notificationController = {
  // ============ PREFERENCES ============
  async getPreferences(req: AuthRequest, res: Response): Promise<void> {
    const data = await notificationService.getPreferences(req.user!.id);
    sendSuccess(res, data, "Preferences fetched");
  },

  async updatePreferences(req: AuthRequest, res: Response): Promise<void> {
    const data = await notificationService.updatePreferences(req.user!.id, req.body);
    sendSuccess(res, data, "Preferences updated");
  },

  async saveFCMToken(req: AuthRequest, res: Response): Promise<void> {
    const data = await notificationService.saveFCMToken(req.user!.id, req.body);
    sendSuccess(res, data, "FCM token registered", 201);
  },

  // ============ IN-APP NOTIFICATIONS ============
  async getNotifications(req: AuthRequest, res: Response): Promise<void> {
    const limit = parseInt(req.query.limit as string) || 50;
    const unreadOnly = req.query.unread === 'true';
    const data = await notificationService.getNotifications(req.user!.id, limit, unreadOnly);
    sendSuccess(res, data, "Notifications fetched");
  },

  async getUnreadCount(req: AuthRequest, res: Response): Promise<void> {
    const count = await notificationService.getUnreadCount(req.user!.id);
    sendSuccess(res, { count }, "Unread count fetched");
  },

  async markAsRead(req: AuthRequest, res: Response): Promise<void> {
    const data = await notificationService.markAsRead(req.user!.id, getNotificationId(req.params));
    sendSuccess(res, data, "Notification marked as read");
  },

  async markAllAsRead(req: AuthRequest, res: Response): Promise<void> {
    const data = await notificationService.markAllAsRead(req.user!.id);
    sendSuccess(res, data, `${data.length} notifications marked as read`);
  },

  async deleteNotification(req: AuthRequest, res: Response): Promise<void> {
    const data = await notificationService.deleteNotification(req.user!.id, getNotificationId(req.params));
    sendSuccess(res, data, "Notification deleted");
  },

  async sendNotification(req: AuthRequest, res: Response): Promise<void> {
    const { user_id, title, message, type, icon } = req.body;
    const targetId = user_id ?? req.user!.id;
    const data = await notificationService.sendNotification(targetId, title, message, type ?? "info", icon);
    sendSuccess(res, data, "Notification sent", 201);
  },
};
