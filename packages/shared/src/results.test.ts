import { describe, expect, it } from "vitest";
import { tallyResults } from "./results.js";
import { PollInputSchema } from "./schemas.js";

describe("tallyResults", () => {
  it("returns zeros when nobody answered", () => {
    expect(tallyResults(3, []).map((r) => r.percentage)).toEqual([0, 0, 0]);
  });

  it("always sums to 100", () => {
    const r = tallyResults(3, [0, 1, 2]);
    expect(r.reduce((s, x) => s + x.percentage, 0)).toBe(100);
    expect(r.map((x) => x.count)).toEqual([1, 1, 1]);
  });

  it("ignores out-of-range answers", () => {
    expect(tallyResults(2, [0, 5, -1]).map((r) => r.count)).toEqual([1, 0]);
  });
});

describe("PollInputSchema", () => {
  const base = { question: "2+2?", options: ["3", "4"], correctOptions: [1], durationSec: 30 };

  it("accepts a valid poll", () => {
    expect(PollInputSchema.safeParse(base).success).toBe(true);
  });

  it("requires a correct option", () => {
    expect(PollInputSchema.safeParse({ ...base, correctOptions: [] }).success).toBe(false);
  });

  it("rejects a correct option index past the end", () => {
    expect(PollInputSchema.safeParse({ ...base, correctOptions: [2] }).success).toBe(false);
  });
});
