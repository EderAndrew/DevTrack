# Implementation Plan: 017 — E-mail Real em Produção

**Branch**: `017-production-email` | **Date**: 2026-10-11 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `/specs/017-production-email/spec.md`

## Summary

The API already sends real e-mail over SMTP; production only needs the provider's SMTP URL. This
feature makes that sending reliable, observable and provider-neutral:

- **One outbox** (N2, N3, N4): the 003 class-invitation outbox becomes `mail_deliveries`, used by all
  six e-mails. Each row points to its subject (invitation, user, bootstrap), never stores the
  address or the link, and each retry mints a fresh link on the subject. The worker, the waits
  (7 attempts, 1 min to 6 h) and `SKIP LOCKED` come from 003; a shared cap
  (`MAIL_SENDS_PER_MINUTE`) and a pause (`0`) are new.
- **Provider notices** (N5, N6, N7): every attempt carries our own `Message-ID`
  (`<deliveryId.attempt@domain>`), which Resend and SES both return in their notices.
  `POST /mail/notices/:provider` verifies the signature on the raw body (Resend/Svix HMAC now; SES
  through SNS with the certificate checked), stores each notice once and moves the delivery to
  `DELIVERED` or `UNDELIVERED (BOUNCED | COMPLAINED)`. A permanent SMTP refusal is
  `UNDELIVERED (REJECTED)` at once (N8).
- **Inviters see it** (N11): class, teacher and manager invitations show "Não entregue" with the
  reason in words; "Reenviar" to the same address asks for confirmation. Account e-mails never show
  anything (anti-enumeration).
- **Templates** (N9): one source per e-mail renders the HTML and the text body; email-safe HTML with
  inline token colours, no external resource, no tracking.
- **Production guard and guide** (N10, N15): the API refuses to start in production with a
  development mail configuration; `docs/deploy/email.md` covers Resend now and the SES switch later,
  configuration only.

## Technical Context

**Language/Version**: TypeScript 7 on Node.js 24 LTS (`apps/api` with SWC; `tsc` type-check)
**Primary Dependencies**:
- NestJS 11, Prisma 7, Zod 4 (`@repo/contracts`), `nodemailer` (already used);
- `node:crypto` (HMAC, RSA-SHA256 verify, `X509Certificate`) and native `fetch` (SNS certificate);
- web: Next.js 16, React 19, TanStack Query 5, shadcn/ui, Lucide;
- no new dependency (N1, N6).

**Storage**: PostgreSQL 17. One migration:
- enums `mail_kind`, `undelivered_reason`, `discard_reason`, `mail_notice_provider`,
  `mail_notice_kind`; `delivery_status` += `DELIVERED`, `UNDELIVERED`, `DISCARDED`;
- tables `mail_deliveries` (replaces `class_invitation_deliveries`, rows moved) and `mail_notices`
  (append-only);
- transition trigger on `mail_deliveries`.

**Testing**:
- Vitest (API: unit, integration, security; web: jsdom, Testing Library, vitest-axe);
- signed notice fixtures (Resend HMAC, SNS with a test RSA certificate through an injected
  fetcher), `InMemoryMailer` / `FailingMailer` (temporary and permanent);
- Playwright E2E with Mailpit and a signed notice posted to the E2E API.

**Target Platform**: Linux containers (API `Dockerfile` target `runtime`), modern browsers.
**Project Type**: web application (pnpm/Turborepo monorepo: `apps/api`, `apps/web`,
`packages/contracts`).

**Performance Goals**:
- a flow that schedules an e-mail adds one INSERT; its response time does not depend on SMTP (SC-002);
- a notice is verified and applied in < 200 ms p95 (the provider retries slow answers);
- the worker sends up to `MAIL_SENDS_PER_MINUTE` (120) per minute across instances;
- an undelivered invitation is visible on the next read after the notice (SC-003, < 1 min).

