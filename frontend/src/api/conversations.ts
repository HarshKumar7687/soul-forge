import type { AiStatus, Character, ConversationSummary, Message } from "../types";
import { api, streamPost } from "./client";

export interface ChatDetail {
  conversation: { id: string; title: string; characterId: string };
  character: Pick<Character, "id" | "name" | "portraitUrl" | "shortDescription"> | null;
  messages: Message[];
}

export type StreamEvent =
  | { type: "user"; message: Message }
  | { type: "delta"; text: string }
  | { type: "done"; message: Message; replacedId: string | null }
  | { type: "error"; code: string; message: string };

const adapt = (cb: (e: StreamEvent) => void) => (event: string, data: any) => {
  if (event === "user") cb({ type: "user", message: data.message });
  else if (event === "delta") cb({ type: "delta", text: data.text });
  else if (event === "done") cb({ type: "done", message: data.message, replacedId: data.replacedId });
  else if (event === "error") cb({ type: "error", code: data.code, message: data.message });
};

export const conversationsApi = {
  list: () => api<{ conversations: ConversationSummary[] }>("/conversations"),
  get: (id: string) => api<ChatDetail>(`/conversations/${id}`),
  create: (characterId: string) => api<{ conversation: { id: string } }>("/conversations", { method: "POST", body: { characterId } }),
  remove: (id: string) => api(`/conversations/${id}`, { method: "DELETE" }),
  send: (id: string, content: string, cb: (e: StreamEvent) => void, signal?: AbortSignal) =>
    streamPost(`/conversations/${id}/messages`, { content }, adapt(cb), signal),
  regenerate: (id: string, cb: (e: StreamEvent) => void, signal?: AbortSignal) =>
    streamPost(`/conversations/${id}/regenerate`, undefined, adapt(cb), signal),
  aiStatus: () => api<AiStatus>("/ai/status"),
};
