import type { SyllabusMediaType } from "@repo/contracts";

const MAX_LENGTH = 255;

const DEFAULT_EXTENSION: Record<SyllabusMediaType, string> = { PDF: "pdf", DOCX: "docx", PNG: "png", JPEG: "jpg" };

/** Control characters and invisible formatting (bidi overrides, zero-width…), research E6. */
const INVISIBLE = /[\p{Cc}\p{Cf}]/gu;

/**
 * The name shown back to the teacher (research E6, 004/US2-4). Only the last path segment,
 * whether the client used `/` or `\`, without control or bidi characters, NFC, at most 255
 * characters (the extension is kept when cutting). Never used as a path: files are stored under
 * a server-generated key.
 */
export function sanitizeOriginalFilename(name: string, mediaType: SyllabusMediaType): string {
  const base = (name.split(/[/\\]/).pop() ?? "").normalize("NFC").replace(INVISIBLE, "").trim();
  if (!base || /^\.+$/.test(base)) return `ementa.${DEFAULT_EXTENSION[mediaType]}`;

  const chars = Array.from(base);
  if (chars.length <= MAX_LENGTH) return base;
  const dot = base.lastIndexOf(".");
  const extension = dot > 0 ? Array.from(base.slice(dot)) : [];
  if (extension.length === 0 || extension.length >= MAX_LENGTH / 2) return chars.slice(0, MAX_LENGTH).join("");
  return [...chars.slice(0, MAX_LENGTH - extension.length), ...extension].join("");
}

/** Lower-case extension of the name's last segment, with the dot (`""` without one). */
export function fileExtension(name: string): string {
  const base = (name.split(/[/\\]/).pop() ?? "").replace(INVISIBLE, "").trim();
  const dot = base.lastIndexOf(".");
  return dot > 0 ? base.slice(dot).toLowerCase() : "";
}
