import type { DeliveryState } from "@repo/contracts";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";

export interface ResendInvitationButtonProps {
  /** The delivery situation of the invitation's e-mail; `UNDELIVERED` asks before resending (017/FR-016). */
  delivery: DeliveryState;
  /** Visible text of the button ("Reenviar", "Reenviar convite"). */
  label: string;
  /** Accessible name of the button, with the invitee. */
  ariaLabel: string;
  busy?: boolean;
  onResend: () => void;
}

/**
 * "Reenviar" of a pending invitation. When the provider said the address refused the e-mail, it
 * first asks "Reenviar para o mesmo endereço?" (017 contracts/web-ui.md): only "Reenviar" sends,
 * "Voltar" closes with nothing sent and the focus back on the button. Any other invitation resends
 * at once, as before (003, 001).
 */
export function ResendInvitationButton({ delivery, label, ariaLabel, busy, onResend }: ResendInvitationButtonProps) {
  const button = (
    <Button type="button" variant="secondary" aria-label={ariaLabel} aria-busy={busy || undefined} onClick={delivery === "UNDELIVERED" ? undefined : onResend}>
      {label}
    </Button>
  );
  if (delivery !== "UNDELIVERED") return button;
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>{button}</AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Reenviar para o mesmo endereço?</AlertDialogTitle>
          <AlertDialogDescription>Este endereço já recusou a mensagem. Confira o e-mail antes de reenviar.</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Voltar</AlertDialogCancel>
          <AlertDialogAction onClick={onResend}>Reenviar</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
