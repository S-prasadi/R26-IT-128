import { Router } from "express";
import type { Response } from "express";
import { progressController } from "../controllers/progress.controller";
import { authenticate } from "../middlewares/auth.middleware";
import { requirePermission } from "../middlewares/permissions.middleware";
import { validate } from "../middlewares/validate.middleware";
import { updateProgressSchema } from "../validations/progress.validation";
import type { AuthRequest } from "../types";

const router = Router();
router.use(authenticate);

router.get("/", requirePermission("progress:read"),
  (req, res) => progressController.getProgress(req as AuthRequest, res as Response));

router.patch("/:module", requirePermission("progress:write"),
  validate(updateProgressSchema),
  (req, res) => progressController.updateProgress(req as AuthRequest, res as Response));

router.get("/milestones", requirePermission("progress:read"),
  (req, res) => progressController.getMilestones(req as AuthRequest, res as Response));

router.patch("/milestones/:id", requirePermission("progress:write"),
  (req, res) => progressController.achieveMilestone(req as AuthRequest, res as Response));

export default router;
