import { remainingLabel } from "../schemas/work-help";

/** "Ajudas restantes: n de 3" (015/FR-015): the help used counts only DELIVERED orientations. */
export function HelpCounter({ allowance, used, id }: { allowance: number; used: number; id?: string }) {
  return (
    <p id={id} className="m-0 text-body-sm text-text-secondary">
      {remainingLabel(allowance, used)}
    </p>
  );
}
