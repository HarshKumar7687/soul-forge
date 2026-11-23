import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

let app: import("express").Express;
let mongod: MongoMemoryServer;

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  process.env.NODE_ENV = "test";
  process.env.MONGODB_URI = mongod.getUri();
  process.env.JWT_SECRET = "test-secret-test-secret-test-secret-1234";
  await mongoose.connect(mongod.getUri());
  const { createApp } = await import("../src/app");
  app = createApp();
});
afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});
beforeEach(async () => {
  await mongoose.connection.db!.dropDatabase();
});

async function signup(email: string) {
  const agent = request.agent(app);
  await agent.post("/api/auth/register").send({ email, password: "forge1234", displayName: "Tester" });
  return agent;
}

const complete = {
  name: "Mira",
  shortDescription: "A wary cartographer",
  personalityTraits: ["curious", "guarded"],
  speakingStyle: "Dry and precise",
  greeting: "You're late.",
};

describe("characters", () => {
  it("requires authentication", async () => {
    expect((await request(app).get("/api/characters")).status).toBe(401);
    expect((await request(app).post("/api/characters").send({ name: "X" })).status).toBe(401);
  });

  it("saves a draft with only a name", async () => {
    const a = await signup("a@example.com");
    const res = await a.post("/api/characters").send({ name: "Draft" });
    expect(res.status).toBe(201);
    expect(res.body.character.status).toBe("draft");
    expect(res.body.character.visibility).toBe("private");
  });

  it("refuses to publish an incomplete character, and public drafts", async () => {
    const a = await signup("a@example.com");
    const pub = await a.post("/api/characters").send({ name: "X", status: "published" });
    expect(pub.status).toBe(400);
    expect(pub.body.error.details.greeting).toBeTruthy();
    const draftPublic = await a.post("/api/characters").send({ name: "X", visibility: "public" });
    expect(draftPublic.status).toBe(400);
  });

  it("edits and validates updates", async () => {
    const a = await signup("a@example.com");
    const { body } = await a.post("/api/characters").send({ name: "Mira" });
    const ok = await a.patch(`/api/characters/${body.character.id}`).send({ ...complete, status: "published" });
    expect(ok.status).toBe(200);
    expect(ok.body.character.status).toBe("published");
    const bad = await a.patch(`/api/characters/${body.character.id}`).send({ ownerId: "x" });
    expect(bad.status).toBe(400);
  });

  it("enforces ownership on read, update, duplicate and delete", async () => {
    const a = await signup("a@example.com");
    const b = await signup("b@example.com");
    const { body } = await a.post("/api/characters").send({ name: "Secret" });
    const id = body.character.id;
    expect((await b.get(`/api/characters/${id}`)).status).toBe(404);
    expect((await b.patch(`/api/characters/${id}`).send({ name: "Hacked" })).status).toBe(404);
    expect((await b.post(`/api/characters/${id}/duplicate`)).status).toBe(404);
    expect((await b.delete(`/api/characters/${id}`)).status).toBe(404);
    expect((await b.get("/api/characters")).body.characters).toHaveLength(0);
    expect((await a.get(`/api/characters/${id}`)).status).toBe(200);
  });

  it("duplicates as a private draft and deletes", async () => {
    const a = await signup("a@example.com");
    const { body } = await a.post("/api/characters").send({ ...complete, status: "published", visibility: "public" });
    const dup = await a.post(`/api/characters/${body.character.id}/duplicate`);
    expect(dup.status).toBe(201);
    expect(dup.body.character.status).toBe("draft");
    expect(dup.body.character.visibility).toBe("private");
    expect(dup.body.character.name).toBe("Mira (copy)");
    expect((await a.delete(`/api/characters/${dup.body.character.id}`)).status).toBe(204);
    expect((await a.get("/api/characters")).body.characters).toHaveLength(1);
  });

  it("featured lists only published public characters", async () => {
    const a = await signup("a@example.com");
    await a.post("/api/characters").send({ name: "Hidden draft" });
    await a.post("/api/characters").send({ ...complete, name: "Private", status: "published", visibility: "private" });
    await a.post("/api/characters").send({ ...complete, name: "Shown", status: "published", visibility: "public" });
    const res = await request(app).get("/api/characters/featured");
    expect(res.body.characters.map((c: { name: string }) => c.name)).toEqual(["Shown"]);
  });

  it("rejects non-image uploads and accepts a real PNG", async () => {
    const a = await signup("a@example.com");
    const bad = await a.post("/api/characters/portrait").attach("image", Buffer.from("<svg onload=alert(1)>"), "x.png");
    expect(bad.status).toBe(400);
    const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(32)]);
    const ok = await a.post("/api/characters/portrait").attach("image", png, "p.png");
    expect(ok.status).toBe(201);
    expect(ok.body.url).toMatch(/^\/uploads\/[a-f0-9]{32}\.png$/);
  });

  it("refuses 18+ ratings while the server switch is off", async () => {
    const a = await signup("a@example.com");
    const res = await a.post("/api/characters").send({ name: "Adult", age: 30, contentRating: "mature" });
    expect(res.status).toBe(400);
    expect(res.body.error.details.contentRating).toMatch(/ALLOW_MATURE_CONTENT/);
  });
});
