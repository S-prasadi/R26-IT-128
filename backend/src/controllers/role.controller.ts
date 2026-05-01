import type { Response } from "express";
import { roleService } from "../services/role.service";
import { sendSuccess } from "../utils/response";
import { HTTP_STATUS } from "../constants/http";
import type { AuthRequest } from "../types";

const param = (v: unknown): string => (typeof v === "string" ? v : String(v));

export const roleController = {
  async list(_req: AuthRequest, res: Response): Promise<void> {
    const roles = await roleService.list();
    sendSuccess(res, roles, "Roles fetched");
  },

  async getById(req: AuthRequest, res: Response): Promise<void> {
    const role = await roleService.findById(param(req.params["id"]));
    sendSuccess(res, role, "Role fetched");
  },

  async create(req: AuthRequest, res: Response): Promise<void> {
    const role = await roleService.create(req.body);
    sendSuccess(res, role, "Role created", HTTP_STATUS.CREATED);
  },

  async update(req: AuthRequest, res: Response): Promise<void> {
    const role = await roleService.update(param(req.params["id"]), req.body);
    sendSuccess(res, role, "Role updated");
  },

  async remove(req: AuthRequest, res: Response): Promise<void> {
    const result = await roleService.remove(param(req.params["id"]));
    sendSuccess(res, result, "Role deleted");
  },

  async attachPermission(req: AuthRequest, res: Response): Promise<void> {
    const result = await roleService.attachPermission(
      param(req.params["id"]),
      req.body.permission_id
    );
    sendSuccess(res, result, "Permission attached");
  },

  async detachPermission(req: AuthRequest, res: Response): Promise<void> {
    const result = await roleService.detachPermission(
      param(req.params["id"]),
      param(req.params["permissionId"])
    );
    sendSuccess(res, result, "Permission detached");
  },
};
