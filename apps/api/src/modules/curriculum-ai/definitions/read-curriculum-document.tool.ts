import { createHash } from "node:crypto";
import { UuidSchema } from "@repo/contracts";
import { z } from "zod";
import { FileStorage } from "../../../platform/storage/file-storage";
import { defineTool, ToolRefusal } from "../../ai/definitions/types";
import { READER_VERSION } from "../../syllabus/extraction/normalize";
import { SyllabusWorkerRunner, WorkerTimeout } from "../../syllabus/syllabus-worker-runner";
import { READ_CURRICULUM_DOCUMENT } from "../proposal/build-proposal";
import { CurriculumDocumentContentSchema } from "../proposal/document-content";

/** The tool's deadline; the 006 executor also bounds it by `AI_TOOL_TIMEOUT_SECONDS`. */
const TIMEOUT_MS = 10_000;

/**
 * `read-curriculum-document` (contracts/curriculum-agent.md, research C7): the normalized content of
 * the one document the execution targets. The 006 executor has already checked the allowlist,
 * the permission, the strict input and that the document is in the workspace (steps 1–3); `run`
 * does steps 4–7, in order, and a refusal returns no content.
 */
export const readCurriculumDocumentTool = defineTool({
  key: READ_CURRICULUM_DOCUMENT,
  name: "Ler documento de ementa",
  description:
    "Lê o conteúdo normalizado do documento de ementa autorizado para esta análise e o catálogo de linguagens de programação. Recebe apenas o documentId informado no contexto.",
  riskLevel: "L1_READ_ONLY",
  timeoutMs: TIMEOUT_MS,
  initialStatus: "ENABLED",
  requiredPermission: "ementas.revisar",
  resourceType: "SYLLABUS_DOCUMENT",
  inputSchema: z.strictObject({ documentId: UuidSchema }),
  outputSchema: CurriculumDocumentContentSchema,
  resourceIdOf: (input) => input.documentId,
  async run(context, input) {
    // 4. Only the document of this execution, whatever the model asked for (FR-008).
    const execution = await context.db.aiExecution.findUnique({
      where: { id: context.executionId },
      select: { resourceType: true, resourceId: true },
    });
    if (execution?.resourceType !== "SYLLABUS_DOCUMENT" || execution.resourceId !== input.documentId) {
      throw new ToolRefusal("AI_CONTEXT_ACCESS_DENIED");
    }

    // 5. Processed, with text: PNG, JPG and scanned PDFs have nothing to read (no OCR).
    const document = await context.db.syllabusDocument.findFirst({
      where: { id: input.documentId, subject: { teacherId: context.workspaceId } },
      select: {
        id: true,
        fileId: true,
        mediaType: true,
        sha256: true,
        processingStatus: true,
        extractionResult: true,
        subject: { select: { name: true } },
      },
    });
    if (
      !document ||
      document.processingStatus !== "PROCESSED" ||
      document.extractionResult !== "TEXT" ||
      (document.mediaType !== "PDF" && document.mediaType !== "DOCX")
    ) {
      throw new ToolRefusal("AI_CONTEXT_ACCESS_DENIED");
    }

    // 6. The stored original is the one the document was processed from.
    const bytes = await context.get(FileStorage).get(document.fileId);
    const sha256 = createHash("sha256").update(bytes).digest();
    if (!sha256.equals(Buffer.from(document.sha256))) throw new ToolRefusal("AI_CONTEXT_ACCESS_DENIED");

    // 7. The 004 readers in a worker thread (research C11).
    let blocks;
    try {
      blocks = await context.get(SyllabusWorkerRunner).normalize(bytes, document.mediaType, TIMEOUT_MS, context.signal);
    } catch (error) {
      throw new ToolRefusal(error instanceof WorkerTimeout ? "AI_TIMEOUT" : "AI_TOOL_EXECUTION_FAILED");
    }
    // 010 research X18: the only languages the agent may propose.
    const languages = await context.db.programmingLanguage.findMany({
      where: { active: true },
      select: { key: true, name: true, aliases: true },
      orderBy: { name: "asc" },
    });
    return {
      documentId: document.id,
      subjectName: document.subject.name,
      mediaType: document.mediaType,
      readerVersion: READER_VERSION,
      sha256: sha256.toString("hex"),
      blocks,
      languages,
    };
  },
});
