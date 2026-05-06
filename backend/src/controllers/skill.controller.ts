import type { Response } from "express";
import { skillService } from "../services/skill.service";
import { sendSuccess } from "../utils/response";
import type { AuthRequest } from "../types";

const p = (v: unknown): string => (typeof v === "string" ? v : String(v));

export const skillController = {
  async listMaster(req: AuthRequest, res: Response): Promise<void> {
    const data = await skillService.listMasterSkills();
    sendSuccess(res, data, "Skills fetched");
  },

  async getUserSkills(req: AuthRequest, res: Response): Promise<void> {
    const data = await skillService.getUserSkills(req.user!.id);
    sendSuccess(res, data, "User skills fetched");
  },

  async addUserSkill(req: AuthRequest, res: Response): Promise<void> {
    const data = await skillService.addUserSkill(req.user!.id, req.body);
    sendSuccess(res, data, "Skill added", 201);
  },

  async updateUserSkill(req: AuthRequest, res: Response): Promise<void> {
    const data = await skillService.updateUserSkill(req.user!.id, p(req.params["skillId"]), req.body);
    sendSuccess(res, data, "Skill updated");
  },

  async deleteUserSkill(req: AuthRequest, res: Response): Promise<void> {
    const data = await skillService.deleteUserSkill(req.user!.id, p(req.params["skillId"]));
    sendSuccess(res, data, "Skill removed");
  },

  async getAssessments(req: AuthRequest, res: Response): Promise<void> {
    const skillId = req.query["skill_id"] as string | undefined;
    const data = await skillService.getAssessments(req.user!.id, skillId);
    sendSuccess(res, data, "Assessments fetched");
  },

  async logAssessment(req: AuthRequest, res: Response): Promise<void> {
    const data = await skillService.logAssessment(req.user!.id, p(req.params["skillId"]), req.body);
    sendSuccess(res, data, "Assessment logged", 201);
  },

  async runForecast(req: AuthRequest, res: Response): Promise<void> {
    const skills: string[] = req.body.skills ?? [];
    const data = await skillService.runForecast(req.user!.id, skills);
    sendSuccess(res, data, "Forecast generated");
  },
};
