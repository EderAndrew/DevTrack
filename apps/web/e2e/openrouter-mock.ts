import { readFileSync } from "node:fs";
import { createServer, type IncomingMessage, type Server } from "node:http";
import { join } from "node:path";
import { API_DIR, OPENROUTER_MOCK_PORT } from "./env.ts";

/**
 * A local stand-in for OpenRouter's chat completions API (008 T026): the E2E API points
 * `OPENROUTER_BASE_URL` here, so "Preencher com IA" runs the real `OpenRouterProvider` without
 * leaving the machine. It replays the POO case of the golden set (`recorded.json`): a request with
 * no `tool` message asks for `read-curriculum-document` with the `documentId` of the context; one
 * with a tool result answers the recorded JSON. Stateless, so parallel journeys don't interfere.
 * With `MOCK_PRIMARY_DOWN=1` it answers 503 to the primary model (`MOCK_PRIMARY_MODEL`, by default
 * the cheapest BASIC entry of the 009 catalog, the policy's primary once approved), so a run with a
 * fallback model exercises the fallback. Any other model gets the recorded answer. Playwright starts it as a `webServer`
 * (`node e2e/openrouter-mock.ts`) before the API. It also answers OpenRouter's decisions route
 * (009 T023, `POST /api/alpha/decisions`) for a decision task run through the real adapter.
 */

interface RecordedRun {
  steps: ({ toolCalls: { toolKey: string }[] } | { output: unknown })[];
}

const recorded = JSON.parse(
  readFileSync(join(API_DIR, "test/fixtures/curriculum-agent/golden/poo-pdf/recorded.json"), "utf8"),
) as RecordedRun;
const toolKey = recorded.steps.flatMap((step) => ("toolCalls" in step ? step.toolCalls : []))[0]!.toolKey;
const output = recorded.steps.flatMap((step) => ("output" in step ? [step.output] : []))[0];

/** The model `MOCK_PRIMARY_DOWN` takes down: `openai-basic` of apps/api `model-catalog.ts` by default. */
const PRIMARY_MODEL = process.env.MOCK_PRIMARY_MODEL || "openai/gpt-6-luna";
const PRIMARY_DOWN = process.env.MOCK_PRIMARY_DOWN === "1";

interface ChatBody {
  model: string;
  messages: { role: string; content: { type: string; text?: string }[] | string | null }[];
}

const readBody = (req: IncomingMessage) =>
  new Promise<string>((resolve, reject) => {
    let data = "";
    req.on("data", (chunk: Buffer) => (data += chunk.toString("utf8")));
    req.on("end", () => resolve(data));
    req.on("error", reject);
  });

function answer(body: ChatBody) {
  const usage = { prompt_tokens: 1_200, completion_tokens: 400, total_tokens: 1_600, cost: 0.016 };
  const base = { id: `gen-e2e-${Date.now()}`, object: "chat.completion", model: body.model, usage };
  if (!body.messages.some((message) => message.role === "tool")) {
    const first = body.messages.find((message) => message.role === "user")!.content;
    const context = JSON.parse(Array.isArray(first) ? (first[0]?.text ?? "{}") : (first ?? "{}")) as { documentId?: string };
    const call = { id: "call_e2e_1", type: "function", function: { name: toolKey, arguments: JSON.stringify({ documentId: context.documentId }) } };
    return { ...base, choices: [{ index: 0, finish_reason: "tool_calls", message: { role: "assistant", content: null, tool_calls: [call] } }] };
  }
  return { ...base, choices: [{ index: 0, finish_reason: "stop", message: { role: "assistant", content: JSON.stringify(output) } }] };
}

interface DecisionBody {
  model: string;
  questions: Record<string, { type: "choice" | "score" | "noul"; criteria?: Record<string, string> | string[] }>;
}

/**
 * Deterministic, confident answers (009 contracts/decisions-provider.md): the first option of a
 * choice, the highest level of a score, "yes" for a yes/no. The wire carries only the values.
 */
function decide(body: DecisionBody) {
  const answers = Object.fromEntries(
    Object.entries(body.questions).map(([id, question]) => {
      if (question.type === "noul") return [id, { noul: 0.9 }];
      if (question.type === "score") {
        const levels = Array.isArray(question.criteria) ? question.criteria : [];
        const top = Math.max(levels.length - 1, 0);
        return [id, { score: top, probabilities: Object.fromEntries(levels.map((level, i) => [level, i === top ? 0.95 : 0.05 / top])), legend: levels[top], confidence: 0.95 }];
      }
      const options = Object.keys(question.criteria ?? {});
      return [id, { choice: options[0], probabilities: Object.fromEntries(options.map((option, i) => [option, i === 0 ? 0.95 : 0.05 / (options.length - 1)])), confidence: 0.95 }];
    }),
  );
  return { id: `dec-e2e-${Date.now()}`, model: body.model, provider: "TypeSafe", answers, usage: { input_tokens: 600, output_tokens: 3, cost: 0.00003 } };
}

/** Starts the mock on `port`; resolves once it listens. */
export function startOpenRouterMock(port: number): Promise<Server> {
  const server = createServer(async (req, res) => {
    const send = (status: number, payload: unknown) => {
      res.writeHead(status, { "Content-Type": "application/json" });
      res.end(JSON.stringify(payload));
    };
    const path = new URL(req.url ?? "/", "http://mock").pathname;
    if (req.method === "GET" && path === "/api/v1/key") return send(200, { data: { label: "e2e", limit: null, usage: 0 } });
    if (req.method === "POST" && path === "/api/v1/chat/completions") {
      const body = JSON.parse(await readBody(req)) as ChatBody;
      if (PRIMARY_DOWN && body.model === PRIMARY_MODEL) return send(503, { error: { code: 503, message: "mock: primary down" } });
      return send(200, answer(body));
    }
    if (req.method === "POST" && path === "/api/alpha/decisions") return send(200, decide(JSON.parse(await readBody(req)) as DecisionBody));
    send(404, { error: { code: 404, message: "mock" } });
  });
  return new Promise((resolve) => server.listen(port, "127.0.0.1", () => resolve(server)));
}

if (process.argv[1]?.endsWith("openrouter-mock.ts")) void startOpenRouterMock(OPENROUTER_MOCK_PORT);
