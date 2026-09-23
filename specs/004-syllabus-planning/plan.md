# Implementation Plan: 004 — Área do Professor: Disciplinas, Ementas, Calendário de Aulas e Tópicos

**Branch**: `004-syllabus-planning` | **Date**: 2026-09-23 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/004-syllabus-planning/spec.md`

## Summary

O professor ganha uma área privada com disciplinas. A turma da 003 passa a ser a oferta
da disciplina, com disciplina, período e datas (E2). A ementa é enviada à disciplina
(PDF, DOCX, PNG, JPG) e o original é guardado imutável numa tabela própria de arquivos
no PostgreSQL (E4). Um worker no processo da API processa o documento com a mesma técnica
da entrega de convites da 003 (E7), lendo o arquivo num `worker_thread` com prazo e
memória limitada (E8). As regras determinísticas de seções e listas (E10) produzem o
conteúdo extraído, que o professor revisa e confirma numa revisão imutável (E11);
imagens e PDFs escaneados são preenchidos à mão. O professor marca os dias de aula num
calendário, os encontros são numerados na leitura (E12), e o planejamento da turma usa
uma revisão confirmada. Nele, o professor cria, edita, junta, divide, reordena, arquiva e
restaura tópicos ligados aos itens da ementa, com cobertura e controle otimista de
concorrência (E13–E16). Não há IA: a geração de tópicos fica para a próxima fase.

## Technical Context

**Language/Version**: TypeScript 7 sobre Node.js 24 LTS (API compila com SWC; `tsc --noEmit` para tipos)
**Primary Dependencies**: NestJS 11 (+ multer do `@nestjs/platform-express`, já presente), Prisma 7 + `@prisma/adapter-pg`, `nestjs-pino`; `@repo/contracts` (Zod 4); web: Next.js 16, React 19, Tailwind CSS 4, shadcn/ui, Lucide, TanStack Query 5, React Hook Form 7. **Novas**: `pdfjs-dist`, `fflate`, `fast-xml-parser` (API) e `react-day-picker` (web, via `Calendar` do shadcn) — E9
**Storage**: PostgreSQL 17 — 10 tabelas novas (`subjects`, `stored_files`, `syllabus_documents`, `syllabus_revisions`, `syllabus_groups`, `syllabus_items`, `class_meetings`, `class_plans`, `topics`, `topic_syllabus_items`), 3 colunas em `classes`, triggers de imutabilidade, restrição única adiada, permissões por migração de dados; arquivos em `bytea` numa tabela separada
**Testing**: Vitest + `@nestjs/testing` + `supertest` contra PostgreSQL real (histórias, matriz de acesso, uploads hostis, concorrência, worker com `runOnce`, teste de ouro da extração), Vitest + RTL + `vitest-axe` + teclado no web, Playwright (2 jornadas novas), guardas de 002/003 (catálogo de endpoints, conformidade, domínio, rastreabilidade, auditoria, segredos)
**Target Platform**: servidor Linux (API em contêiner) e navegadores atuais; CI GitHub Actions
**Project Type**: monorepo web (API NestJS + web Next.js + pacote de contratos)
**Performance Goals**: envio responde em ≤ 2 s para 10 MB; processamento ≤ 1 min para 10 páginas com texto (SC-006); planejamento com 200 encontros e 300 tópicos carrega em ≤ 1 s
**Constraints**: nada do documento sai do servidor; nenhum texto pedagógico em logs ou auditoria; original imutável; leitura de arquivo fora do thread principal com prazo; sem fila, Redis, WebSocket nem armazenamento de objetos; WCAG 2.2 AA
**Scale/Scope**: 8 histórias, 55 requisitos, 28 rotas novas (+ 2 da 003 ampliadas), 7 telas novas, 4 dependências novas

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- [x] **I. Security**: entradas validadas por schemas estritos; arquivos validados por assinatura, tipo, extensão, tamanho, integridade, macros, descompactação e dimensões (E6); nome nunca vira caminho (E4, E6); download como anexo com CSP `sandbox` (E18); leitura isolada com prazo (E8); CSRF: multipart só em rotas marcadas, com `Origin` permitido (E5); IDOR: tudo buscado pelo dono (E3) ✅
- [x] **II. RBAC**: cada rota com sua permissão (`disciplinas.*`, `ementas.*`, `calendario.gerenciar`, `planejamento.*`) e o contexto em [contracts/http-api.md](./contracts/http-api.md) e [contracts/permissions.md](./contracts/permissions.md) ✅
- [x] **III. Server authority**: situação do processamento, confirmação, encontros e planejamento decididos no servidor; datas de calendário sem relógio do navegador ✅
- [x] **IV. Untrusted code**: N/A — nenhum código de aluno; documentos são lidos como dados, nunca executados (pdfjs sem `eval`)
- [x] **V. Data integrity**: migração Prisma; FKs `Restrict` (inclusive tópico → encontro, SC-008), `UNIQUE` (versão, SHA-256, data do encontro, rascunho único), `CHECK`s, triggers de imutabilidade ([data-model.md](./data-model.md)) ✅
- [x] **VI. Audit & logs**: 17 tipos novos na mesma transação, sem conteúdo pedagógico ([contracts/audit-events.md](./contracts/audit-events.md)); recusas, falhas e conflitos em log estruturado sem nome de arquivo nem texto ✅
- [x] **VII. Tests**: integração por história, matriz, amostras hostis (SC-003), imutabilidade (SC-004), extração de ouro (SC-005), concorrência (SC-009), auditoria e segredos (SC-010), E2E (SC-011), axe e teclado (SC-012) ✅
- [x] **VIII. Layering**: controllers finos → services → Prisma; extração em módulo puro testável sem HTTP; `FileStorage` como interface; nenhuma regra em componentes React ✅
- [x] **IX. Simplicity**: sem infraestrutura nova (arquivo no PostgreSQL, worker no processo); 4 dependências justificadas em E9 e `DEPENDENCIES.md`; sem tabela de workspace (E3), sem biblioteca de arrastar ✅
- [x] **X. Evidence**: N/A — nenhuma evidência de aluno
- [x] **XI. Human oversight**: conteúdo extraído é SUGESTÃO; só o professor confirma conteúdo e planejamento (HUMAN_DECISION) ✅
- [x] **XII. Determinism first**: extração por regras determinísticas com teste de ouro (E10); IA fora desta feature ✅
- [x] **XIII. Risk level**: extração L2 (sugestão revisada); nenhuma L3 automática ✅
- [x] **XIV–XV. AI governance**: N/A nesta feature; documentos tratados como dados (XIV: tipo e tamanho validados)
- [x] **XVI. Explicit states**: documento, revisão, encontro, planejamento e tópico com enums e máquinas de estado; `409 INVALID_STATE_TRANSITION` ✅
- [x] **XVII. Idempotency**: mesmo arquivo não cria versão; datas únicas; confirmações e transições repetidas sem efeito; reserva `SKIP LOCKED`; revisão do planejamento contra gravações concorrentes ✅
- [x] **XVIII. Safe interruption**: prazo com `terminate()`, lease para retomar após reinício, tentativas limitadas, kill switch por configuração, estado final sempre conhecido (E7, E8) ✅
- [x] **XIX. AI evals**: N/A — sem IA
- [x] **XX. Pedagogy**: N/A — sem monitoramento
- [x] **XXI. Configurable domain**: disciplinas, ementas, itens e tópicos são dados do professor; regras de extração genéricas (seções e listas), sem área fixa ✅
- [x] **XXII. Personalization & accessibility**: WCAG 2.2 AA, calendário e reordenação operáveis por teclado; nenhuma necessidade individual tratada ✅
- [x] **XXIII. Curricular traceability**: ementa importada para a disciplina, versionada e revisada como proposta L2 aprovada pelo professor; plano por turma referencia a revisão usada; tópicos ligados aos itens (objetos de aprendizagem), com cobertura; uploads tratados como dados ✅
- [x] **XXIV. Academic isolation**: toda rota confere permissão **e** dono (disciplina/turma); filhos buscados dentro do pai confirmado; ligações cruzadas conferidas; fora do contexto → 404; ADMIN/MANAGER/STUDENT → 403 ✅
- [x] **XXV. Privileged provisioning**: N/A — nenhum papel ou conta alterado
- [x] **XXVI. Shared contracts**: todos os pedidos, respostas, enums e erros em `packages/contracts/src/curriculum/` + catálogo (com `upload`/`binary`); mensagens no web; a API valida com os mesmos schemas ✅
- [x] **Frontend stack**: Tailwind + shadcn/ui (Calendar, tabs por links, dialog, alert-dialog, select, checkbox) + Lucide, TanStack Query (com `refetchInterval` para a situação), React Hook Form (`useFieldArray`) + Zod, `fetch` só em `lib/api/client.ts` (com `FormData`), sem Redux; features `subjects`, `syllabus`, `class-calendar`, `class-plan` ✅

**Resultado**: sem violações. *Complexity Tracking* vazio.

**Re-check pós-design** (depois de research, data-model e contracts): mantido. Pontos
revistos:

- IX: `bytea` em tabela separada evita volume e armazenamento de objetos; as quatro
  dependências são as mínimas para ler PDF e DOCX e para o calendário oficial do shadcn.
- I/XVIII: a leitura de arquivos hostis fica fora do thread principal, com prazo e memória
  limitada; a trigger impede alterar o original.
- XXIV: a matriz de [permissions.md](./contracts/permissions.md) cobre 401/403/404,
  inclusive download e ligações cruzadas.

## Project Structure

### Documentation (this feature)

```text
specs/004-syllabus-planning/
├── plan.md                  # este arquivo
├── research.md              # E1–E22
├── data-model.md            # tabelas, índices, transições, invariantes
├── quickstart.md            # roteiro de validação
├── contracts/
│   ├── http-api.md          # rotas, schemas, erros
│   ├── permissions.md       # disciplinas.*, ementas.*, calendario.*, planejamento.* e matriz
│   ├── audit-events.md      # 17 tipos novos
│   ├── syllabus-processing.md # fluxo, worker thread, configuração, teste de ouro
│   └── web-ui.md            # rotas, componentes, mensagens, teclado
├── checklists/requirements.md
└── tasks.md                 # /speckit-tasks
```

### Source Code (repository root)

```text
packages/contracts/src/
├── curriculum/
│   ├── subjects.ts           # SubjectStatus, Create/Update/ChangeStatus, SubjectView, lista
│   ├── syllabus.ts           # MediaType, ProcessingStatus, DocumentView/Detail, UploadResult, Extraction, revisões
│   ├── class-meetings.ts     # IsoDate, ClassMeetingView/List, TopicResolution, UpdateClassMeetingsRequest
│   └── class-plan.ts         # ClassPlanStatus, Topic*, ClassPlanView/Envelope, pedidos, cobertura
├── classes/classes.ts        # + subjectId, startsOn, endsOn; ClassView ampliado; subjectId no filtro
├── common/errors.ts          # + 25 códigos
└── endpoints.ts              # + rotas; `upload: true` e `response: "binary"`

