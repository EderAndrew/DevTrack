# Implementation Plan: 003 — Turmas, Convites e Matrículas de Alunos

**Branch**: `003-class-invitations-enrollment` | **Date**: 2026-09-22 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/003-class-invitations-enrollment/spec.md`

## Summary

Professores ativos criam e administram as próprias turmas e convidam alunos informando
só o e-mail. O convite de turma é uma entidade própria: token de uso único guardado
como hash, 7 dias de validade, reenvio e cancelamento, e entrega do e-mail com novas
tentativas por uma tabela de entregas e um worker no processo da API, sem fila nova
(D5). O aceite reutiliza o caminho de identidade da Fase 001 (`RoleGrantAcceptance`):
conta nova (nome, RA, senha), conta existente autenticada, ou conta nunca verificada
assumida. Na mesma transação, cria o perfil de aluno com RA, a matrícula ativa e o
aceite. A matrícula liga aluno e turma, permite várias turmas por aluno e é removida
por mudança de situação, sem apagar histórico. O autocadastro público da Fase 001 sai
(FR-048, constituição 3.0.0).

## Technical Context

**Language/Version**: TypeScript 7 sobre Node.js 24 LTS (API compila com SWC; `tsc --noEmit` para tipos)
**Primary Dependencies**: NestJS 11, Prisma 7 + `@prisma/adapter-pg`, `argon2`, `nodemailer`, `nestjs-pino`; `@repo/contracts` (Zod 4); web: Next.js 16, React 19, Tailwind CSS 4, shadcn/ui (Radix via `radix-ui`), Lucide, TanStack Query 5, React Hook Form 7 + `@hookform/resolvers`. **Nenhuma dependência nova.**
**Storage**: PostgreSQL 17 — 4 tabelas novas (`classes`, `class_invitations`, `class_invitation_deliveries`, `enrollments`), 2 colunas em `student_profiles`, índices parciais e `CHECK`s em SQL de migração, permissões `turmas.*` por migração de dados
**Testing**: Vitest (`unplugin-swc`) + `@nestjs/testing` + `supertest` contra PostgreSQL real; Vitest + Testing Library + `vitest-axe` no web; Playwright (E2E); guardas de 002 (catálogo de endpoints, interceptor de conformidade, boundary/duplication de contratos)
**Target Platform**: servidor Linux (API em contêiner) e navegadores atuais; CI GitHub Actions
**Project Type**: monorepo web (API NestJS + web Next.js + pacote de contratos)
**Performance Goals**: listas de turmas, alunos e convites em ≤ 1 s com 100 turmas por professor e 200 alunos por turma (SC-008); criação de convite sem esperar o SMTP
**Constraints**: token bruto nunca persistido nem logado; unicidade garantida pelo banco; nenhuma fila/infra nova; anti-enumeração no fluxo público; WCAG 2.2 AA
**Scale/Scope**: 7 telas novas + 1 pública, 14 rotas HTTP novas (1 removida), 8 histórias, 51 requisitos

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- [x] **I. Security**: toda entrada validada no backend por schemas estritos do contrato; OWASP: controle de acesso por turma (404), injeção (Prisma/SQL parametrizado, `escapeLike`), mass assignment (schemas estritos, dono e turma vindos do servidor), vazamento de credenciais (hash de token, varredura de segredos), enumeração (fluxo público só com token), força bruta e abuso (rate limit por token, origem, convite e professor), race conditions (índices parciais, `FOR UPDATE`) ✅
- [x] **II. RBAC**: cada rota lista sua permissão `turmas.*` e o contexto (turma do professor da sessão) em [contracts/http-api.md](./contracts/http-api.md) e [contracts/permissions.md](./contracts/permissions.md) ✅
- [x] **III. Server authority**: validade, situação e expiração decididas no servidor; nenhuma regra depende do relógio do navegador ✅ (sem respostas de avaliação nesta feature)
- [x] **IV. Untrusted code**: N/A — nenhum código de aluno executado
- [x] **V. Data integrity**: migração Prisma; PK/FK `Restrict`, `UNIQUE` parciais, `CHECK`s, `NOT NULL`, índices para as listas ([data-model.md](./data-model.md)) ✅
- [x] **VI. Audit & logs**: 11 tipos novos na mesma transação ([contracts/audit-events.md](./contracts/audit-events.md)); falhas de entrega e tokens rejeitados em log estruturado sem token/hash/link ✅
- [x] **VII. Tests**: integração por história, matriz de autorização, concorrência, varredura de segredos, worker com mailer falho, unitários das máquinas de estado, web (axe/teclado) e 4 jornadas E2E (D16) ✅
- [x] **VIII. Layering**: controllers finos → services → Prisma; `ClassContextPolicy` no serviço; nenhuma regra em componentes React ✅
- [x] **IX. Simplicity**: sem dependência nem infra nova; worker de entregas usa tabela + `setInterval` + `SKIP LOCKED` (D5); reaproveita `RoleGrantAcceptance`, `RateLimitService`, `PublicRateLimit`, `MailDispatcher` ✅
- [x] **X. Evidence**: N/A — nenhuma evidência pedagógica; convites e matrículas são fatos com responsável
- [x] **XI. Human oversight**: N/A — nenhuma decisão pedagógica automática
- [x] **XII. Determinism first**: N/A — sem IA
- [x] **XIII. Risk level**: L1 — expiração preguiçosa e novas tentativas de e-mail; nenhuma operação L2/L3 ✅
- [x] **XIV–XV. AI governance**: N/A
- [x] **XVI. Explicit states**: `ClassStatus`, `ClassInvitationStatus`, `EnrollmentStatus`, `DeliveryStatus` com máquinas de estado e `409 INVALID_STATE_TRANSITION` ✅
- [x] **XVII. Idempotency**: aceite idempotente e serializado (convite e usuário travados), convite pendente e matrícula ativa únicos por índice, remoção repetida sem efeito, entrega com `SKIP LOCKED` ✅
- [x] **XVIII. Safe interruption**: entregas retomadas após reinício; worker desligável (`MAIL_RETRY_INTERVAL_SECONDS=0`); lotes de 50 ✅
- [x] **XIX. AI evals**: N/A
- [x] **XX. Pedagogy**: N/A — sem monitoramento
- [x] **XXI. Configurable domain**: turma é dado do professor (nome, código, período livres); nenhuma disciplina ou tecnologia fixa em enum ✅
- [x] **XXII. Personalization & accessibility**: WCAG 2.2 AA; nenhuma necessidade individual tratada; RA e e-mail visíveis só ao professor da turma e ao próprio aluno ✅
- [x] **XXIII. Curricular traceability**: N/A (ementas e conteúdos nas specs seguintes)
- [x] **XXIV. Academic isolation**: toda rota de turma checa permissão **e** `teacher_id` da sessão; convites e matrículas buscados dentro da turma confirmada; fora do contexto → 404; aluno vê só as próprias matrículas ativas; MANAGER/ADMIN sem acesso ✅
- [x] **XXV. Privileged provisioning**: sem autocadastro público (rota e tela removidas, D12); contas de aluno só pelo aceite do convite de turma (uso único, ligado ao e-mail, com prazo, hash), que concede só `STUDENT` + matrícula e tira papel, turma e e-mail do convite; o professor nunca define nem vê a senha; aceite transacional e idempotente, sem redefinir credencial de conta verificada; conta não verificada assumida com revogação de sessões ✅
- [x] **XXVI. Shared contracts**: todos os pedidos, respostas, enums, paginação e erros novos em `packages/contracts/src/classes/` + catálogo de endpoints; mensagens no web; a API valida com os mesmos schemas ✅
- [x] **Frontend stack**: Tailwind + shadcn/ui (dialog, alert-dialog, select, badge, textarea) + Lucide, TanStack Query (`useInfiniteQuery`), React Hook Form + Zod, `fetch` só em `lib/api/client.ts`, sem Redux (não há estado global de cliente), Vitest + RTL + axe, Playwright; features `classes`, `class-invitations`, `my-classes` ✅

**Resultado**: sem violações. *Complexity Tracking* vazio.

**Re-check pós-design** (depois de research, data-model e contracts): mantido. Pontos
revistos:

- IX: o worker e a tabela de entregas são o mínimo para FR-019/SC-007 sem guardar token.
- XXIV: a matriz de [permissions.md](./contracts/permissions.md) cobre 401/403/404.
- V/XVII: as quatro invariantes de unicidade estão em índices ([data-model.md](./data-model.md)).

## Project Structure

### Documentation (this feature)

```text
specs/003-class-invitations-enrollment/
├── plan.md              # este arquivo
├── research.md          # D1–D16
├── data-model.md        # tabelas, índices, transições
├── quickstart.md        # roteiro de validação
├── contracts/
│   ├── http-api.md      # rotas, schemas, erros
│   ├── permissions.md   # turmas.* e matriz de acesso
│   ├── audit-events.md  # tipos novos e aposentados
│   ├── mail-delivery.md # entrega com novas tentativas
│   └── web-ui.md        # rotas, telas, mensagens
├── checklists/requirements.md
└── tasks.md             # /speckit-tasks
```

### Source Code (repository root)

```text
packages/contracts/src/
├── classes/
│   ├── classes.ts             # ClassStatus, Create/Update/ChangeStatus, ClassView, ClassListQuery, ClassPage
│   ├── class-invitations.ts   # InviteStudentRequest, ClassInvitationView, listas, preview, aceite
│   ├── enrollments.ts         # EnrollmentStatus, EnrollmentView, EnrollmentListQuery/Page, StudentRa
│   └── my-classes.ts          # MyClassView, MyClassList
├── common/errors.ts           # + CLASS_CODE_TAKEN, CLASS_NOT_OPEN, ALREADY_ENROLLED, RA_TAKEN, RA_REQUIRED, TOKEN_EXPIRED
├── auth/requests.ts           # − SignupRequest
└── endpoints.ts               # + 14 rotas, − auth.signup

