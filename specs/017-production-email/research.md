# Research: 017 — E-mail Real em Produção

Decisions carry the prefix **N** (001 R, 002 S, 003 D, 004 E, 005 V, 006 A, 007 C, 008 G, 009 H,
010 X, 011 W, 012 P, 013 K, 014 L, 015 F, 016 M).

What exists (read on 2026-10-11): `platform/mail` has the `Mailer` port, `SmtpMailer`
(`nodemailer`, `SMTP_URL`, `MAIL_FROM`), `MailDispatcher.afterCommit/send` (fire and forget, failure
only logged), `templates.ts` (six templates, HTML only in `class-invitation`), `links.ts`. Senders:
`auth/email-verification.service.ts` (`verify-email`), `auth/password-reset.service.ts`
(`password-reset`, nothing sent for an unknown e-mail), `provisioning/invitation.service.ts`
(`invitation-teacher` / `invitation-manager`), `admin-bootstrap/admin-bootstrap.service.ts`
(`admin-activation`, synchronous in the CLI, exit 3 on failure) and
`class-invitations/delivery.service.ts` + `delivery.worker.ts` (`class-invitation`, outbox
`class_invitation_deliveries`, 003 D5, `contracts/mail-delivery.md`). Tokens: `user_tokens`
(`EMAIL_VERIFICATION`, `PASSWORD_RESET`), `invitations.token_hash`, `class_invitations.token_hash`,
`admin_bootstraps.token_hash`, all hashes only.

## N1 — Sending: standard SMTP, Resend now, SES later, no SDK

**Decision**: keep `nodemailer` over SMTP, the only transport. Production uses Resend SMTPS
(`smtps://resend:<API key>@smtp.resend.com:465`); the switch to SES is
`smtps://<SMTP user>:<SMTP password>@email-smtp.sa-east-1.amazonaws.com:465`. Nothing in the code
names a provider for sending. `MAIL_FROM` (`DevTrack <nao-responda@<domínio>>`) and a new
`MAIL_REPLY_TO` (optional) come from the environment.

**Rationale**: the user's decision (Resend first, SES later) and FR-024. Both providers speak SMTPS
on 465; `nodemailer` is already a dependency (constitution: no new dependency without need).

**Alternatives**: the Resend SDK / HTTP API (richer: tags, `email_id` in the response) — rejected,
it ties the code to Resend and needs a second SDK for SES. The SES v2 API — same.

## N2 — One outbox for all six e-mails: `mail_deliveries`

**Decision**: a new table `mail_deliveries` replaces `class_invitation_deliveries`. Each row is one
e-mail to send: `kind` (`VERIFY_EMAIL`, `PASSWORD_RESET`, `INVITATION_TEACHER`,
`INVITATION_MANAGER`, `ADMIN_ACTIVATION`, `CLASS_INVITATION`), a reference to its **subject** (one
of `class_invitation_id`, `invitation_id`, `user_id`, `admin_bootstrap_id`, by CHECK per kind), the
003 attempt fields and the new delivery facts (N7). The recipient address is **not** stored: it is
read from the subject at send time (`class_invitations.email`, `invitations.email`, `users.email`,
`admin_bootstraps.email`), so no new copy of personal data exists and a corrected address is never
sent to the old one. The migration copies the 003 rows (same ids, statuses, attempts) and drops the
old table; `DeliveryStatus` gains values (N7).

The row is written in the transaction of the operation that creates the e-mail (FR-001), through
`MailOutbox.schedule(tx, kind, subjectRef)`, which also supersedes the pending deliveries of the same
subject and kind (FR-006, 003 behaviour on resend).

**Rationale**: the 003 outbox already solves retries, crash recovery and double instances
(`FOR UPDATE SKIP LOCKED`); one table keeps one worker, one state machine and one retention job.
Not storing the e-mail's content or the link (FR-009) keeps tokens hash-only.

**Alternatives**: one outbox per feature (as 003) — five copies of the same worker. A generic
`payload jsonb` with the rendered e-mail — stores links (tokens) and personal data; rejected.

