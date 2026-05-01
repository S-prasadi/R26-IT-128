import { Router } from "express";
import type { Response } from "express";
import { authController } from "../controllers/auth.controller";
import { authenticate } from "../middlewares/auth.middleware";
import { validate } from "../middlewares/validate.middleware";
import {
  registerSchema,
  loginSchema,
  refreshSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
} from "../validations/auth.validation";
import type { AuthRequest } from "../types";

const router = Router();

router.post("/register", validate(registerSchema), authController.register);
router.post("/login", validate(loginSchema), authController.login);
router.post("/refresh", validate(refreshSchema), authController.refresh);
router.post("/forgot-password", validate(forgotPasswordSchema), authController.forgotPassword);

router.post("/logout", authenticate, (req, res) =>
  authController.logout(req as AuthRequest, res as Response)
);
router.post(
  "/reset-password",
  authenticate,
  validate(resetPasswordSchema),
  (req, res) => authController.resetPassword(req as AuthRequest, res as Response)
);
router.get("/me", authenticate, (req, res) =>
  authController.getMe(req as AuthRequest, res as Response)
);
router.post("/seed-admin", authController.seedAdmin);

export default router;
