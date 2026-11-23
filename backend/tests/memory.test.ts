import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { asText, bootApp, parseSse, ScriptedProvider, signup } from "./helpers";
import { cosine, isDuplicate, parseCandidates, rankMemories } from "../src/services/memoryService";

let ctx: Awaited<ReturnType<typeof bootApp>>;
let ai: typeof import("../src/services/ai");
beforeAll(async () => {
  // Config is read once at startup, so set these first: extract memories every 3 messages, summaries on.
  process.env.MEMORY_EVERY_MESSAGES = "3";
  process.env.CHAT_SUMMARY = "true";
  ctx = await bootApp();
  ai = await import("../src/services/ai");
});
afterAll(() => ctx.stop());
beforeEach(() => ctx.reset());
afterEach(() => ai.setLLMProviderForTests(null));

const d = (n = 0) => new Date(Date.now() - n * 86400000);

describe("memory retrieval (pure)", () => {
  const mems = [
    { content: "Sam is afraid of deep water.", type: "fact", updatedAt: d(1) },
    { content: "Sam adopted a grey cat named Pepper.", type: "event", updatedAt: d(2) },
    { content: "Sam prefers tea over coffee.", type: "preference", updatedAt: d(3) },
  ];
  it("returns only relevant memories, not everything", () => {
    const r = rankMemories(mems, "I'm walking to the lake, deep water scares me");
    expect(r.map((m) => m.content)).toEqual(["Sam is afraid of deep water."]);
    expect(rankMemories(mems, "hello there")).toEqual([]);
  });
  it("uses embeddings when present", () => {
    const withEmb = mems.map((m, i) => ({ ...m, embedding: i === 1 ? [0, 1] : [1, 0] }));
    expect(rankMemories(withEmb, "zzz", [0, 1]).map((m) => m.content)).toEqual(["Sam adopted a grey cat named Pepper."]);
    expect(cosine([1, 0], [0, 1])).toBe(0);
  });
  it("parses model output defensively and dedupes", () => {
    const out = parseCandidates('Sure!\n```json\n[{"content":"Sam hates mornings entirely.","type":"preference"},{"content":"x"},{"content":"Sam owns a boat shop.","type":"bogus"}]\n```');
    expect(out).toEqual([{ content: "Sam hates mornings entirely.", type: "preference" }, { content: "Sam owns a boat shop.", type: "fact" }]);
    expect(parseCandidates("nothing here")).toEqual([]);
    expect(isDuplicate("Sam is afraid of deep water", ["Sam is afraid of deep water."])).toBe(true);
    expect(isDuplicate("Sam likes jazz music", ["Sam is afraid of deep water."])).toBe(false);
  });
});

async function setup() {
  const a = await signup(ctx.app, "a@example.com");
  const ch = (await a.post("/api/characters").send({ name: "Mira", greeting: "Hi." })).body.character;
  const conv = (await a.post("/api/conversations").send({ characterId: ch.id })).body.conversation;
  return { a, ch, conv };
}
const send = (a: any, id: string, content: string) => a.post(`/api/conversations/${id}/messages`).send({ content }).buffer(true).parse(asText);

describe("memory API", () => {
  it("lets users add, edit, list and delete their own memories only", async () => {
    const { a, ch } = await setup();
    const b = await signup(ctx.app, "b@example.com");
    const made = await a.post("/api/memories").send({ characterId: ch.id, content: "Sam loves sailing", type: "preference" });
    expect(made.status).toBe(201);
    expect(made.body.memory.source).toBe("manual");
    const id = made.body.memory.id;
    expect((await a.get("/api/memories")).body.memories).toHaveLength(1);
    expect((await b.get("/api/memories")).body.memories).toHaveLength(0);
    expect((await b.patch(`/api/memories/${id}`).send({ content: "hacked!!" })).status).toBe(404);
    expect((await b.delete(`/api/memories/${id}`)).status).toBe(404);
    const upd = await a.patch(`/api/memories/${id}`).send({ content: "Sam loves sailing at dawn" });
    expect(upd.body.memory.content).toBe("Sam loves sailing at dawn");
    expect((await a.patch(`/api/memories/${id}`).send({ content: "x" })).status).toBe(400);
    expect((await a.delete(`/api/memories/${id}`)).status).toBe(204);
    expect((await a.get("/api/memories")).body.memories).toHaveLength(0);
  });
  it("cannot attach memories to someone else's private character", async () => {
    const { ch } = await setup();
    const b = await signup(ctx.app, "b@example.com");
    expect((await b.post("/api/memories").send({ characterId: ch.id, content: "sneaky memory" })).status).toBe(404);
  });
});

