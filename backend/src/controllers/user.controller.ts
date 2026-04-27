import type { Response } from "express";
import { userService } from "../services/user.service";
import { sendSuccess } from "../utils/response";
import type { AuthRequest } from "../types";

export const userController = {
  async getMe(req: AuthRequest, res: Response): Promise<void> {
    const user = await userService.findById(req.user!.id);
    sendSuccess(res, user, "User fetched");
  },

  async getAll(_req: AuthRequest, res: Response): Promise<void> {
    const users = await userService.findAll();
    sendSuccess(res, users, "Users fetched");
  },
};
