# Audit Events: 023

Metadata holds only ids, enums and counts — never a name, an answer, a statement or a note.

## New

| Type | Actor | Metadata |
|---|---|---|
| `activity_group.created` | the leader | `activityId`, `attemptId`, `memberCount` (participants, leader included) |
| `activity_group.member_added` | the leader | `activityId`, `attemptId`, `memberId` (one event per member, also the ones of the start) |
| `activity_group.editing_changed` | the student, or SYSTEM | `activityId`, `attemptId`, `kind` (`EDITING_HANDED` \| `EDITING_TAKEN_BACK` \| `EDITING_RETURNED` \| `EDITING_RESET`), `reason` (`PAUSED` \| `ACCESS_LOST` \| null), `fromUserId`, `toUserId` |
| `activity_group.leader_changed` | SYSTEM | `activityId`, `attemptId`, `fromUserId`, `toUserId`, `reason` (`ACCESS_LOST`) |
| `activity_group.write_refused` | the student | `activityId`, `attemptId`, `operation` (`SAVE` \| `SUBMIT` \| `HELP` \| `ADD_MEMBERS` \| `EDITING`), `reason` (`NOT_EDITOR` \| `NOT_LEADER` \| `FULL` \| `MEMBERS_UNAVAILABLE`) |

## Changed

| Type | Metadata added |
|---|---|
| `activity.published` | `groupSize` (number or null) |
| `activity.settings_changed` | `groupSize` (the value after the change) |
| `activity_attempt.started` | `group` (boolean), `memberCount` |
| `activity_submission.created` | `submittedById` |

The teacher's group read (`GET …/attempts/:attemptId/group`) and the candidate list are not audited (reads, like the
015 timeline). Each accepted save is recorded in `activity_answer_saves`, not as an audit event (the 012 throttled
`activity_attempt.progress_saved` stays).