apps/api/
├── prisma/
│   ├── schema.prisma                                    # + SchoolClass, ClassInvitation, ClassInvitationDelivery, Enrollment; StudentProfile.ra/status
│   └── migrations/<ts>_classes_invitations_enrollments/ # tabelas + índices parciais + CHECKs + permissões turmas.*
├── src/modules/
│   ├── classes/               # classes.controller/service, class-context.policy, class.state-machine, class.view
│   ├── class-invitations/     # class-invitations.controller/service, class-invitation-acceptance.controller/service,
│   │                          # class-invitation.state-machine, delivery.service, delivery.worker, invitation-rate-limit
│   ├── enrollments/           # enrollments.controller/service, enrollment.state-machine, my-classes.controller/service
│   ├── provisioning/role-grant-acceptance.service.ts   # + roleKey STUDENT, via CLASS_INVITATION
│   ├── identity/ra.ts         # normalizeRa
│   ├── audit/audit-event-types.ts                      # + tipos 003, − auth.signup
│   └── auth/                  # − signup.controller, signup.service (webLinks → platform/mail/links.ts)
├── src/platform/
│   ├── mail/templates.ts      # + class-invitation
│   ├── text/search-key.ts     # searchKey (minúsculas, sem acentos)
│   └── config/config.schema.ts # + MAIL_RETRY_INTERVAL_SECONDS, RATE_LIMIT_CLASS_INVITE_*
└── test/
    ├── integration/003-us*.spec.ts
    ├── security/003-*.spec.ts, 003-class-authorization-matrix.ts, domain-boundary.spec.ts (ex-no-academic-domain)
    └── helpers/journey.ts, factories.ts   # + turma, convite, matrícula

