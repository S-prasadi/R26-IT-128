import { Router } from "express";
import type { Response } from "express";
import { notificationController } from "../controllers/notification.controller";
import { authenticate } from "../middlewares/auth.middleware";
import { requirePermission } from "../middlewares/permissions.middleware";
import { validate } from "../middlewares/validate.middleware";
import {
  updatePreferencesSchema,
  saveFCMTokenSchema,
} from "../validations/notification.validation";
import type { AuthRequest } from "../types";

const router = Router();
router.use(authenticate);

// ============ PREFERENCES ============
router.get("/preferences", requirePermission("notifications:read"),
  (req, res) => notificationController.getPreferences(req as AuthRequest, res as Response));

router.patch("/preferences", requirePermission("notifications:write"),
  validate(updatePreferencesSchema),
  (req, res) => notificationController.updatePreferences(req as AuthRequest, res as Response));

router.post("/fcm-token", requirePermission("notifications:write"),
  validate(saveFCMTokenSchema),
  (req, res) => notificationController.saveFCMToken(req as AuthRequest, res as Response));

// ============ IN-APP NOTIFICATIONS ============
router.get("/", requirePermission("notifications:read"),
  (req, res) => notificationController.getNotifications(req as AuthRequest, res as Response));

router.get("/unread/count", requirePermission("notifications:read"),
  (req, res) => notificationController.getUnreadCount(req as AuthRequest, res as Response));

router.patch("/:id/read", requirePermission("notifications:write"),
  (req, res) => notificationController.markAsRead(req as AuthRequest, res as Response));

router.patch("/read/all", requirePermission("notifications:write"),
  (req, res) => notificationController.markAllAsRead(req as AuthRequest, res as Response));

router.delete("/:id", requirePermission("notifications:write"),
  (req, res) => notificationController.deleteNotification(req as AuthRequest, res as Response));

router.post("/send", requirePermission("users:write"),
  (req, res) => notificationController.sendNotification(req as AuthRequest, res as Response));

export default router;