apps/api/
├── prisma/
│   ├── schema.prisma                                   # + 10 modelos, SchoolClass ampliado
│   └── migrations/<ts>_curriculum_planning/            # tabelas, CHECKs, triggers, unique adiado, permissões
├── src/modules/
│   ├── subjects/            # subjects.controller/service, subject-context.policy
│   ├── syllabus/            # syllabus-documents.controller/service, syllabus-revisions.controller/service,
│   │                        # syllabus-processing.state-machine, syllabus-processing.worker, syllabus-file-inspector,
│   │                        # extraction/ (syllabus-extractor, pdf-lines, docx-lines, section-labels, extract.worker)
│   ├── class-plans/         # class-meetings.controller/service, class-plans.controller/service,
│   │                        # topics.service, topic.state-machine, class-plan.state-machine, plan-revision.guard (E13), coverage
│   ├── classes/             # + campos de oferta, CLASS_SUBJECT_LOCKED, MEETINGS_OUTSIDE_PERIOD
│   └── audit/audit-event-types.ts   # + tipos 004
├── src/platform/
│   ├── storage/             # file-storage.ts (interface), postgres-file-storage.ts
│   ├── http/origin.guard.ts # + @AcceptsMultipart()
│   ├── http/upload.ts       # FileInterceptor configurado, mapeamento de erros do multer
│   └── config/config.schema.ts  # + SYLLABUS_*, RATE_LIMIT_SYLLABUS_*
└── test/
    ├── fixtures/syllabus/   # poo.pdf, poo.docx, ementa.png, escaneado.pdf, hostis; build-fixtures.ts; README.md
    ├── integration/004-us*.spec.ts
    ├── unit: extração (ouro), inspetor, máquinas de estado, remapeamento de itens
    ├── security/004-*.spec.ts, 004-curriculum-authorization-matrix.ts, domain-boundary, traceability, audit-coverage, secret-leak-scan
    └── helpers/journey.ts, factories.ts   # + disciplina, documento, revisão, encontros, planejamento, tópico

