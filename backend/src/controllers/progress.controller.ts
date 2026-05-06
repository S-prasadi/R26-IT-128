import type { Response } from "express";
import { progressService } from "../services/progress.service";
import { sendSuccess } from "../utils/response";
import type { AuthRequest } from "../types";

const p = (v: unknown): string => (typeof v === "string" ? v : String(v));

export const progressController = {
  async getProgress(req: AuthRequest, res: Response): Promise<void> {
    const data = await progressService.getModuleProgress(req.user!.id);
    sendSuccess(res, data, "Progress fetched");
  },

  async updateProgress(req: AuthRequest, res: Response): Promise<void> {
    const module = p(req.params["module"]) as "skill" | "career" | "cv" | "interview";
    const data = await progressService.updateProgress(req.user!.id, module, req.body.completion_pct);
    sendSuccess(res, data, "Progress updated");
  },

  async getMilestones(req: AuthRequest, res: Response): Promise<void> {
    const data = await progressService.getMilestones(req.user!.id);
    sendSuccess(res, data, "Milestones fetched");
  },

  async achieveMilestone(req: AuthRequest, res: Response): Promise<void> {
    const data = await progressService.achieveMilestone(req.user!.id, p(req.params["id"]));
    sendSuccess(res, data, "Milestone achieved");
  },
};
