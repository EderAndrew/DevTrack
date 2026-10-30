# HTTP API Contract: 023 — Trabalho individual ou em grupo

Shapes live in `packages/contracts/src/activities/` (the group shapes in a new `activities/group.ts`), cataloged in
`endpoints.ts`. Unsafe methods need `Origin` and `Content-Type: application/json`. Bodies are strict: unknown fields
→ `400`. Ids of leader, editor, group, attempt, times and sizes never come from a body.

## Teacher: apply and options (changed, 012/015/021 routes)

| Method & path | Permission | Change |
|---|---|---|
| `POST /classes/:classId/activities` | `atividades.aplicar` | ASSIGNMENT body: `groupSize: 2..5 \| null` (default `null` = Individual). EXERCISE and EXAM bodies refuse it (`400`). |
| `PATCH /classes/:classId/activities/:activityId` | `atividades.aplicar` | `groupSize?: 2..5 \| null`, ASSIGNMENT only (`400` otherwise). With an attempt in the activity → `409 ACTIVITY_ALREADY_STARTED`. An ASSIGNMENT applied before 016 (`ALL_ENROLLED`) → `422 GROUP_NEEDS_ATTENDANCE`. Audited by `activity.settings_changed`. |
| `GET` of a teacher activity (list, detail) | (012) | `TeacherActivitySummary`, `TeacherActivity` gain `groupSize: number \| null`. |
| `GET …/activities/:activityId/attempts` (roster) and `GET …/attempts/:attemptId` | `entregas.visualizar` | Each attempt gains `participants: { id, name, isLeader }[]` (the owner alone for an individual attempt) and `group: boolean`. |

## Teacher: group facts of an attempt (new)

| Method & path | Permission | Response | Errors |
|---|---|---|---|
| `GET /classes/:classId/activities/:activityId/attempts/:attemptId/group` | `entregas.visualizar` | `TeacherAttemptGroup` | 403; 404 (another teacher's class, another activity's attempt, an individual attempt) |

```ts
TeacherAttemptGroup = {
  leaderId: string;
  members: { id: string; name: string; joinedAt: string; addedById: string | null }[]; // leader first, then by joinedAt
  events: {                       // by occurredAt
    kind: "EDITING_HANDED" | "EDITING_TAKEN_BACK" | "EDITING_RETURNED" | "EDITING_RESET" | "LEADER_CHANGED";
    reason: "PAUSED" | "ACCESS_LOST" | null;
    actorId: string | null;       // null = the system settlement
    fromId: string; toId: string; occurredAt: string;
  }[];
  saves: { questionId: string; entries: { studentId: string; revision: number; savedAt: string }[] }[]; // by position, then revision
}
```

## Student: activity and attempt (changed, 012 routes)

| Method & path | Permission | Change |
|---|---|---|
| `GET /me/activities`, `GET /me/activities/:activityId` | `atividades.proprias.visualizar` | `StudentActivity` gains `groupSize: number \| null` and `group: StudentGroup \| null` (the caller's group in this activity). The attempt and its answers are the group's for every member; each answer gains `savedBy: { id, name }`. The result (012) is served to every participant under the 012 rules. |
| `POST /me/activities/:activityId/attempt` | `atividades.proprias.responder` | Group work: body `{ memberIds: uuid[] }` (1 to `groupSize − 1` distinct ids) or `{ alone: true }`; an empty body on a group work → `400`; either field on an individual work → `400`. Already a participant of an attempt 1 → `200` with it, nothing created. Unavailable members → `409 GROUP_MEMBERS_UNAVAILABLE` `{ unavailableIds }`, nothing created. |
| `PUT /me/activities/:activityId/attempt/answers` | `atividades.proprias.responder` | In a group: only the effective editor; otherwise `409 GROUP_NOT_EDITOR`. |
| `POST /me/activities/:activityId/attempt/submit` | `atividades.proprias.responder` | In a group: only the leader, holding the editing; otherwise `409 GROUP_NOT_LEADER` / `409 GROUP_NOT_EDITOR`. |
| `POST /me/activities/:activityId/attempt/help` (015) | `atividades.proprias.responder` | In a group: only the effective editor (`409 GROUP_NOT_EDITOR`); the cap of 3 is the attempt's (the group's). `GET` lists the attempt's helps to every member. |
| `POST /me/activities/:activityId/questions/:questionId/code-runs` (019/021) | `atividades.proprias.executar` | Any participant; the run is the caller's (pending and per-minute limits per student). |
| `/attempt/events`, `/attempt/integrity`, `/attempt/pause` (015/016) | (unchanged) | Per caller: each member records and reads only their own events and pause. |

```ts
StudentGroup = {
  groupSize: number;
  leader: { id: string; name: string };
  members: { id: string; name: string }[];      // every participant, leader included, by joinedAt
  editor: { id: string; name: string };         // effective editor
  myRole: "LEADER" | "MEMBER";
  canEdit: boolean;                              // caller is the effective editor and not paused
  addedBy: { id: string; name: string } | null; // for the notice; null for the leader
  freeSlots: number;
  version: number;
}
```

## Student: group routes (new)

| Method & path | Permission | Body | Response | Errors |
|---|---|---|---|---|
| `GET /me/activities/:activityId/group/candidates` | `atividades.proprias.visualizar` | — | `GroupCandidates` | 404 (not a group work, not visible to the caller); `409 GROUP_ALREADY_JOINED` (the caller already started alone or is in a group and is not its leader) |
| `POST /me/activities/:activityId/group/members` | `atividades.proprias.responder` | `{ memberIds: uuid[] }` (1 to `freeSlots`) | `StudentActivity` | `409 GROUP_NOT_LEADER`; `409 GROUP_FULL`; `409 GROUP_MEMBERS_UNAVAILABLE`; `409 INVALID_STATE_TRANSITION` (submitted, closed, cancelled) |
| `POST /me/activities/:activityId/group/editing` | `atividades.proprias.responder` | `{ action: "HAND", toUserId }` \| `{ action: "TAKE_BACK" }` \| `{ action: "RETURN" }` | `StudentActivity` | `409 GROUP_NOT_LEADER` (HAND, TAKE_BACK by a member); `409 GROUP_NOT_EDITOR` (RETURN by someone not editing, or by the leader); `422 GROUP_MEMBER_NOT_AVAILABLE` (HAND to a paused or inactive member, or to someone outside the group); `409 INVALID_STATE_TRANSITION`; `409 ATTEMPT_PAUSED` (the caller is paused) |

```ts
GroupCandidates = {
  groupSize: number;
  freeSlots: number;               // groupSize − 1 before the start; groupSize − participants after
  candidates: { id: string; name: string }[]; // eligible classmates (FR-005), by name
}
```

A HAND to the current editor answers `200` with no change. All group routes run `settleGroup` first (U9).

## Error codes (new)

| Code | Status | When |
|---|---|---|
| `GROUP_MEMBERS_UNAVAILABLE` | 409 | A chosen classmate is no longer eligible (body of the error: `unavailableIds`) |
| `GROUP_FULL` | 409 | Adding would pass `groupSize` |
| `GROUP_NOT_LEADER` | 409 | A leader-only action by a member |
| `GROUP_NOT_EDITOR` | 409 | A save, help or RETURN by someone who is not the effective editor |
| `GROUP_ALREADY_JOINED` | 409 | Candidates asked by a student who started alone or is a member |
| `GROUP_MEMBER_NOT_AVAILABLE` | 422 | HAND to a paused, inactive or foreign student |
| `GROUP_NEEDS_ATTENDANCE` | 422 | `groupSize` on a work without attendance (`ALL_ENROLLED`) |
