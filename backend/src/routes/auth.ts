import { Router } from "express";
import * as c from "../controllers/auth";
import { requireAuth } from "../middleware/auth";
import { authLimiter } from "../middleware/rateLimit";
import { validateBody } from "../middleware/validate";
import { asyncHandler as h } from "../utils/asyncHandler";
import { deleteAccountSchema, loginSchema, registerSchema, updateProfileSchema } from "../validators/auth";

export const authRouter = Router();

authRouter.post("/register", authLimiter, validateBody(registerSchema), h(async (q, s) => c.register(q, s)));
authRouter.post("/login", authLimiter, validateBody(loginSchema), h(async (q, s) => c.login(q, s)));
authRouter.post("/logout", h(async (q, s) => c.logout(q, s)));
authRouter.get("/me", requireAuth, h(async (q, s) => c.me(q, s)));
authRouter.patch("/me", requireAuth, validateBody(updateProfileSchema), h(async (q, s) => c.updateMe(q, s)));
authRouter.delete("/me", requireAuth, authLimiter, validateBody(deleteAccountSchema), h(async (q, s) => c.deleteMe(q, s)));
