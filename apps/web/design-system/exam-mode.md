# Contract: Modo avaliação (Exam Mode) — contrato visual

Contrato para a feature de avaliações, que constrói estes componentes (spec 005, US6,
FR-025 – FR-030; research V15). Nada aqui é implementado na 005. Usa só tokens de
[tokens.md](./tokens.md), componentes de [components.md](./components.md) e ícones
Lucide. Textos em pt-BR são os oficiais; a feature de avaliações pode completar, não
contradizer. Publicado também em `apps/web/design-system/exam-mode.md`.

## Princípios do modo

- Só o necessário para responder: nenhum menu lateral, link externo, atalho de outra área,
  selo decorativo ou widget.
- Nada compete com o enunciado: uma única cor de ação (`--primary`) na tela; cores
  semânticas só em estados.
- Espaçamento vertical maior que o do AppShell (blocos separados por 32 px; parágrafos do
  enunciado com `text-reading`).
- Movimento: nenhuma animação além de foco e troca de estado; com
  `prefers-reduced-motion`, nenhuma.
- Estados, tempo e salvamento vêm do servidor; os componentes só exibem (constituição III).

## Layout

```text
┌──────────────────────────────────────────────────────────────────────┐
│ Prova 1 — POO · ADS3             ⏱ 42:10 restantes   ✓ Resposta salva │ ExamHeader
├──────────────────────────────────────────────────────────────────────┤
│ Questão 4 de 12 ━━━━━━━━━━━━━━━━━░░░░░░░░░░░░░░                       │ ExamProgress
│  01  02  03 [04] 05  06  07  08  09  10  11  12                       │ QuestionNavigator
├──────────────────────────────────────────────────────────────────────┤
│ Questão 4 · Objetiva · 1,0 ponto          [⚑ Marcar para revisão]      │ QuestionHeader
│                                                                      │
│ Enunciado em text-reading, largura ≤ 72ch …                          │ QuestionStatement
│ Material complementar (imagem, código, tabela)                       │
│                                                                      │
│ ( ) Alternativa A                                                    │ AnswerArea
│ (•) Alternativa B                                                    │
├──────────────────────────────────────────────────────────────────────┤
│ [← Anterior]                                  [Próxima →]  [Entregar] │ ExamFooter
└──────────────────────────────────────────────────────────────────────┘
```

Prioridade visual (FR-025): 1) número e estado da questão; 2) enunciado; 3) material
complementar; 4) área de resposta; 5) salvamento; 6) navegação; 7) informações
secundárias (pontuação, tipo). Largura: enunciado e resposta até `--reading-max`; em
tablet o navegador de questões rola na horizontal e nunca reduz a fonte.

Estrutura semântica: `<header>` (ExamHeader), `<nav aria-label="Questões">`
(QuestionNavigator), `<main id="conteudo">` com `<h1>` = "Questão N de M", `<footer>`
(ExamFooter).

## Estados de questão (FR-027)

| Estado | Cor | Forma | Ícone (Lucide) | Texto visível | Anúncio |
|--------|-----|-------|----------------|---------------|---------|
| atual | borda 2 px `--primary`, fundo `--primary-subtle` | quadrado com número em negrito | — | número | "Questão 4, atual, não respondida" (+ estado de resposta) |
| não respondida | borda `--border-control`, fundo `--surface` | círculo vazado | — | número | "Questão 5, não respondida" |
| respondida | fundo `--primary`, número `--primary-foreground` | círculo cheio | `Check` pequeno | número | "Questão 2, respondida" |
| marcada para revisão | borda `--warning` + marcador | círculo com canto marcado | `Flag` | número | "Questão 6, marcada para revisão, respondida" |
| bloqueada | `--disabled-*` | círculo tracejado | `Lock` | número | "Questão 9, bloqueada" (não é botão ativo) |
| invalidada | borda `--text-secondary`, número riscado | círculo com barra | `Ban` | número | "Questão 11, invalidada" |

