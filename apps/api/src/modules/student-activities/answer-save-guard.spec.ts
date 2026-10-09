import { describe, expect, it } from "vitest";
import type { Tx } from "../../platform/database/transaction";
import { AnswerSaveGuard, type GuardedAnswer, type GuardedAttempt } from "./answer-save-guard";

const tx = {} as Tx;
const now = new Date("2026-10-07T12:00:00.000Z");
const attempt: GuardedAttempt = { id: "a", activityId: "b", studentUserId: "c", executionMode: "CONTROLLED", startedAt: now };
const answers: GuardedAnswer[] = [
  { questionId: "q1", answer: { kind: "TEXT", text: "texto" } },
  { questionId: "q2", answer: { kind: "ALTERNATIVE", alternativeId: null } },
];

describe("015/FR-013c AnswerSaveGuard (research F1, F7)", () => {
  it("sem registro, toda resposta é gravada", async () => {
    await expect(new AnswerSaveGuard().check(tx, attempt, answers, now)).resolves.toEqual(["OK", "OK"]);
  });

  it("com registro, devolve o veredito por resposta, na ordem, com a tentativa, as respostas e o horário", async () => {
    const guard = new AnswerSaveGuard();
    const calls: unknown[] = [];
    guard.register(async (...args) => {
      calls.push(args);
      return ["TYPING_LIMIT_EXCEEDED", "OK"];
    });
    await expect(guard.check(tx, attempt, answers, now)).resolves.toEqual(["TYPING_LIMIT_EXCEEDED", "OK"]);
    expect(calls).toEqual([[tx, attempt, answers, now]]);
  });

  it("nenhuma resposta → nada a consultar", async () => {
    const guard = new AnswerSaveGuard();
    guard.register(async () => {
      throw new Error("não deveria ser chamado");
    });
    await expect(guard.check(tx, attempt, [], now)).resolves.toEqual([]);
  });

  it("um veredito faltando é erro de programação", async () => {
    const guard = new AnswerSaveGuard();
    guard.register(async () => ["OK"]);
    await expect(guard.check(tx, attempt, answers, now)).rejects.toThrow(/one verdict per answer/);
  });
});
