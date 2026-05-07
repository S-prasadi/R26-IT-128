import { supabaseAdmin } from "../config/supabase";
import { AppError } from "../middlewares/error.middleware";
import { HTTP_STATUS } from "../constants/http";
import type {
  UpdatePreferencesDto,
  SaveFCMTokenDto,
} from "../validations/notification.validation";

export const notificationService = {
  // ============ PREFERENCES ============
  async getPreferences(userId: string) {
    const { data } = await supabaseAdmin
      .from("notification_preferences")
      .select("id, skill_alerts, career_updates, cv_feedback, interview_reminders, system_notices, updated_at")
      .eq("user_id", userId)
      .maybeSingle();

    if (!data) {
      const { data: created, error } = await supabaseAdmin
        .from("notification_preferences")
        .insert({ user_id: userId })
        .select("id, skill_alerts, career_updates, cv_feedback, interview_reminders, system_notices, updated_at")
        .single();
      if (error) throw new AppError(error.message, HTTP_STATUS.INTERNAL_SERVER_ERROR);
      return created;
    }
    return data;
  },

  async updatePreferences(userId: string, dto: UpdatePreferencesDto) {
    const { data, error } = await supabaseAdmin
      .from("notification_preferences")
      .upsert({ user_id: userId, ...dto }, { onConflict: "user_id" })
      .select("id, skill_alerts, career_updates, cv_feedback, interview_reminders, system_notices, updated_at")
      .single();
    if (error) throw new AppError(error.message, HTTP_STATUS.BAD_REQUEST);
    return data;
  },

  async saveFCMToken(userId: string, dto: SaveFCMTokenDto) {
    const { data, error } = await supabaseAdmin
      .from("fcm_tokens")
      .upsert(
        { user_id: userId, token: dto.token, device_name: dto.device_name, updated_at: new Date().toISOString() },
        { onConflict: "token" }
      )
      .select("id, token, device_name, updated_at")
      .single();
    if (error) throw new AppError(error.message, HTTP_STATUS.BAD_REQUEST);
    return data;
  },

  // ============ IN-APP NOTIFICATIONS ============
  async sendNotification(
    userId: string,
    title: string,
    message: string,
    type: 'info' | 'success' | 'warning' | 'error' = 'info',
    icon?: string,
    data?: Record<string, any>
  ) {
    const { data: notification, error } = await supabaseAdmin
      .from("notifications")
      .insert({
        user_id: userId,
        title,
        message,
        type,
        icon,
        data: data || {},
      })
      .select()
      .single();

    if (error) throw new AppError(error.message, HTTP_STATUS.INTERNAL_SERVER_ERROR);
    return notification;
  },

  async getNotifications(userId: string, limit = 50, unreadOnly = false) {
    let query = supabaseAdmin
      .from("notifications")
      .select("*")
      .eq("user_id", userId);

    if (unreadOnly) {
      query = query.eq("read", false);
    }

    const { data, error } = await query
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error) throw new AppError(error.message, HTTP_STATUS.INTERNAL_SERVER_ERROR);
    return data;
  },

  async markAsRead(userId: string, notificationId: string) {
    const { data, error } = await supabaseAdmin
      .from("notifications")
      .update({ read: true })
      .eq("id", notificationId)
      .eq("user_id", userId)
      .select()
      .single();

    if (error) throw new AppError(error.message, HTTP_STATUS.INTERNAL_SERVER_ERROR);
    return data;
  },

  async markAllAsRead(userId: string) {
    const { data, error } = await supabaseAdmin
      .from("notifications")
      .update({ read: true })
      .eq("user_id", userId)
      .select();

    if (error) throw new AppError(error.message, HTTP_STATUS.INTERNAL_SERVER_ERROR);
    return data;
  },

  async deleteNotification(userId: string, notificationId: string) {
    const { error } = await supabaseAdmin
      .from("notifications")
      .delete()
      .eq("id", notificationId)
      .eq("user_id", userId);

    if (error) throw new AppError(error.message, HTTP_STATUS.INTERNAL_SERVER_ERROR);
    return { success: true };
  },

  async getUnreadCount(userId: string) {
    const { count, error } = await supabaseAdmin
      .from("notifications")
      .select("*", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("read", false);

    if (error) throw new AppError(error.message, HTTP_STATUS.INTERNAL_SERVER_ERROR);
    return count || 0;
  },
};
