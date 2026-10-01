# Proposta de emenda da constituição: 3.1.0 → 3.2.0

**Status**: **aplicada** em 2026-09-30 com `/speckit-constitution` (constituição v3.2.0).
Mantida como registro da decisão. Origem: `/speckit-specify` da 011 (Assumptions da spec) e o
Constitution Check do `/speckit-plan`, que não passava com a v3.1.0.

## Por que

O Princípio XXIII v3.1.0 permitia a geração por IA de modelos para o banco a partir de **um
único conteúdo** da ementa confirmada. Um trabalho da 011 cobre vários tópicos da ementa (ex.:
Encapsulamento, Construtores, Associação e Composição), e a geração com IA recebe todos os
tópicos escolhidos como escopo. Sem a emenda, a 011 violaria uma regra MUST.

## Versão

**MINOR (3.1.0 → 3.2.0)**: amplia uma regra existente sem remover nem enfraquecer garantias. O
caso de um único conteúdo (010) continua conforme, e o escopo ensinado das atividades de turma
não muda.

## Texto aplicado — Princípio XXIII

"**Geração para o banco de questões**" passou a ser:

```markdown
- **Geração para os bancos do professor**: a IA PODE gerar **modelos** para os bancos
  do professor (banco de questões/exercícios, banco de trabalhos) a partir de um ou mais
  conteúdos da ementa confirmada que ele escolher, sem vínculo com turma, porque os
  bancos são reutilizáveis entre turmas e semestres. Valem as mesmas garantias:
  - o escopo são somente os conteúdos escolhidos pelo professor, todos da mesma revisão
    confirmada de uma ementa a que ele tem acesso, verificados no servidor;
  - a IA NÃO DEVE acrescentar, trocar nem remover conteúdos do escopo;
  - cada questão gerada DEVE estar vinculada deterministicamente a pelo menos um
    conteúdo do escopo; itens fora dele são rejeitados;
  - a saída é validada e nasce como rascunho revisado pelo professor (XIII).
  Ao entrar numa atividade de turma, o modelo do banco passa pela regra do escopo
  ensinado daquela turma.
```

"**Banco de questões × atividade**" passou a ser "**Bancos do professor × atividade**": todo
item de banco (questão/exercício ou trabalho) é um modelo, e ao entrar numa atividade de turma
DEVE ser guardado um snapshot (um trabalho do banco ≠ a atividade `ASSIGNMENT` aplicada).

## Como a 011 aplica

- Tópicos de uma única revisão confirmada, verificados no servidor (FR de tópicos, US3).
- Cada questão gerada vinculada a 1–3 dos tópicos escolhidos, e todo tópico escolhido coberto;
  tópico fora da seleção rejeita a saída (US4).
- Trabalho gerado nasce `DRAFT`; só o professor aprova (US5).
- A aplicação a uma turma, com escopo ensinado e snapshot, fica para a 012.
