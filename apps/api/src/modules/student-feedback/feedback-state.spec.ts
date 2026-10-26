import { FeedbackStatusSchema, type FeedbackStatus } from "@repo/contracts";
import { describe, expect, it } from "vitest";
import { allowedTransitions, canTransition } from "./feedback-state";

const ALLOWED: [FeedbackStatus, FeedbackStatus][] = [
  ["RECEIVED", "IN_REVIEW"],
  ["RECEIVED", "RESOLVED"],
  ["RECEIVED", "ARCHIVED"],
  ["IN_REVIEW", "RESOLVED"],
  ["IN_REVIEW", "ARCHIVED"],
  ["RESOLVED", "IN_REVIEW"],
  ["ARCHIVED", "IN_REVIEW"],
];

describe("020/FR-006 situações de um feedback (data-model.md, research J5)", () => {
  it("020/FR-006 as 16 combinações: só as 7 transições do diagrama são aceitas", () => {
    for (const from of FeedbackStatusSchema.options) {
      for (const to of FeedbackStatusSchema.options) {
        const expected = ALLOWED.some(([a, b]) => a === from && b === to);
        expect(canTransition(from, to), `${from} → ${to}`).toBe(expected);
      }
    }
  });

  it("020/FR-006 nunca a mesma situação, nunca de volta a RECEIVED, RESOLVED ↔ ARCHIVED só por IN_REVIEW", () => {
    for (const status of FeedbackStatusSchema.options) {
      expect(canTransition(status, status)).toBe(false);
      expect(canTransition(status, "RECEIVED")).toBe(false);
    }
    expect(canTransition("RESOLVED", "ARCHIVED")).toBe(false);
    expect(canTransition("ARCHIVED", "RESOLVED")).toBe(false);
  });

  it("020/FR-006 allowedTransitions dá os botões de cada situação, na ordem do enum", () => {
    expect(allowedTransitions("RECEIVED")).toEqual(["IN_REVIEW", "RESOLVED", "ARCHIVED"]);
    expect(allowedTransitions("IN_REVIEW")).toEqual(["RESOLVED", "ARCHIVED"]);
    expect(allowedTransitions("RESOLVED")).toEqual(["IN_REVIEW"]);
    expect(allowedTransitions("ARCHIVED")).toEqual(["IN_REVIEW"]);
  });
});