## N3 — A fresh link at each attempt, prepared by the subject's owner

**Decision**: each `kind` registers a `MailSubject` handler, owned by the module that owns the
subject (the 003 rule, generalized):

- `prepare(tx, delivery)` locks the subject, decides whether the e-mail is still due and, if so,
  mints a fresh token on it (hash stored, previous link dead) and returns the recipient and the
  template params; otherwise returns `DISCARD` with a reason (`EXPIRED`, `REVOKED`, `ACCEPTED`,
  `NOT_NEEDED` — e.g. the e-mail was already verified, the bootstrap completed).
- `CLASS_INVITATION` and `INVITATION_*`: rotate `token_hash` on the invitation (003 D5).
- `VERIFY_EMAIL` and `PASSWORD_RESET`: the subject is the user; `prepare` issues a new `user_tokens`
  row of the purpose and invalidates the unused older ones (what `tokens.issue` already does).
- `ADMIN_ACTIVATION`: rotate `token_hash` on the bootstrap while it is `PENDING`.

The **first attempt** keeps the 003 shape: the request already minted the token in its transaction,
and `MailOutbox.attemptNow` sends it after commit, claiming the row (`attempts 0 → 1`). Retries by the
worker call `prepare`. The admin bootstrap CLI makes the first attempt synchronously, as today, and
reports it; a failure leaves the delivery `PENDING` for the API's worker (exit code 3, message: "o
e-mail será tentado de novo pela API").

**Rationale**: FR-006 (no stale or revoked link leaves), FR-009 (no stored link) and the anti-
enumeration of 001 (password reset still schedules nothing for an unknown e-mail; the response and
its timing do not depend on SMTP).

**Alternatives**: always mint in the worker (no token in the request) — breaks `--print-link` of
the bootstrap and adds one minute to every e-mail. Keeping the raw token encrypted in the row —
reversible secrets at rest; rejected.

## N4 — Worker, claim, rate and kill switch

**Decision**: `MailDeliveryWorker` (replaces `ClassInvitationDeliveryWorker`) runs every
`MAIL_RETRY_INTERVAL_SECONDS` (existing; `0` = timer off, tests call `runOnce(now)`), claims up to
`min(50, budget)` due rows with `FOR UPDATE SKIP LOCKED`, marks the attempt in flight
(`inFlightDeadline`, 003) and commits before sending. Waits and the limit of 7 attempts are the 003
table (`delivery-schedule.ts`, moved to `platform/mail/outbox`). A new
`MAIL_SENDS_PER_MINUTE` (default 120) caps the sends of all instances per minute through the
existing `rate_limit_counters` (one shared key); `0` pauses sending — rows stay `PENDING`, nothing
is lost (FR-008). The first attempt (`attemptNow`, N3) takes one unit of the same budget; with no
budget (or `0`) it sends nothing and the row stays `PENDING` for the worker, so a burst of class
invitations never exceeds the cap. Order: `next_attempt_at, created_at`.

**Rationale**: FR-003, FR-005, FR-008; Resend's default limit is a few requests per second, SES
starts in sandbox with 1/s; 120/min fits both and the guide says how to raise it.

**Alternatives**: a queue service (Redis, SQS) — forbidden without a spec need (constitution IX);
the database outbox is enough at this volume.

## N5 — Linking a provider notice to a delivery: our own Message-ID

**Decision**: each attempt sends a `Message-ID` header
`<{deliveryId}.{attempt}@{MAIL_MESSAGE_ID_DOMAIN}>` (default: the domain of `MAIL_FROM`), and the row
keeps the last one in `message_id` (UNIQUE). Resend returns it in every notice as
`data.message_id`; SES returns it in `mail.commonHeaders.messageId` when the identity's notifications
include the original headers (the guide turns that on). A notice whose Message-ID is unknown is
accepted and counted in the log, with no effect and no stored row (US2-7). A notice for an older
attempt of the same delivery (`.{n}` lower than the current one) is recorded and applied by the N7
table, where the first final reason stays (edge case "vários avisos").

