import { readdirSync, readFileSync } from "node:fs";
import { basename, resolve } from "node:path";
import type {
  ApplyCurriculumProposalRequest,
  AiProposalStatus,
  CurriculumExtractionOutput,
  CurriculumExtractionOutputV2,
  RequestCurriculumAnalysisRequest,
  SyllabusExtraction,
} from "@repo/contracts";
import type { Prisma, SyllabusDocument, Subject } from "../../src/generated/prisma/client";
import { type AgentDefinition, type AiDefinitions, type CatalogModel, defineAgent, defineCatalogModel } from "../../src/modules/ai/definitions/types";
import { CURRICULUM_AGENT, CURRICULUM_EXTRACTION_TASK, curriculumAiDefinitions } from "../../src/modules/curriculum-ai/definitions/curriculum-agent";
import { READ_CURRICULUM_DOCUMENT } from "../../src/modules/curriculum-ai/proposal/build-proposal";
import { itemIdsOf } from "../../src/modules/curriculum-ai/proposal/item-ids";
import { referenceAiDefinitions } from "../fixtures/ai/definitions";
import { type FakeModelProvider, fakeOutput, fakeToolCall } from "../fixtures/ai/fake-model-provider";
import { type AiTestApp, createAiExecution, createAiTestApp } from "./ai";
import { createSubject, createSyllabusDocument, pooExtraction } from "./factories";
import { api, type TestApp, type TestAppOptions } from "./test-app";

/** The real `curriculum-agent`, registered ACTIVE: its availability tests disable it through the admin route. */
export const TEST_CURRICULUM_AGENT = defineAgent({ ...CURRICULUM_AGENT, initialStatus: "ACTIVE" });

/** The model of the BASIC catalog entry the analysis runs on in the tests. */
export const CURRICULUM_TEST_MODEL = "anthropic/claude-haiku-4.5";

/** Metrics meeting every threshold of `curriculum-extraction` (009 contracts/catalog-and-quality-gate.md). */
export const PASSING_CURRICULUM_METRICS = { ...CURRICULUM_EXTRACTION_TASK.quality };

/** A BASIC catalog entry approved for `curriculum-extraction`, on the fake provider (006/SC-011). */
export const curriculumTestModel = (entry: Pick<CatalogModel, "key" | "family" | "model"> & Partial<CatalogModel>): CatalogModel =>
  defineCatalogModel({
    provider: "fake",
    tier: "BASIC",
    mode: "GENERATION",
    lifecycle: "PRODUCTION",
    initialStatus: "ENABLED",
    maxOutputTokens: 32_000,
    timeoutMs: 60_000,
    contextWindow: 200_000,
    capabilities: { structuredOutput: true, tools: true, vision: true, reasoning: true },
    approvals: [
      {
        taskKey: CURRICULUM_EXTRACTION_TASK.key,
        metrics: PASSING_CURRICULUM_METRICS,
        evaluatedAt: "2026-09-27T00:00:00.000Z",
        evidence: "apps/api/test/helpers/curriculum-ai.ts",
      },
    ],
    ...entry,
  });

/**
 * The model the policy picks for the agent's task (009 T014): the only approved BASIC entry of
 * the test catalog, with a reference price so the cost is computed (007/FR-047).
 */
export const TEST_CURRICULUM_MODEL_CONFIG = curriculumTestModel({
  key: "anthropic-basic",
  family: "anthropic",
  model: CURRICULUM_TEST_MODEL,
  price: { inputPerMTok: "5", outputPerMTok: "25", currency: "USD" },
});

/**
 * A second approved BASIC entry, of another family and pricier, so the policy makes it the
 * fallback (009 FR-012): what the 008 suites called the configured fallback.
 */
export const TEST_CURRICULUM_FALLBACK_CONFIG = curriculumTestModel({
  key: "openai-basic",
  family: "openai",
  model: "openai/gpt-5.5",
  price: { inputPerMTok: "6", outputPerMTok: "30", currency: "USD" },
});

/**
 * `createAiTestApp` with the 007 definitions (agent, tool, ownership of `SYLLABUS_DOCUMENT`) next to
 * the reference ones. The tool reads through the real file storage and the test build of the
 * syllabus worker.
 */
