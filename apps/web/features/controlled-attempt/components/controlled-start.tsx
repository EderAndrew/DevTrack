"use client";

import type { StudentActivity } from "@repo/contracts";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Alert, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { messageForError } from "@/lib/messages/error-messages";
import { useStartAttempt } from "@/features/student-activities/hooks/use-student-activities";
import { enterFullscreen, exitFullscreen } from "../hooks/use-fullscreen";
import { controlledAnswerHref } from "../schemas/controlled-attempt";

export const CONTROLLED_NOTICE_TITLE = "Este trabalho é feito em modo controlado";
export const CONTROLLED_NOTICE_ITEMS = [
  "O trabalho abre em tela cheia, sem o menu do portal, quando o seu dispositivo permitir.",
  "Sair da tela (trocar de aba, mudar de janela, minimizar ou sair da tela cheia) fica registrado com o horário, e o professor vê esses registros.",
  "Copiar e colar ficam bloqueados, e cada tentativa é registrada.",
  "Nada é bloqueado nem entregue sozinho: você continua respondendo e entrega quando quiser.",
] as const;

/**
 * What the controlled mode does, before the student starts (015/FR-007, contracts/web-ui.md), and
 * "Iniciar em modo controlado" ("Continuar…" for a started attempt): fullscreen is asked for in the
 * click itself (a browser only allows it there), then the attempt starts and the focus page opens.
 */
export function ControlledStart({ activity }: { activity: StudentActivity }) {
  const router = useRouter();
  const start = useStartAttempt(activity.id);
  const [busy, setBusy] = useState(false);
  const started = activity.attempt !== null;

  const begin = async () => {
    setBusy(true);
    const fullscreen = enterFullscreen();
    try {
      if (!started) await start.mutateAsync();
      await fullscreen;
      router.push(controlledAnswerHref(activity.id));
    } catch {
      await fullscreen;
      await exitFullscreen();
      setBusy(false);
    }
  };

  return (
    <section aria-labelledby="modo-controlado" className="flex flex-col items-start gap-4">
      <Alert variant="info">
        <AlertTitle id="modo-controlado">{CONTROLLED_NOTICE_TITLE}</AlertTitle>
        <ul className="m-0 flex flex-col gap-1 pl-5">
          {CONTROLLED_NOTICE_ITEMS.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </Alert>
      <p className="m-0 text-body">
        {activity.questions.length === 1 ? "1 questão" : `${activity.questions.length} questões`}. Suas respostas são salvas
        automaticamente.
      </p>
      <Button type="button" loading={busy} onClick={() => void begin()}>
        {started ? "Continuar em modo controlado" : "Iniciar em modo controlado"}
      </Button>
      {start.isError ? (
        <Alert variant="danger">
          <AlertTitle>{messageForError(start.error)}</AlertTitle>
        </Alert>
      ) : null}
    </section>
  );
}
