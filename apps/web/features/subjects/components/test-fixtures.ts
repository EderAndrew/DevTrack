import type { ClassView, SubjectView } from "@repo/contracts";

export const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
export const apiError = (status: number, code: string, message: string) =>
  json(status, { statusCode: status, code, message });

let sequence = 0;

/** A `SubjectView` of the contract for the web tests. */
export const subjectView = (name: string, overrides: Partial<SubjectView> = {}): SubjectView => {
  sequence += 1;
  return {
    id: `00000000-0000-4000-8000-${String(sequence).padStart(12, "0")}`,
    name,
    description: null,
    status: "ACTIVE",
    classCount: 0,
    documentCount: 0,
    createdAt: "2026-09-23T12:00:00.000Z",
    updatedAt: "2026-09-23T12:00:00.000Z",
    ...overrides,
  };
};

/** A `ClassView` of the contract for the web tests. */
export const classView = (name: string, overrides: Partial<ClassView> = {}): ClassView => {
  sequence += 1;
  return {
    id: `00000000-0000-4000-9000-${String(sequence).padStart(12, "0")}`,
    name,
    code: `T-${sequence}`,
    academicYear: 2026,
    period: null,
    description: null,
    status: "ACTIVE",
    activeStudentCount: 0,
    subject: null,
    startsOn: null,
    endsOn: null,
    plannable: false,
    planStatus: null,
    createdAt: "2026-09-23T12:00:00.000Z",
    updatedAt: "2026-09-23T12:00:00.000Z",
    ...overrides,
  };
};
