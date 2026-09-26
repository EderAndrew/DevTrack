import type { SyllabusExtraction, SyllabusExtractionResult, SyllabusMediaType } from "@repo/contracts";
import type { InspectionResult } from "../syllabus-file-inspector";
import type { NormalizedBlock } from "./normalize";

/** Messages between the API and the reading worker thread (contracts/syllabus-processing.md). */
export type WorkerRequest =
  | { task: "inspect"; bytes: ArrayBuffer; declaredMediaType: string; extension: string }
  | { task: "extract"; bytes: ArrayBuffer; mediaType: SyllabusMediaType }
  /** 007 research C11: the document's blocks with their references, for the Curriculum Agent. */
  | { task: "normalize"; bytes: ArrayBuffer; mediaType: "PDF" | "DOCX" };

export type InspectResponse = InspectionResult;

export type ExtractResponse =
  | { ok: true; result: SyllabusExtractionResult; extraction: SyllabusExtraction }
  | { ok: false; category: "UNREADABLE" | "INTERNAL" };

export type NormalizeResponse = { ok: true; blocks: NormalizedBlock[] } | { ok: false };
