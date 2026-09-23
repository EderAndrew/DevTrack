# DevTrack — web

Next.js 16 (App Router) / React 19, porta 3000. O navegador só fala com este app: o Next.js
reescreve `/api/*` para `$API_ORIGIN/api/*` (`next.config.js`), então o cookie de sessão fica
first-party e não há CORS. O destino do rewrite é gravado no build; chamadas do lado do servidor
(como `GET /api/me`) leem `API_ORIGIN` em tempo de execução. `proxy.ts` só redireciona por
conveniência e nunca autoriza: quem decide é a API.

## Estrutura

| Caminho | Conteúdo |
|---------|----------|
| `app/` | Rotas e layouts (sem `src/`), em grupos que não mudam a URL: `(auth)` login e recuperação de senha, sem cabeçalho; `(public)` telas abertas por links de e-mail, com cabeçalho; `(app)` telas internas, com o menu lateral |
| `features/<feature>/api` | Chamadas à API com os tipos de `@repo/contracts` |
| `features/<feature>/hooks` | Queries e mutations do TanStack Query |
| `features/<feature>/components` | Telas e formulários (React Hook Form); não importam `@/lib/api/*` (regra de lint) |
| `features/<feature>/schemas` | Schemas de formulário derivados dos contratos |
| `components/ui` | Componentes shadcn/ui (Radix + Tailwind), tema em `app/globals.css` |
| `components/shared` | Componentes próprios usados por várias features |
| `lib/api` | Cliente `fetch` nativo (`client.ts`) e chamadas do lado do servidor (`server.ts`) |
| `lib/messages` | Catálogo de mensagens de erro por código, datas e rótulos de status |
| `lib/query`, `lib/forms` | `QueryClient` e ligação dos erros da API aos campos do formulário |
| `test/` | Utilitários de teste (`keyboard.ts` para os testes de teclado `SC-012` e `003/SC-011`, contraste) |
| `e2e/` | Jornadas Playwright, configuração e fixtures |

Features: `auth`, `accounts`, `admin-activation`, `invitations`, `managers`, `profile`, `sessions`,
`teachers` e, da fase 003, `classes` (turmas do professor: lista, formulário, detalhes com as abas
"Alunos" e "Convites", convidar, reenviar, cancelar e remover), `class-invitations` (aceite público
em `/convite-turma`, nos modos criar conta, entrar e assumir cadastro não confirmado) e
`my-classes` ("Minhas turmas" do aluno, em `/minhas-turmas`). Não há mais `/cadastro`: conta de
aluno só nasce do convite de turma.

## Comandos

```bash
cp .env.example .env.local        # API_ORIGIN (padrão http://localhost:4000)
pnpm --filter web dev             # precisa da API em :4000
pnpm --filter web test            # Vitest + Testing Library + vitest-axe (WCAG 2.2 AA) + teclado
pnpm --filter web lint
pnpm --filter web check-types     # rode `pnpm build` antes: usa o dist/ de @repo/contracts
```

## E2E

```bash
docker compose up -d postgres-test mailpit
pnpm build                                          # a API do E2E roda apps/api/dist
pnpm --filter web exec playwright install chromium  # só na primeira vez
pnpm --filter web test:e2e
```

A suíte sobe uma API (porta 4100) e um web (porta 3100) próprios, recria o banco
`devtrack_e2e` a cada execução e lê os e-mails no Mailpit. Não interfere num `pnpm dev` aberto
nem no banco de desenvolvimento. O build do web vai para `.next/e2e` porque o destino do
rewrite é outro. Detalhes em
[`specs/002-stack-alignment/contracts/ci-and-e2e.md`](../../specs/002-stack-alignment/contracts/ci-and-e2e.md).
