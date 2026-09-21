<!--
Sync Impact Report
==================
Version change: 1.0.0 → 1.1.0
Motivo (MINOR): novos princípios de governança, evidência e preparação para
automação/IA. Nenhum princípio existente foi removido ou redefinido.

Princípios modificados:
  III. Servidor como Autoridade — passa a referenciar XVI (estados explícitos)

Princípios adicionados:
  X. Evidência Antes de Conclusão
  XI. Supervisão Humana em Decisões Críticas
  XII. Determinismo Antes de IA
  XIII. Classificação de Risco das Operações (L1/L2/L3)
  XIV. IA como Componente Não Autoritativo
  XV. Grounding e Fontes Identificáveis
  XVI. Estados e Workflows Explícitos
  XVII. Idempotência
  XVIII. Interrupção Segura (Kill Switch)
  XIX. Avaliação de Componentes de IA (Evals)
  XX. Princípio Pedagógico Fundamental

Seções modificadas:
  - Arquitetura e Stack Técnica — componentes futuros acoplados ao domínio por
    interfaces explícitas
  - Ordem de prioridade movida para "Propósito e Prioridades" (texto inalterado)

Seções removidas: nenhuma.

Templates:
  ✅ .specify/templates/plan-template.md  — gates X–XX no Constitution Check
  ✅ .specify/templates/spec-template.md  — evidência/decisão humana, idempotência,
                                            estados e nível de risco
  ✅ .specify/templates/tasks-template.md — testes de idempotência e transições
  ✅ .specify/templates/commands/*.md      — diretório inexistente; nada a atualizar
  ⚠ README.md — ainda é o README do starter do Turborepo; reescrever na Fase 001

Follow-ups:
  - apps/docs (starter do create-turbo) não faz parte da arquitetura definida;
    remover ou justificar na spec da Fase 001.
  - apps/api (NestJS) ainda não existe; será criado na Fase 001.
-->

# DevTrack Constitution

Plataforma educacional para turmas, exercícios e avaliações (teóricas e práticas de
programação), com professores e alunos. Este documento define regras não negociáveis
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
  por exemplo: `turmas.visualizar`, `turmas.criar`, `turmas.editar`,
  `exercicios.visualizar`, `exercicios.criar`, `exercicios.responder`,
  `avaliacoes.criar`, `avaliacoes.publicar`, `avaliacoes.responder`,
  `avaliacoes.corrigir`, `relatorios.visualizar`.
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

Roadmap de fases (ordem deliberada — o Code Runner fica isolado da fundação):

1. **Fase 001 — Fundação**: monorepo, Next.js, NestJS, PostgreSQL, Prisma,
   autenticação, usuários, roles/permissions, turmas, professor/aluno, health check,
   logs, Docker e testes.
2. **Fase 002 — Banco de Questões e Exercícios**.
3. **Fase 003 — Avaliações Teóricas**.
4. **Fase 004 — Avaliações Práticas + Code Runner**.

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

**Version**: 1.1.0 | **Ratified**: 2026-09-21 | **Last Amended**: 2026-09-21

Histórico:

- **1.0.0** — Constituição inicial.
- **1.1.0** — Governança, evidência e preparação para automação/IA (Princípios X–XX).
