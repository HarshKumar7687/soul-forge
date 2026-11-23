import { describe, expect, it } from "vitest";
import { buildMessages } from "../src/services/ai/characterPromptBuilder";

const character = {
  name: "Mira", age: 31, shortDescription: "Cartographer", personalityTraits: ["guarded", "curious"],
  backstory: "Lost her brother at sea.", speakingStyle: "Dry and precise", relationshipWithUser: "Reluctant guide",
  scenario: "A storm-bound tavern", greeting: "You're late.",
  exampleDialogues: [{ user: "Hello?", character: "*shrugs* Evening." }],
};

describe("CharacterPromptBuilder", () => {
  it("includes identity, personality, backstory, voice, relationship, scenario and memories", () => {
    const [sys] = buildMessages({ character, userName: "Sam", history: [], memories: ["Sam is afraid of boats"] });
    for (const needle of ["Mira", "guarded, curious", "Lost her brother", "Dry and precise", "Reluctant guide", "storm-bound tavern", "afraid of boats", "Sam"]) {
      expect(sys.content).toContain(needle);
    }
    expect(sys.content).toContain("asterisks");
  });

  it("puts the greeting in the system prompt and keeps it out of history", () => {
    const m = buildMessages({
      character, userName: "Sam",
      history: [{ role: "assistant", kind: "greeting", content: "You're late." }, { role: "user", content: "Sorry!" }],
    });
    expect(m[0].content).toContain('opened the conversation with: "You\'re late."');
    expect(m.slice(1)).toEqual([{ role: "user", content: "Sorry!" }]);
  });

  it("trims old history to the budget but always keeps the latest message", () => {
    const history = Array.from({ length: 10 }, (_, i) => ({ role: (i % 2 ? "assistant" : "user") as "user" | "assistant", content: `${i}`.repeat(100) }));
    const m = buildMessages({ character, userName: "Sam", history, maxHistoryChars: 250 });
    expect(m.length).toBe(3);
    expect(m.at(-1)!.content).toBe("9".repeat(100));
    const tiny = buildMessages({ character, userName: "Sam", history, maxHistoryChars: 1 });
    expect(tiny.length).toBe(2);
  });

  it("omits empty sections", () => {
    const [sys] = buildMessages({ character: { name: "Bare" }, userName: "", history: [] });
    expect(sys.content).not.toContain("Backstory:");
    expect(sys.content).not.toContain("Current scenario");
    expect(sys.content).toContain("the user");
  });

  it("always includes the minors rule; mature mode relaxes only the general-audience restriction", () => {
    const std = buildMessages({ character, userName: "Sam", history: [] })[0].content;
    const mat = buildMessages({ character, userName: "Sam", history: [], mature: true })[0].content;
    for (const p of [std, mat]) expect(p).toContain("under 18");
    expect(std).toContain("content you must not write");
    expect(mat).not.toContain("content you must not write");
    expect(mat).toContain("between adults");
    expect(mat).toContain("real distress");
  });

  it("asks for short replies by default setting, and reminds the model after the user's message", () => {
    const short = buildMessages({ character, userName: "Sam", history: [{ role: "user", content: "hi" }], replyLength: "short" });
    expect(short[0].content).toContain("never over 120");
    expect(short.at(-1)!.content).toContain("Reply briefly");
    const long = buildMessages({ character, userName: "Sam", history: [{ role: "user", content: "hi" }], replyLength: "long" });
    expect(long.at(-1)!.content).toBe("hi");
  });
});
