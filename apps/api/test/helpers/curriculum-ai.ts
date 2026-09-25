import type {
  ApplyCurriculumProposalRequest,
  CurriculumExtractionOutput,
  RequestCurriculumAnalysisRequest,
  SyllabusExtraction,
} from "@repo/contracts";
import type { SyllabusDocument, Subject } from "../../src/generated/prisma/client";
import { defineAgent, defineModelConfig } from "../../src/modules/ai/definitions/types";
import {
  CURRICULUM_AGENT,
  CURRICULUM_MODEL_CONFIG,
  curriculumAiDefinitions,
} from "../../src/modules/curriculum-ai/definitions/curriculum-agent";
import { READ_CURRICULUM_DOCUMENT } from "../../src/modules/curriculum-ai/proposal/build-proposal";
import { type FakeModelProvider, fakeOutput, fakeToolCall } from "../fixtures/ai/fake-model-provider";
import { type AiTestApp, createAiTestApp } from "./ai";
import { createSubject, createSyllabusDocument, pooExtraction } from "./factories";
import { api, type TestApp, type TestAppOptions } from "./test-app";

/** The real `curriculum-agent`, registered ACTIVE: its availability tests disable it through the admin route. */
export const TEST_CURRICULUM_AGENT = defineAgent({ ...CURRICULUM_AGENT, initialStatus: "ACTIVE" });

/** The agent's model config, on the fake provider: only the provider is swapped (006/SC-011). */
export const TEST_CURRICULUM_MODEL_CONFIG = defineModelConfig({ ...CURRICULUM_MODEL_CONFIG, provider: "fake", model: "fake-model-1" });

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
    resources: curriculum.resources,
  });
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

/**
 * A valid agent output for the POO sample, as written in the document (4 groups, 16 items, no
 * refs). Tests change it to exercise the grounding check and the refs.
 */
export function pooOutput(): CurriculumExtractionOutput {
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