export function createCurriculumAiApp(options: TestAppOptions = {}): Promise<AiTestApp> {
  const curriculum = curriculumAiDefinitions();
  return createAiTestApp({
    ...options,
    agents: [TEST_CURRICULUM_AGENT],
    tools: curriculum.tools,
    modelConfigs: [TEST_CURRICULUM_MODEL_CONFIG],
    tasks: curriculum.tasks,
    resources: curriculum.resources,
  });
}

/**
 * The definitions `createCurriculumAiApp` registers, on `provider`, with `agent` in place of the
 * test agent: what a "restart" with a new agent version syncs (006-us8-versioning pattern).
 */
export function curriculumTestDefinitions(provider: FakeModelProvider, agent: AgentDefinition = TEST_CURRICULUM_AGENT): AiDefinitions {
  const base = referenceAiDefinitions(provider);
  const curriculum = curriculumAiDefinitions();
  return {
    agents: [...base.agents, agent],
    tools: [...base.tools, ...curriculum.tools],
    modelConfigs: [...base.modelConfigs, TEST_CURRICULUM_MODEL_CONFIG],
    tasks: [...base.tasks, ...curriculum.tasks],
    families: base.families,
    providers: base.providers,
    resources: { ...base.resources, ...curriculum.resources },
  };
}

/**
 * A subject of `teacherId` with a `PROCESSED` document of `fixture` (`poo.pdf` by default): `TEXT`
 * for PDF and DOCX, `NO_TEXT` for images. The original is really stored, so the read tool works.
 */
export async function seedProcessedDocument(
  t: TestApp,
  teacherId: string,
  fixture = "poo.pdf",
): Promise<{ subject: Subject; document: SyllabusDocument }> {
  const subject = await createSubject(t, teacherId);
  const withText = fixture.endsWith(".pdf") || fixture.endsWith(".docx");
  const document = await createSyllabusDocument(t, subject.id, {
    fixture,
    status: "PROCESSED",
    extraction: withText ? pooExtraction() : null,
  });
  return { subject, document };
}

const GOLDEN = resolve(__dirname, "../fixtures/curriculum-agent/golden");

/**
 * A subject of `teacherId` with a `PROCESSED` document of the golden case `name`
 * (`test/fixtures/curriculum-agent/golden/<name>/document.*`, built by `fixtures:curriculum`).
 */
export async function seedGoldenDocument(
  t: TestApp,
  teacherId: string,
  name: string,
): Promise<{ subject: Subject; document: SyllabusDocument }> {
  const file = readdirSync(resolve(GOLDEN, name)).find((entry) => entry.startsWith("document."));
  if (!file) throw new Error(`golden case without a document: ${name}`);
  return seedDocumentFile(t, teacherId, resolve(GOLDEN, name, file));
}

/** A subject of `teacherId` with a `PROCESSED` document of the file at `path` (PDF or DOCX). */
export async function seedDocumentFile(
  t: TestApp,
  teacherId: string,
  path: string,
): Promise<{ subject: Subject; document: SyllabusDocument }> {
  const subject = await createSubject(t, teacherId);
  const document = await createSyllabusDocument(t, subject.id, {
    fixture: basename(path),
    bytes: readFileSync(path),
    status: "PROCESSED",
  });
  return { subject, document };
}

/**
 * A valid agent output (v2) for the POO sample, as written in the document (4 groups, 16 items, no
 * refs), with no language unless `languageKey` is given (010). Tests change it to exercise the
 * grounding check and the refs.
 */
export function pooOutput(languageKey: string | null = null): CurriculumExtractionOutputV2 {
  const extraction = pooExtraction() as unknown as SyllabusExtraction;
  return {
    title: extraction.title,
    syllabusText: extraction.syllabusText,
    competencyText: extraction.competencyText,
    groups: extraction.groups.map((group) => ({
      title: group.title,
      items: group.items.map((text) => ({ text, sourceRef: null })),
    })),
    warnings: [],
    languageKey,
  };
}

