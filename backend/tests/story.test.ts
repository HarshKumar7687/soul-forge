import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { asText, bootApp, parseSse, ScriptedProvider, signup } from "./helpers";
import { applyStateUpdate, consumeStoryStream, parseStateUpdate, STATE_DELIM, type StoryState } from "../src/services/storyEngine";

let ctx: Awaited<ReturnType<typeof bootApp>>;
let ai: typeof import("../src/services/ai");
beforeAll(async () => { ctx = await bootApp(); ai = await import("../src/services/ai"); });
afterAll(() => ctx.stop());
beforeEach(() => ctx.reset());
afterEach(() => ai.setLLMProviderForTests(null));

async function* chunks(parts: string[]) { for (const p of parts) yield p; }
const blank: StoryState = { currentScene: "", participants: ["Mira"], events: [], threads: [], relationships: [] };

describe("story engine (pure)", () => {
  it("separates narration from the state block even when the delimiter is split across chunks", async () => {
    const seen: string[] = [];
    const half = Math.floor(STATE_DELIM.length / 2);
    const r = await consumeStoryStream(chunks(["The door creaks open. ", STATE_DELIM.slice(0, half), STATE_DELIM.slice(half) + '{"choices":["Enter"]}']), (t) => seen.push(t));
    expect(r.narration).toBe("The door creaks open.");
    expect(seen.join("")).not.toContain("<<<");
    expect(r.stateRaw).toBe('{"choices":["Enter"]}');
  });
  it("treats a reply without a state block as narration only", async () => {
    const r = await consumeStoryStream(chunks(["Just prose."]), () => {});
    expect(r).toEqual({ narration: "Just prose.", stateRaw: "" });
  });
  it("rejects unusable state and tolerates partial state", () => {
    expect(parseStateUpdate("not json")).toBeNull();
    expect(parseStateUpdate('{"newEvents": "bad", "choices": ["a","b","c","d"]}')?.choices).toEqual([]);
    expect(parseStateUpdate('{"newEvents":["Door opened"]}')?.newEvents).toEqual(["Door opened"]);
  });
  it("applies updates: events, threads, relationships, participants", () => {
    const u = parseStateUpdate(JSON.stringify({
      currentScene: "Crypt", newEvents: ["Found a key"], threadsAdded: ["Who left the key?"],
      relationships: [{ a: "Mira", b: "Sam", note: "wary allies" }], newCharacters: ["Old Tom"],
    }))!;
    let s = applyStateUpdate(blank, u);
    expect(s).toMatchObject({ currentScene: "Crypt", events: ["Found a key"], participants: ["Mira", "Old Tom"] });
    s = applyStateUpdate(s, parseStateUpdate(JSON.stringify({ threadsResolved: ["who left the key"], relationships: [{ a: "sam", b: "mira", note: "trust grows" }] }))!);
    expect(s.threads[0].resolved).toBe(true);
    expect(s.relationships).toEqual([{ a: "Mira", b: "Sam", note: "trust grows" }]);
    expect(blank.events).toEqual([]); // input not mutated
  });
});

const good = (extra: object = {}) => [
  "Rain hammers the tavern roof. Mira looks up. ", STATE_DELIM,
  JSON.stringify({ currentScene: "A storm-bound tavern", newEvents: ["Mira met the player"], threadsAdded: ["Who is the hooded stranger?"], choices: ["Talk to Mira", "Leave"], ...extra }),
];

async function setup() {
  const a = await signup(ctx.app, "a@example.com");
  const ch = (await a.post("/api/characters").send({ name: "Mira", shortDescription: "Cartographer" })).body.character;
  const story = (await a.post("/api/stories").send({ title: "Storm", genre: "mystery", setting: "A tavern", initialSituation: "It rains.", characterIds: [ch.id] })).body.story;
  return { a, ch, story };
}
const go = (a: any, id: string, input = "") => a.post(`/api/stories/${id}/continue`).send({ input }).buffer(true).parse(asText);

