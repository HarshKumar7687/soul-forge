export const CATEGORIES = [
  "fantasy", "mystery", "romance", "sci-fi", "thriller", "adventure", "slice-of-life", "historical", "other",
] as const;
export type Category = (typeof CATEGORIES)[number];
