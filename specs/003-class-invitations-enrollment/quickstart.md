# Quickstart: 003 — Turmas, Convites e Matrículas

Roteiro para validar a feature depois da implementação. Ambiente e pré-requisitos: os
mesmos das fases 001 e 002 (`specs/002-stack-alignment/quickstart.md`). Rode
`pnpm build` antes de comandos filtrados.

## 1. Subir e migrar

```bash
docker compose up -d postgres postgres-test mailpit
pnpm install && pnpm build
pnpm --filter api prisma migrate deploy      # turmas, convites, entregas, matrículas, permissões turmas.*
pnpm dev                                     # web :3000, API :4000, Mailpit :8025
```

Esperado: migração aplicada sem erro; `POST /api/auth/signup` → `404` (FR-048);
`/cadastro` → página não encontrada.

## 2. Professor cria turma (US1)

Com um professor ativo (ADMIN convida professor pelo fluxo da 001), entre em
`/turmas` → "Nova turma": "Programação Orientada a Objetos", `POO-2026-01`, 2026,
"2º semestre". Confira a turma na lista, pesquise "poo" e "programacao" (sem acento),
filtre por 2026 e por situação. Tente criar outra turma com `poo-2026-01` → "Você já
tem uma turma com este código.". Inative e reative; arquive outra turma e confirme
que ela não aceita convite nem edição.

## 3. Convidar aluno novo e aceitar (US2, US3)

Na turma → "Convidar aluno" → `aluno1@example.test` → "Convite enviado.". No Mailpit,
abra o e-mail (turma, professor, prazo, "Aceitar convite"). No link: nome, RA
`2026001`, senha e confirmação → "Você agora faz parte da turma." em
`/minhas-turmas`. De volta à turma (como professor): 1 aluno ativo, convite aceito.
Reabra o link → "Este convite não é mais válido.". Convide `aluno1` de novo → "Este
aluno já está matriculado nesta turma.".

## 4. Aluno existente em segunda turma (US4)

Crie a turma `ALG-2026-01` e convide `aluno1@example.test`. Abra o link sem sessão →
"Entrar para aceitar" → login → "Aceitar convite" → `/minhas-turmas` lista as duas
turmas; nenhuma conta nova (confira em `/admin/usuarios` como ADMIN: um só
`aluno1`). Com outra conta logada, o link recusa com a mensagem de conta errada.

## 5. Convites: reenviar, cancelar, expirar, falha de envio (US5, FR-019)

- Convide `aluno2@example.test`, reenvie: só o link mais novo funciona; reenviar de
  novo em menos de 60 s → aviso de espera.
- Cancele o convite: o link → "Este convite não é mais válido.".
- Expiração: no banco de dev, `UPDATE class_invitations SET expires_at = now() -
  interval '1 minute' WHERE email = 'aluno2@example.test' AND status = 'PENDING';` → o
  link mostra "Este convite expirou." e o convite sai de "Pendentes" e aparece no
  filtro "Expirados".
- Falha de envio: `docker compose stop mailpit`, convide `aluno3@example.test` →
  convite criado, selo "Enviando"; `docker compose start mailpit`; em até ~2 min (nova
  tentativa 1 min depois da falha, worker a cada `MAIL_RETRY_INTERVAL_SECONDS` = 30 s) o
  e-mail chega com um link novo, que funciona.

## 6. Remover aluno e convidar de novo (US6)

Na turma POO, remova `aluno1` (confirmação) → matrícula "Removida", contagem 0;
`aluno1` continua entrando no sistema e ainda vê ALG em "Minhas turmas". Convide
`aluno1` de novo para POO e aceite → matrícula ativa nova; no banco, a removida
continua registrada.

## 7. Isolamento (US8)

Com um segundo professor, abra `/turmas/<id da turma do primeiro>` → "Recurso não
encontrado." (igual a um id inexistente); `GET /api/classes/<id>` → `404`. Como ADMIN sem papel de professor,
`GET /api/classes` → `403`. Como aluno, `GET /api/classes` → `403` e
`GET /api/me/classes` → `200`.

## 8. Testes automatizados

```bash
pnpm lint && pnpm check-types && pnpm test      # inclui 003/* na API, contratos e web
pnpm --filter web test:e2e                      # jornadas 003 (professor, aluno novo, aluno existente, remoção) + 001/002 adaptadas
```

Esperado: tudo verde; `traceability.spec.ts` cobre todos os cenários da spec 003 e os
de autocadastro da 001 como substituídos; `domain-boundary.spec.ts` fixa os 18
modelos; a varredura de segredos passa na jornada 003.
