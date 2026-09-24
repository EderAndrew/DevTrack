import { randomUUID } from "node:crypto";
import { Controller, Post } from "@nestjs/common";
import { endpoints } from "@repo/contracts";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Public } from "../../src/modules/access-control/decorators";
import { AcceptsMultipart } from "../../src/platform/http/origin.guard";
import { api, createTestApp, type TestApp } from "../helpers/test-app";

@Controller("fixture-multipart")
class MultipartFixtureController {
  @Post("marked")
  @Public()
  @AcceptsMultipart()
  marked() {
    return { ok: true };
  }

  @Post("unmarked")
  @Public()
  unmarked() {
    return { ok: true };
  }
}

const FILE = { bytes: Buffer.from("%PDF-1.7\n"), filename: "ementa.pdf", contentType: "application/pdf" };
const UNSAFE = new Set(["POST", "PUT", "PATCH", "DELETE"]);

/** A concrete URL for a catalog path: every `:param` becomes a random UUID. */
const concrete = (path: string) => `/api${path.replace(/:[A-Za-z]+/g, () => randomUUID())}`;

// 004 E5: multipart/form-data passes the CSRF barrier only on routes marked with
// @AcceptsMultipart(), and still only from an allowed Origin (R6).
describe("004/FR-007 multipart só em rotas de envio marcadas, com Origin permitido", () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await createTestApp({ controllers: [MultipartFixtureController] });
  });
  afterAll(() => t.close());

  it("rota marcada aceita multipart com Origin permitido", async () => {
    const res = await api(t).upload("/api/fixture-multipart/marked", FILE);
    expect(res.status).toBe(201);
    expect(res.body).toEqual({ ok: true });
  });

  it("rota marcada continua aceitando JSON", async () => {
    expect((await api(t).post("/api/fixture-multipart/marked")).status).toBe(201);
  });

  it.each([
    ["sem Origin", null],
    ["de outro site", "https://evil.example"],
  ])("rota marcada recusa multipart %s → 403 ORIGIN_NOT_ALLOWED", async (_label, origin) => {
    const res = await api(t, { origin }).upload("/api/fixture-multipart/marked", FILE);
    expect(res.status).toBe(403);
    expect(res.body).toMatchObject({ statusCode: 403, code: "ORIGIN_NOT_ALLOWED" });
  });

  it("rota marcada recusa outros tipos de corpo (formulário e texto)", async () => {
    for (const contentType of ["application/x-www-form-urlencoded", "text/plain"]) {
      const res = await request(t.baseUrl)
        .post("/api/fixture-multipart/marked")
        .set("Origin", t.origin)
        .set("Content-Type", contentType)
        .send("file=x");
      expect(res.status, contentType).toBe(403);
    }
  });

  it("rota não marcada recusa multipart mesmo com Origin permitido", async () => {
    const res = await api(t).upload("/api/fixture-multipart/unmarked", FILE);
    expect(res.status).toBe(403);
    expect(res.body).toMatchObject({ code: "ORIGIN_NOT_ALLOWED" });
  });

  it("toda rota não marcada do catálogo recusa multipart com Origin permitido", async () => {
    const unmarked = Object.values(endpoints).filter(
      (entry) => UNSAFE.has(entry.method) && !("upload" in entry && entry.upload),
    );
    expect(unmarked.length).toBeGreaterThan(30);

    const accepted: string[] = [];
    for (const entry of unmarked) {
      const url = concrete(entry.path);
      const req = request(t.baseUrl)[entry.method.toLowerCase() as "post" | "put" | "patch" | "delete"](url);
      const res = await req.set("Origin", t.origin).attach("file", FILE.bytes, { filename: FILE.filename });
      if (res.status !== 403 || res.body.code !== "ORIGIN_NOT_ALLOWED") accepted.push(`${entry.method} ${entry.path} → ${res.status}`);
    }
    expect(accepted).toEqual([]);
  });
});
