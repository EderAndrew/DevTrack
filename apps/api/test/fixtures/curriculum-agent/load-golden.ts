import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import type { ModelResponse } from "../../../src/modules/ai/definitions/types";
import type { AiEvaluationStore } from "../../../src/modules/ai/evaluation/ai-evaluation.store";
import { CURRICULUM_AGENT_KEY } from "../../../src/modules/curriculum-ai/definitions/curriculum-agent";
import type { FakeStep } from "../ai/fake-model-provider";
import type { GoldenExpected } from "./score";

const FIXTURES = resolve(__dirname, "..");
const GOLDEN = resolve(__dirname, "golden");
/** Where the document id goes in `recorded.json`: each run stores the document under a new id. */
const DOCUMENT_ID = "{{documentId}}";

/** `recorded.json`: the model's answers of one run, replayed in order by the fake provider. */
export interface RecordedRun {
  version: number;
  steps: FakeStep[];
}

export interface GoldenCase {
  /** The folder name, also the evaluation case key. */
  name: string;
  expected: GoldenExpected;
  recorded: RecordedRun;
  /** Absolute path of the source document. */
  documentPath: string;
  /** What `ai_evaluation_cases.input_ref` keeps: the fixture path, never content. */
  inputRef: string;
}

const readJson = <T>(path: string): T => JSON.parse(readFileSync(path, "utf8")) as T;

/** The golden set v1 (research C17), one case per folder of `golden/`, in name order. */
export function loadGoldenCases(): GoldenCase[] {
  return readdirSync(GOLDEN, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort()
    .map((name) => {
      const expected = readJson<GoldenExpected>(resolve(GOLDEN, name, "expected.json"));
      return {
        name,
        expected,
        recorded: readJson<RecordedRun>(resolve(GOLDEN, name, "recorded.json")),
        documentPath: resolve(FIXTURES, expected.document),
        inputRef: `test/fixtures/curriculum-agent/golden/${name}`,
      };
    });
}

/** The recorded steps with the id of the document stored for this run. */
export function recordedSteps(run: RecordedRun, documentId: string): FakeStep[] {
  return JSON.parse(JSON.stringify(run.steps).replaceAll(DOCUMENT_ID, documentId)) as FakeStep[];
}

/** Real provider answers as a `recorded.json` (on-demand `EVAL_RECORD=1`): JSON outputs are kept parsed, for review. */
export function toRecordedRun(responses: ModelResponse[], documentId: string): RecordedRun {
  const steps = responses.map((response): FakeStep => {
    if (response.kind === "tool_calls") return { toolCalls: response.calls };
    try {
      return { output: JSON.parse(response.text) as unknown };
    } catch {
      return { text: response.text };
    }
  });
  return { version: 1, steps: JSON.parse(JSON.stringify(steps).replaceAll(documentId, DOCUMENT_ID)) as FakeStep[] };
}

export function writeRecordedRun(name: string, run: RecordedRun): void {
  writeFileSync(resolve(GOLDEN, name, "recorded.json"), `${JSON.stringify(run, null, 2)}\n`);
}

/** Seeds `ai_evaluation_cases` of `curriculum-agent` (idempotent); returns the case id by name. */
export async function seedEvaluationCases(store: AiEvaluationStore, cases: GoldenCase[]): Promise<Map<string, string>> {
  const ids = new Map<string, string>();
  for (const golden of cases) {
    const { id } = await store.recordCase(CURRICULUM_AGENT_KEY, {
      key: golden.name,
      version: golden.expected.version,
      inputRef: golden.inputRef,
      expected: golden.expected as unknown as Record<string, never>,
    });
    ids.set(golden.name, id);
  }
  return ids;
}
