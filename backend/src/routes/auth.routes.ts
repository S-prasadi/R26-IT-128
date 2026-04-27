import { Router } from "express";
import { authController } from "../controllers/auth.controller";
import { registerValidation, loginValidation } from "../validations/auth.validation";
import { validate } from "../middlewares/validate.middleware";

const router = Router();

router.post("/register", registerValidation, validate, authController.register);
router.post("/login", loginValidation, validate, authController.login);

export default router;
