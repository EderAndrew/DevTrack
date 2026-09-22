# Contract: pacote `@repo/contracts`

Interface pública do pacote `packages/contracts` (Princípio XXVI). É a única fonte das
estruturas trocadas entre `apps/api` e `apps/web`. Formas detalhadas:
[data-model.md](../data-model.md). Decisões: [research.md](../research.md) S1–S8.

## Pacote

```json
{
  "name": "@repo/contracts",
  "private": true,
  "type": "module",
  "exports": { ".": { "types": "./dist/index.d.ts", "default": "./dist/index.js" } },
  "files": ["dist"],
  "scripts": {
    "build": "tsc -p tsconfig.build.json",
    "dev": "tsc -p tsconfig.build.json --watch --preserveWatchOutput",
    "check-types": "tsc --noEmit",
    "lint": "eslint --max-warnings 0 .",
    "test": "vitest run"
  },
  "dependencies": { "zod": "catalog:" }
}
```

- Consumido como `"@repo/contracts": "workspace:*"` em `dependencies` de `apps/api` e
  `apps/web`.
- Ponto de entrada único (`index.ts`); sem *deep imports*.
- Nenhuma dependência além de `zod`.

## Estrutura

```text
packages/contracts/
├── src/
│   ├── common/            # primitivos, enums compartilhados, erro, códigos de erro
│   ├── auth/              # cadastro, verificação, login, recuperação de senha
│   ├── me/                # MeView, sessões próprias
│   ├── accounts/          # administração de contas (ADMIN)
│   ├── provisioning/      # convites, gestores, professores, aceite
│   ├── admin-activation/  # ativação do bootstrap
│   ├── health/
│   ├── endpoints.ts       # catálogo de endpoints
│   └── index.ts
├── test/                  # guardas: fronteira, duplicação, versão única de Zod
├── tsconfig.json          # check-types (inclui test/)
├── tsconfig.build.json    # emite src/ → dist/
├── eslint.config.mjs      # no-restricted-imports (fronteira)
└── vitest.config.ts
```

## Regras (verificadas por teste)

1. Cada schema exportado termina em `Schema`; o tipo derivado tem o mesmo nome sem o
   sufixo e é `z.infer<typeof XSchema>`.
2. Objetos de requisição e de resposta são `z.strictObject`.
3. Datas nas respostas são strings ISO (`IsoDateTimeSchema`).
4. Proibido importar `@prisma/*`, `@nestjs/*`, `react`, `next`, `@reduxjs/*`,
   `express` ou qualquer caminho de `apps/`.
5. Proibido texto destinado ao usuário (mensagens em português); o contrato define
   forma e códigos.
6. Uma única versão de `zod` resolvida no `pnpm-lock.yaml`.
7. Nenhum tipo exportado pelo pacote é redefinido em `apps/api/src` ou `apps/web`
   (por nome, ou por união literal com os mesmos valores de um enum do pacote).

## Catálogo de endpoints

`endpoints` (em `src/endpoints.ts`) tem uma entrada por rota. Caminhos no formato do
Nest, relativos a `/api`. `—` = sem schema. O teste
`apps/api/test/contracts/endpoint-catalog.spec.ts` exige correspondência exata com as
rotas registradas no Nest.

