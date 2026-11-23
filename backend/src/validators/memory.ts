import { z } from "zod";
import { MEMORY_TYPES } from "../models/Memory";

const content = z.string().trim().min(3, "Write at least a few words").max(400, "Use at most 400 characters");
const objectId = z.string().regex(/^[a-f0-9]{24}$/, "Invalid id");

export const createMemorySchema = z.object({ characterId: objectId, content, type: z.enum(MEMORY_TYPES).default("fact") }).strict();
export const updateMemorySchema = z.object({ content: content.optional(), type: z.enum(MEMORY_TYPES).optional() }).strict();
