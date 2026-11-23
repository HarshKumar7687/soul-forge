import type { NextFunction, Request, Response } from "express";
import jwt, { type SignOptions } from "jsonwebtoken";
import { env } from "../config/env";
import { AppError } from "../utils/AppError";

export const COOKIE_NAME = "sf_token";

export function signToken(userId: string): string {
  return jwt.sign({ sub: userId }, env.JWT_SECRET, {
    expiresIn: env.JWT_EXPIRES_IN as SignOptions["expiresIn"],
  });
}

export function requireAuth(req: Request, _res: Response, next: NextFunction) {
  const token = req.cookies?.[COOKIE_NAME];
  if (!token) return next(AppError.unauthorized());
  try {
    const payload = jwt.verify(token, env.JWT_SECRET) as jwt.JwtPayload;
    if (!payload.sub) return next(AppError.unauthorized());
    req.userId = String(payload.sub);
    next();
  } catch {
    next(AppError.unauthorized("Your session has expired. Please sign in again."));
  }
}

/** Sets req.userId when a valid session exists; never rejects. */
export function optionalAuth(req: Request, _res: Response, next: NextFunction) {
  const token = req.cookies?.[COOKIE_NAME];
  if (token) {
    try {
      const payload = jwt.verify(token, env.JWT_SECRET) as jwt.JwtPayload;
      if (payload.sub) req.userId = String(payload.sub);
    } catch {
      /* treat as signed out */
    }
  }
  next();
}
