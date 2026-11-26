# Audit events (031)

No new event type (CK11).

| Type | Change | Metadata |
|------|--------|----------|
| `class_meetings.updated` | written when a save adds, removes, changes a kind/text or resolves topics | `added`, `removed`, `total` (meetings), `resolutions` (count per action), **new** `kinds` (count per kind of all marks after the save, nine keys), **new** `changed` (number of `set` entries that changed an existing mark's kind or texts) |
| `class.offering_updated` | unchanged trigger | **new** `calendarDaysRemoved` (count) |

Never in metadata or logs: `description`, `absenceReason`, `absenceNotice`, dates of a Falta. `audit-event-types.ts`
allowlists the new keys as numbers/count maps. The student's `GET /me/classes/:classId/calendar` writes no event.
