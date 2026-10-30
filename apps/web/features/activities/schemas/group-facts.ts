import type {
  AttemptParticipant,
  RosterEntry,
  TeacherAttemptGroup,
} from "@repo/contracts";
import { formatTime } from "@/lib/messages/dates";

// Texts of a group attempt in the teacher's review (023 contracts/web-ui.md, US6). Facts only: an edit, a
// handoff or an exit is never labelled as misconduct, and nothing here is a grade (US6-5).

export const GROUP_TITLE = "Grupo";
export const GROUP_BADGE = "Em grupo";
export const GROUP_NOTE =
  "Registros de quem participou e de quem salvou cada resposta. A nota é uma só para o grupo.";
export const MEMBERS_TITLE = "Integrantes";
export const HISTORY_TITLE = "Histórico da edição";
export const NO_HISTORY = "A edição ficou sempre com o líder.";
export const SAVES_TITLE = "Quem salvou cada resposta";
export const NO_SAVES = "Nenhuma resposta salva.";
export const STUDENT_COLUMN = "Aluno";
/** 023/FR-021: who asked the AI help, in a group attempt's review. */
export const askedBy = (name: string) => `Pedida por ${name}`;

/** "Ana Souza e mais 2": the leader's name and how many members come with them. */
export function groupName(participants: readonly AttemptParticipant[]): string {
  const leader =
    participants.find((person) => person.isLeader) ?? participants[0];
  if (!leader) return "";
  const others = participants.length - 1;
  return others > 0 ? `${leader.name} e mais ${others}` : leader.name;
}

/**
 * One line per attempt (023/FR-020): the members of a group share the leader's line; a student alone or
 * without an attempt keeps their own. The counts stay per student (they come from the API).
 */
export function rosterLines(roster: readonly RosterEntry[]): RosterEntry[] {
  return roster.filter((entry) => {
    if (!entry.group || entry.attemptId === null) return true;
    const rows = roster.filter((row) => row.attemptId === entry.attemptId);
    // The leader's row stands for the group (the first member's if the leader is not listed).
    const leaderRow = rows.find((row) =>
      row.participants.some(
        (person) => person.isLeader && person.id === row.studentUserId,
      ),
    );
    return (leaderRow ?? rows[0]) === entry;
  });
}

type GroupEvent = TeacherAttemptGroup["events"][number];

/** An editing event in words, with the server's time. */
export function eventText(
  event: GroupEvent,
  nameOf: (id: string) => string,
): string {
  const from = nameOf(event.fromId);
  const to = nameOf(event.toId);
  const at = formatTime(event.occurredAt);
  const why =
    event.reason === "PAUSED"
      ? `${from} saiu da sala`
      : `${from} não tem mais acesso à turma`;
  switch (event.kind) {
    case "EDITING_HANDED":
      return `${from} passou a edição para ${to} às ${at}`;
    case "EDITING_TAKEN_BACK":
      return `${to} retomou a edição de ${from} às ${at}`;
    case "EDITING_RETURNED":
      return `${from} devolveu a edição para ${to} às ${at}`;
    case "EDITING_RESET":
      return `A edição voltou para ${to} às ${at}: ${why}`;
    case "LEADER_CHANGED":
      return `${to} passou a liderar o grupo às ${at}: ${why}`;
  }
}

/** "Salvo por Bruno Lima às 10:15 (revisão 3)". */
export const savedText = (name: string, savedAt: string, revision: number) =>
  `Salvo por ${name} às ${formatTime(savedAt)} (revisão ${revision})`;

/** "Entrou às 10:00" and, for a member, "incluído por Ana Souza". */
export const joinedText = (joinedAt: string, addedBy: string | null) =>
  `Entrou às ${formatTime(joinedAt)}${addedBy ? `, incluído por ${addedBy}` : ""}`;

export const earlierSavesLabel = (count: number) =>
  count === 1
    ? "Ver o salvamento anterior"
    : `Ver os ${count} salvamentos anteriores`;
