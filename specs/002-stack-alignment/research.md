# Research: 002 — Refatoração de alinhamento de stack da Fase 001

**Date**: 2026-09-22 | **Spec**: [spec.md](./spec.md) | **Plan**: [plan.md](./plan.md)

Cada decisão resolve uma incógnita do *Technical Context* ou uma escolha deixada pela
spec para o plano. Formato: **Decision / Rationale / Alternatives considered**. As
decisões R1–R23 da Fase 001 (`specs/001-foundation-identity-access/research.md`)
continuam valendo; aqui a numeração recomeça com o prefixo **S** para não colidir.

Versões verificadas no registro npm em 2026-09-22: `tailwindcss` 4.3.3,
`@tailwindcss/postcss` 4.3.3, `@tanstack/react-query` 5.103.2, `react-hook-form`
7.88.0, `@hookform/resolvers` 5.9.1, `lucide-react` 1.47.0, `radix-ui` 1.6.7,
`class-variance-authority` 0.7.1, `clsx` 2.1.1, `tailwind-merge` 3.7.0, `shadcn` (CLI)
4.21.0, `@playwright/test` 1.63.0, `zod` 4.6.5 (a mesma que a API já usa).

---

## S1. Formato e build do pacote `@repo/contracts`

- **Decision**: pacote de workspace `packages/contracts`, nome `@repo/contracts`, ESM
  (`"type": "module"`), compilado com `tsc` (TypeScript 7 do monorepo) para `dist/` com
  `.d.ts`. `exports` com as condições `types` e `default` (sem `import`/`require`
  separados):

  ```json
  "exports": { ".": { "types": "./dist/index.d.ts", "default": "./dist/index.js" } }
  ```

  Imports internos usam extensão `.js` (`moduleResolution: NodeNext`).
- **Rationale**: a API compila com SWC para CommonJS e roda de `dist/`; o Node não
  executa `.ts` dentro de `node_modules`, então o pacote precisa entregar JavaScript.
  O Node 24 carrega ESM por `require()` sem flag (sem *top-level await* no pacote), e
  o TypeScript em `module: NodeNext` aceita esse import num projeto CommonJS.
  **Verificado em 2026-09-22**: `tsc` 7.0.2 emitiu `index.js` + `index.d.ts` de um
  schema Zod; um `.cjs` fez `require()` do resultado e parseou; um projeto CommonJS
  com `module: NodeNext` fez type-check importando o pacote. Next.js e Vitest consomem
  ESM nativamente.
- **Alternatives considered**: pacote "JIT" exportando `.ts` (quebra a API em runtime,
  que roda JS compilado); build duplo CJS+ESM (duas saídas para manter e risco de
  *dual package hazard* com instâncias diferentes de Zod); `tsup`/bundler (dependência
  nova sem necessidade — `tsc` já está no monorepo).

## S2. Uma única versão de Zod (catálogo pnpm)

- **Decision**: `catalog:` no `pnpm-workspace.yaml` com `zod: ^4.6.5`; `apps/api`,
  `apps/web` e `packages/contracts` declaram `"zod": "catalog:"` em `dependencies`. Um
  teste de guarda lê `pnpm-lock.yaml` e falha se houver mais de uma versão de `zod`
  resolvida.
- **Rationale**: FR-007 e Princípio XXVI. Com a mesma versão, o pnpm resolve uma só
  instância, e os tipos `z.ZodType` do contrato são os mesmos que a API e o web usam.
- **Alternatives considered**: `peerDependencies` no pacote (não fixa a versão sozinho;
  o catálogo é o mecanismo nativo do pnpm 11 para isso); `overrides` (reservado a
  correções de segurança, S17).

## S3. Organização e nomes dentro do pacote

- **Decision**: um diretório por domínio, espelhando os módulos da API:
  `common/` (e-mail, nome, token, senha de entrada, UUID, cursor, formato de erro,
  códigos de erro), `auth/` (cadastro, verificação, login, recuperação de senha),
  `me/` (usuário atual e sessões próprias), `accounts/` (administração de usuários),
  `provisioning/` (convites, gestores, professores, aceite), `admin-activation/`,
  `health/`, mais `endpoints.ts` (S6) e `index.ts`. Nomes: schema em PascalCase com
  sufixo `Schema` e tipo derivado com o mesmo nome sem sufixo:

  ```ts
  export const LoginRequestSchema = z.strictObject({ email: EmailSchema, password: PasswordInputSchema });
  export type LoginRequest = z.infer<typeof LoginRequestSchema>;
  ```

  Enums públicos seguem a mesma regra (`InvitationStatusSchema` / `InvitationStatus`).
