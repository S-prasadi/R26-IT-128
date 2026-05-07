import type { Response, NextFunction } from "express";
import { createRemoteJWKSet, jwtVerify } from "jose";
import { env } from "../config/env";
import { supabaseAdmin } from "../config/supabase";
import { sendError } from "../utils/response";
import { HTTP_STATUS } from "../constants/http";
import type { AuthRequest, AuthPayload } from "../types";

const jwks = createRemoteJWKSet(new URL(env.supabase.jwksUrl));

export async function authenticate(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    sendError(res, "No token provided", HTTP_STATUS.UNAUTHORIZED);
    return;
  }
  const token = header.slice(7);

  try {
    const { payload } = await jwtVerify(token, jwks, {
      issuer: env.supabase.jwtIssuer,
      audience: env.supabase.jwtAudience,
    });

    const userId = payload.sub;
    const email = (payload["email"] as string | undefined) ?? "";
    if (!userId) {
      sendError(res, "Invalid token: missing sub", HTTP_STATUS.UNAUTHORIZED);
      return;
    }

    const { data, error } = await supabaseAdmin
      .from("v_user_permissions")
      .select("role_name, permission_name")
      .eq("user_id", userId);

    if (error) {
      sendError(res, "Failed to load user permissions", HTTP_STATUS.INTERNAL_SERVER_ERROR);
      return;
    }

    const roles = Array.from(new Set((data ?? []).map((r) => r.role_name as string)));
    const permissions = Array.from(
      new Set((data ?? []).map((r) => r.permission_name as string))
    );

    const user: AuthPayload = { id: userId, email, roles, permissions };
    req.user = user;
    next();
  } catch {
    sendError(res, "Invalid or expired token", HTTP_STATUS.UNAUTHORIZED);
  }
}
