# Web UI Contract: 023 — Trabalho individual ou em grupo

Design-system components and tokens only; names and texts rendered as text. Words in
`features/group-work/schemas/`. Layers: `api/` → `hooks/` → `components/` (ESLint).

## Teacher: apply a work (`work-options.tsx`, 012/015/021)

```text
Formato
(•) Individual
( ) Em grupo      Máximo de integrantes, com o líder  [ 3 ▾ ]   ← 2 a 5, only with "Em grupo"
```

- A `RadioGroup` "Formato" and, with "Em grupo", a `NativeSelect` 2–5 (default 3). Shown only for a work; fixed once a
  student starts (the 015 options rule shows "O trabalho já começou").
- The activity detail and list show "Em grupo (até N)" next to the mode.

## Student: start (`features/group-work/components/group-start-dialog.tsx`)

```text
┌ Trabalho em grupo ───────────────────────────────────────────┐
│ Esse trabalho é em grupo, escolha os integrantes do grupo.    │
│ Você pode incluir até 3.                                      │
│ [ ] Ana Souza                                                 │
│ [x] Bruno Lima                     1 de 3                     │
│ [ ] Carla Dias                                                │
│ [Iniciar em grupo]                       [Continuar sozinho]  │
└──────────────────────────────────────────────────────────────┘
```

- A `Dialog` opened by "Iniciar" on a group work; the checklist is `Checkbox` + `Label`, by name; past the limit the
  unchecked boxes are disabled; "Iniciar em grupo" needs 1 checked. No candidates → "Nenhum colega disponível agora."
  and only "Continuar sozinho".
- `409 GROUP_MEMBERS_UNAVAILABLE`: the list is read again and an `Alert` names who is no longer available.

## Student: in the group (`group-bar.tsx`, `group-notice.tsx`)

```text
Você está no grupo de Ana Souza neste trabalho.                        ← members other than the leader
Grupo: Ana Souza (líder), Bruno Lima, Carla Dias      Editando agora: Bruno Lima
[Passar a edição ▾] [Retomar a edição] [Incluir integrantes]            ← leader
[Devolver a edição]                                                      ← the member who is editing
```

- `GroupBar` above the questions on the normal and the focus page; "Editando agora" in a `role="status"` region.
- Readers: the questions are read-only (`activity-answering.tsx` `readOnly`), with "A edição está com <nome>." The
  page polls `GET /me/activities/:id` every `GROUP_POLL_MS` (5 s) while visible.
- "Entregar" only for the leader; without the editing it is disabled with "Retome a edição para entregar" next to
  "Retomar a edição" (spec FR-018). A member never sees it.
- "Incluir integrantes" opens the same checklist with "Você pode incluir até <vagas>"; hidden when full.
- A save refused with `GROUP_NOT_EDITOR` (the leader took the editing back) switches the page to read-only and says
  "A edição voltou para <líder>. O que não foi salvo foi perdido."
- "Minhas atividades": a group work shows "Em grupo" and the group attempt's situation for every member.
- A student who started alone or is in a group never sees the start dialog again; a member who opens the work sees
  the notice and the group's attempt.

## Teacher: review (`features/activities`, `group-facts.tsx`)

- The roster shows one row per attempt: the leader's name with "e mais N" and a "Em grupo" badge.
- The attempt page gains "Grupo": members with the time they joined and who added them, the editing history ("Ana
  passou a edição para Bruno às 10:12", "A edição voltou para Ana: Bruno saiu da sala") and, per question, "Salvo por
  Bruno às 10:15 (revisão 3)" with the earlier saves in a `Collapsible`. The 015 timeline and the 016 pauses show the
  student's name on each fact.
- No text calls an edit, a handoff or an exit "fraude", "cola" or "violação".
