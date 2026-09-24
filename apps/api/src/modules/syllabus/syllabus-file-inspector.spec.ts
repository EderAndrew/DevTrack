import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { docx, jpeg, png } from "../../../test/fixtures/syllabus/build-fixtures";
import { API_ROOT } from "../../../test/helpers/env";
import { inspectSyllabusFile } from "./syllabus-file-inspector";

const fixture = (name: string) => readFileSync(resolve(API_ROOT, "test/fixtures/syllabus", name));
const extensionOf = (name: string) => name.slice(name.lastIndexOf(".")).toLowerCase();

const DECLARED: Record<string, string> = {
  ".pdf": "application/pdf",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".png": "image/png",
  ".jpg": "image/jpeg",
};

const inspect = (name: string, bytes: Uint8Array = fixture(name), declared = DECLARED[extensionOf(name)] ?? "") =>
  inspectSyllabusFile(bytes, declared, extensionOf(name));

describe("004/US2-2 004/US2-3 SyllabusFileInspector — tipo pelo conteúdo e leitura segura (research E6)", () => {
  it.each([
    ["poo.pdf", "PDF", 1],
    ["dez-paginas.pdf", "PDF", 10],
    ["escaneado.pdf", "PDF", 1],
    ["poo.docx", "DOCX", null],
    ["ementa.png", "PNG", null],
    ["ementa.jpg", "JPEG", null],
  ])("%s é aceito como %s", async (name, mediaType, pageCount) => {
    expect(await inspect(name)).toEqual({ ok: true, mediaType, pageCount });
  });

  it.each([
    ["executavel.pdf", "FILE_TYPE_NOT_ALLOWED"],
    ["imagem.docx", "FILE_TYPE_NOT_ALLOWED"],
    ["corrompido.pdf", "FILE_UNREADABLE"],
    ["truncado.jpg", "FILE_UNREADABLE"],
    ["protegido.pdf", "FILE_PROTECTED"],
    ["ole.docx", "FILE_PROTECTED"],
    ["macro.docx", "FILE_MACROS"],
    ["bomba.docx", "FILE_TOO_COMPLEX"],
    ["muitas-entradas.docx", "FILE_TOO_COMPLEX"],
    ["gigante.png", "FILE_TOO_COMPLEX"],
  ])("%s → %s", async (name, code) => {
    expect(await inspect(name)).toEqual({ ok: false, code });
  });

  it("extensão divergente da assinatura → FILE_TYPE_NOT_ALLOWED", async () => {
    expect(await inspectSyllabusFile(fixture("poo.pdf"), "application/pdf", ".docx")).toEqual({
      ok: false,
      code: "FILE_TYPE_NOT_ALLOWED",
    });
    expect(await inspectSyllabusFile(fixture("ementa.png"), "image/png", ".jpg")).toMatchObject({ ok: false });
    expect(await inspectSyllabusFile(fixture("poo.pdf"), "application/pdf", "")).toMatchObject({ ok: false });
  });

  it("tipo declarado divergente da assinatura → FILE_TYPE_NOT_ALLOWED; tipo genérico não diverge", async () => {
    expect(await inspectSyllabusFile(fixture("poo.pdf"), "image/png", ".pdf")).toEqual({
      ok: false,
      code: "FILE_TYPE_NOT_ALLOWED",
    });
    expect(await inspectSyllabusFile(fixture("poo.docx"), "application/pdf", ".docx")).toMatchObject({ ok: false });
    expect(await inspectSyllabusFile(fixture("poo.docx"), "application/octet-stream", ".docx")).toMatchObject({ ok: true });
    expect(await inspectSyllabusFile(fixture("ementa.jpg"), "image/jpeg; charset=binary", ".jpeg")).toMatchObject({ ok: true });
  });

  it("zip que não é documento do Word → FILE_TYPE_NOT_ALLOWED", async () => {
    const { zipSync, strToU8 } = await import("fflate");
    const zip = zipSync({ "[Content_Types].xml": strToU8("<Types/>"), "xl/workbook.xml": strToU8("<workbook/>") });
    expect(await inspect("planilha.docx", zip)).toEqual({ ok: false, code: "FILE_TYPE_NOT_ALLOWED" });
  });

  it("DOCX com tipo macroEnabled no [Content_Types].xml → FILE_MACROS", async () => {
    const bytes = docx(undefined, {});
    const { unzipSync, zipSync, strToU8, strFromU8 } = await import("fflate");
    const files = unzipSync(bytes);
    files["[Content_Types].xml"] = strToU8(
      strFromU8(files["[Content_Types].xml"]!).replace("document.main+xml", "document.macroEnabled.main+xml"),
    );
    expect(await inspect("macro.docx", zipSync(files))).toEqual({ ok: false, code: "FILE_MACROS" });
  });

  it("PNG sem IEND e JPEG sem SOF → FILE_UNREADABLE; JPEG acima de 40 MP → FILE_TOO_COMPLEX", async () => {
    const image = png(10, 10, 8, () => new Uint8Array(10));
    expect(await inspect("x.png", image.subarray(0, image.length - 12))).toEqual({ ok: false, code: "FILE_UNREADABLE" });
    expect(await inspect("x.jpg", Uint8Array.of(0xff, 0xd8, 0xff, 0xd9))).toEqual({ ok: false, code: "FILE_UNREADABLE" });

    const big = jpeg(8, 8);
    // SOF0 of jpeg(): FF C0, length, precision, height, width. 8000 × 8000 = 64 MP.
    const sof = big.findIndex((byte, index) => byte === 0xff && big[index + 1] === 0xc0);
    big.set([0x1f, 0x40, 0x1f, 0x40], sof + 5);
    expect(await inspect("x.jpg", big)).toEqual({ ok: false, code: "FILE_TOO_COMPLEX" });
  });

  it("arquivo vazio ou desconhecido → FILE_TYPE_NOT_ALLOWED", async () => {
    expect(await inspect("vazio.pdf", new Uint8Array(0))).toEqual({ ok: false, code: "FILE_TYPE_NOT_ALLOWED" });
    expect(await inspect("texto.pdf", Buffer.from("apenas texto"))).toEqual({ ok: false, code: "FILE_TYPE_NOT_ALLOWED" });
  });
});
