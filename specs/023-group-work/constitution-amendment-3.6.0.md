# Proposta de emenda da constituição: 3.5.0 → 3.6.0

**Status**: **aplicada** em 2026-10-30 com `/speckit-constitution` (constituição v3.6.0).
Mantida como registro da decisão.
Origem: Constitution Check do `/speckit-plan` da 023 (research U1).

## Por que

O Princípio XXIV proíbe o acesso horizontal entre alunos: "Um aluno vê somente as próprias notas e respostas". A
única exceção hoje é o ranking de pontos de prática (3.3.0). No trabalho em grupo da 023, por decisão do usuário:

- o aluno que inicia vê os **nomes** dos colegas da turma marcados presentes que ainda não começaram o trabalho,
  para escolher os integrantes;
- os integrantes de um grupo veem as **respostas** do grupo (uma tentativa compartilhada), os nomes dos outros
  integrantes e quem está editando, e as orientações da IA entregues ao grupo;
- a **nota e o retorno** liberados da entrega do grupo valem para todos os integrantes.

Isso é acesso entre alunos, então a constituição precisa permiti-lo de forma explícita e delimitada, como fez com o
ranking.

## Versão

**MINOR (3.5.0 → 3.6.0)**: uma exceção explícita e delimitada; nenhuma garantia existente é removida. Fora do grupo
de um trabalho, o isolamento continua igual.

## Texto proposto — Princípio XXIV, depois da exceção do ranking

```markdown
- **Exceção — trabalho em grupo**: num trabalho que o professor aplicou em grupo, os
  integrantes de um mesmo grupo compartilham uma única tentativa: cada um PODE ver as
  respostas do grupo, os nomes dos outros integrantes, quem está editando, as orientações
  de estudo entregues ao grupo e, depois da liberação, a nota e o retorno da entrega do
  grupo, que valem para todos. Para formar ou completar o grupo, o aluno PODE ver apenas o
  nome dos colegas da mesma turma, com matrícula ativa e presença marcada naquele
  trabalho, que ainda não o iniciaram. Fatos individuais de cada integrante (registros do
  modo controlado, pausas, execuções de código, notas de outras atividades) NUNCA são
  vistos pelos outros integrantes; nada de outro grupo, de outro trabalho ou de outra
  turma é exposto.
```

## Como a 023 cumpre cada condição

| Condição | Onde |
|---|---|
| Só em trabalho aplicado em grupo pelo professor | spec FR-001–FR-003; research U2 (`work_format = GROUP` só em ASSIGNMENT) |
| Uma tentativa compartilhada, só entre integrantes do mesmo grupo | spec FR-011; research U3, U5 (participantes; fora do grupo → `404`) |
| Lista de candidatos: só nome, mesma turma, matrícula ativa, presença marcada, sem início | spec FR-005; research U7; contracts/http-api.md (`GroupCandidate` = `{ id, name }`) |
| Nota e retorno iguais para todos, só depois da liberação | spec FR-019; research U14 |
| Fatos individuais não vistos pelos outros integrantes | spec FR-021; research U11–U13 (eventos, pausas e execuções por aluno; visão do aluno filtrada pelo próprio id) |

## Sync

- `.specify/templates/plan-template.md`: o gate XXIV cita a exceção.
- `CLAUDE.md`: versão 3.6.0 (onde a versão é citada) e a regra "Group work (023)".
- `specs/023-group-work/{plan,research}.md`: citam a v3.6.0.
