import type { Request, Response, NextFunction } from "express";
import { env } from "../config/env";

export class AppError extends Error {
  constructor(
    public message: string,
    public statusCode: number = 500
  ) {
    super(message);
    this.name = "AppError";
  }
}

export function errorHandler(
  err: Error,
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  const statusCode = err instanceof AppError ? err.statusCode : 500;
  const message = err instanceof AppError ? err.message : "Internal server error";

  // Always log unexpected (non-AppError) failures — these are bugs/outages, not
  // routine 4xx client errors, so they need a diagnostic trail in every
  // environment, not only development (where everything is logged anyway).
  if (env.nodeEnv === "development" || !(err instanceof AppError)) {
    console.error(err);
  }

  res.status(statusCode).json({
    success: false,
    message,
    ...(env.nodeEnv === "development" && { stack: err.stack }),
  });
}

export function notFound(_req: Request, res: Response): void {
  res.status(404).json({ success: false, message: "Route not found" });
}
