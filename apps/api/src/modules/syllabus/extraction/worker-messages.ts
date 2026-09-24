import type { SyllabusExtraction, SyllabusExtractionResult, SyllabusMediaType } from "@repo/contracts";
import type { InspectionResult } from "../syllabus-file-inspector";

/** Messages between the API and the reading worker thread (contracts/syllabus-processing.md). */
export type WorkerRequest =
  | { task: "inspect"; bytes: ArrayBuffer; declaredMediaType: string; extension: string }
  | { task: "extract"; bytes: ArrayBuffer; mediaType: SyllabusMediaType };

export type InspectResponse = InspectionResult;

export type ExtractResponse =
  | { ok: true; result: SyllabusExtractionResult; extraction: SyllabusExtraction }
  | { ok: false; category: "UNREADABLE" | "INTERNAL" };
