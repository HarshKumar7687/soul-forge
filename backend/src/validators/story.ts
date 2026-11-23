import { z } from "zod";
import { GENRES } from "../models/Story";

const objectId = z.string().regex(/^[a-f0-9]{24}$/, "Invalid id");

export const createStorySchema = z.object({
  title: z.string().trim().min(1, "Give your story a title").max(120),
  genre: z.enum(GENRES),
  contentRating: z.enum(["general", "mature"]).default("general"),
  setting: z.string().trim().max(1500).default(""),
  initialSituation: z.string().trim().max(1500).default(""),
  characterIds: z.array(objectId).max(6, "Use at most 6 characters").default([]),
}).strict();

export const continueStorySchema = z.object({ input: z.string().trim().max(2000, "Use at most 2000 characters").default("") }).strict();
export const addStoryCharacterSchema = z.object({ characterId: objectId }).strict();
