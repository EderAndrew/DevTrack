# HTTP API: Calendário com tipos de data (031)

Schemas in `packages/contracts/src/curriculum/class-meetings.ts` (teacher) and `packages/contracts/src/me/calendar.ts`
(student); both cataloged in `endpoints.ts`.

## Shared

```ts
MeetingKindSchema    = z.enum(["CLASS", "EXAM", "ASSIGNMENT", "REVIEW", "MAKEUP"])
CalendarDayKindSchema = z.enum(["HOLIDAY", "RECESS", "SPECIAL_EVENT", "TEACHER_ABSENCE"])
DayKindSchema        = z.enum([...meeting kinds, ...calendar day kinds])   // nine values
DescriptionSchema    = trimmed string, 1–120 code points, no NUL
AbsenceReasonSchema  = trimmed string, 1–500 code points, no NUL
AbsenceNoticeSchema  = trimmed string, ≤ 200 code points, no NUL; "" → null
```

## `GET /classes/:id/meetings` (changed: two fields and `days`)

Permission and context as in 004 (`planejamento.visualizar`, the teacher's own class, else `404`).

```json
{
  "items": [
    { "id": "…", "date": "2026-11-16", "number": 12, "status": "PLANNED", "topicCount": 2,
      "kind": "EXAM", "description": "P1 — Herança e polimorfismo" }
  ],
  "days": [
    { "date": "2026-11-20", "kind": "HOLIDAY", "description": "Consciência Negra", "absenceReason": null, "absenceNotice": null },
    { "date": "2026-11-25", "kind": "TEACHER_ABSENCE", "description": null, "absenceReason": "Consulta médica", "absenceNotice": "Atividade no portal." }
  ],
  "total": 17,
  "planRevision": 8
}
```

- `items`/`total`/`number`: meetings only (FR-002). `kind = CLASS` ⇒ `description: null`.
- `days`: ordered by date; the teacher's own view (the reason is shown only here).

## `PUT /classes/:id/meetings` (changed: `set`)

Permission `calendario.gerenciar`, context and `planRevision` concurrency as in 004.

```json
{
  "planRevision": 8,
  "add": ["2026-12-02"],
  "set": [
    { "date": "2026-11-16", "kind": "EXAM", "description": "P1 — Herança e polimorfismo" },
    { "date": "2026-11-18", "kind": "TEACHER_ABSENCE", "absenceReason": "Consulta médica", "absenceNotice": "Atividade no portal." },
    { "date": "2026-11-20", "kind": "HOLIDAY", "description": "Consciência Negra" },
    { "date": "2026-11-23", "kind": "CLASS" }
  ],
  "remove": ["2026-11-30"],
  "resolutions": [{ "topicId": "…", "action": "MOVE", "meetingDate": "2026-12-02" }]
}
```

- `set` items: strict discriminated union by `kind` — `CLASS` has only `date`; the seven described kinds need
  `description`; `TEACHER_ABSENCE` needs `absenceReason` and may have `absenceNotice`. Max 400 entries (a date at most
  once). `set` defaults to `[]`, so a 004 body without it is valid.
- A date in more than one of `add`/`set`/`remove` → `400 VALIDATION_ERROR`. `add` of a date that is a non-meeting day →
  `400`.
- Every date of `add`/`set` inside the class period → else `422 MEETING_OUT_OF_PERIOD` (as today).
- Meetings after the save > 200 → `422 TOO_MANY_MEETINGS` (as today).
- A meeting that leaves the meeting condition (by `remove` or a `set` with a non-meeting kind) with non-archived topics not
  all resolved → `409 MEETING_HAS_TOPICS`, nothing changes; a completed topic only `ARCHIVE` (as today).
- A `MOVE` resolution must target a date that is a meeting after the save (a non-meeting day → `400`).
- Response: the `GET` body after the save.
- Errors otherwise as in 004 (`404` another teacher's class, `409 PLAN_REVISION_CONFLICT`, archived class refused).

## `PATCH /classes/:id` — period change (changed behavior only)

Unchanged body/response. Meetings outside the new period still `409 MEETINGS_OUTSIDE_PERIOD`; `class_calendar_days`
outside it (all, when the dates are cleared) are deleted in the same transaction (CK5).

## `GET /me/classes/:classId/calendar` (new)

- Permission `calendario.turma.visualizar`. `classId` a UUID (else `400` before any query). The student must have an
  ACTIVE enrollment in the turma of that class (027), checked before any read; otherwise `404 NOT_FOUND` with the same
  body for another turma, an ended enrollment or an unknown class. No query parameters.
- Response `StudentCalendarSchema` (strict):

```json
{
  "class": { "id": "…", "subjectName": "Programação Orientada a Objetos", "teacherName": "Ricardo Mendes",
             "startsOn": "2026-08-03", "endsOn": "2026-12-11" },
  "today": "2026-11-16",
  "days": [
    { "date": "2026-11-16", "kind": "CLASS", "text": null },
    { "date": "2026-11-18", "kind": "TEACHER_ABSENCE", "text": "Atividade no portal." },
    { "date": "2026-11-20", "kind": "HOLIDAY", "text": "Consciência Negra" }
  ]
}
```

- `days` merges meetings and non-meeting days, ordered by date. `text`: `null` on `CLASS`; the description on the seven
  described kinds; the notice (or `null`) on `TEACHER_ABSENCE`.
- `subjectName` falls back to the class name for a migrated class without subject (as 026/030); `startsOn`/`endsOn` may be
  `null` (no period: `days` is empty).
- Never: topics, meeting number or status, `absenceReason`, ids of days or topics, authors, times (SC-004).
- Not audited (read). `401`/`403` as usual (a teacher, manager or admin without the permission → `403`).
