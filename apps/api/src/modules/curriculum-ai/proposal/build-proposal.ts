import { type CurriculumProposalContent, CurriculumExtractionOutputV2Schema } from "@repo/contracts";
import { CurriculumDocumentContentSchema } from "./document-content";
import { checkGrounding } from "./grounding";
import { itemIdsOf } from "./item-ids";
import { filterSourceRefs } from "./source-refs";

export const READ_CURRICULUM_DOCUMENT = "read-curriculum-document";

export interface BuildContext {
  /** The successful tool results of the execution, in order. */
  toolResults: readonly { toolKey: string; output: unknown }[];
}

/**
 * `proposal.build` of `curriculum-agent` (contracts/curriculum-agent.md, research C6): pure, with
 * only what the runner already holds. `null` → nothing to propose (no successful read, or nothing
 * identified, FR-017). An invalid output or tool result throws, and the execution fails with
 * `AI_OUTPUT_VALIDATION_FAILED`. The language (output v2, 010 research X18) is kept only when its
 * key is in the catalog the tool returned; anything else becomes no language, never a new value.
 */
export function buildCurriculumProposal(
  output: unknown,
  { toolResults }: BuildContext,
): { content: CurriculumProposalContent; itemIds: string[] } | null {
  const read = toolResults.findLast((result) => result.toolKey === READ_CURRICULUM_DOCUMENT);
  if (!read) return null;
  const document = CurriculumDocumentContentSchema.parse(read.output);
  const { languageKey, ...extraction } = CurriculumExtractionOutputV2Schema.parse(output);
  const entry = languageKey === null ? undefined : document.languages.find((language) => language.key === languageKey);

  const itemIds = itemIdsOf(extraction, entry !== undefined);
  if (itemIds.length === 0) return null;
  return {
    content: {
      extraction: filterSourceRefs(extraction, document.blocks),
      language: entry ? { key: entry.key, name: entry.name } : null,
      grounding: checkGrounding(extraction, document.blocks, entry ?? null),
      source: { documentId: document.documentId, sha256: document.sha256, readerVersion: document.readerVersion },
    },
    itemIds,
  };
}
