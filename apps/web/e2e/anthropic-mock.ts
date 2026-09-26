import { readFileSync } from "node:fs";
import { createServer, type IncomingMessage, type Server } from "node:http";
import { join } from "node:path";
import { ANTHROPIC_MOCK_PORT, API_DIR } from "./env.ts";

/**
 * A local stand-in for the Anthropic Messages API (007 T064): the E2E API points
 * `ANTHROPIC_BASE_URL` here, so "Preencher com IA" runs the real provider adapter without leaving
 * the machine. It replays the POO case of the golden set (`recorded.json`): a request with no tool
 * result asks for `read-curriculum-document` with the `documentId` of the context; one with a tool
 * result answers the recorded JSON. Stateless, so parallel journeys don't interfere. Playwright
 * starts it as a `webServer` (`node e2e/anthropic-mock.ts`) before the API.
 */

interface RecordedRun {
  steps: ({ toolCalls: { toolKey: string }[] } | { output: unknown })[];
}

const recorded = JSON.parse(
  readFileSync(join(API_DIR, "test/fixtures/curriculum-agent/golden/poo-pdf/recorded.json"), "utf8"),
) as RecordedRun;
const toolKey = recorded.steps.flatMap((step) => ("toolCalls" in step ? step.toolCalls : []))[0]!.toolKey;
const output = recorded.steps.flatMap((step) => ("output" in step ? [step.output] : []))[0];

interface MessagesBody {
  model: string;
  messages: { role: string; content: { type: string; text?: string }[] | string }[];
}

const readBody = (req: IncomingMessage) =>
  new Promise<string>((resolve, reject) => {
    let data = "";
    req.on("data", (chunk: Buffer) => (data += chunk.toString("utf8")));
    req.on("end", () => resolve(data));
    req.on("error", reject);
  });

function answer(body: MessagesBody) {
  const usage = { input_tokens: 1_200, output_tokens: 400 };
  const base = { id: `msg_e2e_${Date.now()}`, type: "message", role: "assistant", model: body.model, stop_sequence: null, usage };
  const blocks = body.messages.flatMap((message) => (Array.isArray(message.content) ? message.content : []));
  if (!blocks.some((block) => block.type === "tool_result")) {
    const first = body.messages[0]!.content;
    const context = JSON.parse(Array.isArray(first) ? (first[0]?.text ?? "{}") : first) as { documentId?: string };
    return { ...base, stop_reason: "tool_use", content: [{ type: "tool_use", id: "toolu_e2e_1", name: toolKey, input: { documentId: context.documentId } }] };
  }
  return { ...base, stop_reason: "end_turn", content: [{ type: "text", text: JSON.stringify(output) }] };
}

/** Starts the mock on `port`; resolves once it listens. */
export function startAnthropicMock(port: number): Promise<Server> {
  const server = createServer(async (req, res) => {
    const send = (status: number, payload: unknown) => {
      res.writeHead(status, { "Content-Type": "application/json" });
      res.end(JSON.stringify(payload));
    };
    const path = new URL(req.url ?? "/", "http://mock").pathname;
    if (req.method === "GET" && path.startsWith("/v1/models/")) {
      const id = path.slice("/v1/models/".length);
      return send(200, { type: "model", id, display_name: id, created_at: "2026-01-01T00:00:00Z" });
    }
    if (req.method === "POST" && path === "/v1/messages") return send(200, answer(JSON.parse(await readBody(req)) as MessagesBody));
    send(404, { type: "error", error: { type: "not_found_error", message: "mock" } });
  });
  return new Promise((resolve) => server.listen(port, "127.0.0.1", () => resolve(server)));
}

if (process.argv[1]?.endsWith("anthropic-mock.ts")) void startAnthropicMock(ANTHROPIC_MOCK_PORT);
