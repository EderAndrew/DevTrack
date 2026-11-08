import { describe, expect, it } from "vitest";
import { alertMessage, type AlertFacts } from "./message";

const facts = (overrides: Partial<AlertFacts> = {}): AlertFacts => ({
  kind: "OCCURRENCE",
  occurrenceOrdinal: 2,
  studentName: "Ana Souza",
  examTitle: "Prova de Java",
  className: "Turma A",
  classId: "c",
  activityId: "a",
  studentUserId: "s",
  ...overrides,
});

describe("024 texto do aviso (contracts/push-notifications.md)", () => {
  it("024/FR-016 ocorrência: o aviso de 1 a 3, o aluno e a prova, no canal das ocorrências", () => {
    expect(alertMessage(facts())).toEqual({
      channelId: "exam-occurrences",
      title: "Ocorrência na prova",
      body: "Ana Souza — Aviso 2 de 3 — Prova de Java (Turma A)",
      data: { kind: "OCCURRENCE", classId: "c", activityId: "a", studentUserId: "s" },
      priority: "high",
      sound: "default",
    });
  });

  it("024/FR-013 prova retida: título próprio, no canal das retidas", () => {
    const message = alertMessage(facts({ kind: "HOLD", occurrenceOrdinal: 4 }));
    expect(message).toMatchObject({ channelId: "exam-holds", title: "Prova retida — decisão pendente", body: "Ana Souza — Prova de Java (Turma A)" });
    expect(message.data.kind).toBe("HOLD");
  });

  it("depois de uma devolução, a ocorrência que não retém é uma nova ocorrência", () => {
    expect(alertMessage(facts({ occurrenceOrdinal: 5 })).body).toBe("Ana Souza — Nova ocorrência — Prova de Java (Turma A)");
  });

  it('024/FR-022 nenhum texto diz "fraude", "cola" ou "violação"', () => {
    for (const message of [alertMessage(facts()), alertMessage(facts({ kind: "HOLD", occurrenceOrdinal: 4 })), alertMessage(facts({ occurrenceOrdinal: 7 }))]) {
      expect(`${message.title} ${message.body}`).not.toMatch(/fraude|cola|viola/i);
    }
  });
});
