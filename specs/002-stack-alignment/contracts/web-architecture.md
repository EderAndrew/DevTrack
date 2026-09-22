# Contract: arquitetura do `apps/web`

Regras que as telas da Fase 001 passam a seguir e que as fases seguintes copiam.
Decisões: [research.md](../research.md) S9–S13.

## Pastas

```text
apps/web/
├── app/
│   ├── layout.tsx            # Server Component: sessão para a navegação, <Providers>
│   ├── providers.tsx         # "use client": QueryClientProvider
│   ├── globals.css           # Tailwind + tokens do tema (paleta da Fase 001)
│   └── <rotas>/page.tsx      # Server Components: checam sessão e buscam dados iniciais via features/<f>/api, compõem features
├── features/<feature>/
│   ├── api/                  # funções que chamam a API (únicas com acesso a lib/api/*); server.ts = leituras do Server Component (usa next/headers; só app/ importa, nunca por barrel)
│   ├── components/           # "use client": telas e formulários da feature + testes
│   ├── hooks/                # useQuery/useMutation da feature, chaves de query
│   ├── schemas/              # schemas de formulário derivados do contrato + mensagens
│   └── types/                # tipos de UI da feature (nunca cópia de tipo do contrato)
├── components/
│   ├── ui/                   # shadcn (gerado pela CLI; editado só para acessibilidade/tema)
│   └── shared/               # Field, ErrorSummary, SubmitButton, NoAccess, SiteNav, LogoutButton
├── lib/
│   ├── api/client.ts         # wrapper fetch (ApiError, Retry-After, Content-Type)
│   ├── api/server.ts         # GET em Server Component com cookie encaminhado
│   ├── query/                # criação do QueryClient e tratamento global de 401
│   ├── messages/             # catálogo de erros por código, rótulos de status, datas
│   └── utils.ts              # cn() do shadcn
├── test/                     # a11y, keyboard, contrast, render (renderWithProviders)
└── e2e/                      # Playwright
```

Features: `auth`, `sessions`, `admin-activation`, `invitations`, `managers`,
`accounts`, `teachers`. Não há `store/` nesta feature (Redux fora do escopo).

## Mapa das telas

| Rota | Feature | Componente atual → novo |
|------|---------|-------------------------|
| `/entrar` | `auth` | `login-form.tsx` → `features/auth/components/login-form.tsx` |
| `/cadastro` | `auth` | `signup-form.tsx` → `features/auth/components/signup-form.tsx` |
| `/verificar-email` | `auth` | `verify-email.tsx` → `features/auth/components/verify-email.tsx` |
| `/esqueci-senha` | `auth` | `forgot-password-form.tsx` → `features/auth/components/forgot-password-form.tsx` |
| `/redefinir-senha` | `auth` | `reset-password-form.tsx` → `features/auth/components/reset-password-form.tsx` |
| `/convite` | `invitations` | `invitation-acceptance.tsx` → `features/invitations/components/…` |
| `/ativar-admin` | `admin-activation` | `admin-activation.tsx` → `features/admin-activation/components/…` |
| `/conta/sessoes` | `sessions` | `sessions-list.tsx` → `features/sessions/components/…` |
| `/admin/managers` | `managers` | `managers-admin.tsx` → `features/managers/components/…` |
| `/admin/usuarios` | `accounts` | `users-admin.tsx` → `features/accounts/components/…` |
| `/professores` | `teachers` | `teachers-admin.tsx` → `features/teachers/components/…` |

As rotas, os títulos (`metadata`), os redirecionamentos e o `Referrer-Policy` das
páginas com token não mudam.

## Regras de camada (ESLint em `apps/web/eslint.config.js`)

| Regra | Onde vale | Efeito |
|-------|-----------|--------|
| `no-restricted-imports` de `@/lib/api/*` | tudo, exceto `features/*/api/**` e `lib/**` | nem componentes nem rotas (`page.tsx`, `layout.tsx`) chamam a API diretamente (FR-025; Constituição, Padrões por Camada) |
| `no-restricted-imports` de `@/features/*/api/server` | `features/*/components/**`, `features/*/hooks/**`, `components/**` | código de cliente não importa leituras de servidor (`next/headers` quebraria o bundle do cliente) |
| `no-restricted-globals` `fetch` | tudo, exceto `lib/api/**`, `e2e/**`, testes | só o wrapper usa `fetch` |
| `no-restricted-imports` de `@reduxjs/*`, `axios` | tudo | stack oficial |
| `no-restricted-imports` de `@repo/contracts` como valor em `components/shared/**` | `components/shared/**` | componentes compartilhados não conhecem contratos de domínio |

