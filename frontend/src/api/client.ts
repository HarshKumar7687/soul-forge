import type { ApiErrorBody } from "../types";

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public code = "error",
    public fields: Record<string, string> = {}
  ) {
    super(message);
  }
}

export async function api<T = void>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`/api${path}`, {
      method: init.method ?? "GET",
      credentials: "include",
      headers: init.body ? { "Content-Type": "application/json" } : undefined,
      body: init.body ? JSON.stringify(init.body) : undefined,
    });
  } catch {
    throw new ApiError(0, "Cannot reach the server. Check that the backend is running.", "network");
  }
  if (res.status === 204) return undefined as T;
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const e = (data as ApiErrorBody | null)?.error;
    throw new ApiError(res.status, e?.message ?? "Something went wrong", e?.code, e?.details);
  }
  return data as T;
}

export async function upload<T>(path: string, file: File): Promise<T> {
  const body = new FormData();
  body.append("image", file);
  let res: Response;
  try {
    res = await fetch(`/api${path}`, { method: "POST", credentials: "include", body });
  } catch {
    throw new ApiError(0, "Cannot reach the server. Check that the backend is running.", "network");
  }
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const e = (data as ApiErrorBody | null)?.error;
    throw new ApiError(res.status, e?.message ?? "Upload failed", e?.code);
  }
  return data as T;
}

/** POST that answers with Server-Sent Events. Calls onEvent for each event. */
export async function streamPost(
  path: string,
  body: unknown,
  onEvent: (event: string, data: any) => void,
  signal?: AbortSignal
): Promise<void> {
  let res: Response;
  try {
    res = await fetch(`/api${path}`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json", Accept: "text/event-stream" },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal,
    });
  } catch (e) {
    if ((e as Error).name === "AbortError") throw e;
    throw new ApiError(0, "Cannot reach the server. Check that the backend is running.", "network");
  }
  if (!res.ok || !(res.headers.get("content-type") ?? "").includes("text/event-stream")) {
    const data = await res.json().catch(() => null);
    const e = (data as ApiErrorBody | null)?.error;
    throw new ApiError(res.status, e?.message ?? "Something went wrong", e?.code, e?.details);
  }
  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  const flush = (block: string) => {
    const event = /^event: (.+)$/m.exec(block)?.[1];
    const data = /^data: (.+)$/m.exec(block)?.[1];
    if (event && data) onEvent(event, JSON.parse(data));
  };
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const blocks = buffer.split("\n\n");
      buffer = blocks.pop() ?? "";
      blocks.forEach(flush);
    }
    if (buffer.trim()) flush(buffer);
  } catch (e) {
    if ((e as Error).name === "AbortError") throw e;
    throw new ApiError(0, "The connection dropped while the reply was being written.", "network");
  }
}
