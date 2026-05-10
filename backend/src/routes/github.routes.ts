import { Router } from "express";
import type { Request, Response } from "express";
import { githubController } from "../controllers/github.controller";
import { authenticate } from "../middlewares/auth.middleware";
import { requirePermission } from "../middlewares/permissions.middleware";
import type { AuthRequest } from "../types";

const router = Router();

// Public — GitHub redirects the browser here; no Bearer token available
router.get("/callback", (req, res) => githubController.callback(req as Request, res as Response));

// All remaining routes require authentication
router.use(authenticate);

router.get("/auth-url", requirePermission("skills:write"),
  (req, res) => githubController.getAuthUrl(req as AuthRequest, res as Response));

router.get("/status", requirePermission("skills:read"),
  (req, res) => githubController.status(req as AuthRequest, res as Response));

router.delete("/disconnect", requirePermission("skills:write"),
  (req, res) => githubController.disconnect(req as AuthRequest, res as Response));

router.post("/verify-skills", requirePermission("skills:write"),
  (req, res) => githubController.verifySkills(req as AuthRequest, res as Response));

export default router;
