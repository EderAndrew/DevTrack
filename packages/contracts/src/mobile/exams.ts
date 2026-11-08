import { z } from "zod";
import { IsoDateTimeSchema, UuidSchema } from "../common/primitives.js";

// 024 (contracts/http-api.md, research Y10): `GET /mobile/exams`, the teacher's EXAM activities in
// progress (published, not closed, not cancelled, class not archived), by `closesAt`.

export const MobileExamListItemSchema = z.strictObject({
  activityId: UuidSchema,
  classId: UuidSchema,
  className: z.string(),
  title: z.string(),
  closesAt: IsoDateTimeSchema,
  muted: z.boolean(),
});
export type MobileExamListItem = z.infer<typeof MobileExamListItemSchema>;

export const MobileExamListSchema = z.strictObject({
  items: z.array(MobileExamListItemSchema),
  serverNow: IsoDateTimeSchema,
});
export type MobileExamList = z.infer<typeof MobileExamListSchema>;
