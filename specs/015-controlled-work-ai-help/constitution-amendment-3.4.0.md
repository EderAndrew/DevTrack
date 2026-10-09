# Proposta de emenda da constituição: 3.3.0 → 3.4.0

**Status**: **aplicada** em 2026-10-07 com `/speckit-constitution` (constituição v3.4.0).
Mantida como registro da decisão.
Origem: Constitution Check do `/speckit-plan` da 015 (research F17).

## Por que

A 015 dá ao aluno, durante um trabalho, até 3 orientações da IA que chegam a ele sem passar pelo
professor. O Princípio XIII diz "Resultados de IA são sempre rascunhos: IA NUNCA publica — salvar
no banco de questões ou publicar para alunos é ação do professor", e o XIV permite IA para o aluno
"durante avaliações, só o que a spec da avaliação permitir explicitamente". A spec permite, mas o
XIII, lido ao pé da letra, proíbe que um resultado de IA chegue ao aluno sem o professor. Sem a
emenda, a 015 violaria uma regra MUST.

## Versão

**MINOR (3.3.0 → 3.4.0)**: uma exceção explícita e delimitada; nenhuma garantia existente é
removida. Conteúdo de banco e publicação de atividades continuam ação exclusiva do professor.

## Texto aplicado — Princípio XIII, depois do parágrafo "Funcionalidades L2 …"

```markdown
- **Orientação ao aluno (exceção delimitada)**: uma orientação de estudo L2 PODE chegar
  diretamente ao aluno durante uma atividade quando, cumulativamente: a spec da atividade a
  autoriza e o professor a liga para aquela atividade; o modelo NUNCA recebe gabarito,
  resposta esperada, solução, explicação ou critérios de correção; a orientação passa por
  uma checagem determinística de vazamento da resposta antes da entrega; ela não altera
  resposta, nota, situação nem prazo; há um limite fixo por atividade; e o professor vê as
  perguntas e as orientações. Orientações não são conteúdo publicado: não entram em bancos
  nem em atividades.
```

## Sync esperado

- `.specify/templates/plan-template.md`: o gate XIII cita a exceção.
- `CLAUDE.md`: versão 3.4.0.
- `specs/015-controlled-work-ai-help/plan.md`: item XIII do Constitution Check passa a ✅.
