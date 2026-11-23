import type { NextFunction, Request, Response } from "express";
import type { ZodTypeAny } from "zod";
import { AppError } from "../utils/AppError";

export const validateBody =
  (schema: ZodTypeAny) => (req: Request, _res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      const fields = Object.fromEntries(
        result.error.issues.map((i) => [i.path.join(".") || "body", i.message])
      );
      return next(AppError.badRequest("Please check the highlighted fields", fields));
    }
    req.body = result.data;
    next();
  };

/** Validates req.query and exposes the parsed result as res.locals.query. */
export const validateQuery =
  (schema: ZodTypeAny) => (req: Request, res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.query);
    if (!result.success) {
      const fields = Object.fromEntries(result.error.issues.map((i) => [i.path.join(".") || "query", i.message]));
      return next(AppError.badRequest("Invalid search options", fields));
    }
    res.locals.query = result.data;
    next();
  };
