# Quickstart: 017 — E-mail Real em Produção

## Local (no real e-mail)

Prerequisites: the setup of the root CLAUDE.md (Node 24, Docker, `apps/api/.env`, migrations).

```bash
docker compose up -d postgres postgres-test mailpit
pnpm build && pnpm --filter api prisma migrate deploy
pnpm --filter api test -t "017/"                    # outbox, notices, templates, config, security
pnpm --filter web test -t "017/"
pnpm --filter web test:e2e production-email         # undelivered invitation on the screen (needs consent to reset devtrack_e2e)
```

Manual check with `pnpm dev` (Mailpit at http://localhost:8025):

1. As ADMIN, invite a teacher; in Mailpit the e-mail has an HTML and a text part, the same link in
   both, and no external image (view source).
2. Stop Mailpit (`docker compose stop mailpit`), ask for a password reset: the page answers as
   always. The delivery stays `PENDING` (`mail_deliveries`). Start Mailpit: within a minute the
   e-mail arrives, and its link works.
3. As a teacher, invite a student. Post a signed Resend "bounced" notice for its Message-ID with
   `pnpm --filter api mail:notice --kind bounced --delivery <id>` (dev helper, signs with the local
   `MAIL_NOTICE_SECRET`): the invitation shows "Não entregue". "Reenviar" asks for confirmation.
4. Post the same notice again: nothing changes. Post it with a wrong signature: `401`.

## Production (Resend), summarized from `docs/deploy/email.md`

1. Resend: create the account, add the sending domain, publish its SPF, DKIM and DMARC records,
   wait for "Verified"; create an API key with send access.
2. API environment: `SMTP_URL=smtps://resend:<API key>@smtp.resend.com:465`,
   `MAIL_FROM="DevTrack <nao-responda@<domínio>>"`, `MAIL_NOTICE_PROVIDER=resend`.
3. Resend webhook → `https://<api>/api/mail/notices/resend`, events `email.delivered`,
   `email.bounced`, `email.complained`, `email.failed`, `email.delivery_delayed`; copy the signing
   secret into `MAIL_NOTICE_SECRET`.
4. Send a password reset to a test inbox: the message shows `spf=pass`, `dkim=pass`,
   `dmarc=pass`; `mail_deliveries` goes `SENT` → `DELIVERED`.
5. Send to `bounced@resend.dev`: the delivery becomes `UNDELIVERED (BOUNCED)`.

## Switching to SES

Domain identity and DKIM in sa-east-1, production access, SMTP credentials, configuration set
without tracking, SNS topic with notifications including the original headers, subscription to
`https://<api>/api/mail/notices/ses`; then `SMTP_URL`, `MAIL_NOTICE_PROVIDER=ses`,
`MAIL_SES_TOPIC_ARN`. No new version of the API. Steps in `docs/deploy/email.md`.
