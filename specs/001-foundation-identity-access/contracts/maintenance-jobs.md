# Maintenance Jobs Contract: 001 — Foundation, Identity & Access

Rotinas de retenção e limpeza (R21, R23). Executadas pelo `MaintenanceService`
dentro da API a cada `MAINTENANCE_INTERVAL_SECONDS` (padrão 3600; `0` desliga) e
manualmente por:

```bash
pnpm --filter api maintenance:run [--job <nome>]
```

Cada execução só roda se obtiver `pg_try_advisory_lock(MAINTENANCE_LOCK)`; se outra
instância estiver executando, termina sem efeito (exit 0, mensagem "manutenção em
andamento em outra instância"). Remoções em lotes de 1000 linhas por transação (o `code-run-content`
esvazia 500 execuções por transação).

| Job (`--job`) | Seleciona | Efeito | Auditoria | Requisito |
|---------------|-----------|--------|-----------|-----------|
| `unverified-accounts` | `users` com `emailVerifiedAt IS NULL`, `createdAt < now() − 7 d`, único papel `STUDENT`, sem convite aceito | remove sessões, `user_tokens`, `student_profiles`, `user_roles` e o `User` | `account.unverified_purged` por conta (só `id`) | FR-017 |
| `access-records` | `access_records.occurredAt < now() − 6 meses` | remove | `access_records.purged` (`count`, `olderThan`) quando `count > 0` | FR-076 |
| `audit-events` | `audit_events.occurredAt < now() − 5 anos` | remove sob `SET LOCAL devtrack.audit_purge = 'on'` | `audit.purged` (`count`, `olderThan`) quando `count > 0` | FR-077 |
| `rate-limit-counters` | `rate_limit_counters.expiresAt < now()` | remove | nenhuma | R8 |
| `ai-records` (006) | `ai_executions` finais com `finished_at < now() − AI_RECORD_RETENTION_DAYS` (padrão 365), sem proposta `READY_FOR_REVIEW` | remove; transições, chamadas ao modelo e às ferramentas, saída e proposta saem em cascata; casos e resultados de avaliação ficam | nenhuma | 006 research "Retenção" |
| `code-run-content` (019) | `code_runs` finais (`COMPLETED`/`FAILED`) ainda não esvaziados com `finished_at < now() − (CODE_RUN_CONTENT_RETENTION_HOURS − MAINTENANCE_INTERVAL_SECONDS)` (padrão 24 h − 1 h = 23 h) | esvazia o conteúdo (código, mensagem do compilador, stdout e stderr dos casos → `NULL`) e marca `content_purged_at`, em lotes de 500; as linhas ficam (situação, vereditos, contagens, tempos) | nenhuma | 019/FR-019, research B12 |
| `mail-records` (017) | `mail_notices` com mais de 90 dias; `mail_deliveries` finais com `updated_at < now() − MAIL_RECORDS_RETENTION_DAYS`, exceto a última entrega de um convite ainda `PENDING` | remove sob `SET LOCAL devtrack.mail_purge = 'on'` | nenhuma | 017 research N13 |
| `student-feedback` (020) | `student_feedbacks` `RESOLVED`/`ARCHIVED` com `status_changed_at < now() − 24 meses` | remove sob `SET LOCAL devtrack.feedback_purge = 'on'`; o histórico (`student_feedback_status_changes`) sai em cascata; `RECEIVED`/`IN_REVIEW` nunca | nenhuma (log só com o nome e a contagem) | 020/FR-015, research J8 |

Sem `--job`, executa todos na ordem acima. Exit codes: `0` sucesso (inclusive sem
remoções), `1` erro (mensagem genérica, sem dados pessoais). A saída informa apenas
contagens por job.

Garantias testadas:
- conta verificada, com outro papel, com convite aceito ou com menos de 7 dias nunca é
  removida;
- após a remoção, o e-mail pode ser cadastrado de novo e um convite pendente para ele
  continua aceitável (cria identidade nova);
- nenhuma linha de auditoria com menos de 5 anos é removida, e `DELETE` fora do job
  continua falhando;
- duas execuções simultâneas não removem nada em dobro nem falham;
- `ai-records` nunca remove execução em andamento, recente ou com proposta aguardando o
  professor (`test/integration/006-retention.spec.ts`);
- `code-run-content` nunca toca execução pendente nem a que terminou há menos de 23 h, nenhum
  conteúdo de execução passa de 24 h entre duas rodadas, e o gatilho recusa qualquer outra mudança
  numa execução final (`test/security/019-retention.spec.ts`).
- `student-feedback` nunca remove feedback `RECEIVED` ou `IN_REVIEW`, nem encerrado há menos de 24
  meses, e `DELETE` fora do job continua falhando (`test/security/020-retention.spec.ts`).