- **Rationale**: nomes previsíveis tornam possível o teste de guarda de duplicação
  (S7) e deixam claro o que é schema (valor) e o que é tipo.
- **Alternatives considered**: um arquivo único (cresce sem limite nas próximas
  fases); nomes `XxxDto` (vocabulário do NestJS, não do contrato).

## S4. Formato das respostas: JSON como trafega

- **Decision**: schemas de resposta descrevem o JSON que trafega: datas são strings
  ISO 8601 (`z.iso.datetime()`), não `Date`. Os mapeadores de view da API passam a
  converter explicitamente (`expiresAt: row.expiresAt.toISOString()`), e os tipos de
  retorno dos services passam a ser os tipos do contrato. O JSON produzido é o mesmo
  de hoje (o `JSON.stringify` já gerava a mesma string).
- **Rationale**: um só tipo descreve o que API envia e web recebe; hoje a API tipa
  `Date` e o web tipa `string` para o mesmo campo, exatamente a divergência que o
  Princípio XXVI proíbe.
- **Alternatives considered**: `z.codec` (string ↔ `Date`) — mais expressivo, mas
  obriga o web a decodificar cada resposta e muda as funções de formatação sem ganho
  nesta refatoração; manter `Date` na API e `string` no web (duplicação).

## S5. Uso dos contratos na API

- **Decision**: controllers importam os schemas de requisição de `@repo/contracts` e
  continuam usando `ZodBody(schema)` / `new ZodValidationPipe(schema)`; o pipe não
  muda. `platform/http/schemas.ts` e os schemas locais dos controllers são removidos.
  As interfaces de view locais (`MeView`, `SessionView`, `InvitationView`,
  `ManagerView`, `UserAccountView`, `AccountPage`, `TeacherListItem`, `TeacherView`,
  `PublicAccepted`, `HealthStatus`…) são substituídas pelos tipos do contrato. Tipos
  internos (linhas do Prisma como `InvitationRow`, `INVITATION_INCLUDE`) ficam na API.
- **Rationale**: FR-001, FR-008. Os schemas atuais já são Zod 4 `strictObject`;
  movê-los preserva normalização (trim/minúsculas), limites e a rejeição de campos
  desconhecidos — as suítes US1-2 e de autorização da Fase 001 provam a equivalência.
- **Alternatives considered**: gerar os contratos a partir dos controllers (OpenAPI →
  tipos): inverte a fonte de verdade e acrescenta geração de código.

## S6. Catálogo de endpoints e conformidade das respostas

- **Decision**: `endpoints.ts` no pacote declara cada rota da API da Fase 001:

  ```ts
  export const endpoints = {
    "auth.login": { method: "POST", path: "/auth/login", body: LoginRequestSchema, response: LoginResponseSchema, status: 200 },
    "managers.list": { method: "GET", path: "/managers", response: ManagerListResponseSchema, status: 200 },
    // …
  } as const satisfies Record<string, EndpointContract>;
  ```

  Na API, `createTestApp()` registra um **interceptor só de teste**
  (`test/helpers/contract-conformance.interceptor.ts`) que localiza o endpoint pelo
  método e pelo caminho da rota do Nest e valida o valor devolvido pelo handler contra
  `response`; uma resposta fora do contrato vira falha do teste que a produziu. Um teste
  de guarda (`test/contracts/endpoint-catalog.spec.ts`) exige correspondência de mão
  dupla entre as rotas registradas no Nest e o catálogo.
- **Rationale**: FR-002 pede conferir as respostas reais sem reescrever as ~520
  asserções da Fase 001 (US2-1). O interceptor cobre toda resposta que qualquer teste
  já produz; o teste de catálogo impede rota sem contrato, como o
  `route-declarations.spec.ts` já faz para permissões.
- **Alternatives considered**: validar respostas em produção (custo em toda
  requisição e risco de transformar um detalhe em `500` para o usuário); acrescentar
  `expect(schema.parse(res.body))` em cada teste (toca centenas de testes e é fácil
  esquecer em testes novos).

## S7. Testes de guarda do Princípio XXVI

