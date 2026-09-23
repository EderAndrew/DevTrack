import { z } from "zod";
import { IsoDateTimeSchema, UuidSchema } from "../common/primitives.js";

// `GET /me/classes`: the student's active enrollments, most recent first (003 contracts/http-api.md).

export const MyClassViewSchema = z.strictObject({
  id: UuidSchema,
  name: z.string(),
  code: z.string(),
  academicYear: z.int(),
  period: z.string().nullable(),
  teacherName: z.string(),
  enrolledAt: IsoDateTimeSchema,
});
export type MyClassView = z.infer<typeof MyClassViewSchema>;

export const MyClassListSchema = z.strictObject({ items: z.array(MyClassViewSchema) });
export type MyClassList = z.infer<typeof MyClassListSchema>;
