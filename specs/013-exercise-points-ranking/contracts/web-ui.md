# Contract: web UI

Changes to the 012 features (`features/activities`, `features/student-activities`) and a new
`features/ranking` (api, hooks, components). Design-system components only, Portuguese labels,
axe and keyboard tests on every changed or new page, loading / empty / error / offline states.
Points as integers: "1 ponto", "30 pontos"; never "nota" for exercises (research K18).

## Teacher

| Route | Change |
|-------|--------|
| `/turmas/[id]/atividades/nova` | Exercício: no "Nota total", "Prazo" or "Entrega atrasada"; each chosen exercise shows its level and "Vale 30 pontos"; "Total: 105 pontos". Trabalho unchanged |
| `/turmas/[id]/atividades` | Exercício rows: "Sem prazo", "Concluíram: 12 de 30", "Aguardando correção: 3"; no "Resultado liberado" |
| `/turmas/[id]/atividades/[activityId]` | Exercício: no deadline/late-policy edit, no "Liberar resultado"; questions show level and points; roster: aluno, situação (Não iniciou, Em andamento, Concluiu), pontos, "N aguardando correção" |
| `/turmas/[id]/atividades/[activityId]/tentativas/[attemptId]` | Exercício (attempt 1): per question the answer next to the answer key; multiple choice shows "Certo"/"Errado" (automatic); open/code shows radios (`components/ui/radio`) "Certo" / "Errado" and "Comentário (opcional)"; "Salvar correção"; "Já pontuado em outra atividade" rows read-only; no grade input |
| `/turmas/[id]/ranking` (new) | `RankingTable` of the class: Posição, Aluno, Pontos; linked from the class page next to "Atividades" |

## Student

| Route | Change |
|-------|--------|
| `/painel` | One `RankingCard` per class: "Ranking — {turma}", 1º a 5º (posição, nome, pontos) and "Ver ranking completo"; with every student at 0: the rows plus the notice "Ainda não há pontos nesta turma."; with no ACTIVE student: "Esta turma ainda não tem alunos."; exercise cards show "Sem prazo" and points instead of deadline/grade |
| `/minhas-atividades` | Exercise items: "Sem prazo", "Pontos: 45 de 105" (+ "Aguardando correção") |
| `/minhas-atividades/[id]` | Exercício: header without prazo/nota, with "Vale até 105 pontos"; answering as 012 (autosave, offline) without deadline warnings; footer "Concluir exercícios" → `AlertDialog` "Concluir estes exercícios? Você vai ver o gabarito e não poderá mais alterar estas respostas." + "N exercícios em branco valem 0 ponto nesta conclusão."; result screen per question with status by text and icon (Certo, Errado, Aguardando correção, Compare com o gabarito, Já pontuado em outra atividade), the student's answer, the answer key (alternativa correta, resposta esperada or solução), "Explicação" and "Comentário do professor"; summary "Você ganhou 45 pontos" (first) or "Refazer não vale pontos. Seus pontos nesta atividade: 45."; buttons "Refazer" and the list of past conclusions ("Tentativa 2 — 3 de outubro, 14:05") |
| `/minhas-turmas` | Each class links "Ranking" |
| `/minhas-turmas/[id]/ranking` (new) | `RankingTable` with every position; the viewer's row highlighted and labeled "Você" (text, not color only) |

Components: `RankingTable` and `RankingCard` in `features/ranking/components` (built on the
design-system `Table` and `Card`); result statuses use the existing `Status`/`Badge`
variants. No new foundational component; any new visual value goes through tokens.
