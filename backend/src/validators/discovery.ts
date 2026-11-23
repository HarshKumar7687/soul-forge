import { z } from "zod";
import { CATEGORIES } from "./constants";
import { REPORT_REASONS } from "../models/Report";

const objectId = z.string().regex(/^[a-f0-9]{24}$/, "Invalid id");

export const browseQuerySchema = z.object({
  q: z.string().trim().max(80).default(""),
  category: z.enum([...CATEGORIES, ""] as [string, ...string[]]).default(""),
  trait: z.string().trim().max(30).default(""),
  sort: z.enum(["popular", "recent"]).default("popular"),
  page: z.coerce.number().int().min(1).max(500).default(1),
  limit: z.coerce.number().int().min(1).max(24).default(12),
});

export const favoriteSchema = z.object({ characterId: objectId }).strict();
export const reportSchema = z.object({
  reason: z.enum(REPORT_REASONS),
  details: z.string().trim().max(500).default(""),
}).strict();

export const portraitGenerateSchema = z.object({
  name: z.string().trim().max(60).default(""),
  age: z.number().int().min(0).max(100000).nullable().optional(),
  gender: z.string().trim().max(40).default(""),
  category: z.string().trim().max(30).default(""),
  shortDescription: z.string().trim().max(200).default(""),
  appearance: z.string().trim().max(1500).default(""),
  extra: z.string().trim().max(300).default(""),
}).strict();