| Chave | Método | Caminho | params / query / body | Resposta | Status |
|-------|--------|---------|-----------------------|----------|--------|
| `health.live` | GET | `/health/live` | — | `HealthStatus` | 200 |
| `health.ready` | GET | `/health/ready` | — | `HealthStatus` | 200 (503 com `unavailable`) |
| `auth.signup` | POST | `/auth/signup` | body `SignupRequest` | `PublicAccepted` | 202 |
| `auth.verifyEmail` | POST | `/auth/verify-email` | body `VerifyEmailRequest` | `EmailVerifiedResponse` | 200 |
| `auth.resendVerification` | POST | `/auth/verify-email/resend` | body `ResendVerificationRequest` | `PublicAccepted` | 202 |
| `auth.login` | POST | `/auth/login` | body `LoginRequest` | `LoginResponse` | 200 |
| `auth.logout` | POST | `/auth/logout` | — | — | 204 |
| `auth.logoutAll` | POST | `/auth/logout-all` | — | — | 204 |
| `auth.passwordResetRequest` | POST | `/auth/password-reset/request` | body `PasswordResetRequest` | `PublicAccepted` | 202 |
| `auth.passwordResetConfirm` | POST | `/auth/password-reset/confirm` | body `PasswordResetConfirmRequest` | `MessageResponse` | 200 |
| `me.get` | GET | `/me` | — | `MeView` | 200 |
| `sessions.list` | GET | `/me/sessions` | — | `SessionListResponse` | 200 |
| `sessions.get` | GET | `/me/sessions/:id` | params `{id: Uuid}` | `SessionView` | 200 |
| `sessions.revoke` | DELETE | `/me/sessions/:id` | params `{id: Uuid}` | — | 204 |
| `invitations.preview` | POST | `/invitations/preview` | body `TokenRequest` | `InvitationPreview` | 200 |
| `invitations.accept` | POST | `/invitations/accept` | body `AcceptInvitationRequest` | `InvitationAccepted` | 200 |
| `adminActivation.preview` | POST | `/admin-activation/preview` | body `TokenRequest` | `AdminActivationPreview` | 200 |
| `adminActivation.activate` | POST | `/admin-activation` | body `AdminActivationRequest` | `AdminActivated` | 200 |
| `teachers.list` | GET | `/teachers` | query `TeacherListQuery` | `TeacherListResponse` | 200 |
| `teachers.get` | GET | `/teachers/:userId` | params `{userId: Uuid}` | `TeacherView` | 200 |
| `teachers.suspend` | POST | `/teachers/:userId/suspend` | params `{userId: Uuid}` | `TeacherView` | 200 |
| `teachers.deactivate` | POST | `/teachers/:userId/deactivate` | params `{userId: Uuid}` | `TeacherView` | 200 |
| `teachers.reactivate` | POST | `/teachers/:userId/reactivate` | params `{userId: Uuid}` | `TeacherView` | 200 |
| `teacherInvitations.list` | GET | `/teacher-invitations` | query `InvitationListQuery` | `InvitationListResponse` | 200 |
| `teacherInvitations.create` | POST | `/teacher-invitations` | body `InviteRequest` | `InvitationView` | 201 |
| `teacherInvitations.resend` | POST | `/teacher-invitations/:id/resend` | params `{id: Uuid}` | `InvitationView` | 200 |
| `teacherInvitations.revoke` | POST | `/teacher-invitations/:id/revoke` | params `{id: Uuid}` | `InvitationView` | 200 |
| `managers.list` | GET | `/managers` | — | `ManagerListResponse` | 200 |
| `managers.deactivate` | POST | `/managers/:userId/deactivate` | params `{userId: Uuid}` | `ManagerView` | 200 |
| `managers.reactivate` | POST | `/managers/:userId/reactivate` | params `{userId: Uuid}` | `ManagerView` | 200 |
| `managerInvitations.list` | GET | `/manager-invitations` | query `InvitationListQuery` | `InvitationListResponse` | 200 |
| `managerInvitations.create` | POST | `/manager-invitations` | body `InviteRequest` | `InvitationView` | 201 |
| `managerInvitations.resend` | POST | `/manager-invitations/:id/resend` | params `{id: Uuid}` | `InvitationView` | 200 |
| `managerInvitations.revoke` | POST | `/manager-invitations/:id/revoke` | params `{id: Uuid}` | `InvitationView` | 200 |
| `accounts.list` | GET | `/users` | query `UserListQuery` | `AccountPage` | 200 |
| `accounts.get` | GET | `/users/:id` | params `{id: Uuid}` | `UserAccountView` | 200 |
| `accounts.suspend` | POST | `/users/:id/suspend` | params `{id: Uuid}` | `UserAccountView` | 200 |
| `accounts.reactivate` | POST | `/users/:id/reactivate` | params `{id: Uuid}` | `UserAccountView` | 200 |

Total: 38 rotas. Hoje as rotas `teachers.list`/`teacherInvitations.list`/
`managerInvitations.list` validam só o parâmetro `status` com `@Query("status", pipe)`;
o catálogo descreve a query como objeto, e o controller continua lendo o mesmo
parâmetro (comportamento inalterado).

## Conformidade das respostas (API)

`apps/api/test/helpers/contract-conformance.interceptor.ts`, registrado só por
`createTestApp()`:

1. Obtém o método e o caminho da rota do handler (metadados do Nest: `PATH_METADATA`
   do controller + do método, `METHOD_METADATA`).
2. Encontra a entrada do catálogo; ausência → erro (rota sem contrato).
3. Valida o valor devolvido com `response.safeParse`; `response: null` exige
   `undefined`.
4. Em violação, lança um erro com a chave do endpoint e os caminhos dos campos
   inválidos (sem valores, para não vazar dados em logs de teste); o teste que fez a
   requisição recebe `500` e falha na asserção de status.

Respostas de erro já são geradas pelo filtro global a partir de `ErrorCatalog`, que é
tipado por `ErrorCode`; o teste unitário do filtro confere o corpo contra
`ErrorBodySchema`.

## Consumo no web

- Tipos de requisição e resposta vêm de `import type { … } from "@repo/contracts"`.
- Formulários usam os schemas (valores) do pacote com `zodResolver` (S9).
- O web não faz parse das respostas em runtime (S11).
