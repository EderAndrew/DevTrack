import { z } from "zod";
import { type AgentDefinition, defineAgent } from "../../../src/modules/ai/definitions/types";

/** Marker of the reference instructions; scans prove it never leaves the model request (006/SC-007). */
export const INSTRUCTIONS_MARKER = "MARCADOR-INSTRUCOES-006";

const SUMMARY = z.strictObject({ summary: z.string().min(1) });
const ITEMS = z.strictObject({
  items: z.array(z.strictObject({ id: z.string().min(1), label: z.string().min(1) })).min(1),
});

const BASE = {
  requiredPermission: "ia.execucoes.visualizar",
  taskKey: "reference-default",
  resourceTypes: ["SUBJECT"],
  input: z.strictObject({ text: z.string().max(10_000).optional() }),
  buildContext: (context) => ({ resourceType: context.resource?.type ?? null }),
} satisfies Partial<AgentDefinition>;

/** L1: reads a subject through its one tool and returns a summary (006 US1–US4). */
export const REFERENCE_L1 = defineAgent({
  ...BASE,
  key: "reference-l1",
  name: "Agente de referência (leitura)",
  description: "Test-only agent of the AI foundation.",
  version: 1,
  initialStatus: "ACTIVE",
  riskLevel: "L1_READ_ONLY",
  prompt: {
    key: "reference-summary",
    version: 1,
    status: "ACTIVE",
    systemInstructions: `Resuma o recurso autorizado. ${INSTRUCTIONS_MARKER}`,
  },
  output: { version: 1, schema: SUMMARY },
  toolKeys: ["reference.read-subject", "reference.leaky", "reference.disabled"],
});

/** Same as L1, but a denied tool call does not end the execution (006/US3-2). */
export const REFERENCE_L1_CONTINUE = defineAgent({
  ...REFERENCE_L1,
  key: "reference-l1-continue",
  name: "Agente de referência (continua)",
  onToolDenied: "continue",
  prompt: { ...REFERENCE_L1.prompt, key: "reference-summary-continue" },
});

/** L2: proposes items for the teacher's review (006 US5). */
export const REFERENCE_L2 = defineAgent({
  ...BASE,
  key: "reference-l2",
  name: "Agente de referência (proposta)",
  description: "Test-only proposal agent of the AI foundation.",
  version: 1,
  initialStatus: "ACTIVE",
  riskLevel: "L2_PROPOSAL",
  prompt: {
    key: "reference-items",
    version: 1,
    status: "ACTIVE",
    systemInstructions: `Proponha itens para o recurso autorizado. ${INSTRUCTIONS_MARKER}`,
  },
  output: { version: 1, schema: ITEMS },
  toolKeys: ["reference.read-subject", "reference.slow"],
  proposal: {
    type: "REFERENCE_ITEMS",
    itemIds: (output) => ITEMS.parse(output).items.map((item) => item.id),
  },
});

/**
 * L2 with a `proposal.build` hook (007 research C6), registered only by the tests of the hook
 * (`createAiTestApp({agents: [REFERENCE_L2_BUILD]})`). The first item's id drives it: `nothing` →
 * no proposal, `throw` → the hook throws; otherwise the content lists the labels and the tools
 * that answered, and the ids get a `b:` prefix.
 */
export const REFERENCE_L2_BUILD = defineAgent({
  ...REFERENCE_L2,
  key: "reference-l2-build",
  name: "Agente de referência (proposta montada)",
  prompt: { ...REFERENCE_L2.prompt, key: "reference-items-build" },
  proposal: {
    type: "REFERENCE_BUILT",
    itemIds: (output) => ITEMS.parse(output).items.map((item) => item.id),
    build(output, { toolResults }) {
      const { items } = ITEMS.parse(output);
      if (items[0]!.id === "nothing") return null;
      if (items[0]!.id === "throw") throw new Error("falha simulada no build");
      return {
        content: { built: true, labels: items.map((item) => item.label), tools: toolResults },
        itemIds: items.map((item) => `b:${item.id}`),
      };
    },
  },
});

/**
 * L2 with a `proposal.materialize` hook (010 research X8), registered only by its tests: the domain
 * record is the execution's subject, whose description becomes the materialized labels. The first
 * item's id `throw` makes the hook throw after writing, so the rollback is visible.
 */
export const REFERENCE_L2_MATERIALIZE = defineAgent({
  ...REFERENCE_L2,
  key: "reference-l2-materialize",
  name: "Agente de referência (proposta materializada)",
  prompt: { ...REFERENCE_L2.prompt, key: "reference-items-materialize" },
  proposal: {
    type: "REFERENCE_MATERIALIZED",
    itemIds: (output) => ITEMS.parse(output).items.map((item) => item.id),
    async materialize(tx, { resource, content, itemIds, proposalId }) {
      const { items } = ITEMS.parse(content);
      await tx.subject.update({
        where: { id: resource!.id },
        data: { description: `materializado ${proposalId}: ${items.map((item) => item.label).join(", ")} (${itemIds.length})` },
      });
      if (items[0]!.id === "throw") throw new Error("falha simulada no materialize");
    },
  },
});

/** Never ACTIVE: requests answer AI_AGENT_NOT_FOUND (006/US1-6). */
export const REFERENCE_DRAFT = defineAgent({
  ...REFERENCE_L1,
  key: "reference-draft",
  name: "Agente de referência (rascunho)",
  initialStatus: "DRAFT",
  prompt: { ...REFERENCE_L1.prompt, key: "reference-draft" },
});

/** Requires a permission teachers do not hold: 403 without changing any role. */
export const REFERENCE_RESTRICTED = defineAgent({
  ...REFERENCE_L1,
  key: "reference-restricted",
  name: "Agente de referência (restrito)",
  requiredPermission: "ia.agentes.gerenciar",
  prompt: { ...REFERENCE_L1.prompt, key: "reference-restricted" },
});

export const REFERENCE_AGENTS = [REFERENCE_L1, REFERENCE_L1_CONTINUE, REFERENCE_L2, REFERENCE_DRAFT, REFERENCE_RESTRICTED];
