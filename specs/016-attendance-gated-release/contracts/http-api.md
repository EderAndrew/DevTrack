# HTTP API Contract: 016 — Lista de Chamada e Liberação do Trabalho aos Presentes

Shapes live in `packages/contracts/src/attendance/` (new) and in `src/activities/` (changed). They
are cataloged in `endpoints.ts`. Unsafe methods need `Origin` and `Content-Type: application/json`.
Bodies are strict: unknown fields → `400`.

## Changed 012/015 shapes

- **`CreateActivity`**: unchanged. `releaseMode` is set by the server (research M2), and sending it
  → `400`.
- **`TeacherActivitySummary` and `TeacherActivity`**: gain `releaseMode` and
  `attendance: { present: number, enrolled: number } | null`. It is null for `ALL_ENROLLED`.
- **`RosterStatus`**: gains `ABSENT`.
- **Roster row**: gains `markedAt: ISO | null` and
  `pauses: { count: number, secondsAway: number, open: boolean }`.
- **`StudentActivity`** (detail):
  - gains `pause: StudentPause | null`. While non-null, `questions` is `[]` and `attempt.answers` is
    `[]` (spec FR-013);
  - after the submission, gains `pauses: StudentPause[]` (own history, FR-021).
- **Errors**: `SaveAnswers`, `Submit`, the 015 events and the 015 help gain
  `409 ATTEMPT_PAUSED`.
- **`student_access.denied`** reasons gain `NOT_PRESENT`. The answer stays `404`.

## Teacher routes

| Method & path | Permission | Body → Response | Errors |
|---|---|---|---|
| `GET /classes/:classId/activities/:activityId/attendance` | `chamada.registrar` | → `Room` | 404; 409 `ATTENDANCE_NOT_REQUIRED` (`ALL_ENROLLED`) |
| `POST /classes/:classId/activities/:activityId/attendance` | `chamada.registrar` | `{ mark: uuid[0..200], unmark: uuid[0..200] }` (disjoint, not both empty) → `Room` | 404; 409 `ATTENDANCE_NOT_REQUIRED` / `ATTENDANCE_STARTED` (`details.studentUserIds`) / `ACTIVITY_CLOSED`; 422 `STUDENT_NOT_IN_CLASS` |
| `POST /classes/:classId/activities/:activityId/students/:studentUserId/pause` | `chamada.registrar` | `{}` → `201 TeacherPause` (an open one → `200`, the same) | 404; 409 `NOT_STARTED` / `ATTEMPT_ALREADY_SUBMITTED` / `ACTIVITY_CLOSED` / `ATTENDANCE_NOT_REQUIRED` |
| `POST /classes/:classId/activities/:activityId/pauses/:pauseId/release` | `chamada.registrar` | `{}` → `TeacherPause` (already released → `200`, unchanged) | 404; 409 `ACTIVITY_CLOSED` |
| `GET /classes/:classId/activities/:activityId/attempts/:attemptId/pauses` | `entregas.visualizar` | → `{ items: TeacherPause[], totalSecondsAway }` | 404 |

`Room` has this shape:

```text
{ releaseMode, present, enrolled,
  students: { studentUserId, name, markedAt|null, roomStatus, attemptId|null, openPause: TeacherPause|null }[] }
```

- `students` lists the ACTIVE enrollments by name.
- `roomStatus` is one of `NOT_MARKED`, `PRESENT`, `ANSWERING`, `OUT_OF_ROOM` and `SUBMITTED`.

`TeacherPause` has this shape:

```text
{ id, initiatedBy: "STUDENT"|"TEACHER", reason, note|null, startedAt,
  endedAt|null, endedBy: "RELEASE"|"ACCEPTED"|"ACTIVITY_CLOSED"|null, seconds }
```

`seconds` is derived, up to now when the pause is open.

## Student routes

| Method & path | Permission | Body → Response | Errors |
|---|---|---|---|
| `POST /me/activities/:activityId/attempt/pause` | `atividades.proprias.responder` | `{ reason: "BATHROOM"\|"WATER"\|"PHONE"\|"OTHER", note?: string(1..200, only OTHER) }` → `201 StudentPause` (an open one → `200`, the same) | 404; 409 `NOT_STARTED` / `ATTEMPT_ALREADY_SUBMITTED` / `ACTIVITY_CLOSED` / `ATTENDANCE_NOT_REQUIRED`; 429 |
| `GET /me/activities/:activityId/attempt/pause` | `atividades.proprias.visualizar` | → `{ pause: StudentPause \| null }` (polled, research M8) | 404 |

`StudentPause` has this shape:

```text
{ id, initiatedBy, reason, note|null, startedAt, endedAt|null }
```

The note is the student's own. The released-by user id is never sent.

Fields the server controls are refused in bodies with `400`:

- `markedAt` and `startedAt`;
- `releasedAt` / `endedAt`;
- `initiatedBy`, and `reason: "TEACHER"` on the student route;
- `releaseMode`, `studentUserId` on student routes, and `attemptId`.
