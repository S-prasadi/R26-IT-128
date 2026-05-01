import type { Request, Response } from "express";
import { authService } from "../services/auth.service";
import { sendSuccess } from "../utils/response";
import { HTTP_STATUS } from "../constants/http";
import { AppError } from "../middlewares/error.middleware";
import type { AuthRequest } from "../types";

export const authController = {
  async register(req: Request, res: Response): Promise<void> {
    const result = await authService.register(req.body);
    sendSuccess(res, result, "Account created", HTTP_STATUS.CREATED);
  },

  async login(req: Request, res: Response): Promise<void> {
    const result = await authService.login(req.body);
    sendSuccess(res, result, "Login successful");
  },

  async refresh(req: Request, res: Response): Promise<void> {
    const result = await authService.refresh(req.body);
    sendSuccess(res, result, "Session refreshed");
  },

  async logout(req: AuthRequest, res: Response): Promise<void> {
    const header = req.headers.authorization;
    if (!header?.startsWith("Bearer ")) {
      throw new AppError("Missing access token", HTTP_STATUS.UNAUTHORIZED);
    }
    const result = await authService.logout(header.slice(7));
    sendSuccess(res, result, "Logged out");
  },

  async forgotPassword(req: Request, res: Response): Promise<void> {
    const result = await authService.forgotPassword(req.body);
    sendSuccess(res, result, "Password reset email sent");
  },

  async resetPassword(req: AuthRequest, res: Response): Promise<void> {
    const result = await authService.resetPassword(req.user!.id, req.body);
    sendSuccess(res, result, "Password updated");
  },

  async seedAdmin(req: Request, res: Response): Promise<void> {
    const { setup_key, ...dto } = req.body as { setup_key: string; full_name: string; email: string; password: string };
    const result = await authService.seedAdmin(dto, setup_key);
    sendSuccess(res, result, "Admin account created", HTTP_STATUS.CREATED);
  },

  async getMe(req: AuthRequest, res: Response): Promise<void> {
    const me = await authService.getMe(req.user!.id);
    sendSuccess(res, me, "Profile fetched");
  },
};
