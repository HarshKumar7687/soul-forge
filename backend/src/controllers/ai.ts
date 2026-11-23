import type { Request, Response } from "express";
import { env } from "../config/env";
import { llmStatus } from "../services/ai";
import { imageStatus } from "../services/ai/image";

export function status(_req: Request, res: Response) {
  res.json({ ...llmStatus(), image: imageStatus(), matureAllowed: env.ALLOW_MATURE_CONTENT, replyLength: env.CHAT_REPLY_LENGTH });
}
