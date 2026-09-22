# Research: 003 — Turmas, Convites e Matrículas de Alunos

Decisões técnicas da feature (D1–D16). Base: fases 001 (R1–R23) e 002 (S1–S19), e a
constituição v3.0.0. Nenhuma dependência npm nova.

## D1. Nomes no código e no banco

- **Decision**: modelos Prisma `SchoolClass` (`classes`), `ClassInvitation`
  (`class_invitations`), `ClassInvitationDelivery` (`class_invitation_deliveries`) e
  `Enrollment` (`enrollments`); o "cadastro de aluno" é o `StudentProfile` existente
  com as colunas novas `ra` e `status`. Contratos: `ClassView`, `ClassDetail`,
  `CreateClassRequest`, `UpdateClassRequest`, `ClassStatusSchema`,
  `ClassInvitationView`, `EnrollmentView`, etc. (S3: `XxxSchema` + `Xxx`). Rotas em
  inglês (`/classes`, `/class-invitations`), permissões em português (`turmas.*`),
  como na Fase 001 (`/teacher-invitations` × `professores.*`).
- **Rationale**: `class` é palavra reservada em JS/TS; `SchoolClass` evita acessores
  e variáveis ambíguos (`prisma.class`, `const class`). Os contratos podem usar
  `Class…` porque são sempre prefixos compostos.
- **Alternatives considered**: `Class` (palavra reservada, lint e leitura ruins);
  `Course` (é disciplina, não turma — o roteiro prevê disciplinas/ofertas depois);
  uma entidade `Student` nova (duplicaria o `StudentProfile` 0..1 da constituição
  XXV para a mesma pessoa).

## D2. Aluno = `StudentProfile` estendido

- **Decision**: `student_profiles` ganha `ra` (texto, anulável, só preenchido no
  primeiro aceite; único sem diferenciar maiúsculas por índice parcial
  `UNIQUE (upper(ra)) WHERE ra IS NOT NULL`) e `status` (`ACTIVE`|`INACTIVE`, padrão
  `ACTIVE`). A matrícula referencia `student_profiles.user_id`. O RA é gravado já
  normalizado (`trim`, maiúsculas) por `normalizeRa()` em `identity/ra.ts`.
- **Rationale**: FR-040 pede os dados acadêmicos ligados a uma conta sem duplicar
  nome/e-mail; o perfil 0..1 por papel já existe. Contas do antigo autocadastro têm
  perfil sem RA e o informam no primeiro aceite (US4-5).
- **Alternatives considered**: tabela `students` com `id` próprio (dois registros de
  aluno por pessoa); RA `NOT NULL` com migração de dados (não há RA para as contas
  existentes).

## D3. Convite de turma é entidade própria

- **Decision**: `class_invitations` separada de `invitations` (Fase 001), com
  `class_id`, `email` normalizado, `token_hash` único, `status`
  (`PENDING`|`ACCEPTED`|`EXPIRED`|`CANCELLED`), `expires_at`, `send_count`,
  `last_sent_at`, `invited_by_id`, `accepted_at`, `accepted_by_user_id`,
  `cancelled_at`, `cancelled_by_id`, `cancel_reason`. Índice parcial
  `UNIQUE (class_id, email) WHERE status = 'PENDING'`. Expiração preguiçosa como em
  R15: a leitura mostra `PENDING` vencido como `EXPIRED` (`effectiveStatus`) e o uso
  do token grava `EXPIRED`.
- **Rationale**: o convite da Fase 001 concede papel privilegiado e tem nome de exibição
  definido pelo emissor; o de turma concede matrícula, tem turma e outro ciclo
  (`CANCELLED` com motivo, entregas com novas tentativas). Misturar exigiria colunas
  anuláveis e regras condicionais por tipo.
- **Alternatives considered**: reutilizar `invitations` com `role = STUDENT` e
  `class_id` anulável (acopla dois fluxos com regras diferentes).

## D4. Aceite reutiliza `RoleGrantAcceptance`

- **Decision**: `ClassInvitationAcceptanceService` trava o convite (`SELECT … FOR
  UPDATE`), valida turma `ACTIVE` e `TEACHER` do responsável `ACTIVE`, e chama
  `RoleGrantAcceptance.accept()` estendido para `roleKey: "STUDENT"` (modos
  `CREATE_ACCOUNT`, `SIGN_IN_REQUIRED`, `CLAIM_ACCOUNT` iguais aos da Fase 001). Na
  mesma transação: garante `StudentProfile`, grava o RA se faltar, cria a matrícula
  (`INSERT … ON CONFLICT DO NOTHING` contra o índice parcial de matrícula ativa) e
  marca o convite `ACCEPTED`. `CREATE_ACCOUNT` e `CLAIM_ACCOUNT` iniciam sessão (cookie)
  depois do commit; `SIGN_IN_REQUIRED` usa a sessão existente. O autoconvite (e-mail do
  próprio professor) é permitido: o `selfInviteForbidden` de `RoleGrantAcceptance` só
  vale para papéis privilegiados.
