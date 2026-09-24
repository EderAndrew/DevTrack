# Web UI Contract: 004 — Área do Professor

Stack e padrões da 002/003: shadcn/ui + Tailwind + Lucide, TanStack Query, React Hook Form
com os schemas de `@repo/contracts`, textos de erro no catálogo por código, teclado e axe
em todo componente. `proxy.ts` ganha `/disciplinas` no matcher (só redirecionamento).

## Rotas

| Rota | Tela | Permissão exibida |
|------|------|-------------------|
| `/disciplinas` | Minhas disciplinas: lista com pesquisa e filtro de situação, "Nova disciplina" | `disciplinas.visualizar` |
| `/disciplinas/nova` | Formulário nome + descrição | `disciplinas.criar` |
| `/disciplinas/[id]` | Dados (editar, desativar/reativar), Turmas da disciplina (período, datas, situação do planejamento, "Nova turma" com a disciplina escolhida), Ementa (versões, situação, "Enviar ementa") | `disciplinas.visualizar` |
| `/disciplinas/[id]/ementa/[documentId]` | Situação do processamento; texto extraído; revisão (grupos e itens editáveis) com "Salvar", "Confirmar conteúdo"; "Preencher manualmente"; "Tentar novamente"; "Baixar original"; imagem ao lado quando PNG/JPEG | `ementas.visualizar` |
| `/turmas/[id]/ementa` | Ementa usada pela turma, escolher versão confirmada, "Enviar ementa" (envio pela disciplina da turma, com `?turma=` para voltar e usar) | `planejamento.visualizar` |
| `/turmas/[id]/calendario` | Calendário do período, total, lista numerada dos encontros, resolução de tópicos ao desmarcar | `planejamento.visualizar` (edição com `calendario.gerenciar`) |
| `/turmas/[id]/planejamento` | Encontros em ordem com tópicos, "Sem data", cobertura, arquivados, situação do planejamento | `planejamento.visualizar` |

A página da turma (`/turmas/[id]`, 003) ganha navegação por abas: Alunos, Convites,
Ementa, Calendário, Planejamento. O formulário de turma (003) ganha Disciplina (select das
ativas), Data de início e Data de término. Menu lateral: "Minhas disciplinas" (ícone
`Library`) com `disciplinas.visualizar`.

## Componentes

- **Envio** (`features/syllabus/components/syllabus-upload.tsx`): área de soltar arquivo
  + botão "Escolher arquivo" (`<input type="file" accept=".pdf,.docx,.png,.jpg,.jpeg">`),
  texto "PDF, DOCX, PNG ou JPG, até 10 MB.", barra de progresso, recusa no cliente antes
  do envio (tipo e tamanho — UX; o servidor decide).
- **Situação** (`syllabus-status.tsx`): selo "Enviado", "Processando", "Processado",
  "Falhou" em `aria-live="polite"`; atualização a cada 2 s enquanto enviado/processando.
- **Revisão** (`syllabus-revision-editor.tsx`): campos Título, Ementa, Competência;
  grupos com título e itens; botões "Adicionar grupo", "Adicionar item", "Subir",
  "Descer", "Mover para o grupo…", "Remover"; RHF `useFieldArray`.
- **Calendário** (`features/class-calendar/components/meeting-calendar.tsx`): `Calendar`
  do shadcn (`mode="multiple"`, `fromDate`/`toDate` = período da turma, `weekStartsOn: 0`,
  pt-BR), "Total de aulas selecionadas: N", lista dos encontros numerados; "Salvar
  calendário" envia acrescentadas e removidas. Desmarcar data com tópicos abre o diálogo
  "Esta aula tem tópicos planejados" com, por tópico, as escolhas "Mover para outra aula",
  "Deixar sem data", "Juntar com outro tópico" e "Arquivar" (tópico concluído: só "Arquivar").
- **Planejamento** (`features/class-plan/components/…`): cada encontro ("Aula 05 —
  18/03/2027") com seus tópicos; seção "Sem data"; por tópico: Editar, Subir, Descer,
  Aula (select), Dividir, Arquivar, e seleção para "Juntar tópicos"; "Novo tópico";
  "Cobertura da ementa" com itens cobertos/não cobertos e "Criar tópico com este item";
  "Concluir aula" (planejamento em andamento, aula de hoje ou passada) e, no tópico concluído,
  a marca verde "Aula concluída" com só "Arquivar" e "Reabrir aula" habilitados (US9);
  "Tópicos arquivados" com "Restaurar" (o tópico concluído mostra "Aula concluída em
  <data>" e não tem "Restaurar"); barra de situação com "Confirmar planejamento",
  "Reabrir", "Iniciar", "Arquivar planejamento" (confirmação em `alert-dialog`).
- **Formulário de tópico** (diálogo): Título, Descrição, Aula (select com "Sem data"),
  Itens da ementa (lista de caixas de seleção por grupo, com busca).

## Mensagens

| Situação | Texto |
|----------|-------|
| Disciplina criada / salva | "Disciplina criada." / "Disciplina salva." |
| Nome em uso | "Você já tem uma disciplina com este nome." |
| Tipo não aceito | "Envie um arquivo PDF, DOCX, PNG ou JPG." |
| Grande demais | "O arquivo passa de 10 MB." |
| Ilegível / protegido / macros | "Não foi possível abrir este arquivo." / "Este arquivo está protegido por senha." / "Arquivos com macros não são aceitos." |
| Complexo demais | "O arquivo tem páginas ou conteúdo demais para processar." |
| Envio aceito / duplicado | "Ementa enviada." / "Este arquivo já foi enviado (versão N)." |
| Sem texto | "Não foi possível ler o texto deste arquivo. Preencha o conteúdo manualmente." |
| Falhou | "O processamento falhou: <arquivo ilegível \| tempo esgotado \| erro interno>." + "Tentar novamente" / "Preencher manualmente" |
| Revisão salva / confirmada | "Revisão salva." / "Conteúdo confirmado." + (vindo de turma) "Usar esta ementa na turma <nome>?" |
| Revisão vazia | "Inclua ao menos um item antes de confirmar." |
| Turma sem disciplina ou datas | "Informe a disciplina e as datas de início e término da turma para planejar." |
| Ementa obrigatória | "Envie e confirme a ementa antes de criar tópicos." |
| Calendário salvo | "Calendário salvo." |
| Conflito | "O planejamento foi alterado depois que você o abriu. Atualize a página antes de continuar." |
| Planejamento confirmado / sem tópicos | "Planejamento confirmado." / "Crie ao menos um tópico antes de confirmar." |
| Planejamento arquivado | "Este planejamento está arquivado e não pode ser alterado." |
| Aula concluída / reaberta | "Aula concluída." / "Aula reaberta." |
| Aula que ainda não aconteceu | "Só é possível concluir uma aula a partir da data dela." |
| Tópico criado / salvo / juntado / dividido / arquivado / restaurado | "Tópico criado." / "Tópico salvo." / "Tópicos juntados." / "Tópico dividido." / "Tópico arquivado." / "Tópico restaurado." |
| Item fora da versão | "Este item não existe na versão da ementa usada agora." |

## Teclado (SC-012)

Testes `expectTabOrder` em cada formulário; calendário: setas movem o foco entre dias,
`PageUp`/`PageDown` trocam o mês, Espaço/Enter marcam; planejamento: "Subir"/"Descer"
mantêm o foco no tópico movido e anunciam a nova posição ("Tópico movido para a posição 4.").
