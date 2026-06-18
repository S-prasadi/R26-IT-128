import { Router } from "express";
import type { Response } from "express";
import { interviewController } from "../controllers/interview.controller";
import { authenticate } from "../middlewares/auth.middleware";
import { requirePermission } from "../middlewares/permissions.middleware";
import { validate } from "../middlewares/validate.middleware";
import { uploadSingle } from "../middlewares/upload.middleware";
import {
  createSessionSchema,
  endSessionSchema,
  submitResponseSchema,
  predictEmotionSchema,
} from "../validations/interview.validation";
import type { AuthRequest } from "../types";

const router = Router();
router.use(authenticate);

router.get("/", requirePermission("interviews:read"),
  (req, res) => interviewController.list(req as AuthRequest, res as Response));

router.get("/:id", requirePermission("interviews:read"),
  (req, res) => interviewController.get(req as AuthRequest, res as Response));

router.post("/extract-document", requirePermission("interviews:write"),
  uploadSingle,
  (req, res) => interviewController.extractDocument(req as AuthRequest, res as Response));

router.post("/", requirePermission("interviews:write"),
  validate(createSessionSchema),
  (req, res) => interviewController.create(req as AuthRequest, res as Response));

router.patch("/:id", requirePermission("interviews:write"),
  validate(endSessionSchema),
  (req, res) => interviewController.end(req as AuthRequest, res as Response));

router.post("/:id/responses", requirePermission("interviews:write"),
  validate(submitResponseSchema),
  (req, res) => interviewController.submitResponse(req as AuthRequest, res as Response));

router.post("/predict-emotion", requirePermission("interviews:write"),
  validate(predictEmotionSchema),
  (req, res) => interviewController.predictEmotion(req as AuthRequest, res as Response));

export default router;