- **Rationale**: a regra de identidade única, posse de e-mail e conta não verificada é
  a mesma (constituição XXV, emendada na 3.0.0 para cobrir convites de turma); um
  único caminho evita divergência.
- **Alternatives considered**: um segundo serviço de aceite para alunos (duplicaria
  o tratamento de conta existente/não verificada).

## D5. Envio assíncrono: tabela de entregas + worker no processo da API

- **Decision**: cada criação ou reenvio grava, na mesma transação, uma linha em
  `class_invitation_deliveries` (`PENDING`, `attempts = 0`, `next_attempt_at = now + 1 min`, prazo para a 1ª tentativa registrar o resultado).
  Depois do commit, a primeira tentativa usa o token recém-gerado (via
  `MailDispatcher.afterCommit`) e grava `SENT` ou agenda nova tentativa. Um worker
  (`ClassInvitationDeliveryWorker`, `setInterval` de `MAIL_RETRY_INTERVAL_SECONDS`,
  padrão 30, `0` desliga) pega entregas vencidas com `FOR UPDATE SKIP LOCKED`; para
  cada uma, **gera um token novo** para o convite (só se ele ainda estiver `PENDING` e
  esta for a entrega mais recente), grava o hash, faz commit e envia. Espera entre
  tentativas: 1 min, 5 min, 15 min, 1 h, 3 h, 6 h; depois da 7ª falha a entrega vira
  `FAILED`. Reenvio pelo professor marca entregas anteriores como `SUPERSEDED`.
  O professor vê a situação da última entrega (`SENDING`|`SENT`|`FAILED`) na lista.
- **Rationale**: FR-016 proíbe gravar o token bruto; gerar um token novo a cada nova
  tentativa dispensa guardá-lo e mantém um único token válido (FR-017). A tabela dá
  observabilidade e retomada após reinício (FR-019, SC-007) sem fila nova
  (constituição IX). `SKIP LOCKED` permite várias instâncias.
- **Alternatives considered**: guardar o token cifrado até o envio (segredo em repouso
  sem necessidade); BullMQ/Redis (infra nova sem spec); apenas `afterCommit` como na
  Fase 001 (perde o e-mail em falha ou reinício); usar o `MaintenanceService` horário
  (intervalo longo demais para novas tentativas).

## D6. Rate limiting de convites

- **Decision**: `RateLimitService` (contadores no banco, R8) com três chaves: reenvio
  por convite (1 por 60 s), envios por convite (5 por 24 h, contando criação e
  reenvios) e convites criados ou reenviados por professor (50 por hora). Valores em
  `RATE_LIMIT_CLASS_INVITE_*` (config Zod). Acima do limite → `429 RATE_LIMITED` com
  `Retry-After`, sem gravar nada. Preview e aceite público usam `PublicRateLimit` com
  os fluxos novos `class_invitation_preview` e `class_invitation_accept` (por origem e
  por hash do token).
- **Rationale**: reutiliza o mecanismo já auditado da Fase 001; os limites da spec
  (FR-021) viram configuração.
- **Alternatives considered**: limitar só no web (burlável); limite por e-mail
  convidado (penaliza turmas grandes sem ganho).

## D7. Autorização por turma

- **Decision**: `ClassContextPolicy` implementa `ResourceContextPolicy`
  (`findInContext(userId, classId)` com `WHERE id = $1 AND teacher_id = $2`); convites
  e matrículas são sempre buscados com `class_id` já confirmado e `id` na mesma
  consulta. Guardas globais tratam 401/403; ausência de contexto → 404 via
  `findOwnedOrNotFound`. `MANAGER` e `ADMIN` não recebem nenhuma permissão `turmas.*`.
- **Rationale**: é o contrato de R9 previsto para esta fase; nunca "carrega e compara".
- **Alternatives considered**: checar dono no controller (proibido pelo lint de
  camadas); permissão por papel (constituição II).

## D8. Unicidade e concorrência no banco

