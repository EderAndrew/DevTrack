<!--
Sync Impact Report
==================
Version change: 1.2.0 → 2.0.0
Motivo (MAJOR): redefinição incompatível de papéis e responsabilidades —
ACADEMIC_MANAGER é substituído por MANAGER, restrito ao provisionamento cadastral de
professores e sem autoridade pedagógica; disciplinas, períodos e ementas deixam de
ser institucionais e passam ao contexto do professor. Nada foi implementado ainda,
portanto não há migração de código ou dados.

Princípios modificados:
  II. Autenticação e Autorização — papéis ADMIN / MANAGER / TEACHER / STUDENT;
      cadastro público nunca aceita role como parâmetro; permissões de exemplo
      ajustadas (professores.convidar, professores.reenviar_convite; removido
      periodos.gerenciar)
  XXI. Domínio Educacional Configurável — professor cria disciplinas/ofertas,
       períodos da oferta, ementa, turmas, aulas e atividades; removida a gestão
       institucional de disciplinas e períodos
  XXIII. Referência Curricular — ementa recebida pelo professor e importada para a
         disciplina dele (não mais referência institucional compartilhada)
  XXIV. Isolamento por Contexto Acadêmico — MANAGER no lugar de ACADEMIC_MANAGER;
        distinção 403 (sem capacidade) × 404 (fora do contexto)
  XXV. Provisionamento de Usuários e Privilégios → Provisionamento Controlado de
       Professores e Privilégios, reorganizado em Provisionamento, Escopo do
       MANAGER, Identidade única e Desativação: MANAGER sem acesso a alunos e dados
       pedagógicos (negado no backend com 403); User único com múltiplos papéis
       via UserRole (nunca users.role); convite para e-mail existente reutiliza a
       identidade com e-mail verificado e autenticação, sem redefinir credencial;
       aceite transacional e idempotente; desativação preserva o histórico e não
       deixa recursos sem responsável; bootstrap do primeiro ADMIN apenas por
       comando operacional (sem endpoint público, senha padrão ou seed)

Princípios adicionados: nenhum.
Princípios removidos: nenhum.

Seções modificadas:
  - Fluxo de Desenvolvimento e Roadmap de Fases — Fases 001 e 002 ajustadas aos
    novos papéis (sem períodos letivos e disciplinas institucionais)

