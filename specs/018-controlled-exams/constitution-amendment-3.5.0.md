# Proposta de emenda da constituição: 3.4.0 → 3.5.0

**Status**: **aplicada** em 2026-10-12 com `/speckit-constitution` (constituição v3.5.0).
Mantida como registro da decisão.
Origem: `/speckit-analyze` da 018, achado C1 (research T19).

## Por que

Na prova da 018, a 4ª ocorrência suspende a tentativa do aluno até o professor decidir, e o tempo
continua correndo. O Princípio XI lista "bloqueio disciplinar" e "aplicação de penalidades" entre
as decisões que mecanismos automáticos não podem tomar sozinhos. A suspensão não anula nem dá
nota, mas impede o aluno de responder e o tempo perdido não volta, mesmo que o professor devolva a
prova. O plano tratava isso como interpretação do XI; a análise exige emenda ou mudança de
desenho. O usuário decidiu manter a regra (3 avisos, encerramento na 4ª, tempo correndo, decisão
do professor), então a constituição passa a permiti-la de forma explícita e delimitada.

## Versão

**MINOR (3.4.0 → 3.5.0)**: uma exceção explícita e delimitada; nenhuma garantia existente é
removida. Anulação, penalidade e bloqueio disciplinar continuam decisões do professor.

## Texto aplicado — Princípio XI, depois do primeiro item

```markdown
- **Suspensão da tentativa por regra da avaliação (exceção delimitada)**: a spec de uma
  avaliação PODE definir uma regra determinística que suspende a tentativa do aluno (ele
  deixa de responder até a decisão do professor) quando os fatos registrados atingem um
  limite, desde que, cumulativamente:
  - a regra, o limite e as consequências possíveis são mostrados ao aluno antes do início
    e aceitos por ele;
  - a contagem é feita pelo servidor sobre fatos registrados (X), com avisos ao aluno
    antes do limite, e nunca a partir de um evento isolado;
  - a suspensão é um `RULE_RESULT`: não cancela nem anula a avaliação, não dá nota, não
    aplica penalidade e não rotula o aluno (nunca "fraude", "cola" ou "violação");
  - o professor é avisado, vê todos os fatos e decide (`HUMAN_DECISION`) entre anular
    a tentativa, com a penalidade que a spec define, e devolvê-la ao aluno; enquanto ele
    não decide, nenhum resultado do aluno é liberado.

  O tempo da avaliação PODE continuar correndo durante a suspensão quando a spec assim o
  define e o aluno é informado antes do início; isso decorre da regra anunciada, não é
  penalidade aplicada pelo sistema. Anulação, penalidade e bloqueio disciplinar continuam
  sendo decisões do professor.
```

## Como a 018 cumpre cada condição

| Condição | Onde |
|---|---|
| Regra mostrada e aceita antes do início | spec FR-028; `acceptRules: true` (research T13) |
| Contagem do servidor, avisos antes do limite, nunca um evento isolado | spec FR-016–FR-018; research T6 (3 avisos, 4ª ocorrência) |
| Sem anulação, nota, penalidade ou rótulo automáticos | spec FR-019, FR-032; data-model (a retenção não grava nota) |
| O professor decide entre anular e devolver | spec FR-021–FR-023; research T9 |
| Nenhum resultado liberado antes da decisão | spec FR-024; research T10 |
| Tempo correndo anunciado antes do início | spec FR-011, FR-028 |

## Sync

- `.specify/templates/plan-template.md`: o gate XI cita a exceção.
- `CLAUDE.md`: versão 3.5.0.
- `specs/018-controlled-exams/{spec,plan,research}.md`: citam a v3.5.0.
