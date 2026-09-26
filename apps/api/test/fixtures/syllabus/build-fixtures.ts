/**
 * Builds the syllabus sample files (004 research E22) deterministically: the same bytes on
 * every run and every machine. PDF, PNG and JPEG are written by hand; DOCX and compression
 * use only `fflate`. Run from apps/api with `pnpm --filter api fixtures:syllabus` and commit
 * the output. `protegido.pdf` is not generated here (see README.md). The 10 MB files of the
 * size-limit tests are built in memory by the tests themselves, never committed.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { strToU8, zipSync, zlibSync, type Zippable } from "fflate";

// ── Sample content: the POO syllabus of contracts/syllabus-processing.md ──────────────────

/** Unique phrase inside the syllabus text; SC-010 checks it never reaches logs or audit. */
export const SYLLABUS_MARKER = "MARCADOR-EMENTA-004";

export interface SampleSyllabus {
  title: string;
  syllabusText: string;
  competencyText: string;
  groups: { title: string; items: string[] }[];
}

export const POO: SampleSyllabus = {
  title: "Object-Oriented Programming",
  syllabusText:
    "Exploração dos princípios da programação orientada a objetos, com ênfase em classes, objetos, " +
    "encapsulamento, herança e polimorfismo, e na aplicação desses conceitos no projeto e na " +
    "implementação de sistemas de software modulares, reutilizáveis e de fácil manutenção. " +
    `Frase de controle ${SYLLABUS_MARKER}.`,
  competencyText:
    "Capacitar os alunos a projetar e implementar soluções de software com os princípios da " +
    "programação orientada a objetos, aplicando boas práticas de design, padrões de projeto e " +
    "testes unitários na construção de sistemas robustos e extensíveis.",
  groups: [
    {
      title: "Fundamentos de POO",
      items: [
        "Conceitos de classes, objetos e métodos",
        "Encapsulamento, herança e polimorfismo",
        "Associações e composição de objetos",
        "Diferença entre programação estruturada e orientada a objetos",
      ],
    },
    {
      title: "Padrões de Design em POO",
      items: [
        "Princípios de design orientado a objetos (SOLID)",
        "Aplicação de padrões de projeto em POO",
        "Design para reutilização e extensibilidade",
        "Refatoração de código orientado a objetos",
      ],
    },
    {
      title: "POO em Ambientes Reais",
      items: [
        "Persistência de objetos com ORM",
        "Gerenciamento de exceções e erros",
        "Introdução a bibliotecas para POO",
        "Integração de testes unitários",
      ],
    },
    {
      title: "Práticas de Implementação",
      items: [
        "Modularização e organização de código",
        "Controle de acesso com modificadores",
        "Desenvolvimento de hierarquias de classes",
        "Manutenção e documentação",
      ],
    },
  ],
};

/** Section labels as they appear in the sample documents (research E10). */
const SECTION = { syllabus: "Ementa", competency: "Competência", objects: "Objetos de Aprendizagem" };

/** The `SyllabusExtraction` (http-api.md) that extractor version 1 must produce for `POO`. */
export function expectedExtraction(syllabus: SampleSyllabus = POO) {
  return {
    extractorVersion: 1,
    title: syllabus.title,
    syllabusText: syllabus.syllabusText,
    competencyText: syllabus.competencyText,
    groups: syllabus.groups.map((group) => ({ title: group.title, items: [...group.items] })),
  };
}

// ── Byte helpers ──────────────────────────────────────────────────────────────────────────

