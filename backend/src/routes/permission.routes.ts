import { Router } from "express";
import type { Response } from "express";
import { permissionController } from "../controllers/permission.controller";
import { authenticate } from "../middlewares/auth.middleware";
import { requirePermission } from "../middlewares/permissions.middleware";
import { validate } from "../middlewares/validate.middleware";
import { createPermissionSchema } from "../validations/role.validation";
import type { AuthRequest } from "../types";

const router = Router();

router.use(authenticate);

router.get(
  "/",
  requirePermission("permissions:read"),
  (req, res) => permissionController.list(req as AuthRequest, res as Response)
);

router.post(
  "/",
  requirePermission("roles:write"),
  validate(createPermissionSchema),
  (req, res) => permissionController.create(req as AuthRequest, res as Response)
);

export default router;
