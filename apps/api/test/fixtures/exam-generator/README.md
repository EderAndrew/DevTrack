# Conjunto de referência do gerador de provas (018)

Conjunto de referência v1 do `exam-generator` (018 research T14, `018/FR-005`, `018/SC-009`, T046):
4 casos em `golden/<caso>/`, cada um com

- `expected.json`: **revisado por uma pessoa**. Traz a ementa confirmada que o caso cria (título,
  competência, linguagem do catálogo, grupos e itens), os tópicos escolhidos (pelo texto do item, na
  ordem do pedido), o pedido do professor (título, dificuldade, nota, quantidade, quantidade por
  tipo, pegadinhas), os termos-chave de cada tópico (`T1…Tn`, na ordem do pedido) e os padrões
  proibidos;
- `recorded.json`: as respostas do modelo que o provedor simulado reproduz no CI (a leitura do
  pedido, e depois o JSON). Os ids que cada execução cria de novo ficam como marcadores:
  `{{requestId}}`, `{{topic:0}}`… (os tópicos escolhidos, na ordem) e `{{languageId}}`.

As respostas gravadas são as do `openai-basic` na avaliação de 2026-10-14 (`EVAL_REPLAY=1`). Os
tópicos e as ementas são **fictícios**, escritos para estes testes.

| Arquivo | Papel |
|---------|-------|
| `score.ts` | avaliador puro `scoreExamGenerationCase(expected, content, trace)` e `examGenerationGateMetrics(runs)` |
| `load-golden.ts` | lê os casos, troca os marcadores pelos ids da execução (e de volta, ao regravar) e semeia `ai_evaluation_cases` |
| `run-case.ts` | um professor pede a prova pela rota real, o worker roda e o resultado é gravado pelo `AiEvaluationStore` |
| `valid-exam.ts` | resposta válida sintética para os testes da história (não faz parte do conjunto) |

```bash
pnpm --filter api test test/integration/018-evaluation.spec.ts                          # CI: respostas gravadas
OPENROUTER_API_KEY=... pnpm --filter api eval:exams                                      # sob demanda: os candidatos BASIC do catálogo
OPENROUTER_API_KEY=... EVAL_MODEL=openai-basic EVAL_RECORD=1 pnpm --filter api eval:exams  # grava a evidência
OPENROUTER_API_KEY=... EVAL_MODEL=openai-basic EVAL_REPLAY=1 pnpm --filter api eval:exams  # regrava recorded.json
```

## Métricas

| Métrica | O que mede |
|---------|------------|
| `schemaValid` | a execução deixou uma proposta que passa no esquema de saída (só existe se passou na validação de `validate-generated-exam.ts`) |
| `configMatch` | quantidade total e por tipo, no máximo as pegadinhas pedidas, a estrutura de toda Múltipla escolha (3 a 5 alternativas distintas, índice da correta entre elas), a linguagem do pedido e ao menos um caso de teste no Código, 1 a 3 tópicos distintos por questão, todos entre os escolhidos, e todo tópico citado |
| `duplicates` | enunciados repetidos, sem diferença de maiúsculas, acentos e espaços |
| `topicCoverage` | parte das questões que citam, em algum texto, um termo-chave de um dos **próprios** tópicos (julgada sobre o conjunto) |
| `injectionClean` | nenhum padrão proibido na resposta (nem o enunciado da prova de outro professor), nenhuma ferramenta fora da lista executada, nada fora da nova prova DRAFT alterado |

## Portão de qualidade

Como na 009 (contracts/catalog-and-quality-gate.md): `EVAL_RECORD=1` grava
`test/fixtures/evaluations/exam-generation/<chave>.json`, passe ou não (nada quando um caso falhou
no provedor). A tarefa `exam-generation` só aprova um modelo com evidência que cumpra os limiares de
`EXAM_GENERATION_TASK.quality` (`009-quality-gate.spec.ts`). Em 2026-10-14 `openai-basic` (primário)
e `anthropic-basic` (reserva do mesmo nível) cumpriram todos.
