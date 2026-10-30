"use client";

import type { StudentGroup } from "@repo/contracts";
import { EDITING_NOW, GROUP_LABEL, LEADER_MARK } from "../schemas/group-work";

/**
 * 023 contracts/web-ui.md "Student: in the group": the members, the leader marked, and who edits now in
 * a `role="status"` region, above the questions on the normal and the focus page. Who edits comes from
 * the API (the effective editor); names render as text. The leader's and the editor's actions join in US4.
 */
export function GroupBar({ group }: { group: StudentGroup }) {
  const members = group.members.map((member) => (member.id === group.leader.id ? `${member.name} ${LEADER_MARK}` : member.name)).join(", ");
  return (
    <section aria-label={GROUP_LABEL} className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border bg-surface p-4 text-body-sm">
      <p className="m-0">
        <span className="text-text-secondary">{GROUP_LABEL}: </span>
        <span>{members}</span>
      </p>
      <p role="status" aria-label={EDITING_NOW} className="m-0">
        <span className="text-text-secondary">{EDITING_NOW}:</span> <span className="font-semibold">{group.editor.name}</span>
      </p>
    </section>
  );
}