Os estados se combinam (atual + respondida + revisão); o anúncio lista todos. Legenda dos
estados sempre disponível ("Legenda" que abre um `Popover`).

## Componentes

### ExamHeader
- Regiões: título da avaliação e turma (`text-h3`), `ExamTimer`, `SaveStatus`, estado da
  tentativa (`AttemptStatus`) quando não "em andamento".
- Fixo no topo (`--z-sticky`), fundo `--surface`, borda inferior `--border`.

### ExamProgress
- "Questão N de M" (`text-label`) + `Progress` com `aria-valuenow` = respondidas e rótulo
  "N de M respondidas". Atualiza sem mover o foco.

### QuestionNavigator
- Botões de 40 px (≥ 24 px mesmo em tablet), um por questão, com os estados acima;
  `aria-current="step"` na atual; navegação por Tab e setas; "Ir para a questão N" como
  nome quando não é a atual.
- Com muitas questões (ex.: 80): quebra em linhas no desktop; rolagem horizontal em
  tablet; nunca diminui o botão.

### QuestionHeader / QuestionStatus / ReviewFlag
- "Questão N" (`text-h2`), tipo e pontuação (`text-caption`, `--text-secondary`).
- `ReviewFlag`: botão `outline` com `Flag` e texto "Marcar para revisão" / "Desmarcar
  revisão" (`aria-pressed`).
- `QuestionStatus`: `Status` com o estado da resposta ("Não respondida", "Respondida").

### QuestionStatement
- `text-reading`; imagens com texto alternativo do autor; código em `text-code` num bloco
  `--background` com borda `--border` e rolagem horizontal própria (nunca a página).

### AnswerArea
- `MultipleChoiceAnswer`: `Radio` (uma resposta) ou `Checkbox` (várias) com alvos da
  linha inteira (≥ 44 px), letra da alternativa + texto; selecionada com borda
  `--primary` e fundo `--primary-subtle`, além do controle marcado.
- `EssayAnswer`: `Textarea` com contador de caracteres (`text-caption`, anunciado só a
  cada 10% restante do limite).
- `CodeAnswer`: regiões distintas — enunciado (acima), editor (`CodeEditor`), saída,
  erros e resultado da execução, cada uma com título (`text-label`) e borda própria;
  saída e erros em `text-code`; erro com `--danger-text` + `CircleAlert` e texto "Erro de
  execução"; resultado com `Status` ("3 de 5 testes passaram"). A fonte monoespaçada só
  existe dentro de editor, saída e erros.
- `CodeEditor`: escolha da biblioteca fica para a feature de exercícios de programação
  (spec 005, Clarifications); exigências visuais: `text-code`, números de linha em
  `--text-secondary`, foco com o contorno oficial, Tab indenta e Esc seguido de Tab sai
  do editor (anunciado no rótulo), sem tema próprio de cores fora dos tokens.

### SaveStatus (FR-028)

| Estado | Ícone | Texto | Cor | Anúncio |
|--------|-------|-------|-----|---------|
| salvando | `LoaderCircle` (sem giro com menos movimento) | "Salvando…" | `--text-secondary` | nenhum (evita ruído) |
| salvo | `CircleCheck` | "Resposta salva" | `--success-text` | "Resposta salva", via `role="status"`, no máximo uma vez a cada 10 s |
| erro ao salvar | `CircleAlert` | "Não foi possível salvar. Sua resposta continua na tela; tentaremos de novo. Se persistir, avise o professor." | `--danger-text` | imediato, `role="alert"` |

- `text-body-sm`, sem fundo, no `ExamHeader`; a troca salvando → salvo em menos de 1 s não
  pisca (o "Salvando…" só aparece após 400 ms).

### ExamTimer
- Tempo restante `mm:ss` (ou `h:mm:ss`) em `text-label` com algarismos tabulares, ícone
  `Timer`; valor do servidor (constituição III).
