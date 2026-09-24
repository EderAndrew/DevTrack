import { describe, expect, it } from "vitest";
import { fileExtension, sanitizeOriginalFilename } from "./original-filename";

describe("004/US2-4 nome original saneado (research E6)", () => {
  it.each([
    ["../../etc/passwd.pdf", "passwd.pdf"],
    ["..\\..\\Windows\\ementa.docx", "ementa.docx"],
    ["C:\\Users\\prof\\Ementa POO.pdf", "Ementa POO.pdf"],
    ["ementa\u0000\u0007.pdf", "ementa.pdf"],
    ["ementa\u202Efdp.exe", "ementafdp.exe"],
    ["\u200Bementa\u2066.pdf\u2069", "ementa.pdf"],
    ["  Programação.pdf  ", "Programação.pdf"],
  ])("%j → %j", (name, expected) => {
    expect(sanitizeOriginalFilename(name, "PDF")).toBe(expected);
  });

  it("normaliza para NFC", () => {
    const decomposed = "Programac\u0327a\u0303o.pdf";
    expect(sanitizeOriginalFilename(decomposed, "PDF")).toBe("Programação.pdf");
    expect(sanitizeOriginalFilename(decomposed, "PDF").normalize("NFC")).toBe(sanitizeOriginalFilename(decomposed, "PDF"));
  });

  it("corta em 255 caracteres mantendo a extensão", () => {
    const name = sanitizeOriginalFilename(`${"a".repeat(300)}.docx`, "DOCX");
    expect(Array.from(name)).toHaveLength(255);
    expect(name.endsWith(".docx")).toBe(true);
    expect(Array.from(sanitizeOriginalFilename("é".repeat(400), "PDF"))).toHaveLength(255);
  });

  it.each([
    ["", "PDF", "ementa.pdf"],
    ["../", "DOCX", "ementa.docx"],
    ["..", "PNG", "ementa.png"],
    ["\u202E\u0000", "JPEG", "ementa.jpg"],
  ] as const)("vazio (%j) → %s", (name, mediaType, expected) => {
    expect(sanitizeOriginalFilename(name, mediaType)).toBe(expected);
  });

  it("extensão do último segmento, em minúsculas", () => {
    expect(fileExtension("dir/Ementa.PDF")).toBe(".pdf");
    expect(fileExtension("a.b\\c.JPEG")).toBe(".jpeg");
    expect(fileExtension("sem-extensao")).toBe("");
    expect(fileExtension(".pdf")).toBe("");
  });
});