- **Decision**: em `packages/contracts/test/`, rodando com Vitest no próprio pacote:
  - **fronteira** (FR-005): nenhum arquivo do pacote importa `@prisma/*`,
    `@nestjs/*`, `react`, `next`, `@reduxjs/*` ou caminhos de `apps/`; e o código não
    contém literais de texto em português destinados ao usuário (heurística: string
    com espaço fora de comentários e de `describe` de schema é proibida). Reforçado por
    `no-restricted-imports` no ESLint do pacote.
  - **versão única de Zod** (FR-007): lê `pnpm-lock.yaml` e exige uma só versão.
  - **duplicação** (FR-006): varre `apps/api/src` e `apps/web` (exceto `node_modules`,
    `.next`, `dist`, gerados) e falha se encontrar `interface`/`type` com o nome de um
    tipo exportado pelo pacote, ou união literal igual aos valores de um enum do pacote
    (ex.: `"PENDING" | "ACCEPTED" | "EXPIRED" | "REVOKED"`).
- **Rationale**: as regras do XXVI só se mantêm se falharem automaticamente; a
  heurística por nome e por valores cobre o caso real da Fase 001 (cópias manuais em
  `apps/web/lib/*-api.ts` e views na API).
- **Alternatives considered**: só revisão de código (não escala); análise de tipos
  estrutural completa (cara e frágil para um ganho marginal sobre nome + valores).

## S8. Códigos de erro e mensagens

- **Decision**: o pacote exporta `ErrorCodeSchema` (enum dos 24 códigos do catálogo
  atual) e `ErrorBodySchema` (`{statusCode, code, message}`). A API mantém
  `ErrorCatalog` (status e mensagem) tipado com `satisfies Record<ErrorCode, …>`, e
  continua enviando `message` (formato inalterado, FR-010). O web ganha
  `lib/messages/error-messages.ts`, `satisfies Record<ErrorCode, string>`, com os
  mesmos textos que a API envia hoje, e passa a exibir esse texto em vez de
  `error.message`. Código desconhecido → texto de `UNEXPECTED_RESPONSE`. `RATE_LIMITED`
  com `Retry-After` mantém a frase com minutos. `NETWORK_ERROR` e
  `UNEXPECTED_RESPONSE` continuam códigos do web, fora do contrato.
- **Rationale**: Princípio XXVI (textos no web) e FR-013; o `satisfies` torna erro de
  tipo esquecer um código novo em qualquer lado. Um teste do web fixa a tabela de
  textos da Fase 001 (SC-004).
- **Alternatives considered**: mensagens no contrato (proibido pelo XXVI); web
  continuar exibindo `message` da API (deixa o texto da interface dependente do
  backend).

## S9. Formulários: React Hook Form + schema do contrato

