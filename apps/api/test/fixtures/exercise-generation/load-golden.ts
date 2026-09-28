import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import type { ModelResponse } from "../../../src/modules/ai/definitions/types";
import type { AiEvaluationStore } from "../../../src/modules/ai/evaluation/ai-evaluation.store";
import { EXERCISE_GENERATOR_KEY } from "../../../src/modules/exercise-ai/definitions/exercise-generator";
import type { FakeStep } from "../ai/fake-model-provider";
import type { GenerationExpected } from "./score";

const GOLDEN = resolve(__dirname, "golden");
/** Where the batch id goes in `recorded.json`: each run creates the batch under a new id. */
const BATCH_ID = "{{batchId}}";

/** `recorded.json`: the model's answers of one run, replayed in order by the fake provider. */
export interface RecordedRun {
  version: number;
  steps: FakeStep[];
}

export interface GenerationCase {
  /** The folder name, also the evaluation case key. */
  name: string;
  expected: GenerationExpected;
  recorded: RecordedRun;
  /** What `ai_evaluation_cases.input_ref` keeps: the fixture path, never content. */
  inputRef: string;
}

const readJson = <T>(path: string): T => JSON.parse(readFileSync(path, "utf8")) as T;

/** The golden set of the generator (010 research X16), one case per folder of `golden/`, in name order. */
export function loadGenerationCases(): GenerationCase[] {
  return readdirSync(GOLDEN, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort()
    .map((name) => ({
      name,
      expected: readJson<GenerationExpected>(resolve(GOLDEN, name, "expected.json")),
      recorded: readJson<RecordedRun>(resolve(GOLDEN, name, "recorded.json")),
      inputRef: `test/fixtures/exercise-generation/golden/${name}`,
    }));
}

/** The recorded steps with the id of the batch created for this run. */
export function recordedSteps(run: RecordedRun, batchId: string): FakeStep[] {
  return JSON.parse(JSON.stringify(run.steps).replaceAll(BATCH_ID, batchId)) as FakeStep[];
}

/** Real provider answers as a `recorded.json` (on-demand `EVAL_REPLAY=1`): JSON outputs are kept parsed, for review. */
export function toRecordedRun(responses: ModelResponse[], batchId: string): RecordedRun {
  const steps = responses.map((response): FakeStep => {
    if (response.kind === "tool_calls") return { toolCalls: response.calls };
    try {
      return { output: JSON.parse(response.text) as unknown };
    } catch {
      return { text: response.text };
    }
  });
  return { version: 1, steps: JSON.parse(JSON.stringify(steps).replaceAll(batchId, BATCH_ID)) as FakeStep[] };
}

export function writeRecordedRun(name: string, run: RecordedRun): void {
  writeFileSync(resolve(GOLDEN, name, "recorded.json"), `${JSON.stringify(run, null, 2)}\n`);
}

/** Seeds `ai_evaluation_cases` of `exercise-generator` (idempotent); returns the case id by name. */
export async function seedGenerationCases(store: AiEvaluationStore, cases: GenerationCase[]): Promise<Map<string, string>> {
  const ids = new Map<string, string>();
  for (const golden of cases) {
    const { id } = await store.recordCase(EXERCISE_GENERATOR_KEY, {
      key: golden.name,
      version: golden.expected.version,
      inputRef: golden.inputRef,
      expected: golden.expected as unknown as Record<string, never>,
    });
    ids.set(golden.name, id);
  }
  return ids;
}
