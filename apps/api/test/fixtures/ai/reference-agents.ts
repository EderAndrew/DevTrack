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
  modelConfigKey: "fake-default",
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
