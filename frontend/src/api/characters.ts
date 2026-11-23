import type { Character, CharacterInput, PublicCharacter } from "../types";
import { api, upload } from "./client";

export const charactersApi = {
  list: () => api<{ characters: Character[] }>("/characters"),
  featured: () => api<{ characters: PublicCharacter[] }>("/characters/featured"),
  browse: (p: { q?: string; category?: string; trait?: string; sort?: string; page?: number }) => {
    const qs = new URLSearchParams();
    Object.entries(p).forEach(([k, v]) => { if (v !== undefined && v !== "") qs.set(k, String(v)); });
    return api<{ characters: PublicCharacter[]; total: number; page: number; hasMore: boolean }>(`/characters/browse?${qs}`);
  },
  traits: () => api<{ traits: { trait: string; count: number }[] }>("/characters/traits"),
  publicGet: (id: string) =>
    api<{ character: Character | PublicCharacter; creator: { id: string; displayName: string } | null; isFavorite: boolean; isOwner: boolean }>(`/characters/${id}`),
  report: (id: string, body: { reason: string; details: string }) => api(`/characters/${id}/report`, { method: "POST", body }),
  generatePortrait: (body: Record<string, unknown>) => api<{ url: string }>("/characters/portrait/generate", { method: "POST", body }),
  get: (id: string) => api<{ character: Character; creator: { id: string; displayName: string } | null }>(`/characters/${id}`),
  create: (body: Partial<CharacterInput>) => api<{ character: Character }>("/characters", { method: "POST", body }),
  update: (id: string, body: Partial<CharacterInput>) =>
    api<{ character: Character }>(`/characters/${id}`, { method: "PATCH", body }),
  remove: (id: string) => api(`/characters/${id}`, { method: "DELETE" }),
  duplicate: (id: string) => api<{ character: Character }>(`/characters/${id}/duplicate`, { method: "POST" }),
  uploadPortrait: (file: File) => upload<{ url: string }>("/characters/portrait", file),
};
