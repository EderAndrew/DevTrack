# Audit Events: 023

Metadata holds only ids, enums and counts — never a name, an answer, a statement or a note.

## New

| Type                             | Actor          | Target           | Metadata                                                                                                                                                                                      |
| -------------------------------- | -------------- | ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `activity_group.created`         | USER           | ACTIVITY_ATTEMPT | `activityId`, `attemptId`, `memberCount` (participants, leader included)                                                                                                                      |
| `activity_group.member_added`    | USER           | ACTIVITY_ATTEMPT | `activityId`, `attemptId`, `memberId` (one event per member, also the ones of the start)                                                                                                      |
| `activity_group.editing_changed` | USER \| SYSTEM | ACTIVITY_ATTEMPT | `activityId`, `attemptId`, `kind` (`EDITING_HANDED` \| `EDITING_TAKEN_BACK` \| `EDITING_RETURNED` \| `EDITING_RESET`), `reason` (`PAUSED` \| `ACCESS_LOST` \| null), `fromUserId`, `toUserId` |
| `activity_group.leader_changed`  | SYSTEM         | ACTIVITY_ATTEMPT | `activityId`, `attemptId`, `fromUserId`, `toUserId`, `reason` (`ACCESS_LOST`)                                                                                                                 |
| `activity_group.write_refused`   | USER           | ACTIVITY_ATTEMPT | `activityId`, `attemptId`, `operation` (`SAVE` \| `SUBMIT` \| `HELP` \| `ADD_MEMBERS` \| `EDITING`), `reason` (`NOT_EDITOR` \| `NOT_LEADER` \| `FULL` \| `MEMBERS_UNAVAILABLE`)               |

A change of the editing or an inclusion of members asked by a paused student is refused with `409 ATTEMPT_PAUSED`
and audited as the 016 `attempt_pause.write_refused` with `operation: "GROUP_EDITING"` or `"GROUP_MEMBERS"` (same
keys).

`created` and `member_added` are written by the leader; `editing_changed` by the student who changes the
editing, or SYSTEM for the settlement (U9); `write_refused` by the student refused.

## Changed

| Type                          | Metadata added                                                                                                        |
| ----------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `activity.published`          | `groupSize` (2–5), only for a group work                                                                              |
| `activity.settings_changed`   | `groupSize` (the value after the change, `null` back to Individual), when the work is in group or its format changed  |
| `activity_attempt.started`    | `group` (boolean: false for "Continuar sozinho"), `memberCount` (participants, leader included), only on a group work |
| `activity_submission.created` | `submittedById`, only on a group work                                                                                 |

`groupSize`, `group`, `memberCount` and `submittedById` are left out of an individual work's events so they read exactly as before 023 (SC-007: the 012–021
suites pin these metadata objects).

The teacher's group read (`GET …/attempts/:attemptId/group`) and the candidate list are not audited (reads, like the
015 timeline). Each accepted save is recorded in `activity_answer_saves`, not as an audit event (the 012 throttled
`activity_attempt.progress_saved` stays).