- Faltando 5 min: texto `--warning-text` + ícone `TriangleAlert` e anúncio único "Faltam 5
  minutos"; faltando 1 min: `--danger-text` e anúncio único "Falta 1 minuto". Nenhum
  anúncio a cada segundo; o leitor de tela consulta o tempo sob demanda (botão "Tempo
  restante").

### AttemptStatus
- `Status` com "Em andamento", "Entregue", "Encerrada pelo tempo", "Cancelada"; mesmas
  variantes do `Badge` (`info`, `success`, `warning`, `neutral`).

### ExamFooter
- "Anterior" (`secondary`), "Próxima" (`primary`), "Entregar avaliação" (`primary` na
  última questão; antes disso `outline`); entregar sempre pede confirmação
  (`AlertDialog`) com o resumo de questões não respondidas e marcadas para revisão.
- "Encerrar avaliação" e "Cancelar tentativa", quando existirem, usam `danger` com
  confirmação (FR-020).

### ExamAlert e FocusViolationWarning (FR-029)

Estrutura de todo aviso: título (o que aconteceu), linha "Registro" (se foi registrado) e
linha "O que fazer". `AlertDialog` quando exige ação; `Alert` no topo da questão quando
só informa. Tom neutro, sem "violação", "fraude" ou ameaça.

| Situação | Variante | Título | Registro | O que fazer |
|----------|----------|--------|----------|-------------|
| perda de foco (saiu da janela) | `warning` | "Você saiu da tela da avaliação" | "Este evento foi registrado às 14:32." | "Continue respondendo. Se foi um engano, você não precisa fazer nada." |
| tentativa de sair da página | `warning` (diálogo) | "Sair da avaliação?" | "Sua tentativa continua em andamento." | "Fique para continuar ou saia; o tempo continua contando." |
| desconexão | `danger` | "Sem conexão com o servidor" | "Suas respostas desta questão ainda não foram salvas." | "Mantenha esta tela aberta; tentaremos reconectar." |
| falha de sincronização | `warning` | "Não foi possível sincronizar" | "A última resposta salva foi às 14:30." | "Continue; tentaremos de novo automaticamente." |
| tempo acabando | `warning` | "Faltam 5 minutos" | — | "Revise as questões marcadas e entregue." |
| encerramento | `info` (diálogo) | "A avaliação foi encerrada" | "Suas respostas salvas foram entregues às 15:00." | "Você já pode fechar esta tela." |

O horário e o "foi registrado" vêm da resposta do servidor; sem confirmação do servidor,
o texto diz "Estamos registrando este evento".

## Atualizações frequentes (FR-030)

`ExamTimer`, `SaveStatus`, `ExamProgress`, `CodeEditor` e `AttemptStatus` atualizam em
componentes isolados (estado local ou seletor próprio): a atualização não redesenha o
enunciado nem a área de resposta, não move o foco, não altera a rolagem e não recria o
editor.

## Checagens para a feature de avaliações

- Axe sem violações em todas as combinações de estado; teclado cobre navegador, resposta,
  revisão e rodapé; anúncios conforme as tabelas acima.
- Nenhum token, ícone ou texto fora deste contrato sem emendá-lo.

## O que já existe (012)

A 012 (portal do aluno, modo NORMAL) construiu em `apps/web/components/ui/assessment/`:
`ExamProgress`, `QuestionNavigator` (estados atual, não respondida e respondida),
`QuestionHeader`, `QuestionStatus`, `QuestionStatement`, `MultipleChoiceAnswer` (uma
resposta), `EssayAnswer`, `CodeAnswer` (sem as regiões de saída, erros e resultado: nada é
executado), `CodeEditor` (`Textarea` com números de linha, sem biblioteca), `SaveStatus`,
`AttemptStatus` e `AssessmentFooter` (o `ExamFooter` do modo NORMAL). Continuam com a
feature de provas: `ExamHeader`, `ExamTimer`, `ReviewFlag`, `ExamAlert`,
`FocusViolationWarning` e os estados "marcada para revisão", "bloqueada" e "invalidada".
