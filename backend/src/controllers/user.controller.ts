import type { Response } from "express";
import { userService } from "../services/user.service";
import { sendSuccess } from "../utils/response";
import type { AuthRequest } from "../types";
import type { ListUsersQuery } from "../validations/user.validation";

const param = (v: unknown): string => (typeof v === "string" ? v : String(v));

export const userController = {
  async list(req: AuthRequest, res: Response): Promise<void> {
    const result = await userService.findAll(req.query as unknown as ListUsersQuery);
    sendSuccess(res, result, "Users fetched");
  },

  async getById(req: AuthRequest, res: Response): Promise<void> {
    const user = await userService.findById(param(req.params["id"]));
    sendSuccess(res, user, "User fetched");
  },

  async update(req: AuthRequest, res: Response): Promise<void> {
    const user = await userService.update(param(req.params["id"]), req.body);
    sendSuccess(res, user, "User updated");
  },

  async deactivate(req: AuthRequest, res: Response): Promise<void> {
    const user = await userService.deactivate(param(req.params["id"]));
    sendSuccess(res, user, "User deactivated");
  },

  async hardDelete(req: AuthRequest, res: Response): Promise<void> {
    const result = await userService.hardDelete(param(req.params["id"]));
    sendSuccess(res, result, "User deleted");
  },

  async assignRole(req: AuthRequest, res: Response): Promise<void> {
    const result = await userService.assignRole(
      param(req.params["id"]),
      req.body.role_id,
      req.user!.id
    );
    sendSuccess(res, result, "Role assigned");
  },

  async removeRole(req: AuthRequest, res: Response): Promise<void> {
    const result = await userService.removeRole(
      param(req.params["id"]),
      param(req.params["roleId"])
    );
    sendSuccess(res, result, "Role removed");
  },
};
