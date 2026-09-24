# Research: 004 — Área do Professor: Disciplinas, Ementas, Calendário de Aulas e Tópicos

Decisões técnicas da feature (E1–E22). Base: fases 001 (R1–R23), 002 (S1–S19) e 003
(D1–D16), e a constituição v3.0.0. Dependências novas: três na API e uma no web (E9).

## E1. Nomes no código e no banco

- **Decision**: modelos Prisma `Subject` (`subjects`), `StoredFile` (`stored_files`),
  `SyllabusDocument` (`syllabus_documents`), `SyllabusRevision` (`syllabus_revisions`),
  `SyllabusGroup` (`syllabus_groups`), `SyllabusItem` (`syllabus_items`), `ClassMeeting`
  (`class_meetings`), `ClassPlan` (`class_plans`), `Topic` (`topics`) e
  `TopicSyllabusItem` (`topic_syllabus_items`); `SchoolClass` ganha colunas (E2). Na
  interface: disciplina, ementa, revisão, encontro/aula, planejamento, tópico. Rotas em
  inglês (`/subjects`, `/syllabus-documents`, `/classes/:id/plan`), permissões em
  português (`disciplinas.*`, `ementas.*`, `calendario.*`, `planejamento.*`), como nas
  fases anteriores. Contratos em `packages/contracts/src/curriculum/`.
- **Rationale**: "ementa" = *syllabus*; "conteúdo revisado" é uma *revisão* do conteúdo
  extraído; "planejamento" da turma = `ClassPlan` (um por turma). `CurriculumDocument` e
  `CoursePlanning` da descrição viram `SyllabusDocument` e `ClassPlan` para casar com
  `SchoolClass` (D1 da 003).
- **Alternatives considered**: `Course`/`CourseOffering` (duplicaria a turma, E2);
  `Lesson` para encontro (a constituição usa "aulas" para o registro do que foi
  trabalhado, que é outra coisa — presença e realização ficam para depois).

## E2. Turma = oferta da disciplina

- **Decision**: `classes` ganha `subject_id` (FK → `subjects`, `Restrict`, anulável),
  `starts_on` e `ends_on` (`date`, anuláveis, `CHECK (ends_on >= starts_on)` e ambos
  nulos ou ambos preenchidos). O período letivo é o `period` que já existe (texto até 60,
  ex.: "2026.1"). `CreateClassRequest`/`UpdateClassRequest` aceitam os três campos novos
  como opcionais; ementa, calendário e planejamento exigem disciplina e datas
  (`422 CLASS_NOT_PLANNABLE`). Trocar a disciplina é recusado com ementa selecionada ou
  tópicos não arquivados (`409 CLASS_SUBJECT_LOCKED`). Mudança de disciplina, período ou
  datas grava `class.offering_updated`.
- **Rationale**: a constituição (XXIII) define turma como a oferta da disciplina num
  período. Colunas anuláveis preservam as turmas existentes e os fluxos e E2E da 003.
- **Alternatives considered**: entidade `CourseOffering` 1:1 com a turma (dois registros
  para o mesmo conceito); disciplina obrigatória na criação (quebra a 003 e exige
  migração de dados sem disciplina a escolher).

## E3. Área do professor = posse pelo `teacher_id`

- **Decision**: não há tabela de *workspace*. `subjects.teacher_id` e `classes.teacher_id`
  são a fronteira; documentos, revisões e itens pertencem à disciplina; encontros,
  planejamento e tópicos pertencem à turma. `SubjectContextPolicy.find(teacherId, id)`
  (novo) e `ClassContextPolicy` (003) buscam sempre com o dono da sessão; os recursos
  filhos são buscados **dentro** do pai já confirmado (`WHERE subject_id = $confirmado`).
  Toda ligação cruzada (turma × disciplina, tópico × item, tópico × encontro) é conferida
  contra o mesmo pai → 404 se não bater.
- **Rationale**: o isolamento já é por dono (003 D7); uma tabela de workspace 1:1 com o
  professor não acrescenta regra nenhuma hoje (constituição IX). Se houver coprofessores,
  a spec deles introduz a entidade.
- **Alternatives considered**: `teacher_workspaces` com `workspace_id` em todas as tabelas
  (indireção sem uso); RLS do PostgreSQL (muda o modelo de acesso do projeto inteiro).

