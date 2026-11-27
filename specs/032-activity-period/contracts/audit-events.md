# Audit events: 032

No new event type.

| Event | Change |
|-------|--------|
| `class_activity.created` | Metadata loses `startWindowMinutes`; keeps `deadline` presence as today (no value change for works) and, for EXAM, `durationMinutes`, `inactivityLimitSeconds`. No `latePolicy` choice exists on new works (always `REJECT`). |
| `class_activity.updated` | `changed` may list `deadline` for an EXAM (extension, AP5). |

Refusals (`422 INVALID_SCHEDULE`, `422 EXAM_END_CANNOT_MOVE_EARLIER`, `409 ACTIVITY_PERIOD_ENDED` on update or attendance)
are not audited, like the 012/016 refusals they sit beside. Metadata carries ids, enums and counts, never names.
