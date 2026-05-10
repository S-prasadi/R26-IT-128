import type { Request, Response } from "express";
import { githubService } from "../services/github.service";
import { sendSuccess } from "../utils/response";
import { env } from "../config/env";
import type { AuthRequest } from "../types";
import crypto from "crypto";

// In-memory state map for CSRF protection during OAuth flow.
// state (UUID) → userId. Entries auto-expire after 10 minutes.
const oauthStateMap = new Map<string, string>();

export const githubController = {
  async getAuthUrl(req: AuthRequest, res: Response): Promise<void> {
    const state = crypto.randomUUID();
    oauthStateMap.set(state, req.user!.id);
    setTimeout(() => oauthStateMap.delete(state), 10 * 60 * 1000);
    const url = githubService.getAuthUrl(state);
    sendSuccess(res, { url }, "GitHub OAuth URL generated");
  },

  // Public route — GitHub redirects the browser here after authorization.
  // No Bearer token is available, so we identify the user via the state map.
  async callback(req: Request, res: Response): Promise<void> {
    const code  = req.query["code"]  as string | undefined;
    const state = req.query["state"] as string | undefined;
    const userId = state ? oauthStateMap.get(state) : undefined;

    if (!code || !userId) {
      res.redirect(`${env.frontendUrl}/skill?github=error`);
      return;
    }
    oauthStateMap.delete(state!);

    try {
      await githubService.connectGitHub(userId, code);
      res.redirect(`${env.frontendUrl}/skill?github=connected`);
    } catch {
      res.redirect(`${env.frontendUrl}/skill?github=error`);
    }
  },

  async status(req: AuthRequest, res: Response): Promise<void> {
    const data = await githubService.getStatus(req.user!.id);
    sendSuccess(res, data, "GitHub status");
  },

  async disconnect(req: AuthRequest, res: Response): Promise<void> {
    await githubService.disconnect(req.user!.id);
    sendSuccess(res, { success: true }, "GitHub disconnected");
  },

  async verifySkills(req: AuthRequest, res: Response): Promise<void> {
    const data = await githubService.verifySkills(req.user!.id);
    sendSuccess(res, data, `${data.updated} skill(s) verified via GitHub`);
  },
};