/**
 * Programs the expected run on the fake provider: call 1 asks for the read tool with `documentId`
 * (what the model finds in its context), call 2 answers `output`.
 */
export function scriptCurriculumRun(fake: FakeModelProvider, documentId: string, output: unknown): void {
  fake.script(fakeToolCall(READ_CURRICULUM_DOCUMENT, { documentId }), fakeOutput(output));
}

/** `POST /api/syllabus-documents/:id/ai-analyses`. */
export function requestAnalysis(t: TestApp, cookie: string, documentId: string, body: RequestCurriculumAnalysisRequest = {}) {
  return api(t, { cookie }).post(`/api/syllabus-documents/${documentId}/ai-analyses`, body);
}

/** `GET /api/syllabus-documents/:id/ai`. */
export function getCurriculumAiStatus(t: TestApp, cookie: string, documentId: string) {
  return api(t, { cookie }).get(`/api/syllabus-documents/${documentId}/ai`);
}

/** `POST /api/syllabus-documents/:id/ai-proposals/:proposalId/apply`. */
export function applyProposal(
  t: TestApp,
  cookie: string,
  documentId: string,
  proposalId: string,
  body: ApplyCurriculumProposalRequest,
) {
  return api(t, { cookie }).post(`/api/syllabus-documents/${documentId}/ai-proposals/${proposalId}/apply`, body);
}

export interface CurriculumProposalOptions {
  /**
   * The extraction stored as is: the factory skips the output schema, so it can hold what a run
   * never would. An output v2's `languageKey` is dropped: the content keeps the language apart.
   */
  extraction?: CurriculumExtractionOutput | CurriculumExtractionOutputV2;
  /** The proposed language (010); none by default. */
  language?: { key: string; name: string } | null;
  itemIds?: string[];
  status?: AiProposalStatus;
  expiresAt?: Date;
  /** Overrides `content.source` (a changed document, an unknown reader version). */
  source?: Partial<{ documentId: string; sha256: string; readerVersion: number }>;
}

/**
 * A completed `curriculum-agent` execution on `document` with its `CURRICULUM_EXTRACTION`
 * proposal, written straight to the database (the POO output by default, no grounding flags).
 */
export async function createCurriculumProposal(
  t: TestApp,
  teacherId: string,
  document: Pick<SyllabusDocument, "id" | "sha256">,
  options: CurriculumProposalOptions = {},
) {
  const execution = await createAiExecution(t, teacherId, CURRICULUM_AGENT.key, {
    status: "COMPLETED",
    resource: { type: "SYLLABUS_DOCUMENT", id: document.id },
  });
  const { languageKey: _, ...extraction } = { languageKey: null, ...(options.extraction ?? pooOutput()) };
  const language = options.language ?? null;
  const status = options.status ?? "READY_FOR_REVIEW";
  const decided = status !== "READY_FOR_REVIEW";
  const itemIds = options.itemIds ?? itemIdsOf(extraction, language !== null);
  return t.prisma.aiProposal.create({
    data: {
      workspaceId: teacherId,
      executionId: execution.id,
      agentVersionId: execution.agentVersionId,
      agentKey: CURRICULUM_AGENT.key,
      proposalType: "CURRICULUM_EXTRACTION",
      targetResourceType: "SYLLABUS_DOCUMENT",
      targetResourceId: document.id,
      payload: {
        extraction,
        language,
        grounding: { unsupported: [] },
        source: {
          documentId: document.id,
          sha256: Buffer.from(document.sha256).toString("hex"),
          readerVersion: 1,
          ...options.source,
        },
      } as unknown as Prisma.InputJsonObject,
      itemIds,
      // PARTIALLY_APPROVED needs a non-empty accepted set (CHECK ai_proposals_partial_chk).
      acceptedItemIds: status === "PARTIALLY_APPROVED" ? itemIds.slice(0, 1) : [],
      status,
      expiresAt: options.expiresAt ?? new Date(Date.now() + 30 * 86_400_000),
      decidedAt: decided ? new Date() : null,
      decidedByUserId: decided && status !== "EXPIRED" ? teacherId : null,
    },
  });
}
