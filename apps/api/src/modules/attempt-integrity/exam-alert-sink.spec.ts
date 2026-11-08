import { describe, expect, it, vi } from "vitest";
import type { Tx } from "../../platform/database/transaction";
import { alertDrafts, ExamAlertSink } from "./exam-alert-sink";

const ids = { attemptId: "a", activityId: "x", studentUserId: "s" };
const at = (second: number) => new Date(Date.UTC(2026, 10, 7, 10, 0, second));

describe("024 ExamAlertSink: um alerta por ocorrência contada, o da retenção no lugar do da 4ª", () => {
  it("024/FR-012 uma ocorrência que não retém vira OCCURRENCE com o seu ordinal", () => {
    expect(alertDrafts(ids, [{ ordinal: 2, recordedAt: at(1) }], null)).toEqual([
      { kind: "OCCURRENCE", ...ids, occurrenceOrdinal: 2, holdId: null, recordedAt: at(1) },
    ]);
  });

  it("024/FR-013 a ocorrência que abre a retenção vira só o HOLD, com a retenção", () => {
    const drafts = alertDrafts(ids, [{ ordinal: 3, recordedAt: at(1) }, { ordinal: 4, recordedAt: at(4) }], { id: "h", ordinal: 4 });
    expect(drafts.map((draft) => [draft.kind, draft.occurrenceOrdinal, draft.holdId])).toEqual([
      ["OCCURRENCE", 3, null],
      ["HOLD", 4, "h"],
    ]);
  });

  it("024/FR-014 um lote que não conta nada não pede alerta", () => {
    expect(alertDrafts(ids, [], null)).toEqual([]);
  });

  it("024/FR-015 sem registro, o hook não faz nada (a prova fica como na 018)", async () => {
    const sink = new ExamAlertSink();
    await expect(sink.record({} as Tx, alertDrafts(ids, [{ ordinal: 1, recordedAt: at(0) }], null))).resolves.toBeUndefined();
    expect(() => sink.kick()).not.toThrow();
  });

  it("registrado, recebe os rascunhos na transação do lote e o kick depois", async () => {
    const sink = new ExamAlertSink();
    const recorder = { record: vi.fn(async () => {}), kick: vi.fn() };
    sink.register(recorder);
    const tx = {} as Tx;
    await sink.record(tx, []);
    expect(recorder.record).not.toHaveBeenCalled();
    const drafts = alertDrafts(ids, [{ ordinal: 1, recordedAt: at(0) }], null);
    await sink.record(tx, drafts);
    expect(recorder.record).toHaveBeenCalledWith(tx, drafts);
    sink.kick();
    expect(recorder.kick).toHaveBeenCalledTimes(1);
  });
});
