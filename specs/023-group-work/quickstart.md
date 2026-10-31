# Quickstart: 023 — Trabalho individual ou em grupo

Prerequisites: the dev stack of the root `CLAUDE.md` (`docker compose up -d postgres mailpit`, `pnpm dev`), a teacher
with a class of at least four students (invitations through Mailpit), and the constitution at v3.6.0
(`constitution-amendment-3.6.0.md` applied).

## Walk-through

1. As the teacher, apply a work to the class with "Formato: Em grupo", "Máximo de integrantes: 3". In "Chamada e
   prova"/"Chamada", mark students A, B, C and D present and release.
2. As A (one browser), open the work and tap "Iniciar": the dialog says "Você pode incluir até 2" and lists B, C and
   D. Check B and tap "Iniciar em grupo": the questions open, "Editando agora: A".
3. As B (a private window): the work shows "Em grupo"; opening it shows "Você está no grupo de A neste trabalho",
   the questions read-only and no "Iniciar". A saves an answer; within 10 s B sees it, "Salvo por A".
4. As A, "Passar a edição" → B. B's questions become editable; A's become read-only. B saves an answer. A taps
   "Retomar a edição": A edits again, and a late save from B's screen is refused with "A edição voltou para A".
5. As C (a third browser), tap "Iniciar": the list shows only D (A and B already started). Choose "Continuar
   sozinho": C works alone. As A, "Incluir integrantes": the list shows D only (C started alone); add D. The group is
   full (3), so "Incluir integrantes" disappears.
6. As D, the notice says "Você está no grupo de A". D taps "Executar" on a CODE question (with execution allowed):
   the run is D's.
7. In a CONTROLLED group work, B leaves the focus page: the teacher's timeline shows the exit with B's name. The
   teacher pauses B while B holds the editing: the editing goes back to A, and A keeps working.
8. As A, tap "Entregar": the attempt is submitted for A, B and D. As B, there was never an "Entregar".
9. As the teacher, open the submissions: one row "A e mais 2 — Em grupo" and one for C. Open the group's attempt:
   members with join times, the editing history and "Salvo por …" per question. Grade and release: A, B and D see the
   same grade; C sees their own.
10. Repeat steps 1–3 on an individual work, an exercise and an exam: nothing changed.
