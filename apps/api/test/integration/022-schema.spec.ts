import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createUser } from "../helpers/factories";
import { createTestApp, resetDb, type TestApp } from "../helpers/test-app";

/** 022 data-model.md (research Z1): the account's theme is a NOT NULL enum that defaults to DARK. */
describe("022/FR-003 tema da conta garantido pelo PostgreSQL", () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await createTestApp();
  });
  afterAll(() => t.close());

  beforeEach(async () => {
    await resetDb(t.prisma);
  });

  it("022/FR-003 uma conta criada sem tema lê DARK no banco", async () => {
    const user = await createUser(t);
    const rows = await t.prisma.$queryRaw<{ theme: string }[]>`SELECT "theme"::text AS theme FROM "users" WHERE "id" = ${user.id}::uuid`;
    expect(rows).toEqual([{ theme: "DARK" }]);
  });

  it("022/FR-003 um valor fora do enum é recusado", async () => {
    const user = await createUser(t);
    await expect(
      t.prisma.$executeRawUnsafe(`UPDATE "users" SET "theme" = 'SYSTEM' WHERE "id" = $1::uuid`, user.id),
    ).rejects.toThrow(/invalid input value for enum ui_theme/);
  });

  it("022/FR-003 a coluna é NOT NULL", async () => {
    const user = await createUser(t);
    await expect(
      t.prisma.$executeRawUnsafe(`UPDATE "users" SET "theme" = NULL WHERE "id" = $1::uuid`, user.id),
    ).rejects.toThrow(/null value in column "theme"/);
  });
});
