# Maintenance Jobs Contract: 001 — Foundation, Identity & Access

Rotinas de retenção e limpeza (R21, R23). Executadas pelo `MaintenanceService`
dentro da API a cada `MAINTENANCE_INTERVAL_SECONDS` (padrão 3600; `0` desliga) e
manualmente por:

```bash
pnpm --filter api maintenance:run [--job <nome>]
```

Cada execução só roda se obtiver `pg_try_advisory_lock(MAINTENANCE_LOCK)`; se outra
instância estiver executando, termina sem efeito (exit 0, mensagem "manutenção em
andamento em outra instância"). Remoções em lotes de 1000 linhas por transação.

| Job (`--job`) | Seleciona | Efeito | Auditoria | Requisito |
|---------------|-----------|--------|-----------|-----------|
| `unverified-accounts` | `users` com `emailVerifiedAt IS NULL`, `createdAt < now() − 7 d`, único papel `STUDENT`, sem convite aceito | remove sessões, `user_tokens`, `student_profiles`, `user_roles` e o `User` | `account.unverified_purged` por conta (só `id`) | FR-017 |
| `access-records` | `access_records.occurredAt < now() − 6 meses` | remove | `access_records.purged` (`count`, `olderThan`) quando `count > 0` | FR-076 |
| `audit-events` | `audit_events.occurredAt < now() − 5 anos` | remove sob `SET LOCAL devtrack.audit_purge = 'on'` | `audit.purged` (`count`, `olderThan`) quando `count > 0` | FR-077 |
| `rate-limit-counters` | `rate_limit_counters.expiresAt < now()` | remove | nenhuma | R8 |
| `ai-records` (006) | `ai_executions` finais com `finished_at < now() − AI_RECORD_RETENTION_DAYS` (padrão 365), sem proposta `READY_FOR_REVIEW` | remove; transições, chamadas ao modelo e às ferramentas, saída e proposta saem em cascata; casos e resultados de avaliação ficam | nenhuma | 006 research "Retenção" |

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
  professor (`test/integration/006-retention.spec.ts`).