No `Resend-Idempotency-Key`: a key per delivery would make Resend drop a retry whose link is the only
valid one (the token rotates per attempt, N3); a rare duplicate, whose newest link works, is the
lesser harm.

**Rationale**: provider-neutral (FR-014), no provider id needed at send time (SMTP returns none
reliably), and the address is never used to match (edge case).

**Alternatives**: Resend tags / `email_id` — only through the HTTP API (N1). Matching by recipient
and time — ambiguous and needs the address.

## N6 — The notice route: one public endpoint per provider, signature first

**Decision**: `POST /api/mail/notices/:provider` (`resend` | `ses`), `@Public()` and a new
`@ProviderNotice()` marker that makes `OriginGuard` let it through without `Origin` and with
`text/plain` (SNS posts `text/plain; charset=UTF-8`), like `@AcceptsMultipart()` does for uploads.
The route reads the **raw body** (Nest `rawBody: true` in `main.ts` and `createTestApp`), limited to
256 KB, and the adapter verifies it **before** any database read:

- **Resend** (Svix format): headers `svix-id`, `svix-timestamp`, `svix-signature`; HMAC-SHA256 of
  `${id}.${timestamp}.${body}` with the base64 part of `MAIL_NOTICE_SECRET` (`whsec_…`); any `v1,`
  signature of the header may match (constant-time compare); timestamp within ±5 min. Notice id =
  `svix-id`.
- **SES** (SNS): `SignatureVersion` 2 only (SHA256withRSA); `SigningCertURL` must be `https://sns.
  {region}.amazonaws.com/…pem`, fetched with native `fetch` (5 s timeout, cached by URL); string to
  sign built per the SNS rules; `TopicArn` must equal `MAIL_SES_TOPIC_ARN`. A
  `SubscriptionConfirmation` for that topic is confirmed by fetching its `SubscribeURL` (same host
  rule). Notice id = SNS `MessageId`.

Valid notices answer `200` at once (even with no effect); invalid ones `401 NOTICE_REJECTED` with no
detail. The active provider is `MAIL_NOTICE_PROVIDER` (`resend` | `ses` | `none`); the other path
answers `404`. A per-IP limit (`RATE_LIMIT_MAIL_NOTICES_PER_MINUTE`, 600) protects the route.

**Rationale**: FR-010–FR-012, constitution XVII (webhooks idempotent) and I (untrusted input). No
new dependency: `node:crypto` (`createHmac`, `createVerify`, `X509Certificate`) and `fetch` cover
both.

**Alternatives**: the `svix` package / AWS SDK — dependencies for a few lines of crypto; rejected.
One generic route with the provider in a header — weaker routing of the secret; rejected.

## N7 — States of a delivery and the effect of each notice