- **Decision**: índices criados em SQL na migração: `UNIQUE (teacher_id, upper(code))`
  em `classes`; `UNIQUE (class_id, email) WHERE status = 'PENDING'` em
  `class_invitations`; `UNIQUE (class_id, student_user_id) WHERE status = 'ACTIVE'` em
  `enrollments`; `UNIQUE (upper(ra)) WHERE ra IS NOT NULL` em `student_profiles`;
  `CHECK` de coerência (ex.: `removed_at` só com `REMOVED`, `cancelled_at` só com
  `CANCELLED`). Inserções usam `ON CONFLICT DO NOTHING` / `createMany skipDuplicates`
  e traduzem conflito no erro de negócio; transições usam `SELECT … FOR UPDATE` ou
  `UPDATE … WHERE status = … RETURNING`.
- **Rationale**: constituição V e XVII; SC-004.
- **Alternatives considered**: verificar antes de inserir (race condition).

## D9. Ciclo de vida e máquinas de estado

- **Decision**: `ClassStateMachine` (`ACTIVE ⇄ INACTIVE`, `ACTIVE|INACTIVE → ARCHIVED`),
  `ClassInvitationStateMachine` (`PENDING → ACCEPTED|CANCELLED|EXPIRED`) e
  `EnrollmentStateMachine` (`ACTIVE → REMOVED`), no mesmo formato de
  `invitation.state-machine.ts`, com testes unitários. Arquivar cancela os convites
  pendentes na mesma transação (`cancel_reason = 'CLASS_ARCHIVED'`). Remover matrícula
  já removida devolve a matrícula sem efeito (idempotente, sem auditoria).
- **Rationale**: constituição XVI; FR-004, FR-014, FR-044.

## D10. Paginação, pesquisa e filtros

- **Decision**: keyset como `GET /users` (`cursor` opaco, `nextCursor`), 20 itens por
  página. Turmas: ordem `created_at DESC, id DESC`; pesquisa em `search_key` (coluna
  gravada pela aplicação: nome + código em minúsculas e sem acentos, via
  `searchKey()` em `platform/text/search-key.ts`) com `LIKE %termo%`; filtros `year` e
  `status` (padrão: `ACTIVE` e `INACTIVE`). Alunos: ordem por nome
  (`lower(users.name), enrollment id`), pesquisa em nome (sem diferenciar maiúsculas)
  ou RA (prefixo), filtro de situação (padrão `ACTIVE`). Convites: ordem
  `created_at DESC`, pesquisa por parte do e-mail, filtro de situação efetiva (padrão
  `PENDING`). Termos escapados para `LIKE` (`escapeLike`, já existente).
- **Rationale**: FR-007/FR-023/FR-045 exigem filtragem no servidor; o volume esperado
  (SC-008: 100 turmas, 200 alunos) cabe em índices b-tree comuns; `search_key` evita a
  extensão `unaccent`, que não é `IMMUTABLE` e não pode ser usada em índice.
- **Alternatives considered**: `OFFSET` (páginas instáveis com inserções); extensão
  `unaccent`/`pg_trgm` (dependência de banco sem necessidade nesse volume).

## D11. Página pública do convite

- **Decision**: rota web `/convite-turma?token=…` (token na query, como `/convite` da
  Fase 001; `Referrer-Policy: no-referrer` em `next.config.js`). A página chama
  `POST /class-invitations/preview` (token no corpo) e mostra turma, professor e e-mail;
  o modo decide o formulário: `CREATE_ACCOUNT` (nome, RA, senha, confirmação),
  `CLAIM_ACCOUNT` (nome, senha, confirmação, RA se faltar), `SIGN_IN_REQUIRED` (botão
  "Entrar para aceitar" → `/entrar?next=/convite-turma?token=…`; de volta, "Aceitar"
  com RA se faltar). Tokens expirados → `400 TOKEN_EXPIRED` ("Este convite expirou.");
  demais inválidos → `400 TOKEN_INVALID` ("Este convite não é mais válido."); aceite
  repetido pela mesma conta → `200` com `alreadyEnrolled: true`.
- **Rationale**: o `mode` só é revelado a quem tem o token, que chegou no e-mail
  convidado (mesma regra de R15/FR-039); distinguir "expirou" não revela nada sobre
  contas.
- **Alternatives considered**: token no path (`/convite-turma/{token}` — aparece em
  logs de acesso e no histórico com mais facilidade); pedir a senha no convite para
  conta existente (a Fase 001 já definiu autenticação pela sessão).

## D12. Fim do autocadastro (FR-048, constituição 3.0.0)

