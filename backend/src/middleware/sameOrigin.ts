import type { NextFunction, Request, Response } from "express";
import { env } from "../config/env";
import { AppError } from "../utils/AppError";

const allowed = new URL(env.FRONTEND_URL).origin;
const SAFE = new Set(["GET", "HEAD", "OPTIONS"]);

/**
 * CSRF defence in depth on top of SameSite cookies: browsers always send Origin on
 * cross-site writes, so a mismatching Origin is rejected. Non-browser clients send none.
 */
export function sameOrigin(req: Request, _res: Response, next: NextFunction) {
  const origin = req.headers.origin;
  if (SAFE.has(req.method) || !origin || origin === allowed) return next();
  next(AppError.forbidden("Cross-site request blocked"));
}
