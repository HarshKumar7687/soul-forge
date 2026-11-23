import { ProviderError } from "./errors";
import type { AIProvider, ChatMessage, GenerateOptions } from "./types";

export interface ProviderConfig {
  name: string;
  apiKey: string;
  model: string;
  baseUrl: string;
  timeoutMs: number;
  streaming: boolean;
  maxTokens: number;
  temperature: number;
  embeddingModel?: string;
  stripThinkTags?: boolean;
  extraHeaders?: Record<string, string>;
}

/** Resettable timeout plus an optional external abort signal. */
class Guard {
  controller = new AbortController();
  timedOut = false;
  private timer?: ReturnType<typeof setTimeout>;
  constructor(private ms: number, private external?: AbortSignal) {
    if (external) {
      if (external.aborted) this.controller.abort();
      else external.addEventListener("abort", () => this.controller.abort(), { once: true });
    }
    this.touch();
  }
  touch() {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => { this.timedOut = true; this.controller.abort(); }, this.ms);
  }
  clear() { clearTimeout(this.timer); }
  get clientAborted() { return !!this.external?.aborted; }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function statusToKind(status: number): ProviderError {
  if (status === 401 || status === 403) return new ProviderError("auth");
  if (status === 402) return new ProviderError("quota");
  if (status === 404) return new ProviderError("model_unavailable");
  if (status === 408 || status === 504) return new ProviderError("timeout");
  if (status === 429) return new ProviderError("rate_limit");
  return new ProviderError("unavailable");
}

function extractContent(json: unknown): string {
  const choice = (json as { choices?: { message?: { content?: unknown } }[] })?.choices?.[0];
  const content = choice?.message?.content;
  return typeof content === "string" ? content : "";
}

/** Removes Qwen-style thinking blocks without exposing them during streaming. */
class ThinkBlockFilter {
  private buffer = "";
  private insideThink = false;
  private started = false;

  private appendVisible(text: string): string {
    if (this.started) return text;
    const trimmed = text.trimStart();
    if (trimmed) this.started = true;
    return trimmed;
  }

  push(chunk: string, final = false): string {
    this.buffer += chunk;
    let visible = "";

    while (this.buffer) {
      const marker = this.insideThink ? "</think>" : "<think>";
      const markerIndex = this.buffer.toLowerCase().indexOf(marker);
      if (markerIndex >= 0) {
        const markerStart = !this.insideThink && this.buffer[markerIndex - 1] === "\\"
          ? markerIndex - 1
          : markerIndex;
        if (!this.insideThink) visible += this.appendVisible(this.buffer.slice(0, markerStart));
        this.buffer = this.buffer.slice(markerIndex + marker.length);
        this.insideThink = !this.insideThink;
        continue;
      }

      if (final) {
        if (!this.insideThink) visible += this.appendVisible(this.buffer);
        this.buffer = "";
        break;
      }

      // Keep a possible partial marker for the next chunk.
      let keep = 0;
      const max = Math.min(marker.length - 1, this.buffer.length);
      for (let size = max; size > 0; size--) {
        if (this.buffer.slice(-size).toLowerCase() === marker.slice(0, size)) {
          keep = size;
          break;
        }
      }
      const safeLength = this.buffer.length - keep;
      if (!this.insideThink) visible += this.appendVisible(this.buffer.slice(0, safeLength));
      this.buffer = this.buffer.slice(safeLength);
      break;
    }

    return visible;
  }
}

function stripThinkBlocks(text: string): string {
  return new ThinkBlockFilter().push(text, true).trim();
}

/**
 * Works with any OpenAI-style /chat/completions API. OpenRouter and the
 * Hugging Face router both speak this protocol.
 */
export class OpenAICompatibleProvider implements AIProvider {
  readonly capabilities: { streaming: boolean; embeddings: boolean };
  constructor(private cfg: ProviderConfig) {
    this.capabilities = { streaming: cfg.streaming, embeddings: !!cfg.embeddingModel };
    if (!cfg.embeddingModel) this.embed = undefined;
  }

