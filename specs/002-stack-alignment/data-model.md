# Data Model: 002 — Refatoração de alinhamento de stack da Fase 001

**Date**: 2026-09-22 | **Spec**: [spec.md](./spec.md) | **Plan**: [plan.md](./plan.md)

Esta feature **não altera o banco de dados**: nenhuma migration, nenhum modelo Prisma
novo ou alterado (FR-014). Os 14 modelos de
`specs/001-foundation-identity-access/data-model.md` continuam valendo, e o guarda
`no-academic-domain.spec.ts` continua fixando essa lista.

O "modelo" desta feature são as estruturas públicas que passam a morar em
`packages/contracts` (Princípio XXVI), mais as duas estruturas do web que ficam fora
do contrato: o catálogo de mensagens e os tokens do tema. As formas abaixo são as que
a API já envia e aceita hoje (`specs/001-foundation-identity-access/contracts/http-api.md`);
a migração só as move para uma definição única.

---

## 1. Primitivos comuns (`common/`)

Movidos de `apps/api/src/platform/http/schemas.ts`, sem mudar a validação (FR-008).

| Schema | Regra | Uso |
|--------|-------|-----|
| `EmailSchema` | `string` → `trim` → minúsculas → máx. 254 → e-mail válido | cadastro, login, reenvio, recuperação, convites |
| `NameSchema` | `string` → `trim` → 1–120 caracteres, sem caracteres de controle | cadastro, convites (`displayName`) |
| `TokenSchema` | `^[A-Za-z0-9_-]{43}$` (32 bytes base64url) | links de e-mail |
| `PasswordInputSchema` | `string`, máx. 1024 (a força é regra do servidor) | cadastro, login, redefinição, aceite |
| `UuidSchema` | UUID | parâmetros de rota |
| `IsoDateTimeSchema` | string ISO 8601 (`z.iso.datetime()`) | datas nas respostas (S4) |
| `ErrorCodeSchema` | enum dos 24 códigos do catálogo | corpo de erro |
| `ErrorBodySchema` | `{statusCode: int, code: ErrorCode, message: string}` | toda resposta de erro |

Todos os objetos de requisição são `z.strictObject` (campo desconhecido → `400
VALIDATION_ERROR`).

## 2. Enums públicos

| Schema | Valores | Onde aparece |
|--------|---------|--------------|
| `RoleKeySchema` | `STUDENT`, `TEACHER`, `MANAGER`, `ADMIN` | `MeView.roles`, `UserAccountView.roles` |
| `RoleAssignmentStatusSchema` | `ACTIVE`, `SUSPENDED`, `INACTIVE` | papéis, gestores, professores |
| `AccountStatusSchema` | `ACTIVE`, `SUSPENDED` | `UserAccountView.status` |
| `InvitationStatusSchema` | `PENDING`, `ACCEPTED`, `EXPIRED`, `REVOKED` | convites, filtro `?status=` |
| `InvitableRoleSchema` | `MANAGER`, `TEACHER` | convites |
| `TeacherStatusSchema` | `INVITED`, `ACTIVE`, `SUSPENDED`, `INACTIVE` | lista de professores, filtro `?status=` |
| `AcceptanceModeSchema` | `CREATE_ACCOUNT`, `SIGN_IN_REQUIRED`, `CLAIM_ACCOUNT` | pré-visualização de convite e de ativação |
| `HealthStatusValueSchema` | `ok`, `unavailable` | health |

Os valores conferem com os enums de `apps/api/prisma/schema.prisma` (verificado em
2026-09-22). O contrato **não importa** os enums gerados pelo Prisma: se os dois
divergirem no futuro, os testes de integração falham pelo interceptor de conformidade
(S6).

## 3. Requisições (`auth/`, `me/`, `accounts/`, `provisioning/`, `admin-activation/`)

| Schema | Campos |
|--------|--------|
| `SignupRequestSchema` | `name: Name`, `email: Email`, `password: PasswordInput` |
| `VerifyEmailRequestSchema` | `token: Token` |
| `ResendVerificationRequestSchema` | `email: Email` |
| `LoginRequestSchema` | `email: Email`, `password: PasswordInput` |
| `PasswordResetRequestSchema` | `email: Email` |
| `PasswordResetConfirmRequestSchema` | `token: Token`, `password: PasswordInput` |
| `TokenRequestSchema` | `token: Token` (pré-visualização de convite e de ativação) |
| `AcceptInvitationRequestSchema` | `token: Token`, `password?: PasswordInput` |
| `AdminActivationRequestSchema` | `token: Token`, `password?: PasswordInput` |
| `InviteRequestSchema` | `email: Email`, `displayName: Name` (gestor e professor) |
| `UserListQuerySchema` | `query?: string` (máx. 120), `cursor?: string` (máx. 200) |
| `InvitationListQuerySchema` | `status?: InvitationStatus` |
| `TeacherListQuerySchema` | `status?: TeacherStatus` |

## 4. Respostas

