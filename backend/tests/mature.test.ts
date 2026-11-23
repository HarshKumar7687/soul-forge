import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { asText, bootApp, ScriptedProvider, signup } from "./helpers";

let ctx: Awaited<ReturnType<typeof bootApp>>;
let ai: typeof import("../src/services/ai");
beforeAll(async () => {
  process.env.ALLOW_MATURE_CONTENT = "true"; // must be set before the app loads its config
  ctx = await bootApp();
  ai = await import("../src/services/ai");
});
afterAll(() => ctx.stop());
beforeEach(() => ctx.reset());
afterEach(() => ai.setLLMProviderForTests(null));

const adult = { name: "Vera", age: 34, contentRating: "mature", greeting: "Hello." };

describe("18+ characters", () => {
  it("require an adult age and stay private", async () => {
    const a = await signup(ctx.app, "a@example.com");
    expect((await a.post("/api/characters").send({ name: "X", contentRating: "mature" })).body.error.details.age).toBeTruthy();
    expect((await a.post("/api/characters").send({ name: "X", age: 17, contentRating: "mature" })).status).toBe(400);
    expect((await a.post("/api/characters").send({ ...adult, status: "published", visibility: "public", shortDescription: "x", personalityTraits: ["a"], speakingStyle: "y" })).body.error.details.visibility).toMatch(/private/);
    const ok = await a.post("/api/characters").send(adult);
    expect(ok.status).toBe(201);
    expect(ok.body.character.contentRating).toBe("mature");
  });

  it("cannot be switched to mature below 18 or made public afterwards", async () => {
    const a = await signup(ctx.app, "a@example.com");
    const c = (await a.post("/api/characters").send({ name: "Kid", age: 12, greeting: "Hi" })).body.character;
    expect((await a.patch(`/api/characters/${c.id}`).send({ contentRating: "mature" })).status).toBe(400);
    const v = (await a.post("/api/characters").send({ ...adult, shortDescription: "x", personalityTraits: ["a"], speakingStyle: "y", status: "published" })).body.character;
    expect((await a.patch(`/api/characters/${v.id}`).send({ visibility: "public" })).status).toBe(400);
  });

  it("never appear in discovery, featured, or other people's chats", async () => {
    const a = await signup(ctx.app, "a@example.com");
    const b = await signup(ctx.app, "b@example.com");
    const v = (await a.post("/api/characters").send(adult)).body.character;
    // even if a record were forced public in the database, every public path hides it
    const { Character } = await import("../src/models/Character");
    await Character.updateOne({ _id: v.id }, { status: "published", visibility: "public", shortDescription: "x", personalityTraits: ["a"], speakingStyle: "y" });
    expect((await request(ctx.app).get("/api/characters/browse")).body.total).toBe(0);
    expect((await request(ctx.app).get("/api/characters/featured")).body.characters).toHaveLength(0);
    expect((await request(ctx.app).get(`/api/characters/${v.id}`)).status).toBe(404);
    expect((await b.post("/api/conversations").send({ characterId: v.id })).status).toBe(404);
    expect((await b.post("/api/favorites").send({ characterId: v.id })).status).toBe(404);
  });

  it("use the mature prompt rules in chat only for the owner's mature character", async () => {
    const a = await signup(ctx.app, "a@example.com");
    const v = (await a.post("/api/characters").send(adult)).body.character;
    const g = (await a.post("/api/characters").send({ name: "Gen", greeting: "Hi" })).body.character;
    const p = new ScriptedProvider(() => ["ok"]);
    ai.setLLMProviderForTests(p);
    const chat = async (id: string) => {
      const conv = (await a.post("/api/conversations").send({ characterId: id })).body.conversation;
      await a.post(`/api/conversations/${conv.id}/messages`).send({ content: "hello" }).buffer(true).parse(asText);
      return p.calls.at(-1)![0].content;
    };
    expect(await chat(v.id)).toContain("between adults");
    expect(await chat(g.id)).toContain("content you must not write");
    expect(await chat(v.id)).toContain("under 18");
  });
});

describe("18+ stories", () => {
  it("need adult characters throughout", async () => {
    const a = await signup(ctx.app, "a@example.com");
    const grown = (await a.post("/api/characters").send({ name: "Vera", age: 34 })).body.character;
    const noAge = (await a.post("/api/characters").send({ name: "Mystery" })).body.character;
    const body = { title: "Night", genre: "romance", contentRating: "mature", characterIds: [grown.id] };
    const ok = await a.post("/api/stories").send(body);
    expect(ok.status).toBe(201);
    expect(ok.body.story.contentRating).toBe("mature");
    expect((await a.post("/api/stories").send({ ...body, characterIds: [noAge.id] })).status).toBe(400);
    expect((await a.post(`/api/stories/${ok.body.story.id}/characters`).send({ characterId: noAge.id })).status).toBe(400);
    const teen = (await a.post("/api/characters").send({ name: "Teen", age: 16 })).body.character;
    expect((await a.post(`/api/stories/${ok.body.story.id}/characters`).send({ characterId: teen.id })).status).toBe(400);
  });

  it("use mature narrator rules only for mature stories, and always keep the minors rule", async () => {
    const a = await signup(ctx.app, "a@example.com");
    const p = new ScriptedProvider(() => ["Scene. ", "<<<STATE>>>", "{}"]);
    ai.setLLMProviderForTests(p);
    const run = async (contentRating: string) => {
      const s = (await a.post("/api/stories").send({ title: "S", genre: "romance", contentRating })).body.story;
      await a.post(`/api/stories/${s.id}/continue`).send({ input: "" }).buffer(true).parse(asText);
      return p.calls.at(-1)![0].content;
    };
    const mat = await run("mature");
    const gen = await run("general");
    expect(mat).toContain("between adults");
    expect(gen).toContain("general audience");
    expect(mat).toContain("under 18");
    expect(gen).toContain("under 18");
  });
});
