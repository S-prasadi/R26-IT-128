import type { Response } from "express";
import { permissionService } from "../services/permission.service";
import { sendSuccess } from "../utils/response";
import { HTTP_STATUS } from "../constants/http";
import type { AuthRequest } from "../types";

export const permissionController = {
  async list(_req: AuthRequest, res: Response): Promise<void> {
    const perms = await permissionService.list();
    sendSuccess(res, perms, "Permissions fetched");
  },

  async create(req: AuthRequest, res: Response): Promise<void> {
    const perm = await permissionService.create(req.body);
    sendSuccess(res, perm, "Permission created", HTTP_STATUS.CREATED);
  },
};
