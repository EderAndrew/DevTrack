import { isoDate } from "./class.view";

/**
 * 027 FR-022, research Q5: the teacher closes or archives a disciplina da turma only after its calendar —
 * when "today" (America/Sao_Paulo, `planningToday` of the injected clock) is after `endsOn`. Without a
 * calendar it never can.
 */
export function canCloseClass(schoolClass: { endsOn: Date | null }, today: string): boolean {
  const endsOn = isoDate(schoolClass.endsOn);
  return endsOn !== null && today > endsOn;
}
