import type { Response } from "express";
import { careerService } from "../services/career.service";
import { skillService } from "../services/skill.service";
import { sendSuccess } from "../utils/response";
import type { AuthRequest } from "../types";

const p = (v: unknown): string => (typeof v === "string" ? v : String(v));

export const careerController = {
  async getGoal(req: AuthRequest, res: Response): Promise<void> {
    const data = await careerService.getGoal(req.user!.id);
    sendSuccess(res, data, "Career goal fetched");
  },

  async upsertGoal(req: AuthRequest, res: Response): Promise<void> {
    const data = await careerService.upsertGoal(req.user!.id, req.body);
    sendSuccess(res, data, "Career goal saved");
  },

  async getRoadmap(req: AuthRequest, res: Response): Promise<void> {
    const data = await careerService.getRoadmap(req.user!.id);
    sendSuccess(res, data, "Roadmap fetched");
  },

  async addRoadmapItem(req: AuthRequest, res: Response): Promise<void> {
    const data = await careerService.addRoadmapItem(req.user!.id, req.body);
    sendSuccess(res, data, "Roadmap item added", 201);
  },

  async updateRoadmapItem(req: AuthRequest, res: Response): Promise<void> {
    const data = await careerService.updateRoadmapItem(req.user!.id, p(req.params["id"]), req.body);
    sendSuccess(res, data, "Roadmap item updated");
  },

  async deleteRoadmapItem(req: AuthRequest, res: Response): Promise<void> {
    const data = await careerService.deleteRoadmapItem(req.user!.id, p(req.params["id"]));
    sendSuccess(res, data, "Roadmap item deleted");
  },

  async predictPath(req: AuthRequest, res: Response): Promise<void> {
    const userSkills = await skillService.getUserSkills(req.user!.id);
    const data = await careerService.predictPath(req.user!.id, req.body, userSkills);
    sendSuccess(res, data, "Career path generated");
  },

  async modelStatus(_req: AuthRequest, res: Response): Promise<void> {
    const data = await careerService.getModelStatus();
    sendSuccess(res, data, "Model status fetched");
  },

  async getPredictions(req: AuthRequest, res: Response): Promise<void> {
    const data = await careerService.getPredictions(req.user!.id);
    sendSuccess(res, data, "Prediction history fetched");
  },

  async deletePrediction(req: AuthRequest, res: Response): Promise<void> {
    const data = await careerService.deletePrediction(req.user!.id, p(req.params["id"]));
    sendSuccess(res, data, "Prediction deleted");
  },

  async generateRoadmap(req: AuthRequest, res: Response): Promise<void> {
    const data = await careerService.generateRoadmap(req.user!.id, req.body.path_id);
    sendSuccess(res, data, "Roadmap generated from skill gaps", 201);
  },
};
