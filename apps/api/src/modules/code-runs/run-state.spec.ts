import type { CodeRunStatus } from "@repo/contracts";
import { describe, expect, it } from "vitest";
import { canTransition, isFinal, staleReason } from "./run-state";

const NOW = new Date("2026-10-14T13:00:00.000Z");
const at = (seconds: number) => new Date(NOW.getTime() + seconds * 1000);

describe("019/FR-017 estados de uma execução (research B8, data-model.md)", () => {
  it("019/FR-017 transições válidas: QUEUED → RUNNING/FAILED, RUNNING → COMPLETED/FAILED", () => {
    const allowed: [CodeRunStatus, CodeRunStatus][] = [
      ["QUEUED", "RUNNING"],
      ["QUEUED", "FAILED"],
      ["RUNNING", "COMPLETED"],
      ["RUNNING", "FAILED"],
    ];
    const all: CodeRunStatus[] = ["QUEUED", "RUNNING", "COMPLETED", "FAILED"];
    for (const from of all) {
      for (const to of all) {
        const expected = allowed.some(([a, b]) => a === from && b === to);
        expect(canTransition(from, to), `${from} → ${to}`).toBe(expected);
      }
    }
  });

  it("019/FR-017 COMPLETED e FAILED são finais", () => {
    expect([isFinal("QUEUED"), isFinal("RUNNING"), isFinal("COMPLETED"), isFinal("FAILED")]).toEqual([false, false, true, true]);
  });

  it("019/FR-017 na fila depois do prazo → EXPIRED; o prazo exato já venceu", () => {
    expect(staleReason({ status: "QUEUED", deadlineAt: at(1), leaseUntil: null }, NOW)).toBeNull();
    expect(staleReason({ status: "QUEUED", deadlineAt: at(0), leaseUntil: null }, NOW)).toBe("EXPIRED");
    expect(staleReason({ status: "QUEUED", deadlineAt: at(-30), leaseUntil: null }, NOW)).toBe("EXPIRED");
  });

  it("019/FR-017 em execução depois do lease → INTERRUPTED; o prazo da fila não conta mais", () => {
    expect(staleReason({ status: "RUNNING", deadlineAt: at(-120), leaseUntil: at(5) }, NOW)).toBeNull();
    expect(staleReason({ status: "RUNNING", deadlineAt: at(60), leaseUntil: at(0) }, NOW)).toBe("INTERRUPTED");
    expect(staleReason({ status: "RUNNING", deadlineAt: at(60), leaseUntil: at(-1) }, NOW)).toBe("INTERRUPTED");
  });

  it("019/FR-017 uma execução final nunca é vencida", () => {
    expect(staleReason({ status: "COMPLETED", deadlineAt: at(-600), leaseUntil: at(-500) }, NOW)).toBeNull();
    expect(staleReason({ status: "FAILED", deadlineAt: at(-600), leaseUntil: null }, NOW)).toBeNull();
  });

  it("019/FR-017 o relógio é o do chamador: o mesmo registro muda só com o now recebido", () => {
    const run = { status: "QUEUED" as const, deadlineAt: at(60), leaseUntil: null };
    expect(staleReason(run, NOW)).toBeNull();
    expect(staleReason(run, at(60))).toBe("EXPIRED");
  });
});
