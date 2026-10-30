// 023 contracts/web-ui.md: the words of a group work. Names are rendered as text, never HTML.

export const GROUP_START_TITLE = "Trabalho em grupo";
/** FR-004: N is the slots the student may fill (the maximum minus the leader). */
export const groupStartMessage = (slots: number) =>
  `Esse trabalho é em grupo, escolha os integrantes do grupo. Você pode incluir até ${slots}.`;
export const START_IN_GROUP = "Iniciar em grupo";
export const CONTINUE_ALONE = "Continuar sozinho";
export const NO_CANDIDATES = "Nenhum colega disponível agora.";
export const CANDIDATES_LEGEND = "Colegas presentes";
export const LOADING_CANDIDATES = "Carregando os colegas…";
/** "n de N" next to the checklist (US2-3). */
export const chosenCount = (chosen: number, slots: number) => `${chosen} de ${slots}`;
/** US2-5: who left the list between its reading and the confirmation. */
export function unavailableMessage(names: readonly string[]): string {
  if (names.length === 0) return "Algum colega escolhido não está mais disponível. Revise a lista.";
  if (names.length === 1) return `${names[0]} não está mais disponível.`;
  return `${names.slice(0, -1).join(", ")} e ${names.at(-1)} não estão mais disponíveis.`;
}
