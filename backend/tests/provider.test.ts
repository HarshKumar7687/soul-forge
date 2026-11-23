import { afterEach, describe, expect, it, vi } from "vitest";
import { OpenAICompatibleProvider } from "../src/services/ai/OpenAICompatibleProvider";
import { ProviderError } from "../src/services/ai/errors";
import { collectAsync } from "./helpers";

const SECRET = "sk-secret-123";
const make = (over: Partial<ConstructorParameters<typeof OpenAICompatibleProvider>[0]> = {}) =>
  new OpenAICompatibleProvider({
    name: "test", apiKey: SECRET, model: "m", baseUrl: "https://example.test/v1",
    timeoutMs: 2000, streaming: true, maxTokens: 100, temperature: 0.7, ...over,
  });
const msgs = [{ role: "user" as const, content: "hi" }];

const sseBody = (chunks: string[]) =>
  new Response(new ReadableStream({
    start(c) { const e = new TextEncoder(); chunks.forEach((x) => c.enqueue(e.encode(x))); c.close(); },
  }), { status: 200, headers: { "content-type": "text/event-stream" } });
const delta = (t: string) => `data: ${JSON.stringify({ choices: [{ delta: { content: t } }] })}\n\n`;
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const collect = async (p: OpenAICompatibleProvider) => (await collectAsync(p.stream(msgs))).join("");
const kindOf = async (fn: () => Promise<unknown>) => {
  try { await fn(); } catch (e) { expect(e).toBeInstanceOf(ProviderError); expect((e as Error).message).not.toContain(SECRET); return (e as ProviderError).kind; }
  return "none";
};

afterEach(() => vi.unstubAllGlobals());

describe("OpenAICompatibleProvider", () => {
  it("parses streamed deltas, ignoring comments", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => sseBody([": PROCESSING\n\n", delta("Hello "), delta("world"), "data: [DONE]\n\n"])));
    expect(await collect(make())).toBe("Hello world");
  });

  it("sends auth, model and stream flag", async () => {
    const f = vi.fn(async () => sseBody([delta("ok"), "data: [DONE]\n\n"]));
    vi.stubGlobal("fetch", f);
    await collect(make());
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://example.test/v1/chat/completions");
    expect((init.headers as Record<string, string>).Authorization).toBe(`Bearer ${SECRET}`);
    expect(JSON.parse(init.body as string)).toMatchObject({ model: "m", stream: true });
  });

  it("falls back to JSON when the server ignores streaming", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => json(200, { choices: [{ message: { content: "Whole reply" } }] })));
    expect(await collect(make())).toBe("Whole reply");
  });

  it("does not request streaming when the capability is off", async () => {
    const f = vi.fn(async () => json(200, { choices: [{ message: { content: "Plain" } }] }));
    vi.stubGlobal("fetch", f);
    expect(await collect(make({ streaming: false }))).toBe("Plain");
    expect(JSON.parse((f.mock.calls[0] as unknown as [string, RequestInit])[1].body as string).stream).toBe(false);
  });

  it.each([
    [401, "auth"], [403, "auth"], [402, "quota"], [404, "model_unavailable"], [429, "rate_limit"],
  ])("maps HTTP %i to %s", async (status, kind) => {
    vi.stubGlobal("fetch", vi.fn(async () => json(status, { error: { message: `leak ${SECRET}` } })));
    expect(await kindOf(() => collect(make()))).toBe(kind);
  });

  it("retries a 503 once, then reports unavailable", async () => {
    const f = vi.fn(async () => json(503, {}));
    vi.stubGlobal("fetch", f);
    expect(await kindOf(() => collect(make()))).toBe("unavailable");
    expect(f).toHaveBeenCalledTimes(2);
  });

  it("recovers when the retry succeeds", async () => {
    let n = 0;
    vi.stubGlobal("fetch", vi.fn(async () => (n++ === 0 ? json(502, {}) : sseBody([delta("back"), "data: [DONE]\n\n"]))));
    expect(await collect(make())).toBe("back");
  });

  it("times out when the provider hangs", async () => {
    vi.stubGlobal("fetch", vi.fn((_u: string, init: RequestInit) => new Promise((_r, rej) => {
      init.signal!.addEventListener("abort", () => rej(new DOMException("aborted", "AbortError")));
    })));
    expect(await kindOf(() => collect(make({ timeoutMs: 50 })))).toBe("timeout");
  });

  it("rejects empty replies and mid-stream provider errors", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => sseBody(["data: [DONE]\n\n"])));
    expect(await kindOf(() => collect(make()))).toBe("bad_response");
    vi.stubGlobal("fetch", vi.fn(async () => sseBody([delta("par"), `data: ${JSON.stringify({ error: { message: "boom" } })}\n\n`])));
    expect(await kindOf(() => collect(make()))).toBe("unavailable");
  });
});