## Servidor e cliente

- A página (Server Component) chama `getMe()` de `features/auth/api`; sem sessão → `redirect("/entrar?next=…")`;
  sem permissão (para UX) → `<NoAccess>`. A API continua sendo quem autoriza.
- A página busca os dados iniciais por uma função de `features/<f>/api/server.ts` (ex.:
  `fetchOwnSessions()`, que usa `serverGet` por dentro) e passa para o componente da
  feature como `initialData`. A página nunca importa `@/lib/api/*`.
- O componente usa os hooks da feature (`useManagers(initialData)`), que chamam
  `features/<f>/api`.
- Mutações: `useMutation` → em sucesso, `setQueryData` com a entidade devolvida e
  `invalidateQueries` das listas afetadas; anúncio em região `aria-live` como hoje.

## Cache

- `QueryClient` criado uma vez por navegador em `app/providers.tsx`.
- Padrões: `staleTime: 30_000`; `retry`: até 2 vezes só para `NETWORK_ERROR`, nunca para
  respostas da API; `refetchOnWindowFocus: false` (evita requisições inesperadas nos
  fluxos administrativos).
- `QueryCache` e `MutationCache` com `onError`: `ApiError` 401 → `queryClient.clear()` e
  navegação para `/entrar?next=<rota atual>`.
- Logout e "sair de todos": em sucesso, `queryClient.clear()` antes de navegar.
- Sem persistência de cache. Tokens de URL só em mutações.

## Formulários

- `useForm({ resolver: zodResolver(FormSchema, { error: fieldMessages }), mode: "onSubmit" })`.
- `FormSchema` = schema do contrato ou derivado (`.pick`, `.omit`, `.extend`,
  `.refine` para confirmação de senha), em `features/<f>/schemas/`.
- `fieldMessages`: campo vazio → texto atual do campo; demais violações → "Dados
  inválidos.".
- Erros de validação e erros da API vão para o `ErrorSummary` (que recebe o foco) e
  para o campo correspondente (`aria-describedby`, `aria-invalid`); os códigos de API
  associados a campos são os mesmos de hoje (ex.: `SELF_INVITE_FORBIDDEN`,
  `ALREADY_MANAGER`, `INVITATION_ALREADY_PENDING` → campo e-mail).
- Envio duplicado bloqueado por `formState.isSubmitting`; o botão fica focável com
  `aria-disabled`/`aria-busy`, como hoje.

## Componentes compartilhados

| Componente | Base shadcn | Contrato de acessibilidade (inalterado) |
|------------|-------------|------------------------------------------|
| `Field` | `Label` + `Input` | `label[for]`, "(obrigatório)", dica `#<id>-dica`, erro `#<id>-erro`, `aria-describedby`, `aria-invalid` |
| `ErrorSummary` | `Alert` (variante destrutiva) | região `aria-live="polite"` sempre presente; título; foco ao receber erros; links que focam o campo |
| `SubmitButton` | `Button` | `aria-disabled` + `aria-busy` enquanto envia; texto de envio anunciado em `role="status"` |
| Tabelas administrativas | `Table` | `<caption>` visualmente oculta, `th[scope=col]`, botões com `aria-label` que nomeia o alvo |
| `SiteNav`, `LogoutButton`, `NoAccess` | `Button` | textos e ordem de foco atuais |

## Testes

- `renderWithProviders(ui)` em `test/render.tsx`: `QueryClient` novo por teste,
  `retry: false`.
- Cada tela mantém: axe sem violações (estado inicial e de erro), bloco
  `describe("SC-012 — acessibilidade e teclado (FR-075)")` com `expectTabOrder`,
  `tabTo`, `expectFieldErrorLinked`.
- `test/contrast.test.ts`: contraste AA dos pares de tokens em tema claro e escuro.
- `lib/messages/error-messages.test.ts`: tabela fixa com os textos da Fase 001 para os
  24 códigos (SC-004).
- Os títulos de `describe`/`it` com ids da Fase 001 (`US4-…`, `SC-012`) são mantidos: o
  teste de rastreabilidade da Fase 001 os procura em `apps/web`.