## E4. Armazenamento do arquivo original: tabela própria no PostgreSQL

- **Decision**: interface `FileStorage` (`put(bytes, mediaType) → key`, `get(key)`), com
  o adaptador `PostgresFileStorage`, que grava os bytes em `stored_files` (`bytea`,
  `sha256`, `size_bytes`), tabela separada de `syllabus_documents`. A chave é o UUID
  gerado pelo servidor. O documento e o arquivo são gravados **na mesma transação**; a
  leitura confere o SHA-256 antes de devolver. Uma trigger impede `UPDATE` em
  `stored_files` (imutabilidade, FR-010).
- **Rationale**: a descrição pede "não armazenar binário na tabela principal"; uma
  tabela só de arquivos, lida apenas no download, cumpre isso sem infraestrutura nova
  (constituição IX): transação única (sem arquivo órfão nem registro sem arquivo), backup
  junto com os dados, funciona com várias instâncias da API. Com os limites (10 MB, 20
  envios por hora por professor) o volume é pequeno. A interface permite trocar por
  armazenamento de objetos numa spec futura sem mudar os serviços.
- **Alternatives considered**: diretório em volume do contêiner (arquivo órfão quando a
  transação falha, backup separado, não serve para várias instâncias); S3/MinIO
  (infraestrutura nova sem necessidade atual).

## E5. Envio multipart

- **Decision**: `POST /subjects/:id/syllabus-documents` com
  `multipart/form-data` (a turma envia pela disciplina dela, com `?turma=` no web para, depois
  da confirmação, oferecer usar a versão na turma — FR-006), campo único `file`. `FileInterceptor` do Nest (multer, que já vem
  com `@nestjs/platform-express` e tem override de segurança em `pnpm-workspace.yaml`) com
  `memoryStorage` e `limits: {fileSize: 10 MB, files: 1, fields: 0, parts: 1}`; excesso →
  `413 FILE_TOO_LARGE`. O `OriginGuard` passa a aceitar `multipart/form-data` **somente**
  em rotas marcadas com `@AcceptsMultipart()`; a exigência de `Origin` permitido continua
  (R6) e o cookie `SameSite=Lax` não viaja em POST de outro site. O catálogo de endpoints
  ganha `upload: true` nessas entradas (sem `body` Zod; a resposta continua validada).
  Web: `apiRequest` aceita `body: FormData` (sem `Content-Type` manual). A rewrite do
  Next repassa o corpo sem limite próprio (a `proxy.ts` não casa `/api/*`); um teste E2E
  envia um arquivo de 10 MB para confirmar.
- **Rationale**: único meio padrão de enviar arquivo do navegador; nenhuma dependência nova.
- **Alternatives considered**: base64 em JSON (+33% de tamanho e limite do body parser);
  URL pré-assinada (exige armazenamento de objetos).

## E6. Validação do arquivo no envio

