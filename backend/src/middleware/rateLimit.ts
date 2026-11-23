import rateLimit from "express-rate-limit";
import { isTest } from "../config/env";

const common = { standardHeaders: true, legacyHeaders: false, skip: () => isTest };

export const apiLimiter = rateLimit({
  ...common,
  windowMs: 15 * 60 * 1000,
  limit: 600,
  message: { error: { code: "rate_limited", message: "Too many requests. Try again shortly." } },
});

export const authLimiter = rateLimit({
  ...common,
  windowMs: 15 * 60 * 1000,
  limit: 20,
  message: { error: { code: "rate_limited", message: "Too many attempts. Try again in a few minutes." } },
});

/** Protects AI spend: per signed-in user, not per IP. */
export const chatLimiter = rateLimit({
  ...common,
  windowMs: 60 * 1000,
  limit: 20,
  keyGenerator: (req) => req.userId ?? "anonymous",
  message: { error: { code: "rate_limited", message: "You are sending messages too quickly. Wait a moment." } },
});

export const imageLimiter = rateLimit({
  ...common,
  windowMs: 60 * 1000,
  limit: 5,
  keyGenerator: (req) => req.userId ?? "anonymous",
  message: { error: { code: "rate_limited", message: "You are generating portraits too quickly. Wait a minute." } },
});

export const reportLimiter = rateLimit({
  ...common,
  windowMs: 60 * 60 * 1000,
  limit: 20,
  keyGenerator: (req) => req.userId ?? "anonymous",
  message: { error: { code: "rate_limited", message: "Too many reports. Try again later." } },
});
