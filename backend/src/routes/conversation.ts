import { Router } from "express";
import * as c from "../controllers/conversation";
import { requireAuth } from "../middleware/auth";
import { chatLimiter } from "../middleware/rateLimit";
import { validateBody } from "../middleware/validate";
import { asyncHandler as h } from "../utils/asyncHandler";
import { createConversationSchema, sendMessageSchema } from "../validators/conversation";

export const conversationRouter = Router();
conversationRouter.use(requireAuth);

conversationRouter.get("/", h(async (q, s) => c.list(q, s)));
conversationRouter.post("/", validateBody(createConversationSchema), h(async (q, s) => c.create(q, s)));
conversationRouter.get("/:id", h(async (q, s) => c.get(q, s)));
conversationRouter.delete("/:id", h(async (q, s) => c.remove(q, s)));
conversationRouter.post("/:id/messages", chatLimiter, validateBody(sendMessageSchema), h(async (q, s) => c.sendMessage(q, s)));
conversationRouter.post("/:id/regenerate", chatLimiter, h(async (q, s) => c.regenerate(q, s)));
