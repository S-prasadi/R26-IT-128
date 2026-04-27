import type { Request } from "express";

export interface AuthPayload {
  id: string;
  email: string;
  role: "admin" | "user";
}

export interface AuthRequest extends Request {
  user?: AuthPayload;
}

export interface ApiResponse<T = unknown> {
  success: boolean;
  message: string;
  data?: T;
}
