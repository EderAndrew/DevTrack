# CLI Contract: `admin:bootstrap`

Comando operacional executado no ambiente do backend (FR-031). Não existe
equivalente HTTP (FR-030).

```bash
pnpm --filter api admin:bootstrap --email <email> [--print-link]
# atalho na raiz:
pnpm admin:bootstrap --email <email> [--print-link]
```

| Argumento | Obrigatório | Descrição |
|-----------|:-----------:|-----------|
| `--email` | sim | e-mail alvo; normalizado como no restante do sistema |
| `--print-link` | não | também imprime o link de ativação no terminal; uso auditado (`admin.bootstrap.link_printed`) |

Não aceita senha, papel, nome de usuário ou qualquer outro dado. Não lê credenciais de
variáveis de ambiente nem de arquivos (FR-033). Nunca roda automaticamente no startup.

## Comportamento

Tudo dentro de uma transação sob `pg_advisory_xact_lock` de bootstrap (R14):

| Situação | Resultado | Saída | Exit code |
|----------|-----------|-------|-----------|
| Existe `ADMIN` `ACTIVE` | nada muda; auditoria `admin.bootstrap.refused` | `Bootstrap administrativo já realizado` | `2` |
| E-mail de `User` verificado | `ADMIN` concedido ao mesmo `User` (senha intacta); bootstrap `COMPLETED` | `ADMIN concedido a <email>` | `0` |
| E-mail sem `User` ou de `User` não verificado | bootstrap `PENDING` + link de ativação (24 h) enviado por e-mail | `Link de ativação enviado para <email> (válido até <data>)` | `0` |
| … com `--print-link` | idem + link impresso | `Link de ativação: <url>` | `0` |
| Havia bootstrap `PENDING` | o anterior vira `CANCELLED` (link invalidado) antes do novo; ambos auditados | `Bootstrap pendente anterior cancelado` | — |
| E-mail inválido / argumento desconhecido | nada muda | mensagem de uso | `1` |
| Falha de configuração ou banco | nada muda | mensagem genérica (sem segredos) | `1` |
| Falha no envio do e-mail | bootstrap permanece `PENDING`; operador pode rodar de novo (cancela e reemite) ou usar `--print-link` | aviso | `3` |

O link tem a forma `${WEB_ORIGIN}/ativar-admin?token=<token>`; o token nunca é
gravado em log, auditoria ou banco (somente o hash).

## Concorrência

Duas execuções simultâneas serializam no advisory lock; o índice único parcial
"um `PENDING`" é a última barreira. Resultado: no máximo um `ADMIN` pendente ou ativo
(US3-6).
