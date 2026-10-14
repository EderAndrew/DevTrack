import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import type { ModelResponse } from "../../../src/modules/ai/definitions/types";
import type { AiEvaluationStore } from "../../../src/modules/ai/evaluation/ai-evaluation.store";
import { EXAM_GENERATOR_KEY } from "../../../src/modules/exam-ai/definitions/exam-generator";
import type { FakeStep } from "../ai/fake-model-provider";
import type { ExamGenerationExpected } from "./score";

const GOLDEN = resolve(__dirname, "golden");

/**
 * The ids each run creates anew, as placeholders in `recorded.json`: the request, the chosen topics
 * (`{{topic:0}}`…, in selection order) and the syllabus language.
 */
const REQUEST_ID = "{{requestId}}";
const LANGUAGE_ID = "{{languageId}}";
const topicPlaceholder = (position: number) => `{{topic:${position}}}`;

/** The ids of one run, put in place of the placeholders and back. */
export interface RunIds {
  requestId: string;
  topicIds: readonly string[];
  languageId: string | null;
}

/** `recorded.json`: the model's answers of one run, replayed in order by the fake provider. */
export interface RecordedRun {
  version: number;
  steps: FakeStep[];
}

export interface ExamGenerationCase {
  /** The folder name, also the evaluation case key. */
  name: string;
  expected: ExamGenerationExpected;
  recorded: RecordedRun;
  /** What `ai_evaluation_cases.input_ref` keeps: the fixture path, never content. */
  inputRef: string;
}

const readJson = <T>(path: string): T => JSON.parse(readFileSync(path, "utf8")) as T;

/** The golden set of the exam generator (018 research T14), one case per folder of `golden/`, in name order. */
export function loadExamGenerationCases(): ExamGenerationCase[] {
  return readdirSync(GOLDEN, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort()
    .map((name) => ({
      name,
      expected: readJson<ExamGenerationExpected>(resolve(GOLDEN, name, "expected.json")),
      recorded: readJson<RecordedRun>(resolve(GOLDEN, name, "recorded.json")),
      inputRef: `test/fixtures/exam-generator/golden/${name}`,
    }));
}

/** The recorded steps with the ids created for this run. */
export function recordedSteps(run: RecordedRun, ids: RunIds): FakeStep[] {
  let text = JSON.stringify(run.steps).replaceAll(REQUEST_ID, ids.requestId).replaceAll(LANGUAGE_ID, ids.languageId ?? "");
  ids.topicIds.forEach((id, position) => {
    text = text.replaceAll(topicPlaceholder(position), id);
  });
  return JSON.parse(text) as FakeStep[];
}

/** Real provider answers as a `recorded.json` (on-demand `EVAL_REPLAY=1`): JSON outputs are kept parsed, for review. */
export function toRecordedRun(responses: ModelResponse[], ids: RunIds): RecordedRun {
  const steps = responses.map((response): FakeStep => {
    if (response.kind === "tool_calls") return { toolCalls: response.calls };
    try {
      return { output: JSON.parse(response.text) as unknown };
    } catch {
      return { text: response.text };
    }
  });
  let text = JSON.stringify(steps).replaceAll(ids.requestId, REQUEST_ID);
  if (ids.languageId) text = text.replaceAll(ids.languageId, LANGUAGE_ID);
  ids.topicIds.forEach((id, position) => {
    text = text.replaceAll(id, topicPlaceholder(position));
  });
  return { version: 1, steps: JSON.parse(text) as FakeStep[] };
}

export function writeRecordedRun(name: string, run: RecordedRun): void {
  writeFileSync(resolve(GOLDEN, name, "recorded.json"), `${JSON.stringify(run, null, 2)}\n`);
}

/** Seeds `ai_evaluation_cases` of `exam-generator` (idempotent); returns the case id by name. */
export async function seedExamGenerationCases(store: AiEvaluationStore, cases: ExamGenerationCase[]): Promise<Map<string, string>> {
  const ids = new Map<string, string>();
  for (const golden of cases) {
    const { id } = await store.recordCase(EXAM_GENERATOR_KEY, {
      key: golden.name,
      version: golden.expected.version,
      inputRef: golden.inputRef,
      expected: golden.expected as unknown as Record<string, never>,
    });
    ids.set(golden.name, id);
  }
  return ids;
}