describe("memory in conversations", () => {
  const isExtraction = (m: { content: string }[]) => m[0].content.includes("maintain long-term memory");
  const isSummary = (m: { content: string }[]) => m[0].content.startsWith("Summarize a roleplay");

  it("saves selective memories, skips duplicates, and recalls them only when relevant", async () => {
    const { a, conv } = await setup();
    const p = new ScriptedProvider((m) =>
      isExtraction(m) ? ['[{"content":"Sam is afraid of deep water.","type":"fact"}]'] : ["*nods* Noted."]);
    ai.setLLMProviderForTests(p);
    for (const t of ["hi", "I had a long day", "By the way I'm afraid of deep water"]) await send(a, conv.id, t);
    const mems = (await a.get("/api/memories")).body.memories;
    expect(mems).toHaveLength(1);
    expect(mems[0]).toMatchObject({ source: "auto", type: "fact" });

    // Three more messages: extraction returns the same item again, which must not duplicate.
    for (const t of ["ok", "so anyway", "right"]) await send(a, conv.id, t);
    expect((await a.get("/api/memories")).body.memories).toHaveLength(1);

    p.calls.length = 0;
    await send(a, conv.id, "Should we cross the deep water tomorrow?");
    expect(p.calls.at(-1)![0].content).toContain("Sam is afraid of deep water");
    // The relevance window is the last three user messages, so let the topic pass.
    await send(a, conv.id, "fine");
    await send(a, conv.id, "thanks");
    p.calls.length = 0;
    await send(a, conv.id, "What's your favourite colour?");
    expect(p.calls.at(-1)![0].content).not.toContain("afraid of deep water");
  });

  it("does not create memories when the model finds nothing worth keeping", async () => {
    const { a, conv } = await setup();
    ai.setLLMProviderForTests(new ScriptedProvider((m) => (isExtraction(m) ? ["[]"] : ["ok"])));
    for (const t of ["hi", "hello", "how are you"]) await send(a, conv.id, t);
    expect((await a.get("/api/memories")).body.memories).toHaveLength(0);
  });

  it("a failing extraction never breaks the chat", async () => {
    const { a, conv } = await setup();
    const { ProviderError } = ai;
    ai.setLLMProviderForTests(new ScriptedProvider((m) => (isExtraction(m) ? new ProviderError("timeout") : ["fine"])));
    let last: any;
    for (const t of ["one", "two", "three"]) last = await send(a, conv.id, t);
    expect(parseSse(last.body).at(-1)!.event).toBe("done");
  });

  it("summarizes long histories and uses the summary instead of old messages", async () => {
    const { a, conv } = await setup();
    const { Message } = await import("../src/models/Message");
    const { Conversation } = await import("../src/models/Conversation");
    const start = Date.now() - 3_600_000;
    await Message.insertMany(Array.from({ length: 50 }, (_, i) => ({
      conversationId: conv.id, role: i % 2 ? "assistant" : "user", kind: i % 2 ? "reply" : "message",
      content: `old message ${i}`, createdAt: new Date(start + i * 1000),
    })));
    const p = new ScriptedProvider((m) => (isSummary(m) ? ["SUMMARY: they argued about the map."] : isExtraction(m) ? ["[]"] : ["ok"]));
    ai.setLLMProviderForTests(p);
    await send(a, conv.id, "and then?");
    const doc = await Conversation.findById(conv.id);
    expect(doc!.summary).toContain("argued about the map");
    expect(doc!.summarizedThrough).toBeTruthy();

    p.calls.length = 0;
    await send(a, conv.id, "continue");
    const prompt = p.calls.at(-1)!;
    expect(prompt[0].content).toContain("argued about the map");
    expect(prompt.some((m) => m.content === "old message 0")).toBe(false);
    expect(prompt.at(-1)!.content).toBe("continue");
  });
});
