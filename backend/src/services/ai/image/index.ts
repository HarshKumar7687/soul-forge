import { env } from "../../../config/env";
import { ProviderError, providerErrorFromStatus } from "../errors";

export interface ImageProvider {
  readonly name: string;
  readonly model: string;
  generate(prompt: string, signal?: AbortSignal): Promise<Buffer>;
}

async function post(url: string, init: RequestInit, timeoutMs: number, signal?: AbortSignal): Promise<Response> {
  const ctrl = new AbortController();
  let timedOut = false;
  const t = setTimeout(() => { timedOut = true; ctrl.abort(); }, timeoutMs);
  signal?.addEventListener("abort", () => ctrl.abort(), { once: true });
  try {
    const res = await fetch(url, { ...init, signal: ctrl.signal });
    if (!res.ok) { await res.text().catch(() => ""); throw providerErrorFromStatus(res.status); }
    return res;
  } catch (e) {
    if (e instanceof ProviderError) throw e;
    throw new ProviderError(timedOut ? "timeout" : "unavailable", timedOut ? undefined : "Could not reach the image provider.");
  } finally {
    clearTimeout(t);
  }
}

/** Hugging Face Inference (text-to-image): returns raw image bytes. */
export class HuggingFaceImageProvider implements ImageProvider {
  readonly name = "huggingface";
  constructor(private apiKey: string, readonly model: string, private baseUrl: string, private timeoutMs: number) {}
  async generate(prompt: string, signal?: AbortSignal): Promise<Buffer> {
    const res = await post(`${this.baseUrl.replace(/\/$/, "")}/${this.model}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${this.apiKey}`, "Content-Type": "application/json", Accept: "image/png" },
      body: JSON.stringify({ inputs: prompt }),
    }, this.timeoutMs, signal);
    if (!(res.headers.get("content-type") ?? "").startsWith("image/")) throw new ProviderError("bad_response", "The image provider did not return an image.");
    return Buffer.from(await res.arrayBuffer());
  }
}

/** OpenAI-style /images/generations (base64 response). */
export class OpenAIImageProvider implements ImageProvider {
  readonly name = "openai";
  constructor(private apiKey: string, readonly model: string, private baseUrl: string, private timeoutMs: number) {}
  async generate(prompt: string, signal?: AbortSignal): Promise<Buffer> {
    const res = await post(`${this.baseUrl.replace(/\/$/, "")}/images/generations`, {
      method: "POST",
      headers: { Authorization: `Bearer ${this.apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: this.model, prompt, n: 1, size: "1024x1024", response_format: "b64_json" }),
    }, this.timeoutMs, signal);
    const json = (await res.json().catch(() => null)) as { data?: { b64_json?: string }[] } | null;
    const b64 = json?.data?.[0]?.b64_json;
    if (!b64) throw new ProviderError("bad_response", "The image provider did not return an image.");
    return Buffer.from(b64, "base64");
  }
}

let override: ImageProvider | null = null;
/** Test hook. Never used in production code paths. */
export function setImageProviderForTests(p: ImageProvider | null) { override = p; }

export function imageConfigured() { return !!override || (!!env.IMAGE_API_KEY && !!env.IMAGE_MODEL); }

export function getImageProvider(): ImageProvider {
  if (override) return override;
  if (!env.IMAGE_API_KEY || !env.IMAGE_MODEL) {
    throw new ProviderError("not_configured", "Portrait generation is not configured. Set IMAGE_API_KEY and IMAGE_MODEL in backend/.env, then restart the server. You can still upload an image.");
  }
  return env.IMAGE_PROVIDER === "openai"
    ? new OpenAIImageProvider(env.IMAGE_API_KEY, env.IMAGE_MODEL, env.IMAGE_BASE_URL || "https://api.openai.com/v1", env.IMAGE_TIMEOUT_MS)
    : new HuggingFaceImageProvider(env.IMAGE_API_KEY, env.IMAGE_MODEL, env.IMAGE_BASE_URL || "https://router.huggingface.co/hf-inference/models", env.IMAGE_TIMEOUT_MS);
}

export function imageStatus() {
  const configured = imageConfigured();
  return { configured, provider: override?.name ?? env.IMAGE_PROVIDER, model: configured ? override?.model ?? env.IMAGE_MODEL : null };
}

export interface PortraitInput {
  name?: string; age?: number | null; gender?: string; category?: string; shortDescription?: string; appearance?: string; extra?: string;
}

export function buildPortraitPrompt(c: PortraitInput): string {
  const subject = [c.appearance, c.shortDescription, c.extra].map((x) => x?.trim()).filter(Boolean).join(". ");
  const bits = [
    "Stylized digital illustration, head-and-shoulders portrait of a fictional character",
    c.gender?.trim() && c.gender.trim(),
    c.age != null && c.age < 18 ? "wholesome and age-appropriate" : c.age != null ? `around ${c.age} years old` : "",
    subject,
    c.category && c.category !== "other" ? `${c.category} setting` : "",
    "centered composition, soft dramatic lighting, detailed, fully clothed, safe for work, no text, no watermark",
  ];
  return bits.filter(Boolean).join(", ").slice(0, 900);
}
