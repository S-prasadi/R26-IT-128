import { Router } from "express";
import type { Response } from "express";
import { userController } from "../controllers/user.controller";
import { authenticate } from "../middlewares/auth.middleware";
import { requirePermission } from "../middlewares/permissions.middleware";
import { validate } from "../middlewares/validate.middleware";
import {
  updateUserSchema,
  assignRoleSchema,
  listUsersQuerySchema,
} from "../validations/user.validation";
import type { AuthRequest } from "../types";

const router = Router();

router.use(authenticate);

router.get(
  "/",
  requirePermission("users:read"),
  validate(listUsersQuerySchema, "query"),
  (req, res) => userController.list(req as AuthRequest, res as Response)
);

router.get(
  "/:id",
  requirePermission("users:read"),
  (req, res) => userController.getById(req as AuthRequest, res as Response)
);

router.patch(
  "/:id",
  requirePermission("users:write"),
  validate(updateUserSchema),
  (req, res) => userController.update(req as AuthRequest, res as Response)
);

router.delete(
  "/:id",
  requirePermission("users:delete"),
  (req, res) => userController.deactivate(req as AuthRequest, res as Response)
);

router.delete(
  "/:id/hard",
  requirePermission("users:delete"),
  (req, res) => userController.hardDelete(req as AuthRequest, res as Response)
);

router.post(
  "/:id/roles",
  requirePermission("roles:write"),
  validate(assignRoleSchema),
  (req, res) => userController.assignRole(req as AuthRequest, res as Response)
);

router.delete(
  "/:id/roles/:roleId",
  requirePermission("roles:write"),
  (req, res) => userController.removeRole(req as AuthRequest, res as Response)
);

export default router;
