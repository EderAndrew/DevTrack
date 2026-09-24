import { Controller, Logger, Post, UseInterceptors } from "@nestjs/common";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { APP_CONFIG } from "../config/config.module";
import { GlobalExceptionFilter } from "./exception.filter";
import { SyllabusFile, SyllabusFileInterceptor, type UploadedSyllabusFile } from "./upload";

@Controller("fixture")
class UploadFixtureController {
  @Post("upload")
  @UseInterceptors(SyllabusFileInterceptor)
  upload(@SyllabusFile() file: UploadedSyllabusFile) {
    return { name: file.originalName, type: file.declaredMediaType, size: file.bytes.length };
  }
}

const MIB = 1024 * 1024;

// research E5: one part, the field `file`, at most SYLLABUS_MAX_FILE_MB (1 MiB here).
describe("004/E5 SyllabusFileInterceptor", () => {
  let app: NestExpressApplication;
  let server: Parameters<typeof request>[0];

  beforeAll(async () => {
    Logger.overrideLogger(false);
    const moduleRef = await Test.createTestingModule({
      controllers: [UploadFixtureController],
      providers: [{ provide: APP_CONFIG, useValue: { syllabus: { maxFileMb: 1 } } }],
    }).compile();
    app = moduleRef.createNestApplication<NestExpressApplication>();
    app.useGlobalFilters(new GlobalExceptionFilter());
    await app.init();
    server = app.getHttpServer();
  });
  afterAll(async () => {
    await app.close();
    Logger.overrideLogger(["log", "error", "warn"]);
  });

  const post = () => request(server).post("/fixture/upload");
  const file = (size: number) => Buffer.alloc(size, 0x41);

  it("um arquivo no limite chega ao controller com nome e tipo declarados", async () => {
    const res = await post().attach("file", file(MIB), { filename: "ementa.pdf", contentType: "application/pdf" });
    expect(res.status).toBe(201);
    expect(res.body).toEqual({ name: "ementa.pdf", type: "application/pdf", size: MIB });
  });

  it("um byte além do limite → 413 FILE_TOO_LARGE", async () => {
    const res = await post().attach("file", file(MIB + 1), { filename: "ementa.pdf" });
    expect(res.status).toBe(413);
    expect(res.body).toEqual({ statusCode: 413, code: "FILE_TOO_LARGE", message: expect.any(String) });
  });

  it.each([
    ["campo de texto junto", (req: request.Test) => req.field("versao", "2").attach("file", file(10), "a.pdf")],
    ["dois arquivos", (req: request.Test) => req.attach("file", file(10), "a.pdf").attach("file", file(10), "b.pdf")],
    ["arquivo com outro nome de campo", (req: request.Test) => req.attach("arquivo", file(10), "a.pdf")],
    ["só um campo de texto, sem arquivo", (req: request.Test) => req.field("file", "texto")],
  ])("%s → 400 VALIDATION_ERROR", async (_label, build) => {
    const res = await build(post());
    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ statusCode: 400, code: "VALIDATION_ERROR" });
  });

  it("multipart sem nenhuma parte → 400 VALIDATION_ERROR", async () => {
    const res = await post().set("Content-Type", "multipart/form-data; boundary=X").send("--X--\r\n");
    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ code: "VALIDATION_ERROR" });
  });

  it("corpo multipart truncado → 400 VALIDATION_ERROR", async () => {
    const body = '--X\r\nContent-Disposition: form-data; name="file"; filename="a.pdf"\r\n\r\n%PDF-1.7';
    const res = await post().set("Content-Type", "multipart/form-data; boundary=X").send(body);
    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ code: "VALIDATION_ERROR" });
  });
});
