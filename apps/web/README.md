# DevTrack — web

Next.js 16 (App Router) / React 19, porta 3000. O navegador só fala com este app: o Next.js
reescreve `/api/*` para `$API_ORIGIN/api/*` (`next.config.js`), então o cookie de sessão fica
first-party e não há CORS. O destino do rewrite é gravado no build; chamadas do lado do servidor
(como `GET /api/me`) leem `API_ORIGIN` em tempo de execução. `proxy.ts` só redireciona por
conveniência e nunca autoriza: quem decide é a API. As regras de arquitetura, do design system e
as guardas de teste estão em [`CLAUDE.md`](CLAUDE.md).

## Estrutura

| Caminho | Conteúdo |
|---------|----------|
| `app/` | Rotas e layouts (sem `src/`), em grupos que só escolhem a moldura, nunca a URL (tabela abaixo) |
| `features/<feature>/api` | Chamadas à API com os tipos de `@repo/contracts`; só esta camada usa `lib/api` (regra de lint) |
| `features/<feature>/hooks` | Queries e mutations do TanStack Query |
| `features/<feature>/components` | Telas e formulários (React Hook Form), sem regra de negócio |
| `features/<feature>/schemas` | Schemas de formulário derivados dos contratos e os textos da feature |
| `features/<feature>/store` | Estado só do navegador, como as respostas e os eventos guardados sem conexão |
| `design-system/` | `tokens.css` (todo valor visual) e a documentação do design system ([README](design-system/README.md)) |
| `components/ui` | Componentes fundamentais (shadcn/ui, Radix + Tailwind), `assessment/` (questão, salvamento, cronômetro e avisos da prova), `code/` (o `CodeEditor` com CodeMirror 6 sob demanda e o `CodeBlock` só leitura) e `chart.tsx` (Recharts) |
| `components/shared` | Componentes próprios usados por várias telas: menu lateral, cabeçalho público, avisos, marca |
| `components/layout` | `AppShell`, `StudentLayout`, `Topbar`, `PageHeader` e a escolha da moldura das telas de conta |
| `lib/api` | Cliente `fetch` nativo (`client.ts`) e chamadas do lado do servidor (`server.ts`) |
| `lib/messages` | Catálogo de mensagens de erro por código, datas e rótulos de situação |
| `lib/query`, `lib/forms` | `QueryClient` e ligação dos erros da API aos campos do formulário |
| `test/` | Utilitários e guardas: teclado (`keyboard.ts`), CodeMirror (`code-editor.ts`), axe, contraste, camadas de lint, XSS do portal, textos da prova e as guardas do design system |
| `e2e/` | Jornadas Playwright, configuração, sementes e o simulador do OpenRouter |

| Grupo de rota | Moldura | Telas |
|---------------|---------|-------|
| `(auth)` | sem cabeçalho | `/entrar`, `/esqueci-senha` |
| `(public)` | cabeçalho público | links dos e-mails: `/verificar-email`, `/redefinir-senha`, `/convite`, `/convite-turma`, `/ativar-admin` |
| `(app)` | `AppShell` com menu lateral | professor, gestor e administrador: disciplinas, turmas, bancos de exercícios, trabalhos e provas, professores, `/admin/*` |
| `(student)` | layout do aluno | `/painel`, `/minhas-turmas`, `/minhas-atividades`, `/historico`, `/meus-feedbacks` |
| `(account)` | uma das duas acima, pelas permissões do menu | `/conta/perfil`, `/conta/sessoes` |
| `(focus)` | sem menu nem cabeçalho | `/minhas-atividades/[id]/responder`: trabalho em modo controlado e prova |
| `(catalog)` | catálogo | `/design-system`, só em desenvolvimento e nos testes |

## Features

| Fase | Features |
|------|----------|
| 001–002 | `auth`, `accounts`, `admin-activation`, `invitations` (convites de professor e gestor, com a situação do e-mail desde a 017), `managers`, `teachers`, `profile`, `sessions` |
| 003 | `classes` (turmas do professor, alunos e convites), `class-invitations` (aceite em `/convite-turma`), `my-classes` ("Minhas turmas" do aluno). Não há `/cadastro`: conta de aluno só nasce do convite de turma |
| 004 | `subjects` ("Minhas disciplinas"), `syllabus` (envio, processamento, revisão e confirmação da ementa), `class-calendar`, `class-plan` (planejamento com tópicos, cobertura e "Concluir aula"); toda gravação no planejamento envia o `revision` do cache, e um 409 mostra "Atualizar" sem descartar o formulário |
| 005 | `design-system` (o catálogo montado de `registry.ts`) |
| 006–009 | `ai` (pedir, acompanhar e cancelar uma execução da IA e decidir a proposta), `ai-operations` ("Operação de IA": agentes, execuções, modelos, custos e Indicadores), `curriculum-ai` ("Preencher com IA" na ementa) |
| 010 | `exercises` (banco de exercícios, "Criar com IA", lotes; desde a 019 os casos de teste do Código) |
| 011 | `works` (banco de trabalhos e "Criar trabalho com IA") |
| 012–013 | `activities` (aplicar à turma, correção, liberação), `student-activities` (painel, atividades e histórico do aluno), `ranking` |
| 015 | `controlled-attempt` (o monitoramento do modo controlado), `work-help` (a ajuda da IA) |
| 016 | `attendance` ("Chamada", sala, "Sair da sala" e a pausa) |
| 018 | `exams` (Banco de Provas e "Criar prova com IA"), `exam-session` (a sala da prova do professor), `exam-attempt` (a prova do aluno, com o tempo do servidor) |
| 019 | `code-run` ("Executar" e o resultado de cada caso público) |
| 020 | `feedback` ("Enviar feedback", "Meus feedbacks" e os "Feedbacks" do administrador) |

O editor de código (014) não fecha aspas nem parênteses, não completa e não reindenta o que se
digita; desde 2026-10-27 o Enter indenta a nova linha pela gramática da linguagem.

## Comandos

```bash
cp .env.example .env.local        # API_ORIGIN (padrão http://localhost:4000)
pnpm --filter web dev             # precisa da API em :4000
pnpm --filter web test            # Vitest + Testing Library + vitest-axe (WCAG 2.2 AA), teclado e guardas
pnpm --filter web test test/contrast.test.ts   # um arquivo (sem `--`)
pnpm --filter web test -t "014/"  # um teste, ou um prefixo de id
pnpm --filter web lint
pnpm --filter web check-types     # rode `pnpm build` antes: usa o dist/ de @repo/contracts
```

## E2E

```bash
docker compose up -d postgres-test mailpit
pnpm build                                          # a API do E2E roda apps/api/dist
pnpm --filter api code-runner:images                # 019, só na primeira vez: o E2E roda programas de verdade
pnpm --filter web exec playwright install chromium  # só na primeira vez
pnpm --filter web test:e2e
pnpm --filter web test:e2e work-bank                # uma spec, pelo caminho
```

A suíte sobe uma API (porta 4100), um web (porta 3100) e, desde a 019, o worker real do Code Runner
(Docker com `runc`); recria o banco `devtrack_e2e` a cada execução, lê os e-mails no Mailpit e
responde às chamadas de IA pelo simulador `e2e/openrouter-mock.ts`. Não interfere num `pnpm dev`
aberto nem no banco de desenvolvimento. O build do web vai para `.next/e2e` porque o destino do
rewrite é outro. Detalhes em
[`specs/002-stack-alignment/contracts/ci-and-e2e.md`](../../specs/002-stack-alignment/contracts/ci-and-e2e.md).