- **Decision**: remover `SignupController`, `SignupService.signup` e o contrato
  `auth.signup` (`POST /auth/signup` passa a 404 pelo roteador); remover `/cadastro`,
  `signup-form.tsx`, `cadastro.test.tsx` e os hooks/API de cadastro do web. Manter
  verificação de e-mail, reenvio de verificação e o job `unverified-accounts` para as
  contas antigas. `webLinks` sai de `signup.service.ts` para `platform/mail/links.ts`.
  `GrantSource.SELF_SIGNUP` continua no enum (histórico) e ganha `CLASS_INVITATION`.
- **Rationale**: FR-048/FR-049; nenhum código novo pode depender do autocadastro
  (transição da constituição).
- **Alternatives considered**: manter a rota respondendo 410 (revela que existiu, sem
  ganho).

## D13. Guardas que mudam com o domínio acadêmico

- **Decision**:
  - `no-academic-domain.spec.ts` vira `domain-boundary.spec.ts`: fixa os modelos do
    `data-model.md` da 003 e passa a permitir só os termos de turma e matrícula
    (`turma`, `matricul`, `class`, `classes`, `enrollment`); os termos das fases
    seguintes (prova, nota, questão, exercício, disciplina, ementa…) continuam
    proibidos.
  - `audit-coverage.spec.ts` lê o catálogo da 001 e o da 003; a 003 lista os tipos
    novos e os aposentados (`auth.signup`), e a jornada de teste cobre todos.
  - `traceability.spec.ts` passa a checar também `specs/003-…/spec.md` com prefixo
    `003/`; os cenários de autocadastro da 001 (US1-1, US1-2, US1-6, US1-7 e a linha 1
    da tabela) ficam cobertos por um teste `001/US1-… substituído por 003/FR-048` que
    prova que o cadastro público não existe mais.
- **Rationale**: as guardas protegem o escopo de cada fase; esta fase amplia o escopo
  de propósito e precisa dizer isso no código.
- **Alternatives considered**: apagar as guardas (perde a proteção contra domínio
  prematuro das fases 004+).

## D14. Web: componentes e estado

- **Decision**: features `classes` (professor), `class-invitations` (página pública),
  `my-classes` (aluno). Server state com TanStack Query (`useInfiniteQuery` para as
  listas com cursor; chaves `["classes", filtros]`, `["classes", id]`,
  `["classes", id, "enrollments", filtros]`, `["classes", id, "invitations", filtros]`,
  `["me", "classes"]`); mutations invalidam a turma e as listas afetadas. Formulários
  com React Hook Form + schemas derivados dos contratos. Componentes shadcn novos,
  escritos a partir do registro 4.21.0 (a CLI resolve `cn` errado — ver memória de
  002): `dialog`, `alert-dialog`, `select`, `badge`, `textarea`. Redux Toolkit **não**
  é instalado: não há estado global de cliente (constituição, regra do Redux).
- **Rationale**: stack oficial; nenhum pacote npm novo (os primitivos vêm de
  `radix-ui`, já instalado).
- **Alternatives considered**: paginação numerada (exige contagem total por consulta);
  Redux para filtros (estado local de tela, não global).

## D15. Navegação

- **Decision**: menu lateral ganha "Turmas" (`turmas.visualizar`) e "Minhas turmas"
  (`turmas.proprias.listar`); `proxy.ts` passa a proteger `/turmas/*` e
  `/minhas-turmas`. Rotas web: `/turmas`, `/turmas/nova`, `/turmas/[id]`,
  `/turmas/[id]/editar`, `/minhas-turmas`, `/convite-turma`. Depois do aceite, a pessoa
  vai para `/minhas-turmas` com a mensagem "Você agora faz parte da turma.".
- **Rationale**: FR-055; mantém o padrão de grupos de rotas `(app)` e `(public)`.

## D16. Testes

- **Decision**: API — integração por história (`test/integration/003-us1-classes.spec.ts`
  …), segurança (`test/security/003-class-authorization-matrix.ts`, concorrência de
  convite/aceite/remoção, varredura de segredos na jornada 003, rate limit), unitários
  das máquinas de estado, `normalizeRa`, `searchKey` e do agendamento de novas
  tentativas; worker de entregas com mailer falho (`InMemoryMailer` com modo de falha).
  Web — Vitest + RTL + `vitest-axe` + testes de teclado (`SC-012` da 001) por tela.
  E2E — as quatro jornadas da spec (§41) em `apps/web/e2e/`, com um projeto `teacher`
  (ADMIN convida professor) do qual as jornadas de aluno dependem; as jornadas da
  001/002 que criavam aluno pelo cadastro público passam a criá-lo por convite de
  turma (`createEnrolledStudent`).
- **Rationale**: constituição VII; SC-003–SC-011.