**Constraints**:
- provider-neutral sending (SMTP only) and notice parsing behind adapters;
- no address, name, link, token or Message-ID in logs, audit or rows other than the subject's;
- the notice route is public: signature verified on the raw body before any DB access;
- production refuses a development mail configuration.

**Scale/Scope**: hundreds of e-mails a day, peaks of a few hundred class invitations at the start of
a term; 6 e-mail kinds, 1 new route, 2 tables, 3 invitation screens.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

Constitution v3.4.0.

- [x] **I. Security**: the notice route is the only new external input; raw body ≤ 256 KB, signature
  (HMAC or SNS RSA with a pinned certificate host) and timestamp/topic checked before anything else;
  strict parsing of the fields used; per-IP rate limit. HTML templates escape every value.
- [x] **II. RBAC**: no new permission; invitation views keep their 001/003 permissions and context.
  The notice route is `@Public()` by design, authenticated by the provider's signature (N6).
- [x] **III. Server authority**: delivery states, waits and attempts are decided by the server
  clock and the worker; a notice never changes an invitation's state (FR-017).
- [x] **IV. Untrusted code**: N/A.
- [x] **V. Data integrity**: one Prisma migration; FKs per subject with a CHECK of exactly one; UNIQUE
  `message_id` and `(provider, notice_id)`; transition trigger; the 003 rows migrated.
- [x] **VI. Audit & logs**: final delivery outcomes audited (N12) with enums and codes only; refused
  notices logged (not audited, against flooding); secrets and contents never logged; the secret
  scan gains the SMTP password and the notice secret.
- [x] **VII. Tests**: outbox per kind, discards, supersession, crash recovery, two workers, rate cap,
  pause; notice signatures, idempotency, mapping, out-of-order; templates; config guard; UI;
  E2E.
- [x] **VIII. Layering**: the notice controller only reads the raw body and calls
  `MailNoticesService`; subject handlers live in their modules; React shows contract data.
- [x] **IX. Simplicity**: no new dependency or infrastructure; one outbox replaces one, the queue
  stays in PostgreSQL (N4).
- [x] **X. Evidence**: a notice is a FACT from the provider, stored as received (kind, time), never a
  conclusion about the person.
- [x] **XI. Human oversight**: the inviter decides to cancel or resend; nothing is decided
  automatically.
- [x] **XII. Determinism first**: no AI.
- [x] **XIII. Risk level**: N/A (no automated decision beyond retries).
- [x] **XIV–XV. AI governance**: N/A.
- [x] **XVI. Explicit states**: `delivery_status` with a validated transition table (data-model).
- [x] **XVII. Idempotency**: each attempt sends at most once (claim under `FOR UPDATE SKIP LOCKED`,
  stale results ignored); each notice applies once (UNIQUE notice id); webhooks named explicitly by
  the constitution.
- [x] **XVIII. Safe interruption**: `MAIL_SENDS_PER_MINUTE=0` pauses sending without loss;
  `MAIL_RETRY_INTERVAL_SECONDS=0` stops the worker; in-flight attempts recover after a crash;
  SMTP timeout per message.
- [x] **XIX. AI evals**: N/A.
- [x] **XX. Pedagogy**: N/A.
- [x] **XXI. Configurable domain**: provider, domain, sender and limits are configuration.
- [x] **XXII. Personalization & accessibility**: e-mails readable by screen readers and without
  images; no individual needs in any e-mail.
- [x] **XXIII. Curricular traceability**: N/A.
- [x] **XXIV. Academic isolation**: a teacher sees only the delivery of invitations of their own
  classes (003 scoping, unchanged).
- [x] **XXV. Privileged provisioning**: invitation flows unchanged; tokens stay hash-only and
  single-use, a retry mints a new one and kills the previous (003 rule extended).
- [x] **XXVI. Shared contracts**: `DeliveryState` gains a value and `DeliveryIssue` is new in
  `packages/contracts/src/classes`, imported by `provisioning`; the provider bodies are not API↔web
  contracts and stay in `apps/api` (catalog entry without body schema).
