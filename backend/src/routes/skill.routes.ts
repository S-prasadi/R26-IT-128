import { Router } from "express";
import type { Response } from "express";
import { skillController } from "../controllers/skill.controller";
import { authenticate } from "../middlewares/auth.middleware";
import { requirePermission } from "../middlewares/permissions.middleware";
import { validate } from "../middlewares/validate.middleware";
import {
  addUserSkillSchema,
  updateUserSkillSchema,
  logAssessmentSchema,
  runForecastSchema,
} from "../validations/skill.validation";
import type { AuthRequest } from "../types";

const router = Router();
router.use(authenticate);

router.get("/", requirePermission("skills:read"),
  (req, res) => skillController.listMaster(req as AuthRequest, res as Response));

router.get("/user", requirePermission("skills:read"),
  (req, res) => skillController.getUserSkills(req as AuthRequest, res as Response));

router.post("/user", requirePermission("skills:write"),
  validate(addUserSkillSchema),
  (req, res) => skillController.addUserSkill(req as AuthRequest, res as Response));

// :userSkillId below is a `user_skills` row id, whereas :skillId on the assess
// route is a master `skills` id. Same URL shape as before -- the param names
// now say which id each one actually wants.
router.patch("/user/:userSkillId", requirePermission("skills:write"),
  validate(updateUserSkillSchema),
  (req, res) => skillController.updateUserSkill(req as AuthRequest, res as Response));

router.delete("/user/:userSkillId", requirePermission("skills:write"),
  (req, res) => skillController.deleteUserSkill(req as AuthRequest, res as Response));

router.get("/assessments", requirePermission("skills:read"),
  (req, res) => skillController.getAssessments(req as AuthRequest, res as Response));

router.post("/user/:skillId/assess", requirePermission("skills:write"),
  validate(logAssessmentSchema),
  (req, res) => skillController.logAssessment(req as AuthRequest, res as Response));

router.post("/forecast", requirePermission("skills:read"),
  validate(runForecastSchema),
  (req, res) => skillController.runForecast(req as AuthRequest, res as Response));

export default router;
