import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { bootApp, signup } from "./helpers";

let ctx: Awaited<ReturnType<typeof bootApp>>;
beforeAll(async () => { ctx = await bootApp(); });
afterAll(() => ctx.stop());
beforeEach(() => ctx.reset());

const card = (name: string, extra: object = {}) => ({
  name, shortDescription: `${name} the wanderer`, personalityTraits: ["Curious"], speakingStyle: "Calm", greeting: `I am ${name}.`,
  backstory: "SECRET BACKSTORY", status: "published", visibility: "public", category: "fantasy", ...extra,
});
const pub = async (a: any, name: string, extra: object = {}) => (await a.post("/api/characters").send(card(name, extra))).body.character;

describe("browse", () => {
  it("shows only published public characters, with creator, and hides private details", async () => {
    const a = await signup(ctx.app, "a@example.com");
    await pub(a, "Shown");
    await a.post("/api/characters").send({ name: "DraftOnly" });
    await pub(a, "PrivatePub", { visibility: "private" });
    const res = await request(ctx.app).get("/api/characters/browse"); // signed out works
    expect(res.status).toBe(200);
    expect(res.body.characters.map((c: any) => c.name)).toEqual(["Shown"]);
    expect(res.body.characters[0].creator.displayName).toBe("Tester");
    expect(res.body.characters[0].greeting).toBe("I am Shown.");
    expect(JSON.stringify(res.body)).not.toContain("SECRET BACKSTORY");
  });

  it("searches, filters by category and trait, sorts, and paginates", async () => {
    const a = await signup(ctx.app, "a@example.com");
    const x = await pub(a, "Aria", { category: "sci-fi", personalityTraits: ["Bold"] });
    await pub(a, "Borin", { personalityTraits: ["Gruff", "Loyal"] });
    await pub(a, "Cass", { shortDescription: "A smuggler with a heart" });
    const get = (q: string) => request(ctx.app).get(`/api/characters/browse?${q}`);
    expect((await get("q=aria")).body.characters.map((c: any) => c.name)).toEqual(["Aria"]);
    expect((await get("q=smuggler")).body.characters.map((c: any) => c.name)).toEqual(["Cass"]);
    expect((await get("category=sci-fi")).body.total).toBe(1);
    expect((await get("trait=loyal")).body.characters.map((c: any) => c.name)).toEqual(["Borin"]);
    expect((await get("q=.*")).body.total).toBe(0); // regex input is escaped
    expect((await get("category=nope")).status).toBe(400);
    expect((await get("sort=recent")).body.characters[0].name).toBe("Cass");
    await a.post("/api/favorites").send({ characterId: x.id });
    expect((await get("sort=popular")).body.characters[0].name).toBe("Aria");
    const p1 = (await get("limit=2&page=1")).body;
    const p2 = (await get("limit=2&page=2")).body;
    expect([p1.characters.length, p1.hasMore, p2.characters.length, p2.hasMore, p1.total]).toEqual([2, true, 1, false, 3]);
    const traits = (await request(ctx.app).get("/api/characters/traits")).body.traits.map((t: any) => t.trait);
    expect(traits).toContain("curious");
  });
});

describe("favorites", () => {
  it("adds idempotently, counts, lists, and removes", async () => {
    const a = await signup(ctx.app, "a@example.com");
    const b = await signup(ctx.app, "b@example.com");
    const c = await pub(a, "Mira");
    expect((await b.post("/api/favorites").send({ characterId: c.id })).status).toBe(201);
    expect((await b.post("/api/favorites").send({ characterId: c.id })).status).toBe(201);
    const browse = (await b.get("/api/characters/browse")).body.characters[0];
    expect([browse.favoriteCount, browse.isFavorite]).toEqual([1, true]);
    expect((await b.get("/api/favorites")).body.characters.map((x: any) => x.name)).toEqual(["Mira"]);
    expect((await b.delete(`/api/favorites/${c.id}`)).status).toBe(204);
    expect((await b.delete(`/api/favorites/${c.id}`)).status).toBe(204);
    expect((await b.get("/api/characters/browse")).body.characters[0].favoriteCount).toBe(0);
    expect((await b.get("/api/favorites")).body.characters).toHaveLength(0);
  });

  it("cannot favorite private characters, and hides favorites that go private", async () => {
    const a = await signup(ctx.app, "a@example.com");
    const b = await signup(ctx.app, "b@example.com");
    const priv = (await a.post("/api/characters").send({ name: "Hidden" })).body.character;
    expect((await b.post("/api/favorites").send({ characterId: priv.id })).status).toBe(404);
    const c = await pub(a, "Mira");
    await b.post("/api/favorites").send({ characterId: c.id });
    await a.patch(`/api/characters/${c.id}`).send({ visibility: "private" });
    expect((await b.get("/api/favorites")).body.characters).toHaveLength(0);
  });
});

describe("sharing and reporting", () => {
  it("serves public character pages to anyone, without private fields; private ones 404", async () => {
    const a = await signup(ctx.app, "a@example.com");
    const c = await pub(a, "Mira");
    const priv = (await a.post("/api/characters").send({ name: "Hidden" })).body.character;
    const res = await request(ctx.app).get(`/api/characters/${c.id}`);
    expect(res.status).toBe(200);
    expect(res.body.character.name).toBe("Mira");
    expect(res.body.isOwner).toBe(false);
    expect(JSON.stringify(res.body)).not.toContain("SECRET BACKSTORY");
    expect((await request(ctx.app).get(`/api/characters/${priv.id}`)).status).toBe(404);
    const owner = (await a.get(`/api/characters/${c.id}`)).body;
    expect(owner.isOwner).toBe(true);
    expect(owner.character.backstory).toBe("SECRET BACKSTORY");
  });

  it("reports once per user, blocks self-reports, and hides heavily reported characters", async () => {
    const a = await signup(ctx.app, "a@example.com");
    const c = await pub(a, "Mira");
    expect((await a.post(`/api/characters/${c.id}/report`).send({ reason: "other" })).status).toBe(400);
    for (let i = 0; i < 5; i++) {
      const u = await signup(ctx.app, `r${i}@example.com`);
      expect((await u.post(`/api/characters/${c.id}/report`).send({ reason: "inappropriate", details: "no" })).status).toBe(201);
      if (i === 0) expect((await u.post(`/api/characters/${c.id}/report`).send({ reason: "other" })).status).toBe(409);
    }
    expect((await request(ctx.app).get("/api/characters/browse")).body.total).toBe(0);
    expect((await request(ctx.app).get(`/api/characters/${c.id}`)).status).toBe(404);
    expect((await a.get(`/api/characters/${c.id}`)).status).toBe(200); // owner still sees it
    const other = await signup(ctx.app, "z@example.com");
    expect((await other.post("/api/conversations").send({ characterId: c.id })).status).toBe(404);
  });
});