- [x] **Frontend stack**: existing components (`Badge`, `AlertDialog`) and features; no new library.

Re-check after Phase 1 design: no violation. The public, session-less route is the only point that
needs care; it follows the `@AcceptsMultipart()` precedent of 004 for bypassing `OriginGuard` and is
listed in `route-declarations.spec.ts` with its reason.

## Project Structure

### Documentation (this feature)

```text
specs/017-production-email/
├── spec.md
├── plan.md              # this file
├── research.md          # N1–N15
├── data-model.md        # mail_deliveries, mail_notices, enums, transitions, retention
├── quickstart.md
├── contracts/
│   ├── http-api.md          # POST /mail/notices/:provider; DeliveryState/DeliveryIssue in invitation views
│   ├── mail-delivery.md     # the outbox flow (replaces 003 mail-delivery.md)
│   ├── audit-events.md      # mail_delivery.failed | undelivered | discarded
│   ├── configuration.md
│   ├── maintenance-jobs.md  # mail-records
│   └── web-ui.md            # "Não entregue", resend confirmation, e-mail layout
├── checklists/requirements.md
└── tasks.md             # /speckit-tasks
```

### Source Code (repository root)

```text
apps/api/
├── prisma/{schema.prisma, migrations/<ts>_production_email/}
├── src/main.ts                                  # rawBody: true
├── src/platform/config/config.schema.ts         # N10 variables and the production guard
├── src/platform/http/                           # @ProviderNotice() and OriginGuard exception
├── src/platform/mail/
│   ├── mailer.ts, smtp.mailer.ts                # Message-ID, reply-to, timeout, permanent vs temporary errors
│   ├── templates/                               # one source per kind → { html, text } (N9), mail-tokens.ts
│   ├── outbox/                                  # MailOutbox (schedule, attemptNow), MailDeliveryWorker,
│   │                                            #   delivery-schedule.ts (from 003), MailSubject registry
│   ├── notices/                                 # MailNoticesController/Service, resend.adapter.ts,
│   │                                            #   ses.adapter.ts (SNS verify, CertificateFetcher)
│   └── retention/                               # maintenance job mail-records
├── src/modules/class-invitations/               # DeliveryService/Worker removed; class-invitation subject
├── src/modules/provisioning/                    # invitation subject; delivery in the views
├── src/modules/auth/                            # verify-email and password-reset subjects
├── src/modules/admin-bootstrap/                 # admin-activation subject; CLI first attempt
├── src/cli/mail-notice.command.ts               # dev only: posts a signed notice (quickstart step 3); refuses NODE_ENV=production
└── test/
    ├── helpers/mail-notices.ts                  # signed Resend and SNS fixtures, test certificate
    ├── integration/017-us{1..4}-*.spec.ts, 017-schema.spec.ts, 017-migration.spec.ts
    └── security/017-{notice-auth,boundaries,secrets,concurrency,performance}.spec.ts

packages/contracts/src/
├── classes/class-invitations.ts                 # DeliveryState += UNDELIVERED, DeliveryIssue, deliveryIssue
├── provisioning/invitations.ts                  # delivery, deliveryIssue
└── endpoints.ts                                 # mail.notice

apps/web/
├── features/classes/components/class-invitations-tab.tsx   # "Não entregue", resend confirmation
├── features/teachers/, features/managers/                  # the same on their invitation lists
├── lib/messages/                                            # delivery issue texts
└── e2e/production-email.spec.ts

docs/deploy/email.md                             # the guide (N15); README links it
```

**Structure Decision**: the outbox and the notices live in `platform/mail`, next to the `Mailer`
port, because every module sends e-mail; each module that owns a subject registers its
`MailSubject` (as the 015 hooks register on the activity modules), so `platform/mail` never imports
a domain module. The 003 `DeliveryService`/`ClassInvitationDeliveryWorker` are removed and their
tests move to the outbox.

## Complexity Tracking

No violation to justify.