| Schema | Forma |
|--------|-------|
| `PublicAcceptedSchema` | `{message: string}` (respostas genéricas ⚖) |
| `MessageResponseSchema` | `{message: string}` (confirmação de redefinição) |
| `EmailVerifiedResponseSchema` | `{emailVerified: true}` |
| `MeViewSchema` | `{id: Uuid, name, email, emailVerified: boolean, roles: {key: RoleKey, status: RoleAssignmentStatus}[], permissions: string[]}` |
| `LoginResponseSchema` | `{user: MeView}` |
| `SessionViewSchema` | `{id, createdAt: IsoDateTime, lastUsedAt: IsoDateTime, expiresAt: IsoDateTime, current: boolean}` |
| `SessionListResponseSchema` | `{items: SessionView[]}` |
| `InvitationViewSchema` | `{id: Uuid, email, displayName, role: InvitableRole, status: InvitationStatus, expiresAt: IsoDateTime, sendCount: int, lastSentAt: IsoDateTime, invitedBy: {id: Uuid, name}}` |
| `InvitationListResponseSchema` | `{items: InvitationView[]}` |
| `InvitationPreviewSchema` | `{role: InvitableRole, email, displayName, mode: AcceptanceMode}` |
| `InvitationAcceptedSchema` | `{role: InvitableRole, mode: AcceptanceMode}` |
| `AdminActivationPreviewSchema` | `{email, mode: AcceptanceMode}` |
| `AdminActivatedSchema` | `{role: "ADMIN"}` |
| `ManagerViewSchema` | `{userId: Uuid, name, email, status: RoleAssignmentStatus}` |
| `ManagerListResponseSchema` | `{items: ManagerView[]}` |
| `TeacherListItemSchema` | `{userId: Uuid \| null, invitationId: Uuid \| null, displayName, email, status: TeacherStatus}` |
| `TeacherListResponseSchema` | `{items: TeacherListItem[]}` |
| `TeacherViewSchema` | `{userId: Uuid, displayName, email, status: RoleAssignmentStatus, invitations: InvitationView[]}` |
| `UserAccountViewSchema` | `{id: Uuid, name, email, emailVerified: boolean, status: AccountStatus, roles: {key: RoleKey, status: RoleAssignmentStatus}[], createdAt: IsoDateTime}` |
| `AccountPageSchema` | `{items: UserAccountView[], nextCursor: string \| null}` |
| `HealthStatusSchema` | `{status: HealthStatusValue}` |

Respostas de sucesso sem corpo (`204`: logout, logout-all, revogar sessão) não têm
schema; o catálogo de endpoints registra `response: null`.

Os schemas de resposta são objetos estritos (`z.strictObject`): um campo a mais que a
API passe a enviar por engano (por exemplo, `tokenHash`) falha no interceptor de
conformidade — uma defesa extra para "nunca token nem `tokenHash`".

## 5. Catálogo de endpoints

Um registro por rota (38 no total), com chave estável `"<domínio>.<ação>"`:

```ts
interface EndpointContract {
  method: "GET" | "POST" | "PATCH" | "DELETE";
  path: string;            // formato Nest, relativo a /api: "/managers/:userId/deactivate"
  params?: z.ZodType;      // ex.: { userId: Uuid }
  query?: z.ZodType;
  body?: z.ZodType;
  response: z.ZodType | null;  // null = 204 sem corpo
  status: number;          // status de sucesso
}
```

A lista completa, com status e schemas, está em
[contracts/contracts-package.md](./contracts/contracts-package.md#catálogo-de-endpoints).

## 6. Estruturas do web (fora do contrato)

**Catálogo de mensagens de erro** (`apps/web/lib/messages/error-messages.ts`):
`Record<ErrorCode, string>` com os mesmos textos que `ErrorCatalog` da API envia hoje
(por exemplo, `INVALID_CREDENTIALS` → "E-mail ou senha incorretos."), mais
`NETWORK_ERROR` e `UNEXPECTED_RESPONSE`, que são do web. `RATE_LIMITED` com
`Retry-After` é formatado por função ("Muitas tentativas. Tente novamente em N
minutos."). Rótulos de status (`STATUS_LABELS`) também são do web.

**Mensagens de formulário** (`features/<f>/schemas/*.ts`): por campo, a mensagem de
campo vazio atual e "Dados inválidos." para as demais violações do contrato (S9).

**Chaves de query** (por feature):

| Feature | Chaves | Invalidada por |
|---------|--------|----------------|
| `sessions` | `["me"]`, `["sessions", "list"]` | revogar sessão; logout/logout-all limpam tudo |
| `managers` | `["managers", "list"]`, `["managers", "invitations", status?]` | convidar, reenviar, revogar, desativar, reativar |
| `teachers` | `["teachers", "list", status?]`, `["teachers", "detail", userId]`, `["teachers", "invitations", status?]` | convidar, reenviar, revogar, suspender, desativar, reativar |
| `accounts` | `["accounts", "list", query, cursor]`, `["accounts", "detail", id]` | suspender, reativar |

Tokens de URL nunca entram em chave de query (FR-027).

**Tokens do tema** (`apps/web/app/globals.css`), mesmos valores hex de hoje:

| Token atual | Token shadcn | Claro | Escuro |
|-------------|--------------|-------|--------|
| `--background` | `--background` | `#ffffff` | `#121212` |
| `--surface` | `--card`, `--muted` | `#f5f5f7` | `#1e1e1e` |
| `--foreground` | `--foreground`, `--card-foreground` | `#1a1a1a` | `#ededed` |
| `--muted` | `--muted-foreground` | `#595959` | `#b3b3b3` |
| `--border` | `--border`, `--input` | `#767676` | `#8c8c8c` |
| `--primary` | `--primary`, `--ring` | `#1f4fd1` | valor atual do tema escuro |
| `--on-primary` | `--primary-foreground` | `#ffffff` | valor atual do tema escuro |
| `--danger` | `--destructive` | `#b3261e` | valor atual do tema escuro |
| `--danger-surface` | fundo do `Alert` destrutivo | `#fdecea` | valor atual do tema escuro |
| `--radius` | `--radius` | `6px` | `6px` |

Os valores do tema escuro que não aparecem acima são copiados de `globals.css` na
implementação; o teste de contraste (S12) verifica todos os pares nos dois temas.