apps/web/
├── app/(app)/turmas/{page,nova/page,[id]/page,[id]/editar/page}.tsx
├── app/(app)/minhas-turmas/page.tsx
├── app/(public)/convite-turma/page.tsx
├── app/(public)/cadastro/     # removida
├── features/classes/{api,components,hooks,schemas}/
├── features/class-invitations/{api,components,hooks,schemas}/
├── features/my-classes/{api,components,hooks}/
├── features/auth/             # − signup-form, hooks/API de cadastro
├── components/ui/{dialog,alert-dialog,select,badge,textarea}.tsx
├── components/shared/app-sidebar.tsx   # + Turmas, Minhas turmas
├── lib/messages/error-messages.ts      # + códigos novos
├── proxy.ts, next.config.js            # + /turmas, /minhas-turmas; no-referrer em /convite-turma
└── e2e/
    ├── class-teacher.spec.ts, class-new-student.spec.ts, class-existing-student.spec.ts, class-remove-student.spec.ts
    ├── fixtures/journeys.ts             # createEnrolledStudent (substitui signUp)
    └── playwright.config.ts             # + projeto "teacher" (depende de "admin")
```

**Structure Decision**: mantém o monorepo das fases 001/002. Três módulos Nest novos
(`classes`, `class-invitations`, `enrollments`), um diretório de contratos
(`classes/`) e três features web. O aceite continua no módulo `provisioning`
(`RoleGrantAcceptance`), só estendido para o papel `STUDENT`.

## Impacto em artefatos existentes

- **Spec 001**: FR-010/FR-012 e US1-1, US1-2, US1-6, US1-7 superados por 003/FR-048. O
  registro histórico não é reescrito; as guardas passam a tratá-los como substituídos
  (D13).
- **Guardas**: `no-academic-domain.spec.ts` → `domain-boundary.spec.ts`;
  `audit-coverage.spec.ts` lê os catálogos 001 + 003; `traceability.spec.ts` checa
  também a spec 003 (prefixo `003/`).
- **E2E**: fixtures deixam de usar `/cadastro`; alunos passam a ser criados por convite
  de turma de um professor do projeto `teacher`.
- **Docs**: `CLAUDE.md` (estrutura, comandos, guardas), `README.md` e o quickstart da
  001 (seção de cadastro) atualizados na fase de Polish.

## Complexity Tracking

Sem violações da constituição a justificar.
