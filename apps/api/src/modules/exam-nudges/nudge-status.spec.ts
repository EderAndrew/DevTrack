import { describe, expect, it } from "vitest";
import { canSendNudge, MIN_OCCURRENCES_FOR_NUDGE, type NudgeAttemptFacts, nudgeShown, nudgeStatus, running } from "./nudge-status";

const at = (minutes: number) => new Date(Date.UTC(2026, 10, 9, 13, minutes));
const NOW = at(20);
const facts = (overrides: Partial<NudgeAttemptFacts> = {}): NudgeAttemptFacts => ({
  attemptStatus: "IN_PROGRESS",
  submittedAt: null,
  holdOpen: false,
  openPause: null,
  endsAt: at(60),
  activityStatus: "ACTIVE",
  activityEndedAt: null,
  occurrenceCount: 2,
  ...overrides,
});
const pending = { sentAt: at(10), dismissedAt: null };
const dismissed = { sentAt: at(10), dismissedAt: at(12) };

describe("025 derivação do aviso discreto (research N6, data-model \"Derived\")", () => {
  it("025/FR-004 a tentativa corre só em andamento, sem entrega, retenção ou pausa abertas, antes do fim e com a atividade ativa", () => {
    expect(running(facts(), NOW)).toBe(true);
    expect(running(facts({ attemptStatus: "SUBMITTED" }), NOW)).toBe(false);
    expect(running(facts({ submittedAt: at(15) }), NOW)).toBe(false);
    expect(running(facts({ holdOpen: true }), NOW)).toBe(false);
    expect(running(facts({ openPause: { startedAt: at(18), releasedAt: null } }), NOW)).toBe(false);
    // A released pause no longer counts.
    expect(running(facts({ openPause: { startedAt: at(5), releasedAt: at(8) } }), NOW)).toBe(true);
    // A pause ended by derivation (the exam's end reached while paused) leaves the attempt over, not running.
    expect(running(facts({ openPause: { startedAt: at(18), releasedAt: null }, endsAt: at(19) }), NOW)).toBe(false);
    expect(running(facts({ endsAt: NOW }), NOW)).toBe(false);
    expect(running(facts({ endsAt: at(21) }), NOW)).toBe(true);
    expect(running(facts({ activityStatus: "CLOSED", activityEndedAt: at(19) }), NOW)).toBe(false);
    expect(running(facts({ activityStatus: "CANCELLED", activityEndedAt: at(19) }), NOW)).toBe(false);
  });

  it("025/FR-001 025/FR-003 o sino envia a partir de 2 ocorrências contadas, sem aviso pendente", () => {
    expect(MIN_OCCURRENCES_FOR_NUDGE).toBe(2);
    expect(canSendNudge(facts({ occurrenceCount: 0 }), null, NOW)).toBe(false);
    expect(canSendNudge(facts({ occurrenceCount: 1 }), null, NOW)).toBe(false);
    expect(canSendNudge(facts({ occurrenceCount: 2 }), null, NOW)).toBe(true);
    expect(canSendNudge(facts({ occurrenceCount: 3 }), null, NOW)).toBe(true);
    // The 4th opened a hold that the teacher returned: the attempt runs again.
    expect(canSendNudge(facts({ occurrenceCount: 4, holdOpen: false }), null, NOW)).toBe(true);
    expect(canSendNudge(facts({ occurrenceCount: 4, holdOpen: true }), null, NOW)).toBe(false);
    expect(canSendNudge(facts({ occurrenceCount: 3 }), pending, NOW)).toBe(false);
    // A dismissed warning frees the bell again.
    expect(canSendNudge(facts({ occurrenceCount: 3 }), dismissed, NOW)).toBe(true);
    expect(canSendNudge(facts({ occurrenceCount: 3, endsAt: NOW }), null, NOW)).toBe(false);
  });

  it("025/FR-010 o aluno vê o aviso só pendente e com a tentativa correndo; retida ou pausada, ele volta depois", () => {
    expect(nudgeShown(pending, facts(), NOW)).toBe(true);
    expect(nudgeShown(dismissed, facts(), NOW)).toBe(false);
    expect(nudgeShown(pending, facts({ holdOpen: true }), NOW)).toBe(false);
    expect(nudgeShown(pending, facts({ openPause: { startedAt: at(18), releasedAt: null } }), NOW)).toBe(false);
    expect(nudgeShown(pending, facts({ openPause: { startedAt: at(18), releasedAt: at(19) } }), NOW)).toBe(true);
    expect(nudgeShown(pending, facts({ endsAt: NOW }), NOW)).toBe(false);
  });

  it("025/FR-012 025/FR-015 o professor lê fechado, não visto (a tentativa terminou) ou pendente", () => {
    expect(nudgeStatus(dismissed, facts({ submittedAt: at(15) }), NOW)).toBe("DISMISSED");
    expect(nudgeStatus(pending, facts({ attemptStatus: "SUBMITTED", submittedAt: at(15) }), NOW)).toBe("UNSEEN");
    // Time out with no submission yet (settled by the next touch).
    expect(nudgeStatus(pending, facts({ endsAt: at(19) }), NOW)).toBe("UNSEEN");
    expect(nudgeStatus(pending, facts({ activityStatus: "CLOSED", activityEndedAt: at(19) }), NOW)).toBe("UNSEEN");
    expect(nudgeStatus(pending, facts({ activityStatus: "CANCELLED", activityEndedAt: at(19) }), NOW)).toBe("UNSEEN");
    expect(nudgeStatus(pending, facts(), NOW)).toBe("PENDING");
    expect(nudgeStatus(pending, facts({ holdOpen: true }), NOW)).toBe("PENDING");
    expect(nudgeStatus(pending, facts({ openPause: { startedAt: at(18), releasedAt: null } }), NOW)).toBe("PENDING");
  });
});
