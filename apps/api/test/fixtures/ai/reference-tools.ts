import { z } from "zod";
import { defineTool } from "../../../src/modules/ai/definitions/types";

/**
 * Test tools of the reference agent (006 FR-038). They reuse `ia.execucoes.visualizar`, a
 * permission that already exists, so no test creates permissions or changes roles.
 */
export const READ_SUBJECT = defineTool({
  key: "reference.read-subject",
  name: "Ler disciplina (teste)",
  description: "Returns the id and the name of a subject of the execution's workspace.",
  riskLevel: "L1_READ_ONLY",
  timeoutMs: 2_000,
  initialStatus: "ENABLED",
  requiredPermission: "ia.execucoes.visualizar",
  resourceType: "SUBJECT",
  inputSchema: z.strictObject({ subjectId: z.uuid() }),
  outputSchema: z.strictObject({ id: z.uuid(), name: z.string() }),
  resourceIdOf: (input) => input.subjectId,
  async run(context, input) {
    const subject = await context.db.subject.findFirstOrThrow({
      where: { id: input.subjectId, teacherId: context.workspaceId },
      select: { id: true, name: true },
    });
    return subject;
  },
});

/** Sleeps past its timeout (006/US3-6). */
export const SLOW = defineTool({
  key: "reference.slow",
  name: "Ferramenta lenta (teste)",
  description: "Never answers in time.",
  riskLevel: "L1_READ_ONLY",
  timeoutMs: 100,
  initialStatus: "ENABLED",
  requiredPermission: "ia.execucoes.visualizar",
  resourceType: "SUBJECT",
  inputSchema: z.strictObject({ subjectId: z.uuid() }),
  outputSchema: z.strictObject({ ok: z.boolean() }),
  resourceIdOf: (input) => input.subjectId,
  run: (context) =>
    new Promise((resolve) => {
      const timer = setTimeout(() => resolve({ ok: true }), 5_000);
      context.signal.addEventListener("abort", () => clearTimeout(timer), { once: true });
    }),
});

/** Returns a field it does not declare (006/FR-036). */
export const LEAKY = defineTool({
  key: "reference.leaky",
  name: "Ferramenta que vaza (teste)",
  description: "Returns more than it declares.",
  riskLevel: "L1_READ_ONLY",
  timeoutMs: 2_000,
  initialStatus: "ENABLED",
  requiredPermission: "ia.execucoes.visualizar",
  resourceType: "SUBJECT",
  inputSchema: z.strictObject({ subjectId: z.uuid() }),
  outputSchema: z.strictObject({ id: z.uuid() }),
  resourceIdOf: (input) => input.subjectId,
  run: async (_context, input) => ({ id: input.subjectId, teacherEmail: "vazou@example.test" }) as { id: string },
});

/** Registered but disabled. */
export const DISABLED_TOOL = defineTool({ ...READ_SUBJECT, key: "reference.disabled", initialStatus: "DISABLED" });

export const REFERENCE_TOOLS = [READ_SUBJECT, SLOW, LEAKY, DISABLED_TOOL];
