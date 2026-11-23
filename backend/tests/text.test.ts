import { describe, expect, it } from "vitest";
import { trimIncompleteTail } from "../src/utils/text";

describe("trimIncompleteTail", () => {
  const long = "This is a full sentence about the plan. ".repeat(20);
  it("drops an unfinished last sentence when the reply hit the token limit", () => {
    expect(trimIncompleteTail(long + "And then we should", 200)).toBe(long.trimEnd());
  });
  it("leaves complete or short replies alone", () => {
    expect(trimIncompleteTail(long.trimEnd(), 200)).toBe(long.trimEnd());
    expect(trimIncompleteTail("Hello there. Sure thing", 200)).toBe("Hello there. Sure thing");
  });
});
