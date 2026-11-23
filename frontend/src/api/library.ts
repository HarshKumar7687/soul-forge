import type { CharacterBrief, Memory, PublicCharacter, Scene, Story } from "../types";
import { api, streamPost } from "./client";

export const favoritesApi = {
  list: () => api<{ characters: PublicCharacter[] }>("/favorites"),
  add: (characterId: string) => api("/favorites", { method: "POST", body: { characterId } }),
  remove: (characterId: string) => api(`/favorites/${characterId}`, { method: "DELETE" }),
};

export const memoriesApi = {
  list: (characterId?: string) =>
    api<{ memories: Memory[]; characters: { id: string; name: string; portraitUrl: string }[] }>(`/memories${characterId ? `?characterId=${characterId}` : ""}`),
  create: (body: { characterId: string; content: string; type: string }) => api<{ memory: Memory }>("/memories", { method: "POST", body }),
  update: (id: string, body: { content?: string; type?: string }) => api<{ memory: Memory }>(`/memories/${id}`, { method: "PATCH", body }),
  remove: (id: string) => api(`/memories/${id}`, { method: "DELETE" }),
};

export type SceneEvent =
  | { type: "delta"; text: string }
  | { type: "done"; scene: Scene; state: Story["state"]; stateUpdated: boolean }
  | { type: "error"; code: string; message: string };

export const storiesApi = {
  list: () => api<{ stories: Story[] }>("/stories"),
  get: (id: string) => api<{ story: Story; scenes: Scene[]; characters: CharacterBrief[] }>(`/stories/${id}`),
  create: (body: { title: string; genre: string; contentRating: string; setting: string; initialSituation: string; characterIds: string[] }) =>
    api<{ story: Story }>("/stories", { method: "POST", body }),
  remove: (id: string) => api(`/stories/${id}`, { method: "DELETE" }),
  addCharacter: (id: string, characterId: string) =>
    api<{ story: Story; characters: CharacterBrief[] }>(`/stories/${id}/characters`, { method: "POST", body: { characterId } }),
  removeCharacter: (id: string, characterId: string) => api<{ story: Story }>(`/stories/${id}/characters/${characterId}`, { method: "DELETE" }),
  continue: (id: string, input: string, cb: (e: SceneEvent) => void, signal?: AbortSignal) =>
    streamPost(`/stories/${id}/continue`, { input }, (event, data) => {
      if (event === "delta") cb({ type: "delta", text: data.text });
      else if (event === "done") cb({ type: "done", scene: data.scene, state: data.state, stateUpdated: data.stateUpdated });
      else if (event === "error") cb({ type: "error", code: data.code, message: data.message });
    }, signal),
};
