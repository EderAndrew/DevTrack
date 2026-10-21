import { z } from "zod";

// Test cases of a CODE question, shared by the work bank (011), the exam bank (018) and the exercise
// bank (019 research B16), which never import each other.

/** A PRIVATE test case never reaches the student view. */
export const TestCaseVisibilitySchema = z.enum(["PUBLIC", "PRIVATE"]);
export type TestCaseVisibility = z.infer<typeof TestCaseVisibilitySchema>;
