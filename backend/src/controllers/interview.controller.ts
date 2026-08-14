import type { Response } from "express";
import { interviewService } from "../services/interview.service";
import { notificationService } from "../services/notification.service";
import { sendSuccess } from "../utils/response";
import type { AuthRequest } from "../types";

const p = (v: unknown): string => (typeof v === "string" ? v : String(v));

export const interviewController = {
  async list(req: AuthRequest, res: Response): Promise<void> {
    const data = await interviewService.listSessions(req.user!.id);
    sendSuccess(res, data, "Sessions fetched");
  },

  async get(req: AuthRequest, res: Response): Promise<void> {
    const data = await interviewService.getSession(p(req.params["id"]), req.user!.id);
    sendSuccess(res, data, "Session fetched");
  },

  async create(req: AuthRequest, res: Response): Promise<void> {
    const data = await interviewService.createSession(req.user!.id, req.body);
    sendSuccess(res, data, "Interview session started", 201);
  },

  async end(req: AuthRequest, res: Response): Promise<void> {
    const data = await interviewService.endSession(p(req.params["id"]), req.user!.id, req.body);
    // Send in-app notification
    await notificationService.sendNotification(
      req.user!.id,
      "🎤 Interview Complete",
      "Your interview session has been completed! Review your performance analysis and feedback.",
      "success",
      "🎤",
      { screen: "interview", action: "view_results", sessionId: data.id }
    );
    sendSuccess(res, data, "Session ended");
  },

  async submitResponse(req: AuthRequest, res: Response): Promise<void> {
    const data = await interviewService.submitResponse(p(req.params["id"]), req.user!.id, req.body);
    sendSuccess(res, data, "Response submitted");
  },

  async predictEmotion(req: AuthRequest, res: Response): Promise<void> {
    const data = await interviewService.predictEmotion(p(req.body.frame), Number(req.body.sensitivity ?? 50));
    sendSuccess(res, data, "Emotion predicted");
  },

  async extractDocument(req: AuthRequest, res: Response): Promise<void> {
    if (!req.file) {
      res.status(400).json({ success: false, message: "No file uploaded." });
      return;
    }
    const data = await interviewService.extractDocumentText(req.file.buffer, req.file.mimetype);
    sendSuccess(res, data, "Document text extracted");
  },
};