  /** Only usable when EMBEDDING_MODEL is set. Callers must treat failures as "no embeddings". */
  embed?: (texts: string[], signal?: AbortSignal) => Promise<number[][]> = async (texts, signal) => {
    const guard = new Guard(this.cfg.timeoutMs, signal);
    try {
      const res = await fetch(`${this.cfg.baseUrl.replace(/\/$/, "")}/embeddings`, {
        method: "POST",
        signal: guard.controller.signal,
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${this.cfg.apiKey}`, ...this.cfg.extraHeaders },
        body: JSON.stringify({ model: this.cfg.embeddingModel, input: texts }),
      });
      if (!res.ok) throw statusToKind(res.status);
      const json = (await res.json()) as { data?: { embedding?: number[] }[] };
      const out = (json.data ?? []).map((d) => d.embedding ?? []);
      if (out.length !== texts.length || out.some((v) => !v.length)) throw new ProviderError("bad_response");
      return out;
    } catch (e) {
      if (e instanceof ProviderError) throw e;
      throw new ProviderError(guard.timedOut ? "timeout" : "unavailable");
    } finally {
      guard.clear();
    }
  };
  get name() { return this.cfg.name; }
  get model() { return this.cfg.model; }

  private async open(messages: ChatMessage[], opts: GenerateOptions, stream: boolean) {
    const body = JSON.stringify({
      model: this.cfg.model,
      messages,
      stream,
      max_tokens: opts.maxTokens ?? this.cfg.maxTokens,
      temperature: opts.temperature ?? this.cfg.temperature,
    });
    const guard = new Guard(this.cfg.timeoutMs, opts.signal);
    for (let attempt = 0; ; attempt++) {
      try {
        const res = await fetch(`${this.cfg.baseUrl.replace(/\/$/, "")}/chat/completions`, {
          method: "POST",
          signal: guard.controller.signal,
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${this.cfg.apiKey}`,
            ...this.cfg.extraHeaders,
          },
          body,
        });
        if (res.ok) return { res, guard };
        await res.text().catch(() => ""); // drain; upstream body is never forwarded
        if (attempt === 0 && [502, 503, 504].includes(res.status)) { await sleep(800); continue; }
        guard.clear();
        throw statusToKind(res.status);
      } catch (e) {
        if (e instanceof ProviderError) throw e;
        if (guard.timedOut) { guard.clear(); throw new ProviderError("timeout"); }
        if (guard.clientAborted) { guard.clear(); throw e; }
        if (attempt === 0) { await sleep(800); continue; }
        guard.clear();
        throw new ProviderError("unavailable", "Could not reach the AI provider. Check your connection and LLM_BASE_URL.");
      }
    }
  }

  async complete(messages: ChatMessage[], opts: GenerateOptions = {}): Promise<string> {
    const { res, guard } = await this.open(messages, opts, false);
    try {
      const text = extractContent(await res.json().catch(() => null)).trim();
      const output = this.cfg.stripThinkTags ? stripThinkBlocks(text) : text;
      if (!output) throw new ProviderError("bad_response", "The model returned an empty reply. Try again.");
      return output;
    } catch (e) {
      if (guard.timedOut) throw new ProviderError("timeout");
      throw e;
    } finally {
      guard.clear();
    }
  }

  async *stream(messages: ChatMessage[], opts: GenerateOptions = {}): AsyncGenerator<string> {
    if (!this.capabilities.streaming) {
      yield await this.complete(messages, opts);
      return;
    }
    const thinkFilter = this.cfg.stripThinkTags ? new ThinkBlockFilter() : null;
    const { res, guard } = await this.open(messages, opts, true);
    const reader = res.body?.getReader();
    try {
      // Some models or providers ignore stream:true and return plain JSON.
      if (!reader || (res.headers.get("content-type") ?? "").includes("application/json")) {
        const text = extractContent(await res.json().catch(() => null)).trim();
        const output = thinkFilter ? stripThinkBlocks(text) : text;
        if (!output) throw new ProviderError("bad_response", "The model returned an empty reply. Try again.");
        yield output;
        return;
      }
      const decoder = new TextDecoder();
      let buffer = "";
      let emitted = false;
      let finished = false;
      while (!finished) {
        const { done, value } = await reader.read();
        if (done) break;
        guard.touch();
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const raw of lines) {
          const line = raw.trim();
          if (!line.startsWith("data:")) continue; // comments and keep-alives
          const data = line.slice(5).trim();
          if (data === "[DONE]") { finished = true; break; }
          let json: { error?: unknown; choices?: { delta?: { content?: unknown } }[] };
          try { json = JSON.parse(data); } catch { continue; }
          if (json.error) throw new ProviderError("unavailable", "The AI provider stopped the reply unexpectedly. Try again.");
          const piece = json.choices?.[0]?.delta?.content;
          if (typeof piece === "string" && piece) {
            const output = thinkFilter ? thinkFilter.push(piece) : piece;
            if (output) { emitted = true; yield output; }
          }
        }
        if (finished) break;
      }
      const tail = thinkFilter?.push("", true) ?? "";
      if (tail) { emitted = true; yield tail; }
      if (!emitted) throw new ProviderError("bad_response", "The model returned an empty reply. Try again.");
    } catch (e) {
      if (e instanceof ProviderError) throw e;
      if (guard.timedOut) throw new ProviderError("timeout");
      if (guard.clientAborted) throw e;
      throw new ProviderError("unavailable", "The connection to the AI provider dropped. Try again.");
    } finally {
      guard.clear();
      guard.controller.abort();
      reader?.cancel().catch(() => {});
    }
  }
}
