import type { Response, NextFunction } from "express";
import { verifyToken } from "../utils/jwt";
import { sendError } from "../utils/response";
import { HTTP_STATUS } from "../constants/http";
import type { AuthRequest } from "../types";

export function authenticate(req: AuthRequest, res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    sendError(res, "No token provided", HTTP_STATUS.UNAUTHORIZED);
    return;
  }

  try {
    req.user = verifyToken(header.slice(7));
    next();
  } catch {
    sendError(res, "Invalid or expired token", HTTP_STATUS.UNAUTHORIZED);
  }
}

export function authorize(...roles: string[]) {
  return (req: AuthRequest, res: Response, next: NextFunction): void => {
    if (!req.user || !roles.includes(req.user.role)) {
      sendError(res, "Forbidden", HTTP_STATUS.FORBIDDEN);
      return;
    }
    next();
  };
}
