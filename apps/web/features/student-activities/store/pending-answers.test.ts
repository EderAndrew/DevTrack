import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearAllPendingAnswers,
  clearPendingAnswers,
  type PendingAnswer,
  readPendingAnswers,
  writePendingAnswers,
} from "./pending-answers";

// 012/FR-019 research P22: unsent answers in localStorage, per student and activity.

const ANSWERS: PendingAnswer[] = [
  { questionId: "q1", answer: { kind: "TEXT", text: "resposta offline" }, baseRevision: 2 },
  { questionId: "q2", answer: { kind: "ALTERNATIVE", alternativeId: null }, baseRevision: 0 },
];

describe("012/FR-019 respostas não enviadas no navegador", () => {
  beforeEach(() => window.localStorage.clear());
  afterEach(() => vi.restoreAllMocks());

  it("grava e lê por aluno e atividade sob devtrack:respostas:<userId>:<activityId>", () => {
    writePendingAnswers("u1", "a1", ANSWERS);
    expect(window.localStorage.getItem("devtrack:respostas:u1:a1")).not.toBeNull();
    expect(readPendingAnswers("u1", "a1")).toEqual(ANSWERS);
    expect(readPendingAnswers("u2", "a1")).toEqual([]);
    expect(readPendingAnswers("u1", "a2")).toEqual([]);
  });

  it("lista vazia e a entrega removem a chave", () => {
    writePendingAnswers("u1", "a1", ANSWERS);
    writePendingAnswers("u1", "a1", []);
    expect(window.localStorage.getItem("devtrack:respostas:u1:a1")).toBeNull();
    writePendingAnswers("u1", "a1", ANSWERS);
    clearPendingAnswers("u1", "a1");
    expect(window.localStorage.getItem("devtrack:respostas:u1:a1")).toBeNull();
  });

  it("um valor que não é nosso (JSON inválido ou outro formato) é ignorado", () => {
    window.localStorage.setItem("devtrack:respostas:u1:a1", "{não é json");
    expect(readPendingAnswers("u1", "a1")).toEqual([]);
    window.localStorage.setItem("devtrack:respostas:u1:a1", JSON.stringify([{ questionId: "q1", answer: { kind: "HTML" }, baseRevision: 0 }]));
    expect(readPendingAnswers("u1", "a1")).toEqual([]);
  });

  it("no logout, todas as chaves devtrack:respostas: saem; as outras ficam", () => {
    writePendingAnswers("u1", "a1", ANSWERS);
    writePendingAnswers("u2", "a2", ANSWERS);
    window.localStorage.setItem("outra-chave", "fica");
    clearAllPendingAnswers();
    expect(window.localStorage.length).toBe(1);
    expect(window.localStorage.getItem("outra-chave")).toBe("fica");
  });

  it("sem localStorage disponível nada quebra", () => {
    vi.spyOn(window, "localStorage", "get").mockImplementation(() => {
      throw new DOMException("bloqueado", "SecurityError");
    });
    expect(() => writePendingAnswers("u1", "a1", ANSWERS)).not.toThrow();
    expect(readPendingAnswers("u1", "a1")).toEqual([]);
    expect(() => clearAllPendingAnswers()).not.toThrow();
  });

  it("cota cheia ao gravar não quebra", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("cheio", "QuotaExceededError");
    });
    expect(() => writePendingAnswers("u1", "a1", ANSWERS)).not.toThrow();
  });
});
