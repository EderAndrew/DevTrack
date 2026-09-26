import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { SyllabusWorkerRunner, WorkerCrashed, WorkerTimeout } from "../../src/modules/syllabus/syllabus-worker-runner";
import { API_ROOT } from "../helpers/env";
import { TEST_WORKER_PATH, writeFakeWorker } from "../helpers/syllabus-worker";
import { testConfig } from "../helpers/test-app";

const fixture = (name: string) => readFileSync(resolve(API_ROOT, "test/fixtures/syllabus", name));

/**
 * 007 research C11: `normalize` runs in the same worker thread as the 004 extraction. The worker
 * build is the one `compileSyllabusWorker()` writes in the global setup (test/helpers/global-setup.ts).
 */
describe("007/FR-009 leitura normalizada no worker thread", () => {
  const runner = (path = TEST_WORKER_PATH) => new SyllabusWorkerRunner(path, testConfig());

  it("poo.pdf e poo.docx: blocos com ref, sem mudar o arquivo de quem chama", async () => {
    const bytes = fixture("poo.pdf");
    const before = Buffer.from(bytes);
    const pdf = await runner().normalize(bytes, "PDF", 10_000);
    expect(pdf.filter((b) => b.kind === "item")).toHaveLength(16);
    expect(pdf[0]!.ref).toBe("p1.1");
    expect(bytes.equals(before)).toBe(true);

    const docx = await runner().normalize(fixture("poo.docx"), "DOCX", 10_000);
    expect(docx.filter((b) => b.kind === "group")).toHaveLength(4);
    expect(docx[0]!.ref).toBe("par1");
  });

  it("10 páginas (dez-paginas.pdf) em menos de 3 s", async () => {
    const started = performance.now();
    const blocks = await runner().normalize(fixture("dez-paginas.pdf"), "PDF", 10_000);
    expect(performance.now() - started).toBeLessThan(3000);
    expect(blocks.filter((b) => b.kind === "item")).toHaveLength(160);
  });

  it("worker que não responde → WorkerTimeout no prazo da chamada", async () => {
    const started = performance.now();
    await expect(runner(writeFakeWorker("hang")).normalize(fixture("poo.pdf"), "PDF", 200)).rejects.toBeInstanceOf(WorkerTimeout);
    expect(performance.now() - started).toBeLessThan(2000);
  });

  it("chamada abortada → WorkerTimeout, e o worker é encerrado", async () => {
    const controller = new AbortController();
    const pending = runner(writeFakeWorker("hang")).normalize(fixture("poo.pdf"), "PDF", 60_000, controller.signal);
    controller.abort();
    await expect(pending).rejects.toBeInstanceOf(WorkerTimeout);
  });

  it("worker que quebra → WorkerCrashed", async () => {
    await expect(runner(writeFakeWorker("crash")).normalize(fixture("poo.pdf"), "PDF", 10_000)).rejects.toBeInstanceOf(WorkerCrashed);
  });

  it("arquivo ilegível → WorkerCrashed, sem texto no erro", async () => {
    const error = await runner()
      .normalize(fixture("corrompido.pdf"), "PDF", 10_000)
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(WorkerCrashed);
    expect((error as Error).message).toBe("");
  });
});
