import { env } from "../config/env";

export type ContentRating = "general" | "mature";

/** Mature rules apply only when the server allows them AND the item is rated mature. */
export const isMatureActive = (rating?: string | null): boolean => env.ALLOW_MATURE_CONTENT && rating === "mature";

/** Characters used in mature material must be adults. Unknown age does not qualify. */
export const isAdult = (age?: number | null): boolean => typeof age === "number" && age >= 18;
