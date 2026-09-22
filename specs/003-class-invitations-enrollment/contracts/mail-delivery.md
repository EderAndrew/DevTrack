# Mail Delivery Contract: 003 — Convites de turma

Entrega assíncrona do e-mail de convite com novas tentativas (FR-019, D5), sem fila nova.

## Fluxo

1. Criação ou reenvio do convite, numa transação: grava o convite (hash do token novo)
   e uma entrega `PENDING` (`attempts = 0`, `next_attempt_at = now() + 1 min`: o
   worker só assume se a 1ª tentativa não registrar resultado, ex.: a API reiniciou);
   num reenvio, entregas `PENDING` anteriores do convite viram `SUPERSEDED`.
2. Depois do commit, `MailDispatcher.afterCommit` faz a 1ª tentativa com o token da
   requisição (ele existe só em memória), travando a entrega (`FOR UPDATE`) para
   registrar o resultado; se o worker já a tiver assumido, não envia. Sucesso → `SENT`, `sent_at`. Falha →
   `attempts = 1`, `next_attempt_at = now() + 1 min`, `last_error_code`, log
   `class_invitation.delivery_failed`.
3. O worker (`ClassInvitationDeliveryWorker`) roda a cada
   `MAIL_RETRY_INTERVAL_SECONDS` (padrão 30; `0` desliga — usado nos testes, que chamam
   `runOnce()`); em cada ciclo, até 50 entregas com `status = 'PENDING' AND
   next_attempt_at <= now()`, por `SELECT … FOR UPDATE SKIP LOCKED`:
   - convite não mais `PENDING` efetivo, ou entrega que não é a mais recente do convite →
     `SUPERSEDED`, sem enviar;
   - senão: gera token novo, grava o hash no convite (o link anterior deixa de valer),
     commit, envia. Sucesso → `SENT`. Falha → próxima espera da tabela ou `FAILED`.
4. Reinício da API no meio: entregas `PENDING` continuam na tabela e são retomadas pelo
   worker (a 1ª tentativa perdida conta como falha).

## Esperas

| Tentativa que falhou | Próxima tentativa em |
|----------------------|----------------------|
| 1ª | 1 min |
| 2ª | 5 min |
| 3ª | 15 min |
| 4ª | 1 h |
| 5ª | 3 h |
| 6ª | 6 h |
| 7ª | — (`FAILED`, log `class_invitation.delivery_exhausted`) |

Janela total ≈ 10 h 21 min. O professor pode reenviar a qualquer momento (respeitando
os limites de FR-021), o que cria entrega nova e aposenta as anteriores.

## E-mail (`class-invitation`, em `platform/mail/templates.ts`)

- Assunto: `Convite para a turma {nome da turma}`.
- Corpo (texto e HTML escapado): "Você foi convidado para participar da turma
  {nome}", código e período, "Professor(a): {nome do professor}", "Aceite até
  {data e hora de expiração em America/Sao_Paulo}", botão/link "Aceitar convite" →
  `{WEB_ORIGIN}/convite-turma?token={token}`.
- Nunca: senha, hash, token fora do link, dados internos.

## Garantias testadas

- Com o mailer falhando, o convite é criado (201) e a entrega fica `PENDING`; quando o
  mailer volta, `runOnce()` entrega e o link recebido funciona; o link da tentativa
  anterior não funciona.
- Duas instâncias do worker não enviam a mesma entrega duas vezes (`SKIP LOCKED`).
- Convite cancelado ou aceito antes da nova tentativa: nada é enviado.
- Nenhum log, auditoria ou linha de entrega contém token, hash ou link.
