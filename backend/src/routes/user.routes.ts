import { Router } from "express";
import { userController } from "../controllers/user.controller";
import { authenticate, authorize } from "../middlewares/auth.middleware";
import type { AuthRequest } from "../types";
import type { Response } from "express";

const router = Router();

router.use(authenticate);

router.get("/me", (req, res) =>
  userController.getMe(req as AuthRequest, res as Response)
);

router.get("/", authorize("admin"), (req, res) =>
  userController.getAll(req as AuthRequest, res as Response)
);

export default router;
