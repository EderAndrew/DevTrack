import { z } from "zod";

// Student feedback to the platform (020 data-model.md). Platform concepts, fixed in code
// (constitution XXI); the labels live in the web.

/** What the feedback is about, chosen by the student (FR-003). */
export const FeedbackCategorySchema = z.enum(["PROBLEM", "SUGGESTION", "PRAISE", "OTHER"]);
export type FeedbackCategory = z.infer<typeof FeedbackCategorySchema>;

/** RECEIVED → IN_REVIEW → RESOLVED/ARCHIVED (FR-010); only the ADMIN moves it, never back to RECEIVED. */
export const FeedbackStatusSchema = z.enum(["RECEIVED", "IN_REVIEW", "RESOLVED", "ARCHIVED"]);
export type FeedbackStatus = z.infer<typeof FeedbackStatusSchema>;