**Decision**: `delivery_status` becomes `PENDING`, `SENT`, `DELIVERED`, `UNDELIVERED`, `FAILED`,
`DISCARDED`, `SUPERSEDED` (003's `PENDING`, `SENT`, `FAILED`, `SUPERSEDED` keep their meaning). New
columns `sent_at` (kept), `delivered_at`, `undelivered_at`, `undelivered_reason` (`BOUNCED`,
`COMPLAINED`, `REJECTED`), `discard_reason`. Transitions (trigger + service):

| From | To | By |
|---|---|---|
| PENDING | SENT | SMTP accepted the message |
| PENDING | FAILED | 7th temporary failure |
| PENDING | UNDELIVERED (REJECTED) | permanent SMTP rejection (5xx) |
| PENDING | DISCARDED / SUPERSEDED | `prepare` said no / a newer delivery of the subject |
| PENDING (in flight) | DELIVERED / UNDELIVERED (BOUNCED, COMPLAINED) | notice for the current attempt, arriving before the SMTP result (the later result is ignored) |
| SENT | DELIVERED | notice "delivered" |
| SENT, DELIVERED | UNDELIVERED (BOUNCED) | notice "bounced, permanent" (DELIVERED only if it arrives later out of order) |
| SENT, DELIVERED | UNDELIVERED (COMPLAINED) | notice "complained" |
| UNDELIVERED (BOUNCED) | UNDELIVERED (COMPLAINED) | — never: the first final reason stays; later notices are only recorded |

The `message_id` of an attempt is written when the attempt is claimed, before sending, so a notice
that beats the SMTP result still finds its delivery.

Notice mapping: Resend `email.delivered` → delivered; `email.bounced` with `bounce.type =
Permanent` → bounced; other `email.bounced` and `email.delivery_delayed` → temporary (recorded
only); `email.complained` → complained; `email.failed` → rejected; anything else (opened, clicked,
sent, scheduled) → ignored and not stored. SES `Delivery` → delivered; `Bounce` with `bounceType =
Permanent` → bounced; other bounces → temporary; `Complaint` → complained. A "delivered" after
`UNDELIVERED` never moves it back (edge case "fora de ordem").

**Rationale**: FR-013, FR-017 (a notice never touches the invitation's state), explicit states
(XVI).

## N8 — Permanent vs temporary SMTP failures

**Decision**: an SMTP response code 5xx on `RCPT`/`DATA` (`EENVELOPE`, `responseCode >= 500`) is
permanent → `UNDELIVERED (REJECTED)` with no more attempts; connection errors, timeouts
(`MAIL_SEND_TIMEOUT_SECONDS`, 20) and 4xx are temporary → the 003 waits. An authentication error
(`EAUTH`) is temporary for the row (configuration problem) and logged as `mail.auth_failed` at
error level once per cycle, so a wrong key does not burn every e-mail as rejected.

## N9 — Templates: HTML and text from one source, email-safe, DS colours

**Decision**: `templates.ts` becomes `platform/mail/templates/`: one function per kind returns
`{ subject, heading, paragraphs, action: { label, url }, expiry }`, and a shared `layout.ts` renders
both bodies from it, so text and HTML never drift (FR-019). HTML: table layout, inline styles only,
system font stack, colours copied from the light-theme tokens of `design-system/tokens.css`
(`--primary`, `--foreground`, `--text-secondary`, `--background`, `--border`) into
`mail-tokens.ts`, with a test that compares them to `tokens.css`; the action is a link styled as a
button and repeated as plain text; `lang="pt-BR"`, a hidden preheader, every interpolated value
through `escapeHtml`. No `<img>`, `<link>`, `@import`, `url(`, web fonts, tracking pixels or
redirect links (FR-021); the guide tells to switch off Resend's open/click tracking (it is off by
default for SMTP) and SES's configuration-set tracking. Interpolated text in the text body is never
escaped (plain text).

**Rationale**: FR-019–FR-023, SC-005; dark mode left to the client (no `prefers-color-scheme` rules,
which most clients ignore).

## N10 — Configuration and the production guard

**Decision**: new variables (`config.schema.ts`, `.env.example`):

| Variable | Default | Meaning |
|---|---|---|
| `MAIL_REPLY_TO` | — | optional reply address |
| `MAIL_MESSAGE_ID_DOMAIN` | domain of `MAIL_FROM` | right side of our Message-ID (N5) |
| `MAIL_SENDS_PER_MINUTE` | 120 | send cap of all instances; `0` pauses (N4) |
| `MAIL_SEND_TIMEOUT_SECONDS` | 20 | SMTP timeout per message (N8) |
| `MAIL_NOTICE_PROVIDER` | `none` | `resend` \| `ses` \| `none` (N6) |
| `MAIL_NOTICE_SECRET` | — | Resend signing secret (`whsec_…`), required when provider is `resend` |
| `MAIL_SES_TOPIC_ARN` | — | SNS topic, required when provider is `ses` |
| `RATE_LIMIT_MAIL_NOTICES_PER_MINUTE` | 600 | per-IP limit of the notice route |

With `NODE_ENV=production` the schema refuses (FR-025): `SMTP_URL` not `smtps://` (or `smtp://` on
587 with `?requireTLS=true`), a host that is `localhost`, an IP of a private range or `mailpit`,
a `MAIL_FROM` without a domain, and `MAIL_NOTICE_PROVIDER=none`. The secrets (`SMTP_URL` password,
`MAIL_NOTICE_SECRET`) join the list the 008 secret scan looks for; the config loader's error never
prints values.

## N11 — Where the inviter sees it

**Decision**: contracts: `DeliveryStateSchema` (`classes`) gains `UNDELIVERED`, and both invitation
views gain `deliveryIssue: "BOUNCED" | "COMPLAINED" | "REJECTED" | null`; the provisioning
`InvitationViewSchema` (teacher and manager invitations) gains `delivery` and `deliveryIssue`, read
from the latest delivery of the invitation. The web shows, with text and a `warning` badge:
"Não entregue — o endereço não existe ou recusou a mensagem" (BOUNCED, REJECTED) and "Não entregue —
marcado como spam pelo destinatário" (COMPLAINED). "Reenviar" on an undelivered invitation opens a
confirmation ("Este endereço já recusou a mensagem. Confira o e-mail antes de reenviar.").
Account e-mails (verify, reset, activation) are never shown anywhere (FR-018).

## N12 — Audit and logs

**Decision**: new audit types, actor `SYSTEM`, target `MAIL_DELIVERY`:
`mail_delivery.failed` (`kind`, `attempts`, `errorCode`), `mail_delivery.undelivered` (`kind`,
`reason`, `source`: `SMTP` \| `NOTICE`), `mail_delivery.discarded` (`kind`, `reason`). Metadata never
holds the address, name, link, subject or Message-ID. Refused notices are **not** audited (an
attacker could flood the trail): they are a structured log `mail.notice_rejected` (`provider`,
`reason`) and a counter. The 003 log names (`class_invitation.delivery_failed`, `…_exhausted`)
become `mail.delivery_failed` / `mail.delivery_exhausted` with `kind`.

The spec's Security section is amended to say refused notices go to logs, not to the audit trail.

## N13 — Retention

**Decision**: maintenance job `mail-records`: `mail_notices` older than 90 days are deleted;
`mail_deliveries` in a final state (`DELIVERED`, `UNDELIVERED`, `FAILED`, `DISCARDED`, `SUPERSEDED`)
older than 180 days are deleted unless they are the latest delivery of a still-`PENDING` invitation
(whose situation the inviter sees). `MAIL_RECORDS_RETENTION_DAYS` (180) configures it.

## N14 — Tests without a real provider

**Decision**: tests keep `InMemoryMailer` (a `FailingMailer` gains `permanent`/`temporary` modes and
returns the Message-ID it got); notice tests sign fixtures with a test secret
(`test/helpers/mail-notices.ts`: `signedResendNotice`, `signedSnsNotice`). The SNS path gets an
injected `CertificateFetcher`: tests generate an RSA key and a self-signed certificate with
`node:crypto` and serve it through the fetcher, with the real host check. The E2E keeps Mailpit and
posts a signed Resend notice to the E2E API to see "Não entregue" on the screen. No test talks to
Resend or AWS.

## N15 — The guide

**Decision**: `docs/deploy/email.md` (Portuguese): Resend account, domain verification (SPF include,
DKIM CNAMEs, DMARC `p=none` then `quarantine`, return-path), `SMTP_URL`, `MAIL_FROM`, webhook
endpoint and secret, the events to subscribe (`email.delivered`, `email.bounced`,
`email.complained`, `email.failed`, `email.delivery_delayed`), tracking off, a first-send check
(headers `dkim=pass`, `spf=pass`, `dmarc=pass`), limits; the SES switch (domain identity in
sa-east-1, DKIM, custom MAIL FROM, production access request, SMTP credentials, configuration set
without tracking, SNS topic with notifications including headers, `MAIL_NOTICE_PROVIDER=ses`,
`MAIL_SES_TOPIC_ARN`); the LGPD note (the provider as operator: DPA, data location, retention of
logs on the provider side). Linked from `README.md`.
