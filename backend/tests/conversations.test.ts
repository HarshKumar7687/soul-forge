import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { asText, bootApp, parseSse, ScriptedProvider, signup } from "./helpers";

let ctx: Awaited<ReturnType<typeof bootApp>>;
let ai: typeof import("../src/services/ai");

beforeAll(async () => {
  ctx = await bootApp();
  ai = await import("../src/services/ai");
});
afterAll(() => ctx.stop());
beforeEach(() => ctx.reset());
afterEach(() => ai.setLLMProviderForTests(null));

const character = {
  name: "Mira", shortDescription: "Cartographer", personalityTraits: ["guarded"],
  speakingStyle: "Dry", greeting: "You're late.", status: "published", visibility: "public",
};

async function setup() {
  const a = await signup(ctx.app, "a@example.com");
  const ch = (await a.post("/api/characters").send(character)).body.character;
  const conv = (await a.post("/api/conversations").send({ characterId: ch.id })).body.conversation;
  return { a, ch, conv };
}
const send = (a: any, id: string, content: string) =>
  a.post(`/api/conversations/${id}/messages`).send({ content }).buffer(true).parse(asText);

describe("conversations", () => {
  it("starts with the character's greeting and lists the conversation", async () => {
    const { a, conv } = await setup();
    const got = await a.get(`/api/conversations/${conv.id}`);
    expect(got.body.messages).toHaveLength(1);
    expect(got.body.messages[0]).toMatchObject({ role: "assistant", kind: "greeting", content: "You're late." });
    expect((await a.get("/api/conversations")).body.conversations[0].character.name).toBe("Mira");
  });

  it("returns a clear configuration error and saves nothing when no AI is configured", async () => {
    const { a, conv } = await setup();
    const res = await a.post(`/api/conversations/${conv.id}/messages`).send({ content: "hi" });
    expect(res.status).toBe(503);
    expect(res.body.error.code).toBe("ai_not_configured");
    expect(res.body.error.message).toMatch(/LLM_API_KEY/);
    expect((await a.get(`/api/conversations/${conv.id}`)).body.messages).toHaveLength(1);
  });

  it("streams a reply and persists both messages", async () => {
    const { a, conv } = await setup();
    const p = new ScriptedProvider(() => ["*looks up* ", "Hello there."]);
    ai.setLLMProviderForTests(p);
    const res = await send(a, conv.id, "Hi Mira");
    const events = parseSse(res.body);
    expect(events.map((e) => e.event)).toEqual(["user", "delta", "delta", "done"]);
    expect(events[3].data.message.content).toBe("*looks up* Hello there.");
    const got = (await a.get(`/api/conversations/${conv.id}`)).body.messages;
    expect(got.map((m: any) => m.role)).toEqual(["assistant", "user", "assistant"]);
    // the model saw the system prompt with character details, and the user's message
    expect(p.calls[0][0].content).toContain("Mira");
    expect(p.calls[0].at(-1)).toEqual({ role: "user", content: "Hi Mira" });
  });

  it("reports provider failures, keeps the user message, and saves no reply", async () => {
    const { a, conv } = await setup();
    const { ProviderError } = ai;
    ai.setLLMProviderForTests(new ScriptedProvider(() => new ProviderError("rate_limit")));
    const events = parseSse((await send(a, conv.id, "Hi")).body);
    const err = events.find((e) => e.event === "error")!;
    expect(err.data.code).toBe("ai_rate_limit");
    expect(events.some((e) => e.event === "done")).toBe(false);
    const msgs = (await a.get(`/api/conversations/${conv.id}`)).body.messages;
    expect(msgs.map((m: any) => m.role)).toEqual(["assistant", "user"]);
  });

  it("regenerates the last reply, replacing it", async () => {
    const { a, conv } = await setup();
    ai.setLLMProviderForTests(new ScriptedProvider(() => ["First."]));
    await send(a, conv.id, "Hi");
    ai.setLLMProviderForTests(new ScriptedProvider(() => ["Second."]));
    const res = await a.post(`/api/conversations/${conv.id}/regenerate`).buffer(true).parse(asText);
    expect(parseSse(res.body).at(-1)!.event).toBe("done");
    const msgs = (await a.get(`/api/conversations/${conv.id}`)).body.messages;
    expect(msgs.map((m: any) => m.content)).toEqual(["You're late.", "Hi", "Second."]);
  });

  it("can retry after a failure, and cannot regenerate the greeting", async () => {
    const { a, conv } = await setup();
    ai.setLLMProviderForTests(new ScriptedProvider(() => ["x"]));
    expect((await a.post(`/api/conversations/${conv.id}/regenerate`)).status).toBe(400);
    const { ProviderError } = ai;
    ai.setLLMProviderForTests(new ScriptedProvider(() => new ProviderError("timeout")));
    await send(a, conv.id, "Hi");
    ai.setLLMProviderForTests(new ScriptedProvider(() => ["Recovered."]));
    const res = await a.post(`/api/conversations/${conv.id}/regenerate`).buffer(true).parse(asText);
    expect(parseSse(res.body).at(-1)!.data.message.content).toBe("Recovered.");
  });

  it("enforces ownership", async () => {
    const { conv, ch } = await setup();
    const b = await signup(ctx.app, "b@example.com");
    ai.setLLMProviderForTests(new ScriptedProvider(() => ["x"]));
    expect((await b.get(`/api/conversations/${conv.id}`)).status).toBe(404);
    expect((await b.post(`/api/conversations/${conv.id}/messages`).send({ content: "hi" })).status).toBe(404);
    expect((await b.post(`/api/conversations/${conv.id}/regenerate`)).status).toBe(404);
    expect((await b.delete(`/api/conversations/${conv.id}`)).status).toBe(404);
    expect((await b.get("/api/conversations")).body.conversations).toHaveLength(0);
    // public characters can be chatted with; private ones cannot
    expect((await b.post("/api/conversations").send({ characterId: ch.id })).status).toBe(201);
    const a = await signup(ctx.app, "c@example.com");
    const priv = (await a.post("/api/characters").send({ name: "Hidden" })).body.character;
    expect((await b.post("/api/conversations").send({ characterId: priv.id })).status).toBe(404);
  });

  it("lets the owner chat with their own draft (preview before publishing)", async () => {
    const a = await signup(ctx.app, "a@example.com");
    const draft = (await a.post("/api/characters").send({ name: "Draft", greeting: "Hi." })).body.character;
    expect((await a.post("/api/conversations").send({ characterId: draft.id })).status).toBe(201);
  });

  it("deletes a conversation with its messages, and cleans up when a character is deleted", async () => {
    const { a, ch, conv } = await setup();
    expect((await a.delete(`/api/conversations/${conv.id}`)).status).toBe(204);
    expect((await a.get(`/api/conversations/${conv.id}`)).status).toBe(404);
    const again = (await a.post("/api/conversations").send({ characterId: ch.id })).body.conversation;
    await a.delete(`/api/characters/${ch.id}`);
    expect((await a.get(`/api/conversations/${again.id}`)).status).toBe(404);
  });

  it("validates message content", async () => {
    const { a, conv } = await setup();
    ai.setLLMProviderForTests(new ScriptedProvider(() => ["x"]));
    expect((await a.post(`/api/conversations/${conv.id}/messages`).send({ content: "   " })).status).toBe(400);
    expect((await a.post(`/api/conversations/${conv.id}/messages`).send({ content: "a".repeat(4001) })).status).toBe(400);
  });

  it("reports AI status without leaking keys", async () => {
    const a = await signup(ctx.app, "a@example.com");
    const res = await a.get("/api/ai/status");
    expect(res.body.configured).toBe(false);
    expect(JSON.stringify(res.body)).not.toMatch(/key/i);
  });

  it("sends only the last few messages and runs memory extraction rarely", async () => {
    const { a, conv } = await setup();
    const isExtraction = (m: { content: string }[]) => m[0].content.includes("maintain long-term memory");
    const p = new ScriptedProvider((m) => (isExtraction(m) ? ["[]"] : ["ok"]));
    ai.setLLMProviderForTests(p);
    for (let i = 1; i <= 5; i++) await send(a, conv.id, `message ${i}`);
    expect(p.calls.filter(isExtraction)).toHaveLength(0); // default: every 6 user messages
    await send(a, conv.id, "message 6");
    expect(p.calls.filter(isExtraction)).toHaveLength(1);
    const chatCalls = p.calls.filter((c) => !isExtraction(c));
    const last = chatCalls.at(-1)!;
    expect(last.length).toBeLessThanOrEqual(1 + 8); // system prompt + at most 8 recent messages
    expect(last.at(-1)).toEqual({ role: "user", content: "message 6" });
    expect(last.some((m) => m.content === "message 1")).toBe(false);
  });

  it("uses the reply length chosen on the website, per user", async () => {
    const { a, conv } = await setup();
    const p = new ScriptedProvider(() => ["ok"]);
    ai.setLLMProviderForTests(p);
    await send(a, conv.id, "one");
    expect(p.calls.at(-1)![0].content).toContain("never over 120"); // server default is short
    expect((await a.patch("/api/auth/me").send({ replyLength: "long" })).body.user.replyLength).toBe("long");
    await send(a, conv.id, "two");
    expect(p.calls.at(-1)![0].content).not.toContain("never over 120");
    expect(p.calls.at(-1)!.at(-1)!.content).toBe("two");
    expect((await a.patch("/api/auth/me").send({ replyLength: "huge" })).status).toBe(400);
  });
});