function concat(parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

const ascii = (text: string) => Uint8Array.from(text, (char) => char.charCodeAt(0));

function u32be(value: number): Uint8Array {
  return Uint8Array.of(value >>> 24, (value >>> 16) & 0xff, (value >>> 8) & 0xff, value & 0xff);
}

const u16be = (value: number) => Uint8Array.of(value >>> 8, value & 0xff);

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = CRC_TABLE[(crc ^ byte) & 0xff]! ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

/** A grey page with dark bars where lines of text would be: a "photo" of a syllabus. */
function scanPixels(width: number, height: number): Uint8Array {
  const pixels = new Uint8Array(width * height).fill(0xf2);
  for (let line = 0; line < 12; line++) {
    const top = 14 + line * 15;
    const length = width - 40 - ((line * 37) % 90);
    for (let y = top; y < top + 6 && y < height; y++) {
      for (let x = 20; x < 20 + length; x++) pixels[y * width + x] = 0x30;
    }
  }
  return pixels;
}

// ── PDF ───────────────────────────────────────────────────────────────────────────────────

/** WinAnsiEncoding bytes of a PDF string literal, with `\`, `(` and `)` escaped. */
function pdfString(text: string): Uint8Array {
  const extra: Record<string, number> = { "•": 0x95, "–": 0x96, "—": 0x97 };
  const bytes: number[] = [0x28];
  for (const char of text) {
    const code = char.codePointAt(0)!;
    const byte = code < 0x80 || (code >= 0xa0 && code <= 0xff) ? code : extra[char];
    if (byte === undefined) throw new Error(`character outside WinAnsiEncoding: ${char}`);
    if (byte === 0x28 || byte === 0x29 || byte === 0x5c) bytes.push(0x5c);
    bytes.push(byte);
  }
  bytes.push(0x29);
  return Uint8Array.from(bytes);
}

function pdfStream(dictionary: string, data: Uint8Array): Uint8Array {
  return concat([ascii(`<< ${dictionary} /Length ${data.length} >>\nstream\n`), data, ascii("\nendstream")]);
}

/** Serializes objects 1..n (object 1 is the catalog) with a correct cross-reference table. */
export function pdfFile(objects: Uint8Array[]): Uint8Array {
  const parts: Uint8Array[] = [ascii("%PDF-1.7\n"), Uint8Array.of(0x25, 0xe2, 0xe3, 0xcf, 0xd3, 0x0a)];
  let offset = parts.reduce((sum, part) => sum + part.length, 0);
  const offsets: number[] = [];
  objects.forEach((body, index) => {
    const object = concat([ascii(`${index + 1} 0 obj\n`), body, ascii("\nendobj\n")]);
    offsets.push(offset);
    parts.push(object);
    offset += object.length;
  });
  const xref = [`xref\n0 ${objects.length + 1}\n`, "0000000000 65535 f \n"];
  for (const position of offsets) xref.push(`${String(position).padStart(10, "0")} 00000 n \n`);
  xref.push(`trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${offset}\n%%EOF\n`);
  parts.push(ascii(xref.join("")));
  return concat(parts);
}

export interface PdfLine {
  text: string;
  bold?: boolean;
  size?: number;
  indent?: number;
  /** Extra space above the line, in points. */
  gap?: number;
}

/** Splits a paragraph at spaces so that no line is longer than `width` characters. */
export function wrap(text: string, width = 88): string[] {
  const lines: string[] = [];
  let current = "";
  for (const word of text.split(" ")) {
    if (current && current.length + 1 + word.length > width) {
      lines.push(current);
      current = word;
    } else {
      current = current ? `${current} ${word}` : word;
    }
  }
  if (current) lines.push(current);
  return lines;
}

export function syllabusLines(syllabus: SampleSyllabus = POO): PdfLine[] {
  return [
    { text: syllabus.title, bold: true, size: 16 },
    { text: SECTION.syllabus, bold: true, size: 12, gap: 10 },
    ...wrap(syllabus.syllabusText).map((text) => ({ text })),
    { text: SECTION.competency, bold: true, size: 12, gap: 10 },
    ...wrap(syllabus.competencyText).map((text) => ({ text })),
    { text: SECTION.objects, bold: true, size: 12, gap: 10 },
    ...syllabus.groups.flatMap((group, index) => [
      { text: `${index + 1}. ${group.title}`, bold: true, gap: 4 },
      ...group.items.map((item) => ({ text: `• ${item}`, indent: 16 })),
    ]),
  ];
}

/** A text PDF (Helvetica, WinAnsiEncoding, A4), one page per entry of `pages`. */
export function textPdf(pages: PdfLine[][]): Uint8Array {
  const pageIds = pages.map((_, index) => 5 + index * 2);
  const objects: Uint8Array[] = [
    ascii("<< /Type /Catalog /Pages 2 0 R >>"),
    ascii(`<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pages.length} >>`),
    ascii("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>"),
    ascii("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>"),
  ];
  for (const [index, lines] of pages.entries()) {
    const content: Uint8Array[] = [];
    let y = 790;
    for (const line of lines) {
      const size = line.size ?? 11;
      y -= (line.gap ?? 0) + size + 5;
      const font = line.bold ? "F2" : "F1";
      content.push(ascii(`BT /${font} ${size} Tf ${56 + (line.indent ?? 0)} ${y} Td `), pdfString(line.text), ascii(" Tj ET\n"));
    }
    objects.push(
      ascii(
        `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] ` +
          `/Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${pageIds[index]! + 1} 0 R >>`,
      ),
      pdfStream("", concat(content)),
    );
  }
  return pdfFile(objects);
}

/** A PDF whose only page is an image: no text to extract (a scanned syllabus). */
function scannedPdf(): Uint8Array {
  const width = 300;
  const height = 200;
  const image = zlibSync(scanPixels(width, height), { level: 9 });
  return pdfFile([
    ascii("<< /Type /Catalog /Pages 2 0 R >>"),
    ascii("<< /Type /Pages /Kids [3 0 R] /Count 1 >>"),
    ascii(
      "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] " +
        "/Resources << /XObject << /Im1 5 0 R >> >> /Contents 4 0 R >>",
    ),
    pdfStream("", ascii("q 480 0 0 320 56 450 cm /Im1 Do Q\n")),
    pdfStream(
      `/Type /XObject /Subtype /Image /Width ${width} /Height ${height} /ColorSpace /DeviceGray /BitsPerComponent 8 /Filter /FlateDecode`,
      image,
    ),
  ]);
}

// ── PNG and JPEG ──────────────────────────────────────────────────────────────────────────

function pngChunk(type: string, data: Uint8Array): Uint8Array {
  const typed = concat([ascii(type), data]);
  return concat([u32be(data.length), typed, u32be(crc32(typed))]);
}

/** A greyscale PNG; `rows` are the raw scanlines, each already packed at `bitDepth`. */
export function png(width: number, height: number, bitDepth: 1 | 8, rows: (y: number) => Uint8Array): Uint8Array {
  const scanlines: Uint8Array[] = [];
  for (let y = 0; y < height; y++) scanlines.push(Uint8Array.of(0), rows(y));
  const header = concat([u32be(width), u32be(height), Uint8Array.of(bitDepth, 0, 0, 0, 0)]);
  return concat([
    Uint8Array.of(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a),
    pngChunk("IHDR", header),
    pngChunk("IDAT", zlibSync(concat(scanlines), { level: 9 })),
    pngChunk("IEND", new Uint8Array(0)),
  ]);
}

function jpegSegment(marker: number, payload: Uint8Array): Uint8Array {
  return concat([Uint8Array.of(0xff, marker), u16be(payload.length + 2), payload]);
}

/**
 * A baseline greyscale JPEG of a flat mid-grey image. Every 8×8 block has DC difference 0
 * (code `00` of the standard luminance DC table) and only end-of-block (code `0` of a
 * one-symbol AC table), so the scan is 3 zero bits per block.
 */
export function jpeg(width: number, height: number): Uint8Array {
  if (width % 8 || height % 8) throw new Error("jpeg(): width and height must be multiples of 8");
  const blocks = (width / 8) * (height / 8);
  const dcCounts = [0, 1, 5, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0];
  const acCounts = [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
  return concat([
    Uint8Array.of(0xff, 0xd8),
    jpegSegment(0xe0, concat([ascii("JFIF\0"), Uint8Array.of(1, 1, 0, 0, 1, 0, 1, 0, 0)])),
    jpegSegment(0xdb, concat([Uint8Array.of(0), new Uint8Array(64).fill(1)])),
    jpegSegment(0xc0, concat([Uint8Array.of(8), u16be(height), u16be(width), Uint8Array.of(1, 1, 0x11, 0)])),
    jpegSegment(0xc4, Uint8Array.from([0x00, ...dcCounts, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11])),
    jpegSegment(0xc4, Uint8Array.from([0x10, ...acCounts, 0x00])),
    jpegSegment(0xda, Uint8Array.of(1, 1, 0x00, 0, 63, 0)),
    new Uint8Array(Math.ceil((blocks * 3) / 8)),
    Uint8Array.of(0xff, 0xd9),
  ]);
}

// ── DOCX ──────────────────────────────────────────────────────────────────────────────────

const W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
const XML = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';

const escapeXml = (text: string) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export function paragraph(text: string, options: { style?: string; level?: number } = {}): string {
  const props: string[] = [];
  if (options.style) props.push(`<w:pStyle w:val="${options.style}"/>`);
  if (options.level !== undefined) props.push(`<w:numPr><w:ilvl w:val="${options.level}"/><w:numId w:val="1"/></w:numPr>`);
  const pPr = props.length ? `<w:pPr>${props.join("")}</w:pPr>` : "";
  return `<w:p>${pPr}<w:r><w:t xml:space="preserve">${escapeXml(text)}</w:t></w:r></w:p>`;
}

function syllabusBody(syllabus: SampleSyllabus): string {
  return [
    paragraph(syllabus.title, { style: "Title" }),
    paragraph(SECTION.syllabus, { style: "Heading1" }),
    paragraph(syllabus.syllabusText),
    paragraph(SECTION.competency, { style: "Heading1" }),
    paragraph(syllabus.competencyText),
    paragraph(SECTION.objects, { style: "Heading1" }),
    ...syllabus.groups.flatMap((group) => [
      paragraph(group.title, { style: "ListParagraph", level: 0 }),
      ...group.items.map((item) => paragraph(item, { style: "ListParagraph", level: 1 })),
    ]),
  ].join("");
}

/** The package parts of a DOCX whose `word/document.xml` body is `body` (paragraphs from `paragraph`). */
function docxParts(body: string): Record<string, string> {
  const style = (id: string, name: string, bold: boolean) =>
    `<w:style w:type="paragraph" w:styleId="${id}"><w:name w:val="${name}"/>` +
    `${bold ? "<w:rPr><w:b/></w:rPr>" : ""}</w:style>`;
  const level = (ilvl: number, format: string, text: string) =>
    `<w:lvl w:ilvl="${ilvl}"><w:start w:val="1"/><w:numFmt w:val="${format}"/><w:lvlText w:val="${text}"/>` +
    `<w:pPr><w:ind w:left="${360 * (ilvl + 1)}" w:hanging="360"/></w:pPr></w:lvl>`;
  const rel = (id: string, type: string, target: string) =>
    `<Relationship Id="${id}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/${type}" Target="${target}"/>`;
  const wordType = (part: string) => `application/vnd.openxmlformats-officedocument.wordprocessingml.${part}+xml`;

  return {
    "[Content_Types].xml":
      `${XML}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
      '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
      '<Default Extension="xml" ContentType="application/xml"/>' +
      `<Override PartName="/word/document.xml" ContentType="${wordType("document.main")}"/>` +
      `<Override PartName="/word/styles.xml" ContentType="${wordType("styles")}"/>` +
      `<Override PartName="/word/numbering.xml" ContentType="${wordType("numbering")}"/>` +
      "</Types>",
    "_rels/.rels":
      `${XML}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
      `${rel("rId1", "officeDocument", "word/document.xml")}</Relationships>`,
    "word/_rels/document.xml.rels":
      `${XML}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
      `${rel("rId1", "styles", "styles.xml")}${rel("rId2", "numbering", "numbering.xml")}</Relationships>`,
    "word/document.xml": `${XML}<w:document xmlns:w="${W}"><w:body>${body}</w:body></w:document>`,
    "word/styles.xml":
      `${XML}<w:styles xmlns:w="${W}">${style("Title", "Title", true)}${style("Heading1", "heading 1", true)}` +
      `${style("ListParagraph", "List Paragraph", false)}</w:styles>`,
    "word/numbering.xml":
      `${XML}<w:numbering xmlns:w="${W}"><w:abstractNum w:abstractNumId="0">` +
      `${level(0, "decimal", "%1.")}${level(1, "bullet", "•")}</w:abstractNum>` +
      '<w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num></w:numbering>',
  };
}

/** Fixed entry time; the zip's DOS timestamps are local time, so `main` pins TZ to UTC. */
const ZIP_MTIME = new Date("2026-01-01T00:00:00Z");

/** A DOCX of `syllabus`, plus `extra` entries appended after the regular parts. */
export function docx(syllabus: SampleSyllabus = POO, extra: Record<string, Uint8Array> = {}): Uint8Array {
  return docxFromBody(syllabusBody(syllabus), extra);
}

/** A DOCX with any body built from `paragraph` (the 007 golden documents). */
export function docxFromBody(body: string, extra: Record<string, Uint8Array> = {}): Uint8Array {
  const files: Zippable = {};
  for (const [path, text] of Object.entries(docxParts(body))) files[path] = strToU8(text);
  Object.assign(files, extra);
  return zipSync(files, { level: 6, mtime: ZIP_MTIME });
}

// ── The fixture set ───────────────────────────────────────────────────────────────────────

/** Header of an OLE compound file (legacy Office format, used by encrypted DOCX files). */
const OLE_SIGNATURE = Uint8Array.of(0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1);

function oleFile(): Uint8Array {
  const file = new Uint8Array(1024);
  file.set(OLE_SIGNATURE);
  return file;
}

function windowsExecutable(): Uint8Array {
  const file = new Uint8Array(512);
  file.set(ascii("MZ"));
  file.set(Uint8Array.of(0x90, 0x00, 0x03), 2);
  file.set(ascii("This program cannot be run in DOS mode.\r\n"), 0x4e);
  return file;
}

export function buildFixtures(): Record<string, Uint8Array> {
  const scan = scanPixels(300, 200);
  const ementaPng = png(300, 200, 8, (y) => scan.subarray(y * 300, (y + 1) * 300));
  const ementaJpg = jpeg(320, 200);
  const pooPdf = textPdf([syllabusLines()]);

  const manyEntries: Record<string, Uint8Array> = {};
  for (let index = 1; index <= 1000; index++) manyEntries[`customXml/item${index}.xml`] = strToU8(`${XML}<item/>`);

  // Header, a catalog cut in half and bytes that are no PDF syntax: no xref, trailer or page tree.
  const corrupted = concat([ascii("%PDF-1.7\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R"), new Uint8Array(256).fill(0xa5)]);

  return {
    "poo.pdf": pooPdf,
    "poo.docx": docx(),
    "escaneado.pdf": scannedPdf(),
    "ementa.png": ementaPng,
    "ementa.jpg": ementaJpg,
    "executavel.pdf": windowsExecutable(),
    "imagem.docx": ementaPng,
    "macro.docx": docx(POO, { "word/vbaProject.bin": oleFile() }),
    "bomba.docx": docx(POO, { "word/media/bomba.bin": new Uint8Array(51 * 1024 * 1024) }),
    "muitas-entradas.docx": docx(POO, manyEntries),
    "truncado.jpg": ementaJpg.subarray(0, ementaJpg.length - 2),
    "corrompido.pdf": corrupted,
    "ole.docx": oleFile(),
    // 8000 × 6000 = 48 MP > MAX_IMAGE_PIXELS; 1 bit per pixel keeps the file small.
    "gigante.png": png(8000, 6000, 1, () => new Uint8Array(1000)),
    "dez-paginas.pdf": textPdf(Array.from({ length: 10 }, () => syllabusLines())),
    "poo.expected.json": strToU8(`${JSON.stringify(expectedExtraction(), null, 2)}\n`),
  };
}

function main(): void {
  process.env.TZ = "UTC";
  const directory = resolve("test/fixtures/syllabus");
  mkdirSync(directory, { recursive: true });
  for (const [name, bytes] of Object.entries(buildFixtures())) {
    writeFileSync(resolve(directory, name), bytes);
    console.log(`${name}\t${bytes.length} bytes`);
  }
}

if (process.argv[1]?.endsWith("build-fixtures.ts")) main();
