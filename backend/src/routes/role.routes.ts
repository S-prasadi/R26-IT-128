import { Router } from "express";
import type { Response } from "express";
import { roleController } from "../controllers/role.controller";
import { authenticate } from "../middlewares/auth.middleware";
import { requirePermission } from "../middlewares/permissions.middleware";
import { validate } from "../middlewares/validate.middleware";
import {
  createRoleSchema,
  updateRoleSchema,
  attachPermissionSchema,
} from "../validations/role.validation";
import type { AuthRequest } from "../types";

const router = Router();

router.use(authenticate);

router.get(
  "/",
  requirePermission("roles:read"),
  (req, res) => roleController.list(req as AuthRequest, res as Response)
);

router.get(
  "/:id",
  requirePermission("roles:read"),
  (req, res) => roleController.getById(req as AuthRequest, res as Response)
);

router.post(
  "/",
  requirePermission("roles:write"),
  validate(createRoleSchema),
  (req, res) => roleController.create(req as AuthRequest, res as Response)
);

router.patch(
  "/:id",
  requirePermission("roles:write"),
  validate(updateRoleSchema),
  (req, res) => roleController.update(req as AuthRequest, res as Response)
);

router.delete(
  "/:id",
  requirePermission("roles:delete"),
  (req, res) => roleController.remove(req as AuthRequest, res as Response)
);

router.post(
  "/:id/permissions",
  requirePermission("permissions:assign"),
  validate(attachPermissionSchema),
  (req, res) => roleController.attachPermission(req as AuthRequest, res as Response)
);

router.delete(
  "/:id/permissions/:permissionId",
  requirePermission("permissions:assign"),
  (req, res) => roleController.detachPermission(req as AuthRequest, res as Response)
);

export default router;
