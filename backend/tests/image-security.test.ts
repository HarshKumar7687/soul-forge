import fs from "node:fs";
import path from "node:path";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import { bootApp, signup } from "./helpers";
import { HuggingFaceImageProvider, buildPortraitPrompt } from "../src/services/ai/image";
import { ProviderError } from "../src/services/ai/errors";

let ctx: Awaited<ReturnType<typeof bootApp>>;
let img: typeof import("../src/services/ai/image");
let ai: typeof import("../src/services/ai");
beforeAll(async () => { ctx = await bootApp(); img = await import("../src/services/ai/image"); ai = await import("../src/services/ai"); });
afterAll(() => ctx.stop());
beforeEach(() => ctx.reset());
afterEach(() => { img.setImageProviderForTests(null); ai.setLLMProviderForTests(null); vi.unstubAllGlobals(); });

const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(64)]);
const fake = (fn: () => Promise<Buffer>) => ({ name: "fake", model: "fake-img", generate: fn });
const uploadsDir = path.resolve(__dirname, "../uploads");
const fileFor = (url: string) => path.join(uploadsDir, path.basename(url));

describe("portrait generation", () => {
  it("explains missing configuration instead of faking an image", async () => {
    const a = await signup(ctx.app, "a@example.com");
    const res = await a.post("/api/characters/portrait/generate").send({ appearance: "tall, silver hair" });
    expect(res.status).toBe(503);
    expect(res.body.error.code).toBe("ai_not_configured");
    expect(res.body.error.message).toMatch(/IMAGE_API_KEY/);
    expect((await a.get("/api/ai/status")).body.image.configured).toBe(false);
  });

  it("needs a description, then generates and stores a validated image", async () => {
    const a = await signup(ctx.app, "a@example.com");
    img.setImageProviderForTests(fake(async () => PNG));
    expect((await a.post("/api/characters/portrait/generate").send({ name: "Mira" })).status).toBe(400);
    const ok = await a.post("/api/characters/portrait/generate").send({ appearance: "tall, silver hair" });
    expect(ok.status).toBe(201);
    expect(ok.body.url).toMatch(/^\/uploads\/[a-f0-9]{32}\.png$/);
    expect(fs.existsSync(fileFor(ok.body.url))).toBe(true);
    fs.unlinkSync(fileFor(ok.body.url));
  });

  it("rejects non-image output and surfaces provider errors", async () => {
    const a = await signup(ctx.app, "a@example.com");
    img.setImageProviderForTests(fake(async () => Buffer.from("<svg onload=alert(1)>")));
    expect((await a.post("/api/characters/portrait/generate").send({ appearance: "x" })).status).toBe(400);
    img.setImageProviderForTests(fake(async () => { throw new ProviderError("quota"); }));
    const res = await a.post("/api/characters/portrait/generate").send({ appearance: "x" });
    expect([res.status, res.body.error.code]).toEqual([502, "ai_quota"]);
    const anon = await request(ctx.app).post("/api/characters/portrait/generate").send({ appearance: "x" });
    expect(anon.status).toBe(401);
  });

  it("builds a safe prompt", () => {
    const p = buildPortraitPrompt({ appearance: "silver hair", age: 15, category: "fantasy" });
    expect(p).toContain("silver hair");
    expect(p).toContain("safe for work");
    expect(p).toContain("age-appropriate");
  });

  it("HuggingFace provider maps responses and errors", async () => {
    const mk = () => new HuggingFaceImageProvider("sk-secret", "m", "https://x.test/models", 1000);
    vi.stubGlobal("fetch", vi.fn(async () => new Response(PNG, { status: 200, headers: { "content-type": "image/png" } })));
    expect((await mk().generate("p")).length).toBe(PNG.length);
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 401 })));
    await expect(mk().generate("p")).rejects.toMatchObject({ kind: "auth" });
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 200, headers: { "content-type": "application/json" } })));
    await expect(mk().generate("p")).rejects.toMatchObject({ kind: "bad_response" });
  });
});

describe("upload cleanup", () => {
  it("deletes replaced portraits, but keeps files still used by a duplicate", async () => {
    const a = await signup(ctx.app, "a@example.com");
    const up = async () => (await a.post("/api/characters/portrait").attach("image", PNG, "p.png")).body.url as string;
    const u1 = await up();
    const ch = (await a.post("/api/characters").send({ name: "Mira", portraitUrl: u1 })).body.character;
    const dup = (await a.post(`/api/characters/${ch.id}/duplicate`)).body.character;
    const u2 = await up();
    await a.patch(`/api/characters/${ch.id}`).send({ portraitUrl: u2 });
    expect(fs.existsSync(fileFor(u1))).toBe(true); // duplicate still uses it
    await a.delete(`/api/characters/${dup.id}`);
    expect(fs.existsSync(fileFor(u1))).toBe(false);
    await a.delete(`/api/characters/${ch.id}`);
    expect(fs.existsSync(fileFor(u2))).toBe(false);
  });
});

describe("security", () => {
  it("blocks cross-site writes but allows the frontend origin and same-site GETs", async () => {
    const evil = await request(ctx.app).post("/api/auth/login").set("Origin", "https://evil.example").send({ email: "a@b.co", password: "x" });
    expect(evil.status).toBe(403);
    const ok = await request(ctx.app).post("/api/auth/login").set("Origin", "http://localhost:5173").send({ email: "a@b.co", password: "x" });
    expect(ok.status).toBe(401); // reached the handler
    expect((await request(ctx.app).get("/api/health").set("Origin", "https://evil.example")).status).toBe(200);
  });

  it("sets nosniff on uploads and security headers on the API", async () => {
    const a = await signup(ctx.app, "a@example.com");
    const url = (await a.post("/api/characters/portrait").attach("image", PNG, "p.png")).body.url as string;
    const res = await request(ctx.app).get(url);
    expect(res.headers["x-content-type-options"]).toBe("nosniff");
    expect((await request(ctx.app).get("/api/health")).headers["x-powered-by"]).toBeUndefined();
    fs.unlinkSync(fileFor(url));
  });

  it("deleting an account removes characters, conversations, memories, stories and favorites", async () => {
    const a = await signup(ctx.app, "a@example.com");
    const other = await signup(ctx.app, "o@example.com");
    const ch = (await a.post("/api/characters").send({ name: "Mira", greeting: "Hi", status: "published", visibility: "public", shortDescription: "x", personalityTraits: ["a"], speakingStyle: "y" })).body.character;
    await a.post("/api/conversations").send({ characterId: ch.id });
    await a.post("/api/memories").send({ characterId: ch.id, content: "remember this" });
    await a.post("/api/stories").send({ title: "S", genre: "fantasy", characterIds: [ch.id] });
    await other.post("/api/favorites").send({ characterId: ch.id });
    await other.post("/api/conversations").send({ characterId: ch.id });
    expect((await a.delete("/api/auth/me").send({ password: "forge1234" })).status).toBe(204);
    const models = {
      Character: (await import("../src/models/Character")).Character,
      Conversation: (await import("../src/models/Conversation")).Conversation,
      Message: (await import("../src/models/Message")).Message,
      Memory: (await import("../src/models/Memory")).Memory,
      Story: (await import("../src/models/Story")).Story,
      Favorite: (await import("../src/models/Favorite")).Favorite,
    };
    for (const [name, model] of Object.entries(models)) expect(await model.countDocuments(), name).toBe(0);
  });
});
