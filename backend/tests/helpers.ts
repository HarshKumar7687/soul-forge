import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import request from "supertest";
import type { AIProvider, ChatMessage } from "../src/services/ai";

export async function bootApp() {
  const mongod = await MongoMemoryServer.create();
  process.env.NODE_ENV = "test";
  process.env.MONGODB_URI = mongod.getUri();
  process.env.JWT_SECRET = "test-secret-test-secret-test-secret-1234";
  await mongoose.connect(mongod.getUri());
  const { createApp } = await import("../src/app");
  return {
    app: createApp(),
    reset: () => mongoose.connection.db!.dropDatabase(),
    stop: async () => { await mongoose.disconnect(); await mongod.stop(); },
  };
}

export async function signup(app: import("express").Express, email: string) {
  const agent = request.agent(app);
  await agent.post("/api/auth/register").send({ email, password: "forge1234", displayName: "Tester" });
  return agent;
}

/** Collect an SSE response body as text. */
export const asText = (r: import("superagent").Response, cb: (err: Error | null, body: unknown) => void) => {
  let d = "";
  r.setEncoding("utf8");
  r.on("data", (c: string) => (d += c));
  r.on("end", () => cb(null, d));
};

export async function collectAsync<T>(it: AsyncIterable<T>): Promise<T[]> {
  const out: T[] = [];
  for await (const x of it) out.push(x);
  return out;
}

export function parseSse(text: string): { event: string; data: any }[] {
  return text.split("\n\n").filter(Boolean).map((block) => {
    const event = /^event: (.+)$/m.exec(block)?.[1] ?? "";
    const data = JSON.parse(/^data: (.+)$/m.exec(block)?.[1] ?? "null");
    return { event, data };
  });
}

/** Scripted provider used only in tests. Production never uses it. */
export class ScriptedProvider implements AIProvider {
  name = "scripted";
  model = "scripted-1";
  capabilities = { streaming: true };
  calls: ChatMessage[][] = [];
  constructor(public script: (m: ChatMessage[]) => string[] | Error) {}
  async complete(m: ChatMessage[]) { return (await collectAsync(this.stream(m))).join(""); }
  async *stream(m: ChatMessage[]) {
    this.calls.push(m);
    const out = this.script(m);
    if (out instanceof Error) throw out;
    for (const c of out) yield c;
  }
}
