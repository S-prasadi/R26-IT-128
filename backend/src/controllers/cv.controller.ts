import type { Response } from "express";
import { cvService } from "../services/cv.service";
import { interviewService } from "../services/interview.service";
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

  async upload(req: AuthRequest, res: Response): Promise<void> {
    if (!req.file) {
      res.status(400).json({ success: false, message: "No file uploaded." });
      return;
    }
    const data = await cvService.uploadCV(p(req.params["id"]), req.user!.id, req.file);
    sendSuccess(res, data, "CV uploaded and text extracted");
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

  async verifyProjects(req: AuthRequest, res: Response): Promise<void> {
    const data = await cvService.verifyProjects(p(req.params["id"]), req.user!.id);
    sendSuccess(res, data, "Projects verified against GitHub");
  },

  async attachJobPost(req: AuthRequest, res: Response): Promise<void> {
    // Accepts either a pasted job_text (JSON/form field) or an uploaded file
    // (PDF/PNG/JPG/TXT) which is OCR'd via Module D.
    let jobText: string = typeof req.body?.job_text === "string" ? req.body.job_text.trim() : "";
    if (!jobText && req.file) {
      try {
        const { extracted_text } = await interviewService.extractDocumentText(req.file.buffer, req.file.mimetype);
        jobText = extracted_text.trim();
      } catch {
        res.status(422).json({ success: false, message: "Could not extract text from the uploaded file. Please paste the job description as text instead." });
        return;
      }
    }
    if (jobText.length < 30) {
      res.status(400).json({ success: false, message: "Provide the job post text (paste it or upload a readable file)." });
      return;
    }
    const title = typeof req.body?.title === "string" && req.body.title.trim() ? req.body.title.trim() : undefined;
    const data = await cvService.attachJobPost(p(req.params["id"]), req.user!.id, { ...(title ? { title } : {}), job_text: jobText });
    sendSuccess(res, data, "Job post compared", 201);
  },

  async deleteJobPost(req: AuthRequest, res: Response): Promise<void> {
    const data = await cvService.deleteJobPost(p(req.params["id"]), req.user!.id, p(req.params["jobPostId"]));
    sendSuccess(res, data, "Job post removed");
  },
};
