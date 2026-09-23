# Permissions Contract: 004 — Área do Professor

Acrescenta permissões ao catálogo das fases 001 e 003 por uma migração de dados
idempotente (`INSERT … ON CONFLICT DO NOTHING`). O código checa permissões, nunca nomes de
papel; o contexto (disciplina ou turma do professor da sessão) é conferido depois, no
serviço (404).

| Permissão | Descrição | TEACHER | STUDENT | MANAGER | ADMIN |
|-----------|-----------|:-------:|:-------:|:-------:|:-----:|
| `disciplinas.visualizar` | Listar e ver as próprias disciplinas | ✅ | — | — | — |
| `disciplinas.criar` | Criar disciplina | ✅ | — | — | — |
| `disciplinas.editar` | Editar, desativar e reativar as próprias disciplinas | ✅ | — | — | — |
| `ementas.enviar` | Enviar ementa e pedir novo processamento | ✅ | — | — | — |
| `ementas.visualizar` | Ver e baixar documentos, conteúdo extraído e revisões | ✅ | — | — | — |
| `ementas.revisar` | Criar, editar e confirmar revisões do conteúdo | ✅ | — | — | — |
| `calendario.gerenciar` | Marcar e desmarcar encontros das próprias turmas | ✅ | — | — | — |
| `planejamento.visualizar` | Ver encontros, planejamento, tópicos e cobertura | ✅ | — | — | — |
| `planejamento.editar` | Escolher a ementa usada, criar, editar, juntar, dividir, reordenar, arquivar e restaurar tópicos | ✅ | — | — | — |
| `planejamento.alterar_situacao` | Confirmar, reabrir, iniciar e arquivar o planejamento | ✅ | — | — | — |

A edição da turma como oferta (disciplina, período, datas) usa `turmas.editar` (003).
`MANAGER` e `ADMIN` não recebem nenhuma permissão desta feature (constituição XXIV e
XXV; FR-044). Uma pessoa com vários papéis tem a união das permissões dos papéis ativos:
`ADMIN` + `TEACHER` age como professor, só sobre o próprio conteúdo.

Matriz de autorização (testes em `apps/api/test/security/004-curriculum-authorization-matrix.ts`,
somada à matriz geral `authorization-matrix.ts`):

| Sujeito | Rotas desta feature |
|---------|---------------------|
| Sem sessão | 401 |
| E-mail não verificado | 403 `EMAIL_NOT_VERIFIED` |
| STUDENT | 403 |
| MANAGER / ADMIN sem TEACHER | 403 |
| TEACHER suspenso ou inativo | 403 |
| TEACHER dono | 2xx |
| TEACHER de outra área (ids do dono, inclusive download e ligações cruzadas) | 404 |
| ADMIN + TEACHER | 2xx no próprio conteúdo, 404 no alheio |
