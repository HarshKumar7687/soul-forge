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

const creds = { email: "Ada@Example.com", password: "forge1234", displayName: "Ada" };

describe("auth", () => {
  it("registers, hashes the password, and sets an httpOnly cookie", async () => {
    const res = await request(app).post("/api/auth/register").send(creds);
    expect(res.status).toBe(201);
    expect(res.body.user.email).toBe("ada@example.com");
    expect(res.body.user.passwordHash).toBeUndefined();
    expect(res.headers["set-cookie"][0]).toMatch(/HttpOnly/i);
    const stored = await mongoose.connection.db!.collection("users").findOne({});
    expect(stored!.passwordHash).not.toBe(creds.password);
  });

  it("rejects weak passwords and duplicate emails", async () => {
    const weak = await request(app).post("/api/auth/register").send({ ...creds, password: "short" });
    expect(weak.status).toBe(400);
    await request(app).post("/api/auth/register").send(creds);
    const dup = await request(app).post("/api/auth/register").send(creds);
    expect(dup.status).toBe(409);
  });

  it("logs in with correct credentials only", async () => {
    await request(app).post("/api/auth/register").send(creds);
    const bad = await request(app).post("/api/auth/login").send({ email: creds.email, password: "wrong1234" });
    expect(bad.status).toBe(401);
    const good = await request(app).post("/api/auth/login").send({ email: creds.email, password: creds.password });
    expect(good.status).toBe(200);
  });

  it("protects /me and returns the user with a valid session", async () => {
    expect((await request(app).get("/api/auth/me")).status).toBe(401);
    const agent = request.agent(app);
    await agent.post("/api/auth/register").send(creds);
    const me = await agent.get("/api/auth/me");
    expect(me.status).toBe(200);
    expect(me.body.user.displayName).toBe("Ada");
    await agent.post("/api/auth/logout");
    expect((await agent.get("/api/auth/me")).status).toBe(401);
  });

  it("updates the profile and ignores unknown fields", async () => {
    const agent = request.agent(app);
    await agent.post("/api/auth/register").send(creds);
    const ok = await agent.patch("/api/auth/me").send({ bio: "Worldbuilder" });
    expect(ok.body.user.bio).toBe("Worldbuilder");
    const bad = await agent.patch("/api/auth/me").send({ email: "evil@example.com" });
    expect(bad.status).toBe(400);
  });

  it("deletes the account only with the right password", async () => {
    const agent = request.agent(app);
    await agent.post("/api/auth/register").send(creds);
    expect((await agent.delete("/api/auth/me").send({ password: "nope12345" })).status).toBe(401);
    expect((await agent.delete("/api/auth/me").send({ password: creds.password })).status).toBe(204);
    expect(await mongoose.connection.db!.collection("users").countDocuments()).toBe(0);
  });
});
