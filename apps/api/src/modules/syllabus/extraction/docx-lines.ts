import { XMLParser } from "fast-xml-parser";
import type { DocxPackage } from "./docx-package";
import type { SourceLine } from "./source-line";

/** A node of fast-xml-parser's `preserveOrder` output: `{tag: children, ":@": attributes}` or `{"#text": …}`. */
type XmlNode = Record<string, unknown>;

const ATTRIBUTES = ":@";
const TEXT = "#text";

/**
 * Entities and DTDs are never expanded (research E9: `processEntities: false`); the five XML
 * entities and character references are decoded by hand, and nothing else is.
 */
const parser = new XMLParser({
  preserveOrder: true,
  ignoreAttributes: false,
  attributeNamePrefix: "",
  processEntities: false,
  htmlEntities: false,
  ignoreDeclaration: true,
  ignorePiTags: true,
  parseTagValue: false,
  parseAttributeValue: false,
  trimValues: false,
});

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };

function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (whole, entity: string) => {
    if (entity[0] !== "#") return ENTITIES[entity.toLowerCase()] ?? whole;
    const code = entity[1] === "x" || entity[1] === "X" ? Number.parseInt(entity.slice(2), 16) : Number.parseInt(entity.slice(1), 10);
    return Number.isInteger(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : "";
  });
}

const tagOf = (node: XmlNode) => Object.keys(node).find((key) => key !== ATTRIBUTES);
const childrenOf = (node: XmlNode): XmlNode[] => {
  const tag = tagOf(node);
  const value = tag ? node[tag] : undefined;
  return Array.isArray(value) ? (value as XmlNode[]) : [];
};
const attr = (node: XmlNode, name: string): string | undefined =>
  (node[ATTRIBUTES] as Record<string, string> | undefined)?.[name];
const child = (node: XmlNode, tag: string) => childrenOf(node).find((item) => tagOf(item) === tag);

function* descendants(nodes: XmlNode[], tag: string, stopAt: string = tag): Generator<XmlNode> {
  for (const node of nodes) {
    const name = tagOf(node);
    if (name === tag) yield node;
    if (name !== stopAt) yield* descendants(childrenOf(node), tag, stopAt);
  }
}

const HEADING_STYLE = /^(title|subtitle|heading\s*\d*|t[ií]tulo\s*\d*|subt[ií]tulo)$/i;

interface Style {
  heading: boolean;
  bold: boolean;
}

function readStyles(xml: string | undefined): Map<string, Style> {
  const styles = new Map<string, Style>();
  if (!xml) return styles;
  for (const style of descendants(parser.parse(xml) as XmlNode[], "w:style")) {
    const id = attr(style, "w:styleId");
    if (!id) continue;
    const name = attr(child(style, "w:name") ?? {}, "w:val") ?? "";
    const rPr = child(style, "w:rPr");
    styles.set(id, { heading: HEADING_STYLE.test(id) || HEADING_STYLE.test(name), bold: rPr ? isOn(child(rPr, "w:b")) : false });
  }
  return styles;
}

/** `numId` → level → number format (`decimal`, `bullet`, `lowerLetter`…). */
function readNumbering(xml: string | undefined): Map<string, Map<number, string>> {
  const formats = new Map<string, Map<number, string>>();
  if (!xml) return formats;
  const root = parser.parse(xml) as XmlNode[];
  const abstract = new Map<string, Map<number, string>>();
  for (const definition of descendants(root, "w:abstractNum")) {
    const levels = new Map<number, string>();
    for (const level of descendants(childrenOf(definition), "w:lvl")) {
      levels.set(Number(attr(level, "w:ilvl") ?? 0), attr(child(level, "w:numFmt") ?? {}, "w:val") ?? "decimal");
    }
    abstract.set(attr(definition, "w:abstractNumId") ?? "", levels);
  }
  for (const num of descendants(root, "w:num")) {
    const levels = abstract.get(attr(child(num, "w:abstractNumId") ?? {}, "w:val") ?? "");
    if (levels) formats.set(attr(num, "w:numId") ?? "", levels);
  }
  return formats;
}

/** `<w:b/>` or `<w:b w:val="true"/>`; `w:val="0"`/`"false"` turns it off. */
function isOn(node: XmlNode | undefined): boolean {
  if (!node) return false;
  const value = attr(node, "w:val");
  return value === undefined || !["0", "false", "off"].includes(value.toLowerCase());
}

/** Formats that read as a sub-item marker ("a)", "•") even on the first level (research E10). */
const ITEM_FORMATS = new Set(["bullet", "lowerLetter", "none"]);

/**
 * Paragraphs of `word/document.xml` in reading order (tables included), research E10: the list
 * level comes from `w:numPr/w:ilvl` and `numbering.xml`, headings from `w:pStyle`.
 */
export function docxLines(docx: DocxPackage): SourceLine[] {
  const document = docx.parts["word/document.xml"];
  if (!document) return [];
  const styles = readStyles(docx.parts["word/styles.xml"]);
  const numbering = readNumbering(docx.parts["word/numbering.xml"]);

  const lines: SourceLine[] = [];
  for (const paragraph of descendants(parser.parse(document) as XmlNode[], "w:p")) {
    const pPr = child(paragraph, "w:pPr");
    const style = styles.get(attr(child(pPr ?? {}, "w:pStyle") ?? {}, "w:val") ?? "");

    const runs = [...descendants(childrenOf(paragraph), "w:r")];
    let text = "";
    let allBold = runs.length > 0;
    for (const run of runs) {
      let runText = "";
      for (const part of childrenOf(run)) {
        const tag = tagOf(part);
        if (tag === "w:t") runText += childrenOf(part).map((node) => String(node[TEXT] ?? "")).join("");
        else if (tag === "w:tab" || tag === "w:br" || tag === "w:cr") runText += " ";
      }
      if (runText.trim() && !isOn(child(child(run, "w:rPr") ?? {}, "w:b")) && !style?.bold) allBold = false;
      text += runText;
    }
    text = decodeEntities(text).replace(/\s+/g, " ").trim();
    if (!text) continue;

    lines.push({
      text,
      emphasis: Boolean(style?.heading) || allBold,
      list: listKind(pPr, numbering),
      wraps: false,
    });
  }
  return lines;
}

function listKind(pPr: XmlNode | undefined, numbering: Map<string, Map<number, string>>): SourceLine["list"] {
  const numPr = pPr ? child(pPr, "w:numPr") : undefined;
  if (!numPr) return null;
  const numId = attr(child(numPr, "w:numId") ?? {}, "w:val") ?? "";
  if (numId === "0") return null; // numbering explicitly removed
  const level = Number(attr(child(numPr, "w:ilvl") ?? {}, "w:val") ?? 0);
  const format = numbering.get(numId)?.get(level) ?? "decimal";
  return level > 0 || ITEM_FORMATS.has(format) ? "item" : "group";
}
