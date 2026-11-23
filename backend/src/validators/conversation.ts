import { z } from "zod";

export const createConversationSchema = z.object({
  characterId: z.string().regex(/^[a-f0-9]{24}$/, "Invalid character"),
}).strict();

export const sendMessageSchema = z.object({
  content: z.string().trim().min(1, "Write a message first").max(4000, "Messages can be up to 4000 characters"),
}).strict();
