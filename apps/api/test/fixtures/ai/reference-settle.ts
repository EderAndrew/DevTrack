import { z } from "zod";
import { defineAgent } from "../../../src/modules/ai/definitions/types";
import { REFERENCE_L1, REFERENCE_L2 } from "./reference-agents";

const ITEMS = z.strictObject({
  items: z.array(z.strictObject({ id: z.string().min(1), label: z.string().min(1) })).min(1),
});

/**
 * L2 whose proposal its domain settles (015 research F9), registered only by its tests. The hook
 * writes the labels into the execution's subject, then the first item's id decides: `approve` →
 * APPROVE, `reject` → REJECT, `throw` → the hook throws after writing, anything else → no decision.
 */
export const REFERENCE_L2_SETTLE = defineAgent({
  ...REFERENCE_L2,
  key: "reference-l2-settle",
  name: "Agente de referência (proposta decidida pela regra)",
  prompt: { ...REFERENCE_L2.prompt, key: "reference-items-settle" },
  proposal: {
    type: "REFERENCE_SETTLED",
    itemIds: (output) => ITEMS.parse(output).items.map((item) => item.id),
    settle: "ON_MATERIALIZE",
    async materialize(tx, { resource, content }) {
      const { items } = ITEMS.parse(content);
      await tx.subject.update({ where: { id: resource!.id }, data: { description: `decidido: ${items.map((item) => item.label).join(", ")}` } });
      const first = items[0]!.id;
      if (first === "throw") throw new Error("falha simulada no materialize");
      if (first === "approve") return "APPROVE";
      if (first === "reject") return "REJECT";
      return undefined;
    },
  },
});

/** Executions per hour of this agent, above the global per-agent limit its tests set (015 research F12). */
export const REFERENCE_OWN_LIMIT_PER_HOUR = 4;

/** L1 with its own hourly limit (015 research F12), registered only by its tests. */
export const REFERENCE_L1_OWN_LIMIT = defineAgent({
  ...REFERENCE_L1,
  key: "reference-l1-own-limit",
  name: "Agente de referência (limite próprio)",
  prompt: { ...REFERENCE_L1.prompt, key: "reference-summary-own-limit" },
  hourlyLimit: () => REFERENCE_OWN_LIMIT_PER_HOUR,
});
