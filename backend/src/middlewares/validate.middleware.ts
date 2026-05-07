import type { Request, Response, NextFunction } from "express";
import { ZodSchema, ZodError } from "zod";
import { HTTP_STATUS } from "../constants/http";

type Source = "body" | "query" | "params";

export function validate(schema: ZodSchema, source: Source = "body") {
  return (req: Request, res: Response, next: NextFunction): void => {
    try {
      const parsed = schema.parse(req[source]);
      Object.defineProperty(req, source, { value: parsed, writable: true, configurable: true });
      next();
    } catch (err) {
      if (err instanceof ZodError) {
        res.status(HTTP_STATUS.UNPROCESSABLE_ENTITY).json({
          success: false,
          message: "Validation failed",
          errors: err.errors.map((e) => ({
            path: e.path.join("."),
            message: e.message,
          })),
        });
        return;
      }
      next(err);
    }
  };
}
