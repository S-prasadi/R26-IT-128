import { Router } from "express";
import type { Response } from "express";
import { cvController } from "../controllers/cv.controller";
import { authenticate } from "../middlewares/auth.middleware";
import { requirePermission } from "../middlewares/permissions.middleware";
import { validate } from "../middlewares/validate.middleware";
import { uploadSingle } from "../middlewares/upload.middleware";
import {
  createCVSchema,
  updateCVSchema,
  upsertSectionsSchema,
  analyzeCVSchema,
} from "../validations/cv.validation";
import type { AuthRequest } from "../types";

const router = Router();
router.use(authenticate);

router.get("/", requirePermission("cv:read"),
  (req, res) => cvController.list(req as AuthRequest, res as Response));

router.get("/:id", requirePermission("cv:read"),
  (req, res) => cvController.get(req as AuthRequest, res as Response));

router.post("/", requirePermission("cv:write"),
  validate(createCVSchema),
  (req, res) => cvController.create(req as AuthRequest, res as Response));

router.patch("/:id", requirePermission("cv:write"),
  validate(updateCVSchema),
  (req, res) => cvController.update(req as AuthRequest, res as Response));

router.delete("/:id", requirePermission("cv:write"),
  (req, res) => cvController.remove(req as AuthRequest, res as Response));

router.put("/:id/sections", requirePermission("cv:write"),
  validate(upsertSectionsSchema),
  (req, res) => cvController.upsertSections(req as AuthRequest, res as Response));

router.post("/:id/analyze", requirePermission("cv:write"),
  validate(analyzeCVSchema),
  (req, res) => cvController.analyze(req as AuthRequest, res as Response));

router.post("/:id/upload", requirePermission("cv:write"),
  uploadSingle,
  (req, res) => cvController.upload(req as AuthRequest, res as Response));

export default router;
