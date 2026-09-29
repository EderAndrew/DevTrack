# Proposta de emenda da constituição: 3.0.0 → 3.1.0

**Status**: **aplicada** em 2026-09-27 com `/speckit-constitution` (constituição v3.1.0).
Mantida como registro da decisão. Origem: `/speckit-analyze` da 010, achado C1 (opção A escolhida pelo usuário em
2026-09-27).

## Por que

O Princípio XXIII ("Escopo ensinado") exige que a geração por IA de exercícios, trabalhos e
provas receba só o que já foi trabalhado **naquela turma**. A 010 gera exercícios para o
**banco de questões** do professor, que é reutilizável entre turmas e semestres e não pertence
a nenhuma turma (o próprio XXIII já separa "banco de questões × atividade"). Sem a emenda, a
geração para o banco seria uma reinterpretação silenciosa de uma regra MUST.

## Versão

**MINOR (3.0.0 → 3.1.0)**: acrescenta uma distinção e uma regra nova para o banco; não remove
nem enfraquece a regra das atividades de turma, que continua valendo integralmente.

## Texto a aplicar — Princípio XXIII

Substituir o item "**Escopo ensinado**" por estes dois itens:

```markdown
- **Escopo ensinado**: geração por IA de **atividades de uma turma** (exercícios aplicados,
  trabalhos e provas) DEVE receber somente o escopo permitido — conteúdos e objetivos já
  trabalhados naquela turma até o ponto escolhido pelo professor. O escopo é calculado
  deterministicamente a partir das aulas registradas (XII), e a saída DEVE ser validada
  deterministicamente: toda questão gerada DEVE estar vinculada a um conteúdo do escopo; itens
  fora dele são rejeitados ou sinalizados.
- **Geração para o banco de questões**: a IA PODE gerar **modelos** para o banco do professor a
  partir de um conteúdo da ementa confirmada que ele escolher, sem vínculo com turma, porque o
  banco é reutilizável entre turmas e semestres. Valem as mesmas garantias: um único conteúdo
  como escopo, escolhido pelo professor e verificado no servidor; vínculo determinístico de cada
  questão gerada a esse conteúdo; saída validada; rascunho revisado pelo professor (XIII). Ao
  entrar numa atividade de turma, a questão do banco passa pela regra do escopo ensinado daquela
  turma.
```

## Rodapé

`**Version**: 3.1.0 | **Ratified**: 2026-09-21 | **Last Amended**: <data da aplicação>`

## Sync Impact Report (para o topo da constituição)

```text
Version change: 3.0.0 → 3.1.0
Motivo (MINOR): o Princípio XXIII passa a distinguir a geração por IA de atividades de turma
(escopo ensinado, inalterado) da geração de modelos para o banco de questões do professor (um
conteúdo da ementa confirmada escolhido pelo professor, sem turma, com as mesmas garantias).

Princípios modificados:
  XXIII. Referência Curricular e Rastreabilidade Pedagógica — "Escopo ensinado" restrito a
         atividades de turma; novo item "Geração para o banco de questões".

Princípios adicionados: nenhum.
Princípios removidos: nenhum.

Templates:
  ✅ .specify/templates/plan-template.md  — gate XXIII sem mudança de texto necessária
  ✅ .specify/templates/spec-template.md  — sem mudança necessária
  ✅ .specify/templates/tasks-template.md — sem mudança necessária

Follow-ups:
  - A spec 010-exercise-bank já referencia a regra (spec "Curricular traceability", plan
    Constitution Check XXIII).
  - A futura spec de atividades aplica o escopo ensinado quando uma questão do banco entrar
    numa atividade de turma.
```

## Como aplicar

Rode `/speckit-constitution` com: "Aplicar a emenda de `specs/010-exercise-bank/
constitution-amendment-3.1.0.md` (Princípio XXIII, versão 3.1.0)". Depois, este arquivo pode
ficar como registro da decisão ou ser removido.