apps/web/
├── app/(app)/disciplinas/{page,nova/page,[id]/page,[id]/ementa/[documentId]/page}.tsx
├── app/(app)/turmas/[id]/{ementa,calendario,planejamento}/page.tsx
├── features/subjects/{api,components,hooks,schemas}/
├── features/syllabus/{api,components,hooks,schemas}/
├── features/class-calendar/{api,components,hooks}/
├── features/class-plan/{api,components,hooks,schemas}/
├── features/classes/        # formulário com disciplina e datas; abas da turma
├── components/ui/{calendar,checkbox}.tsx
├── components/shared/app-sidebar.tsx   # + Minhas disciplinas
├── lib/api/client.ts                   # + body FormData
├── lib/messages/error-messages.ts      # + códigos novos
├── proxy.ts                            # + /disciplinas
└── e2e/syllabus-plan.spec.ts, syllabus-manual.spec.ts, fixtures (arquivos de apps/api/test/fixtures/syllabus)
```

**Structure Decision**: mantém o monorepo. Três módulos Nest novos (`subjects`,
`syllabus`, `class-plans`) e uma porta de armazenamento em `platform/storage`; um
diretório de contratos (`curriculum/`); quatro features web. A turma continua no módulo
`classes`, ampliada.

## Impacto em artefatos existentes

- **Spec 003**: turma ganha campos opcionais; nenhum comportamento da 003 muda (testes da
  003 continuam válidos). `ClassView` ganha campos — os testes de contrato da 003 são
  atualizados.
- **Guardas**: `domain-boundary.spec.ts` (modelos e termos), `traceability.spec.ts`
  (`SPECS` + 004), `audit-coverage.spec.ts` (catálogo 004), `secret-leak-scan.spec.ts`
  (frase marcadora do documento), `endpoint-catalog.spec.ts` (entradas `upload` e
  `binary`), `authorization-matrix.ts` (rotas 004).
- **OriginGuard**: exceção explícita para rotas multipart (E5), com teste que prova que as
  demais rotas continuam exigindo JSON.
- **`DEPENDENCIES.md`**: quatro dependências novas, auditoria refeita.
- **Docs**: `CLAUDE.md` (módulos, comandos, guardas), `README.md`, `.env.example`, na fase
  de Polish.

## Complexity Tracking

Sem violações da constituição a justificar.
