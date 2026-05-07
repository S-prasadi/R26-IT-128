import type { Response } from "express";
import { cvService } from "../services/cv.service";
import { notificationService } from "../services/notification.service";
import { sendSuccess } from "../utils/response";
import type { AuthRequest } from "../types";

const p = (v: unknown): string => (typeof v === "string" ? v : String(v));

export const cvController = {
  async list(req: AuthRequest, res: Response): Promise<void> {
    const data = await cvService.listCVs(req.user!.id);
    sendSuccess(res, data, "CVs fetched");
  },

  async get(req: AuthRequest, res: Response): Promise<void> {
    const data = await cvService.getCV(p(req.params["id"]), req.user!.id);
    sendSuccess(res, data, "CV fetched");
  },

  async create(req: AuthRequest, res: Response): Promise<void> {
    const data = await cvService.createCV(req.user!.id, req.body);
    sendSuccess(res, data, "CV created", 201);
  },

  async update(req: AuthRequest, res: Response): Promise<void> {
    const data = await cvService.updateCV(p(req.params["id"]), req.user!.id, req.body);
    sendSuccess(res, data, "CV updated");
  },

  async remove(req: AuthRequest, res: Response): Promise<void> {
    const data = await cvService.deleteCV(p(req.params["id"]), req.user!.id);
    sendSuccess(res, data, "CV deleted");
  },

  async upsertSections(req: AuthRequest, res: Response): Promise<void> {
    const data = await cvService.upsertSections(p(req.params["id"]), req.user!.id, req.body);
    sendSuccess(res, data, "Sections saved");
  },

  async analyze(req: AuthRequest, res: Response): Promise<void> {
    const data = await cvService.analyzeCV(p(req.params["id"]), req.user!.id, req.body);
    // Send in-app notification
    await notificationService.sendNotification(
      req.user!.id,
      "✅ CV Analysis Complete",
      "Your CV has been analyzed. Check your results and improvement suggestions!",
      "success",
      "✅",
      { screen: "cv", action: "view_analysis" }
    );
    sendSuccess(res, data, "CV analysed");
  },
};