describe("stories API", () => {
  it("creates stories with accessible characters only", async () => {
    const { a, ch, story } = await setup();
    expect(story.state.participants).toEqual(["Mira"]);
    const b = await signup(ctx.app, "b@example.com");
    const bad = await b.post("/api/stories").send({ title: "X", genre: "fantasy", characterIds: [ch.id] });
    expect(bad.status).toBe(400);
    expect((await a.post("/api/stories").send({ title: "", genre: "fantasy" })).status).toBe(400);
    expect((await a.post("/api/stories").send({ title: "X", genre: "western" })).status).toBe(400);
  });

  it("begins a story, saves the scene, and updates structured state", async () => {
    const { a, story } = await setup();
    const p = new ScriptedProvider(() => good());
    ai.setLLMProviderForTests(p);
    const events = parseSse((await go(a, story.id)).body);
    expect(events.at(-1)!.event).toBe("done");
    const done = events.at(-1)!.data;
    expect(done.scene.narration).toBe("Rain hammers the tavern roof. Mira looks up.");
    expect(done.scene.choices).toEqual(["Talk to Mira", "Leave"]);
    expect(done.state.events).toEqual(["Mira met the player"]);
    expect(events.filter((e) => e.event === "delta").map((e) => e.data.text).join("")).not.toContain("<<<");
    expect(p.calls[0][0].content).toContain("Cartographer");
    const got = (await a.get(`/api/stories/${story.id}`)).body;
    expect(got.scenes).toHaveLength(1);
    expect(got.story.sceneCount).toBe(1);
  });

  it("keeps continuity: later prompts include prior scenes and state, and the user's action", async () => {
    const { a, story } = await setup();
    const p = new ScriptedProvider(() => good());
    ai.setLLMProviderForTests(p);
    await go(a, story.id);
    p.script = () => good({ newEvents: ["The stranger fled"] });
    await go(a, story.id, "I chase the stranger");
    const prompt = p.calls[1];
    expect(prompt[0].content).toContain("Mira met the player");
    expect(prompt[0].content).toContain("Who is the hooded stranger?");
    expect(prompt.some((m) => m.content.includes("Rain hammers"))).toBe(true);
    expect(prompt.at(-1)).toEqual({ role: "user", content: "I chase the stranger" });
    const scenes = (await a.get(`/api/stories/${story.id}/scenes`)).body.scenes;
    expect(scenes.map((s: any) => s.index)).toEqual([0, 1]);
    expect(scenes[1].userInput).toBe("I chase the stranger");
  });

  it("still saves the scene when the state block is unusable, and says so", async () => {
    const { a, story } = await setup();
    ai.setLLMProviderForTests(new ScriptedProvider(() => ["A quiet moment. ", STATE_DELIM, "{oops"]));
    const done = parseSse((await go(a, story.id)).body).at(-1)!;
    expect(done.data.stateUpdated).toBe(false);
    expect((await a.get(`/api/stories/${story.id}`)).body.story.state.events).toEqual([]);
  });

  it("requires input after the opening, and saves nothing on provider failure", async () => {
    const { a, story } = await setup();
    const { ProviderError } = ai;
    ai.setLLMProviderForTests(new ScriptedProvider(() => new ProviderError("rate_limit")));
    const ev = parseSse((await go(a, story.id)).body);
    expect(ev.find((e) => e.event === "error")!.data.code).toBe("ai_rate_limit");
    expect((await a.get(`/api/stories/${story.id}`)).body.scenes).toHaveLength(0);
    ai.setLLMProviderForTests(new ScriptedProvider(() => good()));
    await go(a, story.id);
    expect((await a.post(`/api/stories/${story.id}/continue`).send({ input: "" })).status).toBe(400);
  });

  it("reports missing AI configuration clearly", async () => {
    const { a, story } = await setup();
    const res = await a.post(`/api/stories/${story.id}/continue`).send({ input: "" });
    expect(res.status).toBe(503);
    expect(res.body.error.code).toBe("ai_not_configured");
  });

  it("lets users add characters mid-story and enforces ownership", async () => {
    const { a, story } = await setup();
    const b = await signup(ctx.app, "b@example.com");
    const sam = (await a.post("/api/characters").send({ name: "Sam" })).body.character;
    const added = await a.post(`/api/stories/${story.id}/characters`).send({ characterId: sam.id });
    expect(added.body.story.state.participants).toEqual(["Mira", "Sam"]);
    expect((await a.post(`/api/stories/${story.id}/characters`).send({ characterId: sam.id })).status).toBe(409);
    expect((await b.get(`/api/stories/${story.id}`)).status).toBe(404);
    expect((await b.post(`/api/stories/${story.id}/continue`).send({ input: "x" })).status).toBe(404);
    expect((await b.delete(`/api/stories/${story.id}`)).status).toBe(404);
    expect((await b.get("/api/stories")).body.stories).toHaveLength(0);
  });

  it("deletes a story and its scenes", async () => {
    const { a, story } = await setup();
    ai.setLLMProviderForTests(new ScriptedProvider(() => good()));
    await go(a, story.id);
    expect((await a.delete(`/api/stories/${story.id}`)).status).toBe(204);
    expect((await a.get(`/api/stories/${story.id}`)).status).toBe(404);
    const { StoryScene } = await import("../src/models/StoryScene");
    expect(await StoryScene.countDocuments()).toBe(0);
  });
});
