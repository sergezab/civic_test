import { describe, expect, it } from "vitest";
import { parseGradeResult } from "./interview";

describe("parseGradeResult", () => {
  it("accepts the backend grade contract", () => {
    expect(
      parseGradeResult({
        verdict: "correct",
        feedback: "Correct.",
        correctAnswer: "George Washington",
        heard: "George Washington",
        model: null,
        fallback: true,
      }),
    ).toEqual({
      verdict: "correct",
      feedback: "Correct.",
      correctAnswer: "George Washington",
      heard: "George Washington",
      model: null,
      fallback: true,
    });
  });

  it("rejects malformed verdicts", () => {
    expect(() =>
      parseGradeResult({
        verdict: "yes",
        feedback: "Correct.",
        correctAnswer: "George Washington",
        heard: "George Washington",
        model: null,
        fallback: true,
      }),
    ).toThrow(/invalid verdict/);
  });

  it("rejects missing required fields", () => {
    expect(() =>
      parseGradeResult({
        verdict: "incorrect",
        feedback: "Try again.",
        correctAnswer: "George Washington",
        heard: "Lincoln",
        model: null,
      }),
    ).toThrow(/API contract/);
  });
});
