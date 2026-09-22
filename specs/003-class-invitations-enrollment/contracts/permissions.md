# Permissions Contract: 003 — Turmas, Convites e Matrículas

Acrescenta permissões ao catálogo da Fase 001
(`specs/001-foundation-identity-access/contracts/permissions.md`), por uma migração de
dados idempotente (`INSERT … ON CONFLICT DO NOTHING`). O código checa permissões,
nunca nomes de papel (constituição II); o contexto da turma é conferido depois, no
serviço (404).

| Permissão | Descrição | TEACHER | STUDENT | MANAGER | ADMIN |
|-----------|-----------|:-------:|:-------:|:-------:|:-----:|
| `turmas.criar` | Criar turma própria | ✅ | — | — | — |
| `turmas.visualizar` | Listar e ver as próprias turmas e os convites delas | ✅ | — | — | — |
| `turmas.editar` | Editar dados das próprias turmas | ✅ | — | — | — |
| `turmas.alterar_situacao` | Ativar, inativar e arquivar as próprias turmas | ✅ | — | — | — |
| `turmas.convidar_aluno` | Convidar aluno por e-mail para turma própria | ✅ | — | — | — |
| `turmas.reenviar_convite` | Reenviar convite de turma própria | ✅ | — | — | — |
| `turmas.cancelar_convite` | Cancelar convite de turma própria | ✅ | — | — | — |
| `turmas.visualizar_alunos` | Listar as matrículas das próprias turmas | ✅ | — | — | — |
| `turmas.remover_aluno` | Remover matrícula de turma própria | ✅ | — | — | — |
| `turmas.proprias.listar` | Listar as turmas em que tem matrícula ativa | — | ✅ | — | — |

`MANAGER` e `ADMIN` não recebem nenhuma dessas permissões (constituição XXIV e XXV):
sem papel de professor, `GET /classes` → `403 FORBIDDEN`. Uma pessoa com vários papéis
tem a união das permissões dos papéis **ativos** (Fase 001): um professor suspenso
perde `turmas.*` na hora.

Matriz de autorização (testes em `apps/api/test/security/003-class-authorization-matrix.ts`):

| Sujeito | Rotas de turma do professor | `/me/classes` | Aceite público |
|---------|-----------------------------|---------------|----------------|
| Sem sessão | 401 | 401 | permitido (token) |
| STUDENT | 403 | 200 | permitido |
| TEACHER dono da turma | 2xx | 403 se não for aluno | permitido |
| TEACHER de outra turma | 404 | — | — |
| TEACHER suspenso/inativo | 403 | — | — |
| MANAGER / ADMIN sem TEACHER | 403 | 403 | permitido |
| E-mail não verificado | 403 `EMAIL_NOT_VERIFIED` | 403 | permitido |
