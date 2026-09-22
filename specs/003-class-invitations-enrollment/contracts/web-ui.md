# Web UI Contract: 003 — Turmas, Convites e Matrículas

Segue `specs/002-stack-alignment/contracts/web-architecture.md`: código em
`apps/web/features/<feature>/{api,components,hooks,schemas}`, chamadas à API só em
`features/*/api` (lint), server state com TanStack Query, formulários com React Hook
Form + schemas derivados de `@repo/contracts`, componentes shadcn/ui, textos em
português, WCAG 2.2 AA (axe + teclado `SC-012`). Nenhum estado global de cliente
(sem Redux).

## Rotas

| Rota | Grupo | Acesso (UX; a API autoriza) | Tela |
|------|-------|------------------------------|------|
| `/turmas` | `(app)` | `turmas.visualizar` | Lista de turmas: pesquisa (nome/código), filtros ano e situação, "Carregar mais", "Nova turma" |
| `/turmas/nova` | `(app)` | `turmas.criar` | Formulário de turma |
| `/turmas/[id]` | `(app)` | `turmas.visualizar` | Detalhes: dados, situação, nº de alunos ativos, ações (Editar, Inativar/Reativar, Arquivar), abas "Alunos" e "Convites", botão "Convidar aluno" |
| `/turmas/[id]/editar` | `(app)` | `turmas.editar` | Formulário de turma preenchido |
| `/minhas-turmas` | `(app)` | `turmas.proprias.listar` | Lista das turmas do aluno; mostra "Você agora faz parte da turma." quando vem do aceite |
| `/convite-turma?token=` | `(public)` | pública | Aceite do convite (`Referrer-Policy: no-referrer`) |
| `/cadastro` | — | — | **removida** (FR-048) |

`proxy.ts` passa a proteger `/turmas/:path*` e `/minhas-turmas` (redireciona para
`/entrar?next=…` sem cookie). Menu lateral: "Turmas" (ícone `School`, se
`turmas.visualizar`) e "Minhas turmas" (ícone `BookOpen`, se `turmas.proprias.listar`),
acima de "Meu perfil".

## Features

| Feature | Conteúdo |
|---------|----------|
| `features/classes` | API e hooks de turmas, convites e matrículas do professor; telas de lista, formulário, detalhes, abas; diálogos de convite, cancelamento, remoção e arquivamento |
| `features/class-invitations` | Preview e aceite público; formulários por modo |
| `features/my-classes` | "Minhas turmas" |

Chaves de query: `["classes", filtros]`, `["classes", id]`,
`["classes", id, "enrollments", filtros]`, `["classes", id, "invitations", filtros]`,
`["me", "classes"]`. Invalidações: criar/editar/situação → `["classes"]`; convidar,
reenviar, cancelar → `["classes", id, "invitations"]`; remover aluno →
`["classes", id]` e `["classes", id, "enrollments"]`; aceite → `["me"]`.

## Componentes shadcn novos (registro 4.21.0, sem dependência npm nova)

`dialog` (convidar aluno), `alert-dialog` (confirmar cancelamento, remoção e
arquivamento), `select` (filtros e situação), `badge` (situações), `textarea`
(descrição). Imports ajustados para `@/lib/utils`; textos de acessibilidade em
português ("Fechar").

## Formulários

| Formulário | Campos | Schema base |
|------------|--------|-------------|
| Turma | Nome*, Código*, Ano letivo*, Período, Descrição | `CreateClassRequestSchema` / `UpdateClassRequestSchema` |
| Convidar aluno | E-mail* | `InviteStudentRequestSchema` |
| Conclusão de cadastro (`CREATE_ACCOUNT`) | Nome completo*, RA*, Senha*, Confirmar senha* (e-mail só leitura) | `AcceptClassInvitationRequestSchema` + confirmação |
| Assumir conta (`CLAIM_ACCOUNT`) | Nome completo*, Senha*, Confirmar senha*, RA* (se `raRequired`) | idem |
| Aceitar com a conta (`SIGN_IN_REQUIRED`) | RA* (se `raRequired`) + botão "Aceitar convite" | idem |

Erros de campo junto ao campo e no resumo de erros (padrão da 001); a senha segue a
dica de tamanho da 001 (`PASSWORD_MIN_LENGTH`).

## Estados e mensagens

| Situação | Texto |
|----------|-------|
| Convite criado | "Convite enviado." |
| `ALREADY_ENROLLED` | "Este aluno já está matriculado nesta turma." |
| `INVITATION_ALREADY_PENDING` | "Já existe um convite pendente para este e-mail." |
| `CLASS_NOT_OPEN` | "Esta turma não aceita novos alunos." |
| `CLASS_CODE_TAKEN` | "Você já tem uma turma com este código." |
| `RA_TAKEN` | "Este RA já está em uso." |
| `RA_REQUIRED` | "Informe o RA." |
| `TOKEN_EXPIRED` | "Este convite expirou." |
| `TOKEN_INVALID` | "Este convite não é mais válido." |
| `WRONG_ACCOUNT` | "Este convite é para outra conta. Saia e entre com o e-mail convidado." |
| Aceite concluído | "Você agora faz parte da turma." |
| Aceite repetido (`alreadyEnrolled`) | "Você já faz parte desta turma." |
| Entrega falhou (`delivery = FAILED`) | selo "Envio falhou" na linha do convite, com "Reenviar" |
| Listas vazias | "Nenhuma turma encontrada.", "Nenhum aluno nesta turma.", "Nenhum convite pendente." |

Carregamento: esqueleto/indicador com `aria-busy`; erro de carregamento com "Tentar
novamente". Diálogos devolvem o foco ao botão que os abriu.
