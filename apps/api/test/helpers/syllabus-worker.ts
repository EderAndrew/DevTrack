import { mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { transformFileSync } from "@swc/core";
import { API_ROOT } from "./env";

const SOURCE = resolve(API_ROOT, "src/modules/syllabus");
/** Build of the reading worker for the tests (research E8); ignored by git. */
export const TEST_WORKER_DIR = resolve(API_ROOT, "test/.tmp/syllabus");
/** What `createTestApp` injects as `SYLLABUS_WORKER_PATH`. */
export const TEST_WORKER_PATH = resolve(TEST_WORKER_DIR, "extraction/extract.worker.js");

/**
 * Compiles the worker entry and what it imports (`extraction/` and the file inspector) to
 * CommonJS, as `swc src -d dist` does for production. Vitest transforms only the files it
 * imports itself, and a worker thread loads plain JavaScript from disk.
 */
export function compileSyllabusWorker(): void {
  rmSync(TEST_WORKER_DIR, { recursive: true, force: true });
  const sources = [
    resolve(SOURCE, "syllabus-file-inspector.ts"),
    ...readdirSync(resolve(SOURCE, "extraction"))
      .filter((name) => name.endsWith(".ts") && !name.endsWith(".spec.ts") && !name.endsWith(".d.ts"))
      .map((name) => resolve(SOURCE, "extraction", name)),
  ];
  for (const source of sources) {
    const { code } = transformFileSync(source, {
      swcrc: false,
      module: { type: "commonjs" },
      jsc: { target: "es2023", parser: { syntax: "typescript", dynamicImport: true } },
    });
    const target = resolve(TEST_WORKER_DIR, relative(SOURCE, source)).replace(/\.ts$/, ".js");
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, code);
  }
}

/**
 * A stand-in worker for failure tests, written next to the real one. `behavior`: `hang` never
 * answers (deadline), `internal` answers `INTERNAL`, `crash` throws.
 */
export function writeFakeWorker(behavior: "hang" | "internal" | "crash"): string {
  const bodies = {
    hang: "setInterval(() => {}, 1000);",
    internal: 'parentPort.once("message", () => parentPort.postMessage({ ok: false, category: "INTERNAL" }));',
    crash: 'parentPort.once("message", () => { throw new Error("falha simulada"); });',
  };
  const path = resolve(TEST_WORKER_DIR, `fake-${behavior}.worker.js`);
  mkdirSync(TEST_WORKER_DIR, { recursive: true });
  writeFileSync(path, `const { parentPort } = require("node:worker_threads");\n${bodies[behavior]}\n`);
  return path;
}