Templates:
  ✅ .specify/templates/plan-template.md  — gate XXV atualizado
  ✅ .specify/templates/spec-template.md  — sem mudança necessária
  ✅ .specify/templates/tasks-template.md — sem mudança necessária
  ✅ .specify/templates/commands/*.md      — diretório inexistente; nada a atualizar
  ⚠ README.md — ainda é o README do starter do Turborepo; reescrever na Fase 001

Follow-ups (decisões para specs 001/002):
  - Detalhes do comando de bootstrap e do fluxo de prova de posse de e-mail
    (spec 001); fluxo autenticado para novos ADMINs.
  - Política para turmas/provas em andamento quando um professor é desativado
    (transferência, congelamento, somente leitura; afastamento × desligamento ×
    suspensão) — spec do ciclo de vida de professores e turmas.
  - apps/docs (starter do create-turbo) não faz parte da arquitetura definida;
    remover ou justificar na spec da Fase 001.
  - apps/api (NestJS) ainda não existe; será criado na Fase 001.
-->

# DevTrack Constitution

Plataforma de ensino e avaliação configurável por professor — disciplinas, turmas,
conteúdos, exercícios e avaliações (teóricas e práticas), para qualquer área. Este documento define regras não negociáveis
que toda spec, plano, tarefa e implementação DEVE respeitar.

## Propósito e Prioridades

O propósito do sistema é produzir evidências confiáveis sobre o processo de
aprendizagem do aluno — não apenas impedir o uso indevido de ferramentas externas
(ver Princípio XX). Monitoramento existe para aumentar a confiabilidade da avaliação,
não para substituir o julgamento pedagógico.

**Ordem de prioridade** em qualquer trade-off: Segurança → Correção → Clareza →
Testabilidade → Manutenibilidade → Performance. Performance nunca justifica código
inseguro ou arquitetura desnecessariamente complexa.

## Core Principles

### I. Segurança por Padrão

- Toda implementação DEVE considerar segurança desde o início e seguir o OWASP Top 10
  vigente — incluindo Broken Access Control, Security Misconfiguration, Injection,
  Cryptographic Failures, Authentication Failures, Software Supply Chain Failures,
  Insecure Design, Software or Data Integrity Failures, Security Logging and Alerting
  Failures e Mishandling of Exceptional Conditions.
- Toda entrada externa é não confiável. Inputs DEVEM ser validados, normalizados
  quando necessário, sanitizados quando aplicável e rejeitados quando inválidos.
- O backend é responsável pela validação definitiva. Validação no frontend é apenas UX.

**Rationale**: a plataforma lida com notas e avaliações; uma falha de segurança
compromete diretamente a integridade acadêmica.

### II. Autenticação e Autorização (RBAC)

- Autenticação e autorização são responsabilidades distintas.
- Toda operação protegida DEVE validar identidade, autorização e o contexto do recurso
  solicitado (ex.: o professor é responsável por *esta* turma).
- O controle de acesso DEVE usar RBAC com permissões explícitas verificadas no backend,
  por exemplo: `usuarios.gerenciar`, `professores.criar`, `professores.ativar`,
  `professores.visualizar`, `professores.convidar`, `professores.reenviar_convite`,
  `professores.desativar`, `disciplinas.criar`,
  `disciplinas.editar`, `turmas.buscar`, `turmas.visualizar`, `turmas.criar`,
  `turmas.gerenciar`, `matriculas.solicitar`, `matriculas.aprovar`, `notas.lancar`,
  `notas.proprias.visualizar`, `conteudos.criar`, `conteudos.editar`,
  `questoes.criar`, `questoes.editar`, `questoes.compartilhar`,
  `exercicios.visualizar`, `exercicios.criar`, `exercicios.responder`,
  `avaliacoes.criar`, `avaliacoes.publicar`, `avaliacoes.responder`,
  `avaliacoes.corrigir`, `relatorios.visualizar`, `ia.exercicios.gerar`,
  `ia.avaliacoes.gerar`, `ia.adaptacoes.gerar`.
- O sistema é multi-professor: cada professor DEVE enxergar e alterar somente os
  recursos a que tem acesso (disciplinas, turmas, conteúdos, questões, alunos).
  Compartilhamento entre professores DEVE ser explícito e autorizado.
- **RBAC define o que** o usuário pode fazer; **o vínculo acadêmico define onde**
  (Princípio XXIV). Autorização DEVE combinar os dois.
- Uma única identidade (`User`: autenticação, status, roles) serve a todos os perfis
  e PODE acumular papéis; dados específicos ficam em perfis (ex.: `TeacherProfile`,
  `StudentProfile`). Não criar mecanismos de autenticação separados por tipo de
  usuário (ver XXV — Identidade única).
- Papéis de domínio, cada um um conjunto de permissões explícitas:
  - `ADMIN` — administra a plataforma e provisiona `MANAGER`s;
  - `MANAGER` — garante **quem pode ser professor** (provisionamento cadastral);
  - `TEACHER` — administra todo o seu processo pedagógico;
  - `STUDENT` — autocadastro e participação nas turmas em que foi admitido.
  Nomes exibidos na interface PODEM ser personalizados (ex.: "Gestor de Cadastros").
  No início, `ADMIN` PODE acumular as funções de `MANAGER`. Necessidades futuras
  (coordenação, secretaria, gestão acadêmica) DEVEM gerar papéis novos, nunca
  ampliar indevidamente um papel existente.
- Papéis elevados NUNCA DEVEM ser autoatribuídos; provisionamento segue o Princípio
  XXV.
- Flags como `isAdmin`, `isTeacher` ou `isStudent` NÃO DEVEM ser o mecanismo
  definitivo de autorização.
- O frontend PODE usar permissões para controlar UX, mas esconder um botão nunca é uma
  barreira de segurança; toda operação sensível DEVE ser reautorizada pela API.

### III. Servidor como Autoridade

- O servidor é a autoridade sobre início, término, duração, submissão, permissões e
  estado de avaliações. O relógio do navegador NUNCA é fonte confiável.
- Avaliações DEVEM possuir estados controlados (ex.: `SCHEDULED`, `AVAILABLE`,
  `IN_PROGRESS`, `SUBMITTED`, `EXPIRED`, `CANCELLED`); transições inválidas DEVEM ser
  rejeitadas pelo backend (ver Princípio XVI).
- Respostas em exercícios e avaliações DEVEM ter autosave periódico, resiliente a
  atualização de página, perda temporária de internet, fechamento acidental e
  reconexão. O aluno não pode perder uma avaliação inteira por falha transitória.

### IV. Código de Aluno é Código Não Confiável

- Código submetido por alunos NUNCA DEVE ser executado dentro do processo da API,
  diretamente no servidor principal, com acesso ao banco, aos secrets ou à rede interna.
- A execução DEVE ocorrer em ambiente isolado, com limites de CPU, memória, tempo,
  processos, filesystem e network.
- O Code Runner DEVE ser tratado como componente independente, com spec própria.

**Rationale**: é a superfície de ataque mais sensível do sistema; por isso fica fora
da fundação (ver Roadmap de Fases).

### V. Integridade de Dados

- PostgreSQL é o source of truth da aplicação.
- Alterações estruturais DEVEM ser feitas via migrations (Prisma); alterações manuais
  no banco DEVEM ser evitadas.
- PK, FK, UNIQUE, NOT NULL e índices DEVEM ser definidos conscientemente. A
  integridade de dados não pode depender exclusivamente da aplicação.

### VI. Auditoria e Observabilidade

- Operações críticas DEVEM gerar registros de auditoria, especialmente: início e
  finalização de avaliação, envio de respostas, perda de foco, saída do fullscreen,
  tentativas de copiar/colar, desconexões, reconexões, alterações administrativas e
  publicação/cancelamento de avaliações.
- Logs de auditoria DEVEM ser separados de logs técnicos e registrar somente o
  necessário.
- Logs técnicos DEVEM ser estruturados e, quando aplicável, incluir `requestId`,
  `userId`, `assessmentId`, `classId`, `event` e `timestamp`.
- NUNCA registrar senhas, tokens, secrets ou dados sensíveis desnecessários — nem
  para facilitar debugging.

### VII. Testes de Regras Críticas

- Regras críticas de negócio DEVEM ter testes automatizados, priorizando:
  autenticação, autorização/RBAC, avaliações, submissões, cálculo de notas, limites de
  tempo, transições de estado, correção automática e Code Runner.
- Regras de negócio DEVEM ser testáveis sem iniciar um servidor HTTP.
- Correções de bugs relevantes DEVERIAM incluir um teste que reproduza o problema.

### VIII. Clean Code e SOLID Pragmático

- Código DEVE priorizar legibilidade, simplicidade, previsibilidade, manutenção e
  testabilidade, com nomes que expressem intenção.
- Evitar funções excessivamente grandes, classes com múltiplas responsabilidades,
  números e strings mágicas, duplicação, dependências ocultas e comentários que
  explicam código confuso. Comentários explicam decisões e contexto.
- SOLID DEVE ser aplicado quando trouxer benefício real:
  - **SRP**: classes, serviços e módulos com responsabilidade clara.
  - **OCP**: novos tipos de questão (`MultipleChoiceQuestion`, `TrueFalseQuestion`,
    `ShortAnswerQuestion`, `CodeQuestion`, `CodeCompletionQuestion`,
    `OrderingQuestion`, …) DEVEM poder ser adicionados sem reescrever o sistema de
    avaliações.
  - **LSP**: implementações respeitam os contratos de suas abstrações.
  - **ISP**: interfaces pequenas e focadas.
  - **DIP**: regras de negócio não dependem diretamente de infraestrutura.

### IX. Simplicidade e Evolução Incremental

- Não implementar funcionalidades apenas porque poderão ser necessárias no futuro
  (YAGNI, KISS, DRY — sem sacrificar segurança ou clareza).
- Abstrações compartilhadas só existem quando há reutilização ou benefício
  arquitetural claro.
- Infraestrutura adicional (Redis, BullMQ, WebSocket, sandbox de execução, IA etc.)
  NÃO é obrigatória na fundação; entra somente quando uma spec aprovada exigir.

### X. Evidência Antes de Conclusão

- Decisões sobre comportamento, desempenho ou aprendizagem do aluno DEVEM se basear em
  evidências registradas pelo sistema: respostas submetidas, histórico de alterações de
  respostas, resultados de casos de teste, tentativas de execução, tempo utilizado,
  perda de foco, saída de fullscreen, tentativas de copiar/colar, desconexões e
  reconexões, e submissões anteriores quando pedagogicamente aplicável.
- Nenhum evento isolado é automaticamente prova de fraude, desconhecimento ou
  comportamento inadequado. `WINDOW_BLUR` não significa `CHEATING`.
- O sistema DEVE registrar fatos observáveis e deixar a interpretação para regras de
  negócio explícitas ou para o professor:
  `eventos → evidências → análise/regras → professor`.
- Sem evidência suficiente para uma conclusão, o sistema DEVE representar essa
  incerteza explicitamente.

### XI. Supervisão Humana em Decisões Críticas

- Decisões pedagógicas críticas NÃO DEVEM ser tomadas exclusivamente por mecanismos
  automatizados. São críticas, entre outras: nota definitiva com análise subjetiva,
  acusação de fraude, anulação de avaliação, aplicação de penalidades, bloqueio
  disciplinar e classificação definitiva de dificuldade de aprendizagem.
- Mecanismos automáticos PODEM coletar evidências, executar validações
  determinísticas, calcular resultados objetivos, identificar padrões, gerar alertas e
  produzir sugestões.
- A decisão final que envolva julgamento pedagógico, disciplinar ou subjetivo DEVE
  permanecer sob controle do professor.
- Resultados DEVEM distinguir claramente sua natureza: `FACT`, `RULE_RESULT`,
  `SUGGESTION` e `HUMAN_DECISION`.

### XII. Determinismo Antes de IA

- Quando um problema puder ser resolvido de forma confiável por regras
  determinísticas, essas regras DEVEM ser preferidas.
- IA NÃO DEVE substituir validações, constraints, cálculos, máquinas de estado,
  autorização, casos de teste, compilação, execução de código, comparação de
  resultados ou regras objetivas de correção.
- Ex.: se um programa produz a saída esperada é decidido por casos de teste no Code
  Runner (resultado objetivo); IA fica para interpretação pedagógica.
- IA DEVE ser usada principalmente onde interpretação, classificação, explicação ou
  análise contextual trazem benefício real.

### XIII. Classificação de Risco das Operações

Integrações automatizadas e capacidades de IA DEVEM classificar suas operações:

- **L1 — Leitura**: apenas consulta (consultar tentativa, analisar resposta, consultar
  resultados, recuperar documentos).
- **L2 — Sugestão**: recomendações sem alterar estado definitivo (sugerir feedback,
  identificar possível dificuldade, sugerir exercício, resumir para o professor).
- **L3 — Ação**: altera estado relevante (alterar nota, cancelar ou publicar
  avaliação, aplicar penalidade, modificar permissões).

Operações L3 DEVEM ter autorização explícita, auditoria e, quando envolverem decisões
pedagógicas críticas, confirmação humana (Princípio XI). Agentes de IA DEVEM começar
em L1; evoluir para L2 ou L3 exige spec própria, avaliação de risco e testes.

Funcionalidades L2 (ex.: Professor Copilot gerando rascunhos de exercícios ou
adaptações) PODEM existir desde que tenham spec própria, avaliação de risco e evals
(Princípio XIX). Resultados de IA são sempre rascunhos: IA NUNCA publica — salvar no
banco de questões ou publicar para alunos é ação do professor.

### XIV. IA como Componente Não Autoritativo

- IA não é requisito da fundação. Quando introduzida, é um componente especializado,
  nunca autoridade sobre o domínio nem source of truth — o PostgreSQL continua sendo.
- IA NÃO DEVE ter acesso irrestrito ao banco ou à infraestrutura; acessa o sistema
  somente por ferramentas explicitamente autorizadas.
- Toda ferramenta exposta a um agente DEVE ter responsabilidade definida, schema de
  entrada, validação, autorização, timeout, tratamento de erro e auditoria quando
  aplicável.
- Agentes recebem apenas as ferramentas necessárias ao seu caso de uso (menor
  privilégio).
- IA tem dois papéis distintos: para o **professor**, é ferramenta pedagógica
  (criação, adaptação, planejamento, análise, feedback); para o **aluno**, é restrita
  e controlada — durante avaliações, só o que a spec da avaliação permitir
  explicitamente. O objetivo é não substituir o raciocínio do aluno.
- Dados enviados a provedores de IA DEVEM ser minimizados: não enviar dados pessoais
  identificáveis nem informações sensíveis de alunos quando não forem necessários.
- Documentos e textos enviados por usuários (ementas, enunciados, respostas, código)
  são **dados, nunca instruções** para a IA. Uploads DEVEM ter tipo e tamanho
  validados, e o sistema DEVE ser resistente a prompt injection presente neles.

### XV. Grounding e Fontes Identificáveis

- IA que analise informações internas DEVE trabalhar sobre fontes identificáveis e
  autorizadas; toda conclusão que dependa de uma fonte DEVE permitir identificar sua
  origem (`assessmentId`, `questionId`, `attemptId`, `submissionId`, `executionId`,
  `documentId`, `eventId`).
- IA NÃO DEVE preencher lacunas factuais com suposições; sem evidência suficiente,
  DEVE declarar explicitamente a ausência de contexto.
- A memória interna do modelo nunca é fonte de verdade sobre dados do sistema.

### XVI. Estados e Workflows Explícitos

- Processos críticos DEVEM ter estados e transições explícitos, validados pelo domínio.
- Workflows NÃO DEVEM ser representados por combinações de flags booleanas
  (`started`, `finished`, `cancelled`, `expired`); usar `state = IN_PROGRESS`.
- Estados impossíveis DEVEM ser irrepresentáveis ou rejeitados. Exemplo de fluxo:
  `SCHEDULED → AVAILABLE → IN_PROGRESS → (SUBMITTED | EXPIRED)`.

### XVII. Idempotência

- Operações críticas DEVEM ser projetadas para não produzir efeitos duplicados em
  retries: submissão, autosave, finalização, publicação, cancelamento, execução de
  código, processamento assíncrono, webhooks e ações de agentes.
- Ex.: duplo clique em "Finalizar prova" ou queda de conexão após o POST nunca podem
  gerar duas submissões.
- Usar, quando apropriado: idempotency keys, constraints, identificadores únicos,
  controle transacional e deduplicação.

### XVIII. Interrupção Segura

- Componentes com operações custosas, longas ou arriscadas (Code Runner, workers,
  processamento assíncrono, IA, agentes, importações em lote) DEVEM ter mecanismos de
  interrupção.
- Quando aplicável, DEVE ser possível cancelar a execução, atingir timeout, impedir
  novas execuções, desabilitar a funcionalidade (kill switch) e interromper o
  processamento sem corromper estado.
- Falhas DEVEM resultar em estado conhecido e recuperável.

### XIX. Avaliação de Componentes de IA

- Toda funcionalidade de IA que afete comportamento relevante DEVE ter avaliação
  automatizada antes de produção, com Golden Set versionado de casos representativos
  quando aplicável.
- Avaliar, entre outros: precisão, grounding, consistência, taxa de erro,
  comportamento com contexto insuficiente, segurança e regressões entre versões.
- Mudanças de modelo, system prompt, ferramentas, retrieval ou workflow DEVEM poder
  ser avaliadas antes do release. Prompts relevantes são artefatos versionados.

### XX. Princípio Pedagógico Fundamental

- O sistema DEVE favorecer a capacidade do professor de compreender o que o aluno
  consegue resolver, quais conceitos domina, onde tem dificuldades, como evolui e
  quais intervenções pedagógicas podem ser necessárias.
- Entre vigilância excessiva e coleta proporcional de evidências, DEVE-se preferir a
  abordagem menos invasiva que ainda preserve a integridade da avaliação.

**Rationale**: impede que o projeto se transforme em software de vigilância de alunos;
o propósito continua sendo aprendizagem.

### XXI. Domínio Educacional Configurável

- O sistema é uma plataforma de ensino e avaliação configurável por professor, não um
  sistema para disciplinas específicas. Disciplina, linguagem, tecnologia, conteúdo,
  nível e necessidades pedagógicas são **dados do domínio**, não código.
- O **professor** é responsável pelo seu contexto pedagógico e DEVE poder criar e
  organizar: disciplinas/ofertas, período da oferta (ex.: "2026/2",
  "Setembro/2026"), ementa (importada), plano de ensino, turmas, módulos, conteúdos,
  aulas, objetivos de aprendizagem, exercícios, trabalhos e provas.
- Ofertas PODEM ser de tipos diferentes (ex.: `ACADEMIC`, `EXTENSION`, `WORKSHOP`,
  `COURSE`), atendendo tanto semestres acadêmicos quanto aulas online e cursos
  independentes.
- Disciplina não é linguagem: uma disciplina PODE usar uma, várias ou nenhuma
  linguagem/tecnologia (ex.: Paradigmas com Python; Git & Agile sem linguagem
  principal).
- Java, Python, JavaScript, HTML, Git ou qualquer tecnologia NÃO DEVEM ser enums,
  condicionais ou regras fixas no código; a arquitetura DEVE suportar áreas não
  previstas originalmente.
- Conceitos da **plataforma** — estados de workflow (XVI), tipos de questão (VIII),
  níveis de dificuldade e objetivos cognitivos — PODEM ser tipos fixos no código.
- Questões DEVEM carregar metadados pedagógicos, incluindo dois eixos independentes:
  **dificuldade** (ex.: INTRODUTÓRIO, BÁSICO, INTERMEDIÁRIO, AVANÇADO, DESAFIO) e
  **objetivo cognitivo** (ex.: RECONHECER, COMPREENDER, APLICAR, ANALISAR, CRIAR).

### XXII. Personalização Pedagógica e Acessibilidade

- O sistema DEVE permitir diferentes caminhos de aprendizagem sem presumir que todos
  os alunos têm as mesmas necessidades.
- **Dificuldade do conteúdo** e **necessidade de adaptação** DEVEM ser conceitos
  distintos no domínio. Um aluno pode precisar de enunciado simplificado e resolver
  programação intermediária; outro pode precisar de progressão conceitual menor.
- Quando pedagogicamente apropriado, o sistema DEVE permitir: níveis de dificuldade,
  exercícios progressivos, divisão em etapas (scaffolding), enunciados adaptados,
  tempo adicional, quantidade diferenciada de questões, tentativas adicionais e
  diferentes formas de apresentação.
- Necessidades específicas NÃO DEVEM reduzir automaticamente a expectativa de
  aprendizagem: adaptações buscam acessibilidade e progressão rumo ao mesmo objetivo.
- Informações sobre necessidades individuais são dados pessoais sensíveis (LGPD):
  - registrar a **adaptação pedagógica necessária**, não diagnósticos ou laudos, salvo
    exigência legal ou institucional definida em spec;
  - acesso restrito aos professores da turma e perfis explicitamente autorizados, com
    auditoria (VI);
  - NUNCA enviar essas informações de forma identificável a provedores de IA (XIV).
- IA PODE sugerir adaptações (L2); o professor controla sua utilização e publicação.

**Rationale**: evitar o modelo "PCD = exercício fácil" e garantir que adaptação seja
meio de progressão, não redução de expectativa.

### XXIII. Referência Curricular e Rastreabilidade Pedagógica

- Cada camada tem papel próprio e NÃO DEVE ser confundida com as demais:
  - **Ementa**: referência curricular (ementa, competência, objetos de aprendizagem)
    recebida pelo professor e importada para a disciplina dele. PODE ser reutilizada
    nas turmas desse professor e mudar entre semestres; DEVE ser versionada, e o
    plano DEVE referenciar a versão utilizada. Uma ementa não determina uma aula por
    tópico — a distribuição em aulas é decisão do professor.
  - **Plano de ensino**: como o professor organiza a ementa para uma **turma**
    (semanas, aulas, sequência, junção de conteúdos, linguagem/tecnologia adotada).
    A ordem da ementa não é a ordem de ensino.
  - **Aulas**: registro do que foi **efetivamente trabalhado** naquela turma.
  - **Atividades** (exercícios, trabalhos e provas) e questões DEVEM ser vinculáveis
    aos conteúdos e objetivos de aprendizagem que avaliam. Nunca reduzir esse vínculo
    a um rótulo textual (ex.: `question.subject = "Java"`).
- **Importação de ementa** (PDF, DOCX, imagem) é interpretação L2: produz uma
  proposta de estrutura em rascunho que o professor edita e aprova; nada é salvo como
  aprovado automaticamente. Itens compostos da ementa DEVEM ser propostos como
  conteúdos granulares.
- **Escopo ensinado**: geração por IA de exercícios, trabalhos e provas DEVE receber
  somente o escopo permitido — conteúdos e objetivos já trabalhados naquela turma até
  o ponto escolhido pelo professor. O escopo é calculado deterministicamente a partir
  das aulas registradas (XII), e a saída DEVE ser validada deterministicamente: toda
  questão gerada DEVE estar vinculada a um conteúdo do escopo; itens fora dele são
  rejeitados ou sinalizados.
- **Cobertura**: antes de publicar uma prova, o professor DEVE conseguir ver a
  distribuição das questões por conteúdo, objetivo e dificuldade.
- **Tipos de atividade** são conceitos pedagógicos distintos, ainda que compartilhem
  infraestrutura: `EXERCISE` (prática/fixação, múltiplas tentativas, feedback
  imediato), `ASSIGNMENT` (trabalho avaliativo com entrega, individual ou em grupo) e
  `EXAM` (prova com tempo e tentativa controlados e regras mais rígidas). Novos tipos
  (ex.: `QUIZ`, `PROJECT`, `PRACTICAL_EXAM`) só entram com spec. O professor decide o
  tipo e o peso de cada atividade.
- Artefatos gerados por IA seguem estados explícitos (XVI) — ex.:
  `DRAFT → APPROVED → PUBLISHED` — e a transição para publicado é sempre do professor.
- **Adaptações** de uma atividade são versões da mesma atividade, avaliando os mesmos
  conteúdos e objetivos, atribuídas a alunos conforme suas necessidades pedagógicas
  (XXII) — nunca uma atividade separada para uma categoria de pessoas.
- **Banco de questões × atividade**: o banco de questões pertence ao professor e é
  reutilizável entre turmas e semestres; atividades pertencem a uma turma. A questão
  do banco é um modelo — ao entrar em uma atividade, DEVE ser guardado um snapshot
  (`Question ≠ ExamQuestion`). Editar o banco NUNCA altera atividades já publicadas
  ou aplicadas.
- **Disciplina ≠ turma**: a disciplina (e sua ementa, conteúdos e materiais) é
  reutilizável; a turma é a oferta da disciplina em um período letivo, com seus
  próprios alunos, plano, atividades e notas.

**Rationale**: a ementa passa de arquivo anexado a dado estruturado que orienta o
semestre inteiro — planejamento, aulas, geração por IA, atividades, adaptações e
análise de evolução.

### XXIV. Isolamento por Contexto Acadêmico

- Turmas são **fronteiras de isolamento acadêmico**. Exercícios, trabalhos, provas,
  submissões, resultados e notas DEVEM ter contexto acadêmico explícito (turma) — uma
  prova pertence à turma, não apenas ao professor que a criou.
- Ter uma role ou permissão NÃO é suficiente para acessar recurso de uma turma. O
  backend DEVE validar também o vínculo do usuário com o contexto solicitado:
  - professores só gerenciam turmas às quais estão explicitamente vinculados;
  - alunos só acessam recursos de turmas em que possuem matrícula ativa.
- O sistema DEVE impedir acesso horizontal entre turmas, professores, alunos,
  avaliações, submissões, resultados e notas. Um aluno vê somente as próprias notas e
  respostas; um professor, somente as de suas turmas.
- Conhecer o identificador de uma turma ou recurso NUNCA é suficiente para obter
  acesso. Distinção de respostas:
  - **sem a capacidade** (o papel não possui a permissão para aquele tipo de
    recurso) → `403`;
  - **com a capacidade, mas fora do contexto** (ex.: prova de outra turma) → o
    recurso DEVERIA ser respondido como inexistente (`404`), sem revelar sua
    existência.
- **Conta ≠ matrícula**: o aluno cria a própria conta (autocadastro, quando permitido
  pela configuração da plataforma — XXV); a conta sozinha não dá acesso a nenhuma
  turma.
- O ingresso em turma DEVE ocorrer por mecanismo controlado — código de ingresso,
  convite, solicitação com aprovação do professor ou mecanismo institucional futuro.
  Códigos de ingresso são credenciais: imprevisíveis, com limite de tentativas,
  revogáveis e regeneráveis.
- A busca de turmas DEVE expor apenas o mínimo necessário para identificá-las (ex.:
  disciplina, turma, período, turno, professor), nunca alunos ou atividades.
- Matrículas DEVEM ter ciclo de vida explícito (XVI) — ex.: `PENDING`, `ACTIVE`,
  `REJECTED`, `CANCELLED` — cobrindo troca de turma, desistência e entrada tardia.
  Mudanças de matrícula DEVEM ser auditadas.
- Papéis administrativos (`ADMIN`, `MANAGER`) NÃO atravessam esse isolamento
  implicitamente: acesso a respostas, submissões e notas de turmas às quais não estão
  vinculados exige permissão explícita, escopo definido e auditoria.
- Toda autorização é aplicada no backend (II).

**Rationale**: previne Broken Access Control/IDOR, o risco nº 1 do OWASP, na
fronteira mais sensível do produto — notas e avaliações de alunos.

### XXV. Provisionamento Controlado de Professores e Privilégios

**Provisionamento**

- `TEACHER` é papel privilegiado e NUNCA pode ser obtido por autocadastro público.
  Professores DEVEM ser provisionados exclusivamente por usuário administrativo com a
  permissão correspondente (`MANAGER`, ou `ADMIN` enquanto acumular a função),
  preferencialmente por **convite** com validade limitada. `MANAGER`s são
  provisionados por `ADMIN`.
- O fluxo público de cadastro DEVE criar exclusivamente contas permitidas para
  autocadastro (`STUDENT`) e NUNCA permite atribuir `TEACHER`, `MANAGER` ou `ADMIN`.
  Roles não são parâmetro confiável do cadastro público — um payload com
  `"role": "TEACHER"` é ignorado ou rejeitado, mesmo que a interface não ofereça
  essa opção.
- O administrador autoriza a existência da conta, mas NÃO DEVE conhecer nem definir
  a credencial pessoal do professor. Convites DEVEM ser de uso único, vinculados ao
  e-mail convidado, com expiração, armazenados como hash (`tokenHash`) e revogáveis.
- Contas de professor DEVEM ter ciclo de vida explícito (XVI) — ex.: `INVITED`,
  `ACTIVE`, `SUSPENDED`, `INACTIVE`.
- Alunos PODEM ter autocadastro quando permitido pela configuração da plataforma. O
  autocadastro concede apenas `STUDENT` e nenhum acesso acadêmico — este depende de
  matrícula válida (XXIV). O e-mail DEVE ser verificado.
- Toda atribuição, remoção ou alteração de privilégio (incluindo `TEACHER`) DEVE
  exigir autorização no backend e ser auditada, registrando o responsável, data e
  hora e o papel/permissão concedido ou removido. Nenhum usuário concede a si
  próprio privilégios superiores, e o sistema NÃO DEVE permitir remover ou
  desativar o último `ADMIN` ativo.

**Bootstrap administrativo**

- NÃO PODE existir endpoint público capaz de criar ou promover alguém a `ADMIN`.
- O primeiro `ADMIN` nasce exclusivamente de um comando operacional executado no
  ambiente do backend (ex.: `pnpm admin:bootstrap`), que só funciona enquanto não
  existir `ADMIN` ativo, é transacional (duas execuções simultâneas não criam dois
  administradores), auditado e, depois de concluído, recusa novas execuções.
- PROIBIDO: senha padrão, credenciais de administrador em seed ou variáveis de
  ambiente (ex.: `ADMIN_EMAIL` + `ADMIN_PASSWORD`) e criação automática no startup.
- O bootstrap respeita a identidade única: se o e-mail já pertencer a um `User`
  verificado, acrescenta `ADMIN` a ele; uma conta não verificada NUNCA é promovida
  sem prova prévia de posse do e-mail.
- Administradores seguintes dependem de fluxo autenticado e autorizado, definido em
  spec.

**Escopo do `MANAGER`**

- `MANAGER` tem finalidade restrita ao provisionamento e à gestão cadastral de
  professores (ex.: `professores.visualizar`, `professores.criar`,
  `professores.convidar`, `professores.reenviar_convite`, `professores.ativar`,
  `professores.desativar`).
- Por padrão, `MANAGER` NÃO tem acesso a dados de alunos, matrículas, dados
  pedagógicos das turmas, ementas e planos do professor, exercícios, trabalhos,
  avaliações, submissões, correções, resultados ou notas.
- Essas restrições DEVEM ser aplicadas no backend: sem a capacidade, a API nega
  explicitamente (ex.: `GET /students` → `403`), em vez de responder vazio.

**Identidade única**

- `User` representa uma identidade única; roles representam capacidades. Uma mesma
  identidade PODE acumular múltiplos papéis explicitamente autorizados (ex.:
  `STUDENT` e `TEACHER`). O sistema NÃO DEVE criar contas duplicadas para
  representar papéis diferentes da mesma pessoa.
- Papéis DEVEM ser modelados como relação (ex.:
  `User → UserRole → Role → RolePermission → Permission`), nunca como coluna única
  (`users.role`). Perfis são opcionais por papel (`TeacherProfile` 0..1,
  `StudentProfile` 0..1).
- Se o convite for para um e-mail que já pertence a um `User`, a aceitação DEVE
  reutilizar essa identidade e adicionar `TEACHER` e `TeacherProfile`. Para impedir
  sequestro de conta e pré-registro malicioso:
  - privilégios só são vinculados a um `User` existente cujo e-mail esteja
    verificado e mediante autenticação nessa conta; o convite NUNCA redefine a
    credencial de uma conta existente;
  - se a conta existente não tiver e-mail verificado, quem aceita o convite (e,
    portanto, controla o e-mail) assume a conta com redefinição de credencial e
    revogação de todas as sessões ativas.
- A aceitação de convites DEVE ser transacional e idempotente (XVII): aceitar o
  mesmo convite duas vezes nunca cria dois `TeacherProfile` nem atribuições
  duplicadas de papel.

**Desativação**

- **Desativar, não apagar**: a desativação de um professor (ou o cancelamento de uma
  matrícula) DEVE impedir novos acessos e preservar integralmente turmas,
  avaliações, submissões, resultados, notas, auditorias e demais registros
  históricos. Recursos acadêmicos NÃO DEVEM ser excluídos nem ficar sem responsável
  válido em consequência da desativação.
- A política para turmas em andamento — transferência, congelamento, continuidade,
  acesso somente leitura, e as diferenças entre afastamento temporário,
  desligamento e suspensão por segurança — DEVE ser definida na spec responsável
  pelo ciclo de vida de professores e turmas.
- Contas com histórico acadêmico não são excluídas fisicamente; pedidos de exclusão
  de dados (LGPD) são atendidos por anonimização, preservando a integridade do
  registro acadêmico conforme a lei e a política institucional.

**Rationale**: `MANAGER` controla quem pode ser professor; o professor controla seu
ambiente pedagógico. Uma pessoa tem uma identidade e pode acumular papéis ao longo
da vida do sistema — projetar a autenticação como "aluno **ou** professor" seria um
erro caro de corrigir depois.

## Arquitetura e Stack Técnica

Monorepo com:

- `apps/api` — backend NestJS.
- `apps/web` — frontend Next.js.
- `packages/*` — bibliotecas e configurações compartilhadas, somente com necessidade
  real de reutilização.
- `specs/*` — especificações funcionais e técnicas produzidas pelo Spec Kit.

Stack obrigatória: pnpm, Turborepo, TypeScript, PostgreSQL e Prisma ORM. A arquitetura
DEVE favorecer modularidade, baixo acoplamento e alta coesão.

Componentes futuros (Code Runner, eventos/auditoria, workers, serviços de IA) DEVEM se
conectar ao domínio por interfaces explícitas (`Web → API → Domain → componentes`),
sem que a fundação precise implementá-los antecipadamente.

## Padrões por Camada

**Backend**

- Controllers apenas recebem requisições, acionam validações, delegam operações e
  retornam respostas HTTP; não contêm regras de negócio complexas.
- Regras de negócio ficam em services/use cases. Acesso ao banco é isolado da camada
  HTTP — sem chamadas Prisma em controllers.

**Frontend**

- Componentes React priorizam apresentação e interação. UI, estado, comunicação com a
  API, validação e regras de domínio DEVEM ficar separados.

**Tratamento de erros**

- Erros NÃO DEVEM expor stack traces, queries SQL, estrutura interna, secrets ou
  informações de infraestrutura.
- A API DEVE usar um formato de erro consistente:

  ```json
  {
    "statusCode": 403,
    "code": "ASSESSMENT_ACCESS_DENIED",
    "message": "Você não possui acesso a esta avaliação."
  }
  ```

**Secrets e configuração**

- Secrets NUNCA são commitados. Usar variáveis de ambiente; o repositório PODE ter
  `.env.example`, mas nunca `.env` ou `.env.production` com credenciais reais.
- Configurações obrigatórias DEVEM ser validadas no startup; a aplicação DEVE falhar
  rapidamente se estiverem ausentes.

**Dependências**

- Novas dependências só com necessidade clara, após verificar manutenção, segurança,
  licença, compatibilidade e necessidade real. Evitar dependências para
  funcionalidades triviais.

## Fluxo de Desenvolvimento e Roadmap de Fases

Toda feature relevante DEVE ter especificação antes da implementação, seguindo:

```text
SPEC → PLAN → TASKS → IMPLEMENTATION → TESTS → REVIEW
```

A implementação segue a spec aprovada. Se durante a implementação for necessário mudar
comportamento ou requisito, a spec DEVE ser atualizada primeiro.

Roadmap de fases (ordem deliberada — o domínio acadêmico e o currículo vêm antes do
banco de questões, porque toda questão precisa saber a que conteúdo e objetivo
pertence; o Code Runner fica isolado e por último entre os componentes de risco):

1. **Fase 001 — Foundation**: monorepo, Next.js, NestJS, PostgreSQL, Prisma,
   autenticação, `User` único multi-papel (`UserRole` → `Role` → `Permission`;
   `ADMIN`, `MANAGER`, `TEACHER`, `STUDENT`), provisionamento de `MANAGER` por
   `ADMIN`, convite de professor por `MANAGER` (`TeacherInvitation`), bootstrap do
   primeiro `ADMIN` por comando operacional, autocadastro de aluno com e-mail
   verificado, sessões, auditoria de privilégios, health check, logs,
   Docker e testes. A arquitetura de autorização DEVE nascer preparada para checagem
   por contexto de recurso (XXIV), para que a Fase 002 não exija refazer a fundação.
2. **Fase 002 — Academic Domain**: perfis de professor e aluno, disciplinas/ofertas
   do professor (tipo de oferta e período), turmas (turno e modalidade) e matrículas
   com ingresso controlado.
3. **Fase 003 — Syllabus & Learning Plan**: ementa (versionada), plano de ensino por
   turma, módulos, aulas, conteúdos e objetivos de aprendizagem.
4. **Fase 004 — Question Bank**: questões com níveis, tipos, tags e vínculo com
   conteúdos e objetivos; versões/adaptações.
5. **Fase 005 — AI Teacher Assistant** (L2): importação/interpretação de ementa,
   sugestão de plano de ensino e geração de exercícios, trabalhos, provas e
   adaptações — sempre como rascunho aprovado pelo professor.
6. **Fase 006 — Exercises & Assignments**.
7. **Fase 007 — Exams** (incluindo matriz de cobertura).
8. **Fase 008 — Controlled Exam Session**: sessão controlada e monitoramento.
9. **Fase 009 — Code Runner**: avaliações práticas.
10. **Fase 010 — Learning Analytics**: progressão, evidências e IA pedagógica.

## Governance

- Esta constituição prevalece sobre qualquer outra prática do projeto. Toda spec,
  plano e revisão de PR DEVE verificar conformidade com ela.
- Violações só são aceitas se justificadas na seção *Complexity Tracking* do plano,
  explicando por que a alternativa mais simples foi rejeitada.
- Emendas DEVEM ser feitas via `/speckit-constitution`, com Sync Impact Report
  atualizado e propagação para os templates em `.specify/templates/`.
- Versionamento semântico:
  - **MAJOR**: remoção ou redefinição incompatível de princípios ou governança.
  - **MINOR**: novo princípio/seção ou expansão material de orientação.
  - **PATCH**: esclarecimentos, redação e correções não semânticas.

**Version**: 2.0.0 | **Ratified**: 2026-09-21 | **Last Amended**: 2026-09-21

Histórico:

- **1.0.0** — Constituição inicial.
- **1.1.0** — Governança, evidência e preparação para automação/IA (Princípios X–XX).
- **1.2.0** — Domínio educacional configurável, personalização/acessibilidade e
  referência curricular (Princípios XXI–XXIII), isolamento por contexto acadêmico
  (XXIV), provisionamento de usuários e privilégios (XXV), multi-professor, papéis
  da IA, documentos como dados e novo roadmap (001–010).
- **2.0.0** — `ACADEMIC_MANAGER` substituído por `MANAGER`, restrito ao
  provisionamento de professores e sem autoridade pedagógica; disciplinas, períodos
  e ementas passam ao contexto do professor; identidade única com múltiplos papéis;
  403 × 404; desativação preserva o histórico; bootstrap administrativo.