- **Decision**: `SyllabusFileInspector` decide o tipo pelo conteúdo (assinatura), nunca
  pelo nome ou pelo `Content-Type` do cliente, e exige que os três concordem:

  | Tipo | Assinatura | Extensões | Verificações |
  |------|-----------|-----------|--------------|
  | PDF | `%PDF-` | `.pdf` | abre com pdfjs; criptografado → `FILE_PROTECTED`; ≤ 50 páginas; falha de leitura → `FILE_UNREADABLE` |
  | DOCX | ZIP `PK\x03\x04` + `[Content_Types].xml` com `wordprocessingml.document.main+xml` + `word/document.xml` | `.docx` | ≤ 1.000 entradas; soma descompactada ≤ 50 MB (diretório central **e** contagem durante a descompressão); `vbaProject.bin` ou tipo `macroEnabled` → `FILE_MACROS`; contêiner OLE (`D0 CF 11 E0`, DOCX criptografado) → `FILE_PROTECTED` |
  | PNG | `89 50 4E 47 0D 0A 1A 0A` | `.png` | IHDR válido; largura × altura ≤ 40 MP; `IEND` presente |
  | JPEG | `FF D8 FF` | `.jpg`, `.jpeg` | marcador SOF com dimensões ≤ 40 MP; `FF D9` no fim |

  Qualquer divergência → `400 FILE_TYPE_NOT_ALLOWED`. Nome original: `path.basename`
  sobre `/` e `\`, remoção de controles e bidi, NFC, corte em 255 caracteres; vazio →
  `ementa.<ext>`. A inspeção roda no mesmo worker thread da extração (E8), com prazo de
  10 s.
- **Rationale**: cobre MIME spoofing, zip bomb, macros, arquivos protegidos e
  corrompidos (US2-2, US2-3, SC-003) antes de gravar qualquer coisa.
- **Alternatives considered**: `file-type` (dependência para quatro assinaturas triviais);
  antivírus (fora do escopo, registrado nas Assumptions da spec).

## E7. Processamento assíncrono: colunas no documento + worker no processo da API

- **Decision**: o próprio `syllabus_documents` é a fila: `processing_status`
  (`UPLOADED|PROCESSING|PROCESSED|FAILED`), `attempts`, `next_attempt_at`,
  `lease_expires_at`, `failure_category` (`UNREADABLE|TIMEOUT|INTERNAL`),
  `extraction_result` (`TEXT|NO_TEXT`), `extraction` (`jsonb`), `extractor_version`,
  `processed_at`. `SyllabusProcessingWorker` (`setInterval` de
  `SYLLABUS_PROCESSING_INTERVAL_SECONDS`, padrão 10; `0` desliga = *kill switch*, FR-015)
  reserva com `UPDATE … SET status='PROCESSING', attempts = attempts + 1,
  lease_expires_at = now() + 3 min WHERE id IN (SELECT id … WHERE (status='UPLOADED' AND
  next_attempt_at <= now()) OR (status='PROCESSING' AND lease_expires_at < now()) ORDER BY
  next_attempt_at LIMIT 2 FOR UPDATE SKIP LOCKED) RETURNING id` e processa fora da
  transação. Depois do commit do envio, o serviço chama `worker.kick()` para começar sem esperar o intervalo. Com o intervalo igual a `0`, `kick()` não faz nada: o processamento só roda por `runOnce` chamado à mão (testes). Falha transitória (tempo esgotado, erro interno) volta a `UPLOADED`
  com espera de 1 min e depois 5 min; na 3ª tentativa → `FAILED`. Falha de leitura
  (`UNREADABLE`) → `FAILED` direto. "Tentar novamente" (`FAILED → UPLOADED`, zera
  `attempts`) tem limite por professor. Testes chamam `runOnce(now)`.
- **Rationale**: mesmo padrão da entrega de convites (003 D5): sem fila nem
  infraestrutura nova, retomada após reinício pelo `lease_expires_at` (edge case "servidor
  reiniciado"), um único executor por documento (`SKIP LOCKED`, SC-009).
- **Alternatives considered**: tabela de *jobs* genérica (abstração sem segundo uso);
  BullMQ/Redis (infra nova, proibida sem necessidade, constituição IX).

## E8. Isolamento da leitura: `worker_threads` com prazo e memória limitada

- **Decision**: inspeção (E6) e extração (E10) rodam em `node:worker_threads`
  (`syllabus-extract.worker.js`, compilado com a API), um por tarefa, com
  `resourceLimits: {maxOldGenerationSizeMb: 256, maxYoungGenerationSizeMb: 32}` e prazo
  (10 s na inspeção, 120 s na extração) cumprido por `worker.terminate()`. O worker recebe
  só os bytes e devolve JSON; não tem acesso a Prisma, config nem rede. pdfjs roda com
  `isEvalSupported: false`, `disableFontFace: true`, `useSystemFonts: false` e sem
  `standardFontDataUrl`.
- **Rationale**: leitores de PDF e DOCX consomem CPU e memória de forma imprevisível com
  arquivos hostis; no thread principal travariam todas as requisições. O prazo e o
  `terminate` realizam a interrupção segura da constituição XVIII (estado final conhecido: `TIMEOUT`). O caminho do arquivo do worker vem da configuração interna do runner, com padrão `dist/modules/syllabus/extraction/extract.worker.js`; nos testes, o `global-setup` do Vitest compila `extract.worker.ts` e suas importações com `@swc/core` (já presente) para `apps/api/test/.tmp/extraction/`, e o `createTestApp` aponta o runner para lá.
- **Alternatives considered**: thread principal (bloqueia a API); processo filho
  (`child_process`) com o mesmo efeito e mais custo; contêiner separado (infra nova).

## E9. Dependências novas

- **Decision**:

  | Pacote | Onde | Licença | Para quê | Alternativa descartada |
  |--------|------|---------|----------|------------------------|
  | `pdfjs-dist` (legacy build) | api | Apache-2.0 | texto com posição, páginas, detecção de criptografia | `pdf-parse` (sem manutenção, sem posição do texto); `unpdf` (embrulha o próprio pdfjs) |
  | `fflate` | api | MIT | descompactar DOCX com limite de tamanho por entrada | `jszip` (sem controle de descompressão progressiva); `mammoth` (desempacota sem nossos limites e traz jszip + xmldom) |
  | `fast-xml-parser` | api | MIT | ler `word/document.xml` e `numbering.xml` com `processEntities: false` e sem DTD | analisador manual de XML (frágil); `@xmldom/xmldom` (DOM completo desnecessário) |
  | `react-day-picker` | web | MIT | base do componente `Calendar` do shadcn/ui, modo seleção múltipla com teclado | calendário próprio (reescrever navegação por teclado e ARIA de grade) |

  Fixadas por versão exata; auditoria e justificativa em `DEPENDENCIES.md`; `pnpm audit
  --prod` sem achados altos. pdfjs ≥ 4.2.67 (corrige CVE-2024-4367).
- **Rationale**: ler PDF e DOCX sem biblioteca seria reimplementar formatos complexos; o
  calendário é componente oficial do shadcn/ui (stack da constituição).
- **Alternatives considered**: OCR (`tesseract.js`) — fora do escopo pela clarificação
  (FR-020).

## E10. Regras determinísticas de extração

- **Decision**: `SyllabusExtractor` (versão 1) transforma o documento em linhas e depois
  em estrutura:
  1. **Linhas**: PDF — itens de texto de cada página agrupados por coordenada vertical
     (tolerância de 2 pt) e ordenados pela horizontal; DOCX — parágrafos de
     `word/document.xml`, com `w:numPr/w:ilvl` como nível de lista e `w:pStyle` de título
     como cabeçalho; os números da lista vêm de `numbering.xml`.
  2. **Seções**: linha que casa, sem acento e sem diferenciar maiúsculas, com um rótulo
     conhecido: ementa (`ementa`, `syllabus`, `description`, `descrição`), competência
     (`competência(s)`, `competency`, `competencies`), objetos de aprendizagem (`objetos de
     aprendizagem`, `objetivos de aprendizagem`, `conteúdo programático`, `conteúdos`,
     `learning objects`, `learning objectives`, `contents`). A lista de rótulos fica em
     `syllabus-section-labels.ts` (dado de configuração genérico, não conteúdo de área).
  3. **Grupos e itens**: dentro de "objetos de aprendizagem", marcador de primeiro nível
     (`1.`, `1)`, `I.`, `A.`, título em negrito/estilo) abre grupo; marcadores de segundo
     nível (`-`, `•`, `▪`, `◦`, `*`, `–`, `a)`, `1.1`) viram itens do grupo; linha sem
     marcador que continua a anterior é juntada a ela. Sem seção de objetos, todas as
     listas do documento viram grupos/itens; lista sem grupo cai em um grupo sem título.
  4. **Título**: a primeira linha não vazia antes da primeira seção.
  5. **Sem texto**: menos de 20 caracteres não brancos no documento (PDF escaneado) →
     `NO_TEXT`; imagens sempre `NO_TEXT` (sem OCR, FR-020).
  O resultado segue `SyllabusExtractionSchema` com `extractorVersion: 1`; o mesmo arquivo
  e a mesma versão produzem o mesmo JSON (teste de ouro com a ementa de POO em PDF e
  DOCX, SC-005).
- **Rationale**: regras genéricas de estrutura (seções e listas) não dependem de área
  (constituição XXI) nem de IA (XII); a revisão humana corrige o resto (FR-021).
- **Alternatives considered**: heurística por tamanho de fonte (instável entre PDFs);
  IA (próxima fase, pela clarificação).

## E11. Conteúdo extraído, revisões e confirmação

- **Decision**: o resultado bruto fica em `syllabus_documents.extraction` (nunca
  alterado depois de gravado). A revisão é `syllabus_revisions` (`DRAFT|CONFIRMED`,
  `source` `EXTRACTION|MANUAL|REVISION`, `based_on_revision_id`) com `title`,
  `syllabus_text`, `competency_text` e as tabelas `syllabus_groups`/`syllabus_items`
  (posição, texto, `origin_item_id` para itens copiados de outra revisão). Uma revisão
  rascunho por documento (índice parcial). Salvar o rascunho substitui grupos e itens
  inteiros (`PUT`), porque ninguém referencia itens de rascunho. Confirmar exige ≥ 1 item e
  grava `confirmed_at`/`confirmed_by`; triggers impedem `UPDATE`/`DELETE` em revisões
  confirmadas e nos seus grupos e itens. Corrigir depois: `POST …/revisions` com
  `basedOn` = revisão confirmada copia a estrutura para um novo rascunho (itens com
  `origin_item_id`).
- **Rationale**: FR-017 (extraído preservado), FR-021 (revisão separada), FR-023
  (confirmado imutável), FR-024 (itens com identificação estável). A cadeia
  `origin_item_id` permite reaproveitar tópicos na troca de versão (E16).
- **Alternatives considered**: revisão como JSON único (itens sem id estável para ligar
  tópicos); editar o extraído no lugar (perde o original do processamento).

## E12. Encontros: data única, número derivado

- **Decision**: `class_meetings (id, class_id, meeting_date date, status, …)` com
  `UNIQUE (class_id, meeting_date)`. O número do encontro é calculado na leitura
  (`row_number() OVER (PARTITION BY class_id ORDER BY meeting_date)`), não guardado. O
  calendário é salvo por `PUT /classes/:id/meetings` com `{planRevision, add: date[],
  remove: date[], resolutions: TopicResolution[]}` numa transação; remover encontro com
  tópicos sem resolução → `409 MEETING_HAS_TOPICS` (erro padrão, sem lista; a tela identifica os tópicos pelo planejamento). `topics.meeting_id` é FK
  `ON DELETE RESTRICT`: o banco impede tópico ligado a encontro inexistente (SC-008). A
  mudança de datas da turma aplica a mesma regra aos encontros que ficariam fora do
  período. Datas são `date` sem fuso.
- **Rationale**: número derivado nunca fica inconsistente e dispensa renumerar linhas
  (FR-027); `position` da descrição vira campo calculado da resposta.
- **Alternatives considered**: `position` gravado (reescrita de N linhas a cada data
  acrescentada, risco de buracos).

## E13. Planejamento e concorrência otimista

- **Decision**: `class_plans` (um por turma, `UNIQUE (class_id)`), criado ao selecionar a
  primeira ementa, com `syllabus_revision_id`, `status`
  (`DRAFT|READY|ACTIVE|ARCHIVED`) e `revision int`. Toda operação que altera o
  planejamento (tópicos, ordem, encontros, ementa usada, situação) recebe `planRevision` e
  começa com `UPDATE class_plans SET revision = revision + 1 WHERE id = $1 AND revision =
  $2 AND status <> 'ARCHIVED' RETURNING revision`; nenhuma linha → `409
  PLAN_REVISION_CONFLICT` (ou `409 PLAN_ARCHIVED`). A resposta devolve a nova revisão.
- **Rationale**: FR-041 e SC-009 com uma única linha travada por gravação: serializa as
  escritas do planejamento sem `SELECT … FOR UPDATE` espalhado.
- **Alternatives considered**: versão por tópico (não protege reordenação nem operações
  que mexem em vários tópicos); `updatedAt` como token (resolução de relógio).

## E14. Tópicos: posição, junção e divisão

- **Decision**: `topics.position` com `UNIQUE (plan_id, position) DEFERRABLE INITIALLY
  DEFERRED`. `PUT /classes/:id/plan/topic-order` recebe a lista completa dos tópicos não
  arquivados com o encontro de cada um e regrava as posições 1..N (arquivados vão depois,
  na ordem em que estavam). Junção (`POST …/topics/merge`): o primeiro tópico escolhido
  fica com título, descrição, encontro e itens revisados; os outros vão a `ARCHIVED` com
  `merged_into_topic_id`. Divisão (`POST …/topics/:id/split`): o tópico continua como a
  primeira parte; as outras nascem com `split_from_topic_id` e a situação do original.
  Arquivar guarda `status_before_archive`; restaurar volta a ela, ou a `ACTIVE` se o
  planejamento já foi confirmado.
- **Rationale**: rastreabilidade de junção e divisão (FR-036, FR-037) sem apagar nada
  (FR-038); a restrição adiada permite regravar posições numa transação.
- **Alternatives considered**: posições fracionárias (evitam regravar, mas o limite de
  300 tópicos torna a regravação barata e o resultado legível).

## E15. Cobertura

- **Decision**: calculada na leitura: itens da revisão usada pelo planejamento com ou sem
  ligação a tópico **não arquivado** do planejamento. `GET /classes/:id/plan/coverage`
  devolve grupos → itens → `topicIds`.
- **Rationale**: no rascunho todos os tópicos são `DRAFT`; contar só `ACTIVE` mostraria
  zero cobertura enquanto o professor planeja (texto da spec ajustado).

## E16. Troca da ementa usada pelo planejamento

- **Decision**: `PUT /classes/:id/plan/syllabus` com `{planRevision, revisionId}` (a
  confirmação da troca é um diálogo no web). Os links de tópico são remapeados pela cadeia `origin_item_id` quando o
  item existe na nova revisão; os demais continuam apontando para o item antigo e voltam
  marcados `outsideRevision: true` na resposta e na tela. Grava
  `class_plan.syllabus_selected`.
- **Rationale**: FR-042 sem perder tópicos nem ligações.

## E17. Situação do processamento na tela

- **Decision**: `useSyllabusDocument` usa `refetchInterval` de 2 s enquanto a situação é
  `UPLOADED` ou `PROCESSING`, e para nas demais; a troca de situação é anunciada numa
  região `aria-live="polite"`.
- **Rationale**: FR-016 sem WebSocket nem SSE (constituição IX).

## E18. Download e visualização do original

- **Decision**: `GET /syllabus-documents/:id/file` responde com os bytes do
  `stored_files` (SHA-256 conferido), `Content-Type` = tipo validado,
  `Content-Disposition: attachment; filename*=UTF-8''…` (RFC 6266),
  `Cache-Control: private, no-store`, `Content-Security-Policy: default-src 'none';
  sandbox` e `nosniff` (global). `?view=inline` só para PNG e JPEG, usado para mostrar a
  imagem ao lado do preenchimento manual (FR-020); PDF e DOCX nunca são servidos inline —
  na revisão, o professor abre o original pelo botão "Baixar original" e vê o texto
  extraído ao lado. Checksum divergente → `500` e log de erro (nunca serve bytes
  corrompidos).
- **Rationale**: FR-012; impede que um PDF/DOCX hostil seja interpretado na origem da
  aplicação.
- **Alternatives considered**: visualizador de PDF embutido (dependência grande e
  superfície de ataque na própria origem).

## E19. Telas e rotas do web

- **Decision**: `/disciplinas` (lista), `/disciplinas/nova`, `/disciplinas/[id]` (dados,
  ofertas/turmas, versões da ementa com "Enviar ementa"), `/disciplinas/[id]/ementa/[documentId]`
  (situação, revisão e confirmação), e na turma `/turmas/[id]/ementa`,
  `/turmas/[id]/calendario`, `/turmas/[id]/planejamento` (abas de navegação ao lado de
  Alunos e Convites). Calendário: `components/ui/calendar.tsx` do shadcn (react-day-picker,
  `mode="multiple"`, um mês por vez com navegação, grade com setas e Espaço). Reordenação
  por botões "Subir"/"Descer" e seleção "Aula" (FR-053), sem arrastar. Zona de envio com
  eventos nativos de arrastar e soltar e um `<input type="file">` rotulado. Features
  `subjects`, `syllabus`, `class-calendar`, `class-plan` em `apps/web/features/`.
- **Rationale**: stack oficial; nenhuma biblioteca de arrastar e soltar (FR-053 exige
  alternativa ao arrastar, não o arrastar).

## E20. Limites e configuração

- **Decision**: novas variáveis (Zod no `config.schema.ts`, `.env.example`):
  `SYLLABUS_MAX_FILE_MB` (10), `SYLLABUS_PROCESSING_INTERVAL_SECONDS` (10; 0 desliga),
  `SYLLABUS_PROCESSING_TIMEOUT_SECONDS` (120), `RATE_LIMIT_SYLLABUS_UPLOADS_HOURLY` (20),
  `RATE_LIMIT_SYLLABUS_RETRIES_HOURLY` (10). Os demais limites da spec (50 páginas, 50 MB
  descompactados, 40 MP, 200 encontros, 300 tópicos, 500 itens) são constantes nomeadas
  em `curriculum-limits.ts`, com validação no contrato quando é entrada do cliente.
  Contagem por `RateLimitService` (001).

## E21. Auditoria: nomes no padrão do catálogo

- **Decision**: os eventos da spec (FR-047) usam o padrão `recurso.acao` do catálogo:
  `subject.created`, `subject.updated`, `class.offering_updated`, `syllabus.uploaded`,
  `syllabus.processed`, `syllabus.processing_failed`, `syllabus.revision_confirmed`,
  `class_meetings.updated`, `topic.created`, `topic.updated`, `topic.merged`,
  `topic.split`, `topic.archived`, `topic.restored`, `topics.reordered`,
  `class_plan.syllabus_selected`, `class_plan.status_changed`. `syllabus.processed` e
  `syllabus.processing_failed` têm ator `SYSTEM`. Metadados em
  [contracts/audit-events.md](./contracts/audit-events.md) (sem textos, títulos nem nomes
  de arquivo).

## E23. Aula concluída por tópico (emenda de 2026-09-24, US9)

- **Decision**: a conclusão é uma situação do tópico (`TopicStatus.COMPLETED`), não do
  encontro: numa aula com vários tópicos o professor conclui cada um. `ACTIVE ⇄ COMPLETED`
  por rotas próprias (`POST …/topics/:topicId/complete` e `…/reopen`, `planejamento.editar`,
  auditadas como `topic.completed` e `topic.reopened`). O tópico guarda `completed_on`, a data
  da aula no momento da conclusão, para que o arquivo continue mostrando "Aula concluída em
  <data>" mesmo que a aula seja removida depois. "Hoje" é a data em America/Sao_Paulo.
- **Rationale**: estado explícito em vez de indicador booleano (constituição); `ClassMeetingStatus`
  continua reservado a realizar/cancelar o encontro inteiro, com presença, nas próximas specs.
- **Alternatives considered**: `class_meetings.status = COMPLETED` (trava todos os tópicos da
  aula juntos; o professor preferiu por tópico); reabrir sem limite (recusado: arquivado depois
  de concluído é final).

## E22. Guardas, fixtures e testes

- **Decision**:
  - `domain-boundary.spec.ts`: lista de modelos 001 + 003 + 004; termos proibidos de fases
    futuras continuam (questão, prova, exercício, nota, tentativa…), mas "tópico" e
    "ementa" passam a ser permitidos.
  - `traceability.spec.ts`: `SPECS` ganha a 004 (prefixo `004/`).
  - `audit-coverage.spec.ts`: lê os catálogos 001 + 003 + 004; a jornada `journey.ts`
    ganha os passos da 004 (inclusive processamento com `runOnce`).
  - `secret-leak-scan.spec.ts`: acrescenta uma frase marcadora do documento de teste e
    exige que ela não apareça em logs nem na auditoria (SC-010).
  - Fixtures em `apps/api/test/fixtures/syllabus/`: PDF e DOCX da ementa de POO, PDF
    escaneado (só imagem), PNG, PDF criptografado, DOCX com macro, DOCX-bomba, executável
    com extensão `.pdf`, JPEG truncado — gerados por `build-fixtures.ts` (determinístico,
    com `fflate`) e versionados; os que não dá para gerar (PDF criptografado) são binários
    pequenos versionados com a origem descrita em `README.md` da pasta.
  - E2E: `syllabus-plan.spec.ts` (disciplina → turma → PDF → revisão → calendário →
    tópicos → juntar, dividir, arquivar → confirmar) e `syllabus-manual.spec.ts` (imagem →
    preenchimento manual), SC-011.
