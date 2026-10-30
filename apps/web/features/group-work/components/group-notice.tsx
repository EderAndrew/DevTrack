"use client";

import type { StudentGroup } from "@repo/contracts";
import { Alert, AlertTitle } from "@/components/ui/alert";
import { groupNotice } from "../schemas/group-work";

/**
 * 023/FR-009 (contracts/web-ui.md): a member brought in by the leader is told whose group they are in.
 * Nothing for the leader. The name renders as text.
 */
export function GroupNotice({ group }: { group: StudentGroup }) {
  if (group.myRole !== "MEMBER") return null;
  return (
    <Alert variant="info">
      <AlertTitle>{groupNotice(group.leader.name)}</AlertTitle>
    </Alert>
  );
}
