import jwt from "jsonwebtoken";
import { env } from "../config/env";
import type { AuthPayload } from "../types";

export function signToken(payload: AuthPayload): string {
  return jwt.sign(payload, env.jwt.secret, {
    expiresIn: env.jwt.expiresIn as jwt.SignOptions["expiresIn"],
  });
}

export function verifyToken(token: string): AuthPayload {
  return jwt.verify(token, env.jwt.secret) as AuthPayload;
}
