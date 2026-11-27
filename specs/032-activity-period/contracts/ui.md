# UI: 032 (web; the mobile app is unchanged)

## Apply form (`features/activities/components/new-activity.tsx`), ASSIGNMENT and EXAM

Fieldset **"Período"**:

- **Início**: radios "Agora" / "Agendar" (012); "Agendar" shows date + time.
- **Término**: date (prefilled with the start's date: today for "Agora") + time. Hint: "Depois do término ninguém mais
  começa nem entrega."
- EXAM keeps "Duração (minutos)" and "Limite de inatividade"; hint under the duration: "Quem começar perto do término
  terá só o tempo que falta."
- Removed: "Limite para iniciar" (EXAM), "Prazo de entrega" and "Política de atraso" (ASSIGNMENT).
- Errors: end not after start, or exam period shorter than the duration → message on "Término" (client and
  `INVALID_SCHEDULE`).

## Activity detail (`activity-detail.tsx`)

- "Período: 30/11 19:10 → 22:00" (same day: "30/11, 19:10 → 22:00").
- Legacy work with `ACCEPT_MARKED`: badge "Aceita entrega atrasada (regra anterior)".
- Work: "Alterar término" (as the deadline edit today).
- Exam, scheduled: "Alterar período"; published with the end ahead: "Estender término" (only later times offered;
  `EXAM_END_CANNOT_MOVE_EARLIER` shown on the field); after the end: no action.

## Class activity list

- Each work and exam shows its period ("30/11, 19:10 → 22:00") where the deadline was shown (FR-008).

## Exam monitor and attendance (web)

- Monitor header: "Termina às 22:00" (from `closesAt`).
- Attendance after the end (`periodEnded`): the mark controls are disabled with "O período terminou: não é possível liberar mais
  alunos."; a `409 ACTIVITY_PERIOD_ENDED` from a race shows the same text.

## Student

- Exam rules screen when not allowed to start after the end: "O período desta prova terminou."
- Timer: unchanged component; it counts to the capped `endsAt`.

All with Design System tokens and components, both themes, keyboard and screen-reader labels with date and time.