- **Decision**: cada formulário usa `useForm` com `zodResolver(schema)`, onde `schema`
  é o schema de requisição do contrato ou um derivado dele em
  `features/<f>/schemas/` (ex.: `ResetPasswordFormSchema = ResetPasswordConfirmRequestSchema.omit({ token: true }).extend({ confirmation })`
  com `refine` para "as senhas não coincidem"). As mensagens vêm de um mapa do web por
  campo, aplicado pela opção `error` do Zod no resolver:
  - campo vazio → a mensagem atual do campo ("Informe seu e-mail.", "Informe o
    nome.", …);
  - qualquer outra violação do contrato (formato de e-mail, tamanho, caractere de
    controle) → "Dados inválidos.", o mesmo texto que a API devolve hoje nesses casos,
    agora ligado ao campo;
  - regras que são só do servidor (força da senha) não entram no cliente; o
    `WEAK_PASSWORD` da API continua aparecendo como hoje.

  Os componentes `Field`, `ErrorSummary` e `SubmitButton` são refeitos sobre os
  componentes shadcn com os mesmos atributos de acessibilidade (ids `-dica`/`-erro`,
  `aria-describedby`, `aria-invalid`, resumo que recebe o foco, `aria-busy`), e o envio
  duplicado é bloqueado por `formState.isSubmitting`.
- **Rationale**: FR-022 e FR-012. Os textos continuam os mesmos; a única diferença
  observável é que um valor que antes só era recusado pela API ("Dados inválidos." no
  resumo) passa a ser apontado no próprio campo antes do envio — sem texto novo e com
  a API ainda validando tudo (Princípio I).
- **Alternatives considered**: validar no cliente só "campo vazio" com schema próprio
  (contraria "validar com o schema do contrato"); mensagens padrão do Zod (texto em
  inglês e diferente do atual).

## S10. Estado do servidor: TanStack Query

- **Decision**:
  - `app/providers.tsx` (Client Component) cria um `QueryClient` por navegador
    (`useState`) e envolve a árvore em `QueryClientProvider`. Padrões: `retry` só para
    falhas de rede, nunca para `4xx`; `staleTime` de 30 s; sem *persister*.
  - As páginas continuam Server Components: checam a sessão e buscam os dados no
    servidor, com o cookie encaminhado (como hoje), e passam o resultado como
    `initialData` para os hooks da feature (`useManagers(initial)`). Não há "piscar" de
    conteúdo protegido, e o redirecionamento para `/entrar` continua no servidor.
  - Cada feature tem uma fábrica de chaves (`managersKeys.list()`,
    `managersKeys.invitations(status)`); mutações atualizam o cache com a entidade
    devolvida (`setQueryData`) e invalidam as listas afetadas.
  - Limpeza (FR-024): `queryClient.clear()` após logout e "sair de todos"; um
    `QueryCache`/`MutationCache` com `onError` global limpa o cache e leva a
    `/entrar?next=…` quando a API responde `401`.
  - Tokens de URL (verificar e-mail, redefinir senha, convite, ativar admin) só
    trafegam em **mutações**, nunca em chaves de query, e nada é persistido (FR-027).
- **Rationale**: FR-023/FR-024 com a menor mudança nas páginas: a autenticação e o
  primeiro render continuam no servidor; o cache passa a cuidar das atualizações
  depois das ações.
- **Alternatives considered**: `prefetchQuery` + `HydrationBoundary` (padrão oficial
  para SSR; mais peças para o mesmo resultado aqui e exige `QueryClient` por
  requisição no servidor — pode ser adotado quando houver telas com muitas queries);
  buscar tudo no cliente (tela vazia até carregar e checagem de sessão depois do
  render).

## S11. Camada de API do web e regra de lint

- **Decision**: o wrapper `fetch` atual (`lib/api-client.ts`) vira `lib/api/client.ts`
  sem mudar comportamento (cabeçalhos, `{}` em métodos não seguros, `Retry-After`,
  `ApiError`); `lib/server-api.ts` vira `lib/api/server.ts`. Funções de chamada ficam em
  `features/<f>/api/*.ts`, tipadas com os tipos do contrato (sem parse das respostas
  em runtime — a conformidade é garantida por S6). ESLint em `apps/web`:
  `no-restricted-imports` impede `lib/api/*` fora de `features/*/api/**` e `lib/**`,
  inclusive nas páginas Server Component, que buscam dados iniciais por
  `features/<f>/api/server.ts` (Constituição, Padrões por Camada),
  e `no-restricted-globals`/`no-restricted-syntax` impede chamar `fetch` fora de
  `lib/api/**`.
- **Rationale**: FR-025; a regra de lint é o que impede a próxima feature de chamar a
  API direto de um componente.
- **Alternatives considered**: Axios (vetado pela constituição); parse de toda resposta
  no web (custo e duplicação da garantia que os testes da API já dão).

## S12. Tema: Tailwind v4 + shadcn/ui com a paleta atual

- **Decision**: Tailwind CSS 4 via `@tailwindcss/postcss` (`postcss.config.mjs`);
  `globals.css` passa a declarar os tokens do shadcn (`--background`, `--foreground`,
  `--card`, `--primary`, `--primary-foreground`, `--muted`, `--muted-foreground`,
  `--destructive`, `--border`, `--input`, `--ring`, `--radius`) com **os mesmos valores
  hex** da paleta atual, em tema claro e dentro de `@media (prefers-color-scheme: dark)`
  (o tema continua seguindo o sistema; não há alternância manual), e expõe-os ao
  Tailwind com `@theme inline`. `components.json` do shadcn: estilo `new-york`,
  `rsc: true`, `tsx: true`, ícones `lucide`, aliases `@/components`, `@/lib/utils`
  (`tsconfig` do web ganha `paths: {"@/*": ["./*"]}`). Componentes adicionados pela CLI
  (`pnpm dlx shadcn@4.21.0 add …`), só os usados: `button`, `input`, `label`, `table`,
  `alert`. A fonte Geist local e o *skip link* continuam.
- **Contraste**: o axe em jsdom não mede contraste (sem layout). Um teste unitário
  (`apps/web/test/contrast.test.ts`) lê os tokens de `globals.css` e verifica AA (4.5:1
  texto, 3:1 bordas e foco) para cada par usado, nos dois temas — sem dependência nova.
- **Rationale**: FR-020, FR-029 (Q1 → A). Mapear a paleta para os tokens do shadcn
  preserva a aparência e os contrastes já medidos.
- **Alternatives considered**: tema padrão do shadcn (rejeitado na clarificação);
  `@axe-core/playwright` para medir contraste no navegador (dependência nova para uma
  verificação que a leitura dos tokens já cobre).

## S13. Estrutura do web por feature

- **Decision**:

  ```text
  apps/web/
  ├── app/                  # rotas: páginas Server Component + layout + providers
  ├── features/
  │   ├── auth/             # entrar, cadastro, verificar e-mail, esqueci/redefinir senha, sair
  │   ├── sessions/         # conta/sessoes
  │   ├── admin-activation/ # ativar-admin
  │   ├── invitations/      # convite (preview + aceite)
  │   ├── managers/         # admin/managers
  │   ├── accounts/         # admin/usuarios
  │   └── teachers/         # professores
  │       └── {api,components,hooks,schemas,types}/
  ├── components/
  │   ├── ui/               # shadcn (gerado pela CLI)
  │   └── shared/           # Field, ErrorSummary, SubmitButton, NoAccess, SiteNav
  ├── lib/{api,query,messages,utils.ts}
  └── test/                 # a11y, keyboard, contrast, render helper
  ```

  `store/` não é criado (S18). Os testes ficam ao lado do componente da feature e
  mantêm os títulos (`describe`/`it`) com os ids da Fase 001, porque
  `apps/api/test/traceability.spec.ts` os procura em `apps/web`.
- **Rationale**: FR-026 e a estrutura fixada pela constituição.
- **Alternatives considered**: mover para `src/` (vetado pela emenda).

## S14. Testes E2E com Playwright

- **Decision**: `apps/web/e2e/` com `playwright.config.ts` (Chromium) e o script
  `pnpm --filter web test:e2e`. O `webServer` do Playwright sobe API e web em portas
  próprias (API `4100`, web `3100`) a partir dos builds, com `apps/web/e2e/.env.e2e`
  (versionado, só valores de exemplo). Banco: `devtrack_e2e` no contêiner
  `postgres-test` (tmpfs), recriado a cada execução por `prisma migrate reset --force`
  no *global setup*. E-mails: Mailpit de desenvolvimento, lidos pela API HTTP dele e
  isolados por destinatário único por execução (`<jornada>-<timestamp>@example.test`).
  O primeiro ADMIN vem de `admin:bootstrap --print-link`, como no quickstart da 001.
  Os limites de *rate limit* ficam nos valores de produção; cada jornada usa e-mails
  próprios para não compartilhar contadores.
- **Rationale**: FR-030–FR-032 e SC-006; reaproveita os contêineres existentes, não
  toca no banco de desenvolvimento e não conflita com um `pnpm dev` aberto.
- **Alternatives considered**: `apps/e2e` como app separado (mais um workspace sem
  código próprio); banco no contêiner de dev (viola FR-031); rodar contra `next dev`
  (lento e diferente de produção).

## S15. Integração contínua (GitHub Actions)

- **Decision**: `.github/workflows/ci.yml`, em `push` e `pull_request`, um job
  `ubuntu-latest` com `permissions: contents: read`:
  1. `postgres:17` como *service* na porta 5433 (`devtrack_test`), com *healthcheck*;
  2. `pnpm/action-setup` (versão de `packageManager`) e `actions/setup-node` (Node 24,
     cache do pnpm);
  3. `pnpm install --frozen-lockfile`;
  4. `cp apps/api/.env.test.example apps/api/.env.test`;
  5. `pnpm lint`, `pnpm check-types`, `pnpm build`, `pnpm test`.

  Actions fixadas por SHA de commit, com a versão em comentário. Sem segredos (FR-037):
  os testes usam `InMemoryMailer` e os valores de `.env.test.example`. O E2E fica fora
  (Q2 → C).
- **Rationale**: FR-035–FR-037, SC-009. Fixar por SHA segue *Software Supply Chain
  Failures* (Princípio I).
- **Alternatives considered**: actions por tag (mutável); matriz de jobs separados
  (paraleliza, mas cada job repete install e build; um job basta no volume atual).

## S16. Turborepo e Docker

- **Decision**: `turbo.json`: `check-types` e `dev` passam a depender de `^build`
  (API e web precisam de `packages/contracts/dist`); `packages/contracts` ganha
  `build` (`tsc -p tsconfig.build.json`), `dev` (`tsc -w`), `check-types`, `lint` e
  `test`. `apps/api/Dockerfile` troca `pnpm --filter api build` por
  `pnpm --filter "api..." build` (constrói as dependências de workspace antes), e o
  `pnpm deploy` já copia o pacote para a imagem.
- **Rationale**: clone limpo compila sem passo manual (edge case da spec); a imagem de
  produção da API continua funcionando.
- **Alternatives considered**: `postinstall` compilando o pacote (esconde falhas de
  build no install).

## S17. Dependências novas

- **Decision**:

  | Pacote | Onde | Tipo | Licença | Motivo |
  |--------|------|------|---------|--------|
  | `zod` (catálogo) | contracts, web | prod | MIT | Schemas do contrato (XXVI) |
  | `@repo/contracts` | api, web | prod (workspace) | — | Contratos compartilhados |
  | `@tanstack/react-query` | web | prod | MIT | Server state (stack oficial) |
  | `react-hook-form` | web | prod | MIT | Formulários (stack oficial) |
  | `@hookform/resolvers` | web | prod | MIT | RHF + Zod |
  | `lucide-react` | web | prod | ISC | Ícones (stack oficial) |
  | `radix-ui` | web | prod | MIT | Primitivas usadas pelos componentes shadcn |
  | `class-variance-authority` | web | prod | Apache-2.0 | Variantes dos componentes shadcn |
  | `clsx`, `tailwind-merge` | web | prod | MIT | Utilitário `cn()` do shadcn |
  | `tailwindcss`, `@tailwindcss/postcss` | web | dev | MIT | Estilos (stack oficial) |
  | `@playwright/test` | web | dev | Apache-2.0 | E2E (stack oficial) |

  Removidos: `@repo/ui` (e o diretório `packages/ui`). A CLI `shadcn` roda por
  `pnpm dlx` com versão fixa e não entra no `package.json`. Tudo é registrado em
  `apps/api/DEPENDENCIES.md`, renomeado para `DEPENDENCIES.md` na raiz (passa a cobrir
  o monorepo), com nova execução de `pnpm audit --prod` e `pnpm licenses list --prod`.
- **Rationale**: FR-041, SC-008; cada item corresponde a uma linha da tabela de stack
  da constituição ou é exigido pelos componentes shadcn.
- **Alternatives considered**: `tw-animate-css` (só necessário para componentes
  animados, que não são usados).

## S18. Redux Toolkit

- **Decision**: não instalado nesta feature (FR-028). O estado de cliente da Fase 001
  é local de cada tela (`useState`/RHF).
- **Rationale**: Princípio IX e a regra da emenda ("adotado só na primeira spec com
  estado global de cliente real").
- **Alternatives considered**: instalar e deixar configurado (dependência sem uso).

## S19. Migração dos testes existentes

- **Decision**:
  - API: as mudanças nos testes se limitam a importações (ex.: tipos de view vindos
    do contrato) e aos helpers (`createTestApp` registra o interceptor de S6). Nenhuma
    asserção muda (US2-1).
  - Web: os testes passam a renderizar com `renderWithProviders()` de
    `test/render.tsx` (novo `QueryClient` por teste, `retry: false`); consultas por
    papel e rótulo continuam iguais porque os textos e a semântica não mudam. Os
    testes de teclado (`SC-012`) e axe continuam em cada tela.
  - Guardas da Fase 001 (`traceability`, `audit-coverage`, `no-academic-domain`,
    `secret-leak-scan`) continuam apontando para `specs/001-…` e seguem rodando.
- **Rationale**: SC-001 e US2-1: a suíte da Fase 001 é a prova de que não houve
  regressão.
- **Alternatives considered**: reescrever os testes de tela junto com as telas (perde
  a comparação antes/depois).
