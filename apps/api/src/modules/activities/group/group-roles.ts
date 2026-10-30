/**
 * Who may act in a group attempt (023 research U9), pure: from the stored leader and editor, each
 * participant's join time, ACTIVE enrollment and open pause. A leader who lost access is replaced by the
 * active participant who joined first; an editor who is paused or lost access is not effective and the
 * editing falls back to the effective leader. The settlement (US4) persists these fallbacks; the reads
 * apply them on the spot so nobody waits for it.
 */

export interface GroupParticipant {
  id: string;
  joinedAt: Date;
  /** ACTIVE enrollment in the activity's class. */
  active: boolean;
  /** An open pause of this participant on the attempt (016). */
  paused: boolean;
}

export interface GroupState {
  leaderId: string;
  editorId: string;
  groupSize: number;
  participants: readonly GroupParticipant[];
}

export interface GroupRoles {
  /** The stored leader, or the active participant who joined first when the leader lost access; null when nobody is active. */
  leaderId: string | null;
  /** The stored editor when active and not paused, else the effective leader. */
  editorId: string | null;
  /** Participants by join time, leader included; ties keep the order they came in (a stable sort). */
  members: readonly GroupParticipant[];
  freeSlots: number;
}

const byJoin = (a: GroupParticipant, b: GroupParticipant) => a.joinedAt.getTime() - b.joinedAt.getTime();

export function groupRoles(state: GroupState): GroupRoles {
  const members = [...state.participants].sort(byJoin);
  const find = (id: string) => members.find((member) => member.id === id);
  const leader = find(state.leaderId);
  const leaderId = leader?.active ? leader.id : (members.find((member) => member.active)?.id ?? null);
  const editor = find(state.editorId);
  const editorId = editor?.active && !editor.paused ? editor.id : leaderId;
  return { leaderId, editorId, members, freeSlots: Math.max(0, state.groupSize - members.length) };
}

/** The caller may write when they are the effective editor and not paused themselves (023/FR-012, FR-023). */
export function canEdit(roles: GroupRoles, userId: string): boolean {
  const me = roles.members.find((member) => member.id === userId);
  return roles.editorId === userId && me !== undefined && !me.paused;
}
