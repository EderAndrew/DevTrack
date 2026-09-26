import { type CurriculumProposalContent, CurriculumExtractionOutputSchema } from "@repo/contracts";
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
 * `AI_OUTPUT_VALIDATION_FAILED`.
 */
export function buildCurriculumProposal(
  output: unknown,
  { toolResults }: BuildContext,
): { content: CurriculumProposalContent; itemIds: string[] } | null {
  const read = toolResults.findLast((result) => result.toolKey === READ_CURRICULUM_DOCUMENT);
  if (!read) return null;
  const document = CurriculumDocumentContentSchema.parse(read.output);
  const extraction = CurriculumExtractionOutputSchema.parse(output);

  const itemIds = itemIdsOf(extraction);
  if (itemIds.length === 0) return null;
  return {
    content: {
      extraction: filterSourceRefs(extraction, document.blocks),
      grounding: checkGrounding(extraction, document.blocks),
      source: { documentId: document.documentId, sha256: document.sha256, readerVersion: document.readerVersion },
    },
    itemIds,
  };
}
