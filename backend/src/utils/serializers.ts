import { REPORT_HIDE_THRESHOLD } from "../models/Report";

interface CardSource {
  _id: unknown; ownerId: unknown; name: string; age?: number | null; gender?: string; category?: string; shortDescription?: string;
  appearance?: string; personalityTraits?: string[]; greeting?: string; portraitUrl?: string; favoriteCount?: number; chatCount?: number; contentRating?: string;
  createdAt?: Date; status?: string; visibility?: string; reportCount?: number;
}

/** Can people other than the owner see and use this character? */
export const isPublicVisible = (c: Pick<CardSource, "status" | "visibility" | "reportCount" | "contentRating">) =>
  c.status === "published" && c.visibility === "public" && (c.reportCount ?? 0) < REPORT_HIDE_THRESHOLD && c.contentRating !== "mature";

/** What everyone else sees. Backstory, goals, scenario and other private-by-design details stay with the owner. */
export function publicCard(c: CardSource) {
  return {
    id: String(c._id), ownerId: String(c.ownerId), name: c.name, age: c.age ?? null, gender: c.gender ?? "", category: c.category ?? "other",
    shortDescription: c.shortDescription ?? "", appearance: c.appearance ?? "", personalityTraits: c.personalityTraits ?? [],
    greeting: c.greeting ?? "", portraitUrl: c.portraitUrl ?? "", favoriteCount: c.favoriteCount ?? 0, chatCount: c.chatCount ?? 0,
    createdAt: c.createdAt, status: c.status, visibility: c.visibility,
  };
}

export const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
