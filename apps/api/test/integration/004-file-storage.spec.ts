import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { AppException } from "../../src/platform/http/errors";
import { FileStorage } from "../../src/platform/storage/file-storage";
import { API_ROOT } from "../helpers/env";
import { LogCapture } from "../helpers/log-capture";
import { createTestApp, resetDb, type TestApp } from "../helpers/test-app";

const POO_PDF = readFileSync(resolve(API_ROOT, "test/fixtures/syllabus/poo.pdf"));

// research E4: the original file lives in stored_files, written in the caller's transaction,
// never changed afterwards, and checked against its SHA-256 on every read.
describe("004/FR-009 004/FR-010 armazenamento do arquivo original", () => {
  let t: TestApp;
  let storage: FileStorage;
  const logs = new LogCapture();

  beforeAll(async () => {
    t = await createTestApp({ logs });
    storage = t.get(FileStorage);
  });
  afterAll(() => t.close());
  beforeEach(async () => {
    await resetDb(t.prisma);
    logs.clear();
  });

  const put = (bytes: Buffer) => t.prisma.runInTransaction((tx) => storage.put(tx, bytes));

  it("grava e lê os mesmos bytes, com SHA-256 e tamanho", async () => {
    const ref = await put(POO_PDF);
    expect(ref.sizeBytes).toBe(POO_PDF.length);
    expect(ref.sha256.equals(createHash("sha256").update(POO_PDF).digest())).toBe(true);

    const read = await storage.get(ref.key);
    expect(read.equals(POO_PDF)).toBe(true);

    const row = await t.prisma.storedFile.findUniqueOrThrow({ where: { id: ref.key } });
    expect(row.sizeBytes).toBe(POO_PDF.length);
    expect(Buffer.from(row.sha256).equals(ref.sha256)).toBe(true);
  });

  it("a gravação acompanha a transação: rollback não deixa arquivo órfão", async () => {
    await expect(
      t.prisma.runInTransaction(async (tx) => {
        await storage.put(tx, POO_PDF);
        throw new Error("falha depois de gravar");
      }),
    ).rejects.toThrow("falha depois de gravar");
    expect(await t.prisma.storedFile.count()).toBe(0);
  });

  it("UPDATE e DELETE em stored_files são recusados pela trigger", async () => {
    const { key } = await put(POO_PDF);
    await expect(
      t.prisma.$executeRaw`UPDATE "stored_files" SET "bytes" = ${Buffer.from("x")}, "size_bytes" = 1 WHERE "id" = ${key}::uuid`,
    ).rejects.toThrow(/immutable/);
    await expect(t.prisma.$executeRaw`DELETE FROM "stored_files" WHERE "id" = ${key}::uuid`).rejects.toThrow(/immutable/);
    expect((await storage.get(key)).equals(POO_PDF)).toBe(true);
  });

  it("tamanho diferente dos bytes é recusado pelo banco (CHECK)", async () => {
    await expect(
      t.prisma.storedFile.create({
        data: { bytes: new Uint8Array([1, 2, 3]), sizeBytes: 4, sha256: new Uint8Array(32) },
      }),
    ).rejects.toThrow();
  });

  it("bytes adulterados (trigger desligada só no teste) → 500 sem devolver bytes e log de erro", async () => {
    const { key } = await put(POO_PDF);
    const tampered = Buffer.from(POO_PDF);
    tampered[tampered.length - 10] = tampered[tampered.length - 10]! ^ 0xff;
    await t.prisma.$transaction([
      t.prisma.$executeRawUnsafe("SET LOCAL session_replication_role = replica"),
      t.prisma.$executeRaw`UPDATE "stored_files" SET "bytes" = ${tampered} WHERE "id" = ${key}::uuid`,
    ]);

    const error = await storage.get(key).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(AppException);
    expect(error).toMatchObject({ status: 500, code: "INTERNAL_ERROR" });

    const line = logs.lines().find((entry) => entry.msg === "syllabus.checksum_mismatch");
    expect(line).toMatchObject({ level: 50, fileId: key });
    expect(logs.text()).not.toContain("MARCADOR-EMENTA-004");
  });
});
