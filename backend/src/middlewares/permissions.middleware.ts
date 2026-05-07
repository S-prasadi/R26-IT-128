import type { Response, NextFunction } from "express";
import { sendError } from "../utils/response";
import { HTTP_STATUS } from "../constants/http";
import type { AuthRequest } from "../types";

export function requirePermission(...needed: string[]) {
  return (req: AuthRequest, res: Response, next: NextFunction): void => {
    if (!req.user) {
      sendError(res, "Unauthorized", HTTP_STATUS.UNAUTHORIZED);
      return;
    }
    const has = needed.every((p) => req.user!.permissions.includes(p));
    if (!has) {
      sendError(res, "Forbidden: missing permission", HTTP_STATUS.FORBIDDEN);
      return;
    }
    next();
  };
}

export function requireAnyPermission(...needed: string[]) {
  return (req: AuthRequest, res: Response, next: NextFunction): void => {
    if (!req.user) {
      sendError(res, "Unauthorized", HTTP_STATUS.UNAUTHORIZED);
      return;
    }
    const has = needed.some((p) => req.user!.permissions.includes(p));
    if (!has) {
      sendError(res, "Forbidden: missing permission", HTTP_STATUS.FORBIDDEN);
      return;
    }
    next();
  };
}

export function requireRole(...roles: string[]) {
  return (req: AuthRequest, res: Response, next: NextFunction): void => {
    if (!req.user) {
      sendError(res, "Unauthorized", HTTP_STATUS.UNAUTHORIZED);
      return;
    }
    const has = roles.some((r) => req.user!.roles.includes(r));
    if (!has) {
      sendError(res, "Forbidden: missing role", HTTP_STATUS.FORBIDDEN);
      return;
    }
    next();
  };
}
