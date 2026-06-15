import { Router } from "express";
import type { Response } from "express";
import { careerController } from "../controllers/career.controller";
import { authenticate } from "../middlewares/auth.middleware";
import { requirePermission } from "../middlewares/permissions.middleware";
import { validate } from "../middlewares/validate.middleware";
import {
  upsertGoalSchema,
  addRoadmapItemSchema,
  updateRoadmapItemSchema,
  predictPathSchema,
  generateRoadmapSchema,
} from "../validations/career.validation";
import type { AuthRequest } from "../types";

const router = Router();
router.use(authenticate);

router.get("/goal", requirePermission("career:read"),
  (req, res) => careerController.getGoal(req as AuthRequest, res as Response));

router.post("/goal", requirePermission("career:write"),
  validate(upsertGoalSchema),
  (req, res) => careerController.upsertGoal(req as AuthRequest, res as Response));

router.get("/roadmap", requirePermission("career:read"),
  (req, res) => careerController.getRoadmap(req as AuthRequest, res as Response));

router.post("/roadmap", requirePermission("career:write"),
  validate(addRoadmapItemSchema),
  (req, res) => careerController.addRoadmapItem(req as AuthRequest, res as Response));

router.post("/roadmap/generate", requirePermission("career:write"),
  validate(generateRoadmapSchema),
  (req, res) => careerController.generateRoadmap(req as AuthRequest, res as Response));

router.patch("/roadmap/:id", requirePermission("career:write"),
  validate(updateRoadmapItemSchema),
  (req, res) => careerController.updateRoadmapItem(req as AuthRequest, res as Response));

router.delete("/roadmap/:id", requirePermission("career:write"),
  (req, res) => careerController.deleteRoadmapItem(req as AuthRequest, res as Response));

router.post("/predict", requirePermission("career:read"),
  validate(predictPathSchema),
  (req, res) => careerController.predictPath(req as AuthRequest, res as Response));

router.get("/predictions", requirePermission("career:read"),
  (req, res) => careerController.getPredictions(req as AuthRequest, res as Response));

router.delete("/predictions/:id", requirePermission("career:write"),
  (req, res) => careerController.deletePrediction(req as AuthRequest, res as Response));

export default router;
