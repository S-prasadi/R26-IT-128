import type { Response } from "express";
import type { ApiResponse } from "../types";

export function sendSuccess<T>(
  res: Response,
  data: T,
  message = "Success",
  statusCode = 200
): void {
  const body: ApiResponse<T> = { success: true, message, data };
  res.status(statusCode).json(body);
}

export function sendError(
  res: Response,
  message = "Something went wrong",
  statusCode = 500
): void {
  const body: ApiResponse = { success: false, message };
  res.status(statusCode).json(body);
}
