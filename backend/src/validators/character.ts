import { z } from "zod";
import { CATEGORIES } from "./constants";

const text = (max: number) => z.string().trim().max(max, `Use at most ${max} characters`);

const base = z.object({
  name: z.string().trim().min(1, "Give your character a name").max(60),
  age: z.number().int("Use a whole number").min(0).max(100000).nullable().optional(),
  gender: text(40),
  category: z.enum(CATEGORIES),
  contentRating: z.enum(["general", "mature"]),
  shortDescription: text(200),
  appearance: text(1500),
  personalityTraits: z.array(z.string().trim().min(1).max(30)).max(12, "Use at most 12 traits"),
  backstory: text(4000),
  speakingStyle: text(1000),
  interests: text(800),
  dislikes: text(800),
  goals: text(1000),
  relationshipWithUser: text(600),
  scenario: text(1500),
  greeting: text(1000),
  exampleDialogues: z
    .array(z.object({ user: text(500), character: text(1000) }))
    .max(6, "Use at most 6 example dialogues"),
  visibility: z.enum(["private", "public"]),
  status: z.enum(["draft", "published"]),
  portraitUrl: z
    .string()
    .max(300)
    .refine((v) => v === "" || /^\/uploads\/[a-f0-9]{32}\.(png|jpg|webp)$/.test(v), "Invalid portrait"),
});

export const createCharacterSchema = base.partial().required({ name: true }).strict();
export const updateCharacterSchema = base.partial().strict();

/** Fields a character needs before it can be published. */
export function publishErrors(c: {
  name?: string;
  shortDescription?: string;
  personalityTraits?: string[];
  greeting?: string;
  speakingStyle?: string;
  visibility?: string;
  status?: string;
}): Record<string, string> {
  const errs: Record<string, string> = {};
  if (c.status === "published") {
    if (!c.name?.trim()) errs.name = "Give your character a name";
    if (!c.shortDescription?.trim()) errs.shortDescription = "Add a short description";
    if (!c.personalityTraits?.length) errs.personalityTraits = "Add at least one personality trait";
    if (!c.speakingStyle?.trim()) errs.speakingStyle = "Describe how they speak";
    if (!c.greeting?.trim()) errs.greeting = "Write a greeting message";
  }
  if (c.visibility === "public" && c.status !== "published") {
    errs.visibility = "Publish the character before making it public";
  }
  return errs;
}
