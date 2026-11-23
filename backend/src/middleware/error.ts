import type { NextFunction, Request, Response } from "express";
import { isProd } from "../config/env";
import { ProviderError } from "../services/ai/errors";
import { AppError } from "../utils/AppError";
import { logger } from "../utils/logger";

export function notFound(_req: Request, _res: Response, next: NextFunction) {
  next(AppError.notFound("Route not found"));
}

export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction) {
  if (err instanceof AppError) {
    return res.status(err.status).json({ error: { code: err.code, message: err.message, details: err.details } });
  }
  if (err instanceof ProviderError) {
    return res.status(err.status).json({ error: { code: err.code, message: err.message } });
  }
  const e = err as { type?: string; code?: number };
  if (e?.type === "entity.too.large") {
    return res.status(413).json({ error: { code: "too_large", message: "Request body is too large" } });
  }
  if (e?.type === "entity.parse.failed") {
    return res.status(400).json({ error: { code: "bad_json", message: "Malformed JSON body" } });
  }
  if (e?.code === 11000) {
    return res.status(409).json({ error: { code: "conflict", message: "That value is already in use" } });
  }
  logger.error("Unhandled error", { path: req.path, method: req.method, err });
  res.status(500).json({
    error: { code: "internal", message: isProd ? "Something went wrong" : String((err as Error)?.message) },
  });
}
