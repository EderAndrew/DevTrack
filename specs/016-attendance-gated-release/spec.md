# Feature Specification: Lista de Chamada e Liberação do Trabalho aos Presentes

**Feature Branch**: `016-attendance-gated-release`
**Created**: 2026-10-09
**Status**: Draft
**Input**: User description: "Lista de chamada por atividade para liberar trabalhos e provas apenas
aos alunos presentes. Ao liberar um trabalho ou uma prova para a turma, o professor faz a chamada
daquela atividade, marcando os alunos que estão em sala de aula; a atividade só fica visível e
disponível para os alunos marcados como presentes, para que nenhum aluno faça o trabalho ou a prova
em casa (reduzindo as chances de cola). A chamada é da atividade, não de uma aula do calendário.
Aluno atrasado: enquanto o professor não marcar a presença dele, a atividade não aparece; quando o
professor marca, ela passa a aparecer. Saída da sala durante a atividade: o aluno informa o motivo
da saída (banheiro, pegar água, atender telefone, outro); a atividade fica fechada para ele e só o
professor a libera de novo quando ele voltar, impedindo o acesso pelo celular ou por outro
computador; ao ser liberado, o aluno retoma de onde parou, sem perder respostas. Os exercícios
continuam livres: o aluno pode praticar de qualquer lugar, a qualquer momento, sem depender da
chamada. Fora do escopo: trabalho para casa (sem chamada e menos restrito), que fica para uma
próxima feature. O prazo de trabalho continua correndo durante a pausa."

## Contexto: o que já existe e o que muda

Desde a 012, um trabalho aplicado a uma turma aparece para **todos** os alunos com matrícula
ACTIVE a partir da publicação, e cada um responde de onde estiver. A 015 acrescentou o modo
CONTROLADO e a ajuda da IA, mas manteve essa visibilidade e deixou a lista de chamada para esta
feature. Trabalhos são feitos em sala, sob supervisão do professor; esta feature faz o sistema
refletir isso.

| Ponto | Hoje (012–015) | Depois desta feature |
|-------|----------------|----------------------|
| Quem vê um Trabalho | Todos os matriculados ACTIVE, a partir da publicação | Só os alunos que o professor marcou como **presentes** na chamada daquela atividade |
| Chamada | Não existe | Por atividade: o professor marca os presentes; marcar = liberar ao aluno |
| Aluno atrasado | — | Não vê nada até o professor marcá-lo; marcado, a atividade aparece |
| Sair da sala no meio | Livre; no CONTROLADO a saída da tela é só registrada (015) | O aluno declara a saída com o motivo; a tentativa **pausa** e só o professor a libera na volta |
| Prazo | 012 | Não muda; continua correndo durante a pausa |
| Exercícios (013) | Livres | Continuam livres: sem chamada e sem pausa |
| Prova | Ainda não existe | Quando existir, segue a mesma regra de chamada e pausa (ver Assumptions) |

```text
Professor ──aplica trabalho (012/015)──▶ Atividade de Trabalho — invisível a todos
     │
     └─ Chamada da atividade: marca presentes ──▶ cada presente passa a ver e responder
                                └─ marca depois (atrasado) ──▶ passa a ver a partir daí

Aluno presente ──inicia──▶ Tentativa ABERTA ──▶ responde (autosave 012)
                               │  "Sair da sala" + motivo ──▶ PAUSADA (nenhum dispositivo acessa)
                               │       Professor "Liberar retorno" ──▶ ABERTA, de onde parou
                               └─ entrega (012)
```

**Constituição**: a pausa não é uma conclusão automática sobre o aluno (X, XI). Ela começa por
declaração do próprio aluno, ou por decisão do professor, e só termina por decisão do professor
(`HUMAN_DECISION`). Uma pausa nunca altera a nota, nunca entrega a tentativa e nunca a rotula como
fraude. A regra da 015 continua valendo: saídas da tela, copiar e colar **nunca** bloqueiam a
tentativa e **nunca** pausam.

## User Scenarios & Testing *(mandatory)*

Os perfis envolvidos são:

- o **professor** responsável pela turma;
- o **aluno**, com papel STUDENT e matrícula `ACTIVE` na turma.

MANAGER e ADMIN não têm acesso à chamada. Os testes citam os ids dos cenários no formato
`016/USn-k`.

### User Story 1 - Professor faz a chamada e libera o trabalho aos presentes (Priority: P1)

Depois de aplicar um trabalho (012), o professor abre a atividade e vê a aba "Chamada". Ela lista
os alunos com matrícula ACTIVE, nenhum marcado, com a opção "Marcar todos". O professor marca os
alunos que estão em sala e confirma com "Liberar para os presentes". Os alunos marcados passam a
ver o trabalho no portal. Os demais não veem nada: o trabalho não aparece na lista, no dashboard
nem por link direto. A aba mostra o total de presentes ("18 de 25 presentes").

**Why this priority**: este é o pedido central. Sem a chamada, o trabalho continua aberto a todos
de qualquer lugar.

**Independent Test**: aplicar um trabalho a uma turma de 3 alunos e marcar 2 deles. Conferir que
os 2 o veem e conseguem iniciar. Conferir que o terceiro recebe "não encontrado" em todas as vias
de acesso: lista, dashboard, detalhe, início e salvamento.

**Acceptance Scenarios**:

1. **Given** um trabalho recém-aplicado e publicado, **When** a chamada ainda não foi feita,
   **Then** nenhum aluno o vê. Para o professor, a atividade mostra "Aguardando chamada" na lista e
   no detalhe.
2. **Given** a chamada aberta, **When** o professor marca 2 alunos e confirma, **Then** esses 2
   passam a ver o trabalho e a iniciá-lo. A atividade mostra "2 de 3 presentes", e a presença fica
   registrada com o horário do servidor.
3. **Given** um aluno não marcado, **When** ele abre a lista ou o dashboard, ou tenta abrir,
   iniciar ou salvar o trabalho por link direto, **Then** o trabalho não aparece e cada acesso
   direto responde "não encontrado", como uma atividade de outra turma.
4. **Given** um trabalho agendado (publicação futura), **When** o professor marca presentes antes
   da publicação, **Then** a presença fica registrada, mas o aluno só vê o trabalho quando a data
   de publicação chega. A visibilidade exige as duas coisas: publicação e presença.
5. **Given** uma turma de 40 alunos, **When** o professor usa "Marcar todos", desmarca 3 e
   confirma, **Then** os 37 marcados recebem o trabalho de uma vez.
6. **Given** uma atividade de Exercícios (013), **When** é publicada, **Then** não há chamada e
   todos os matriculados a veem e praticam de qualquer lugar, exatamente como hoje.
7. **Given** um professor de outra turma, um aluno ou um MANAGER, **When** tenta ver ou alterar a
   chamada, **Then** recebe "não encontrado" ou "sem permissão", conforme o caso.

---

### User Story 2 - Aluno atrasado e presença marcada por engano (Priority: P1)

Um aluno que chega depois da liberação não vê o trabalho. Quando o professor o marca na chamada, o
trabalho aparece para ele, que inicia normalmente com o prazo da turma. Se o professor marcou um
aluno por engano, pode desmarcá-lo enquanto o aluno não iniciou. Depois do início, desmarcar não é
mais possível, e o professor usa a pausa (US3/US5).

**Why this priority**: atrasos acontecem em toda aula. Sem marcar depois, o aluno atrasado
ficaria sem o trabalho.

**Independent Test**: liberar um trabalho a 2 alunos e conferir que um terceiro não o vê. Marcar o
terceiro e conferir que o trabalho aparece e que ele consegue iniciar. Desmarcar um aluno que não
iniciou e conferir que o trabalho some. Tentar desmarcar um aluno que já iniciou e conferir a
recusa.

**Acceptance Scenarios**:

1. **Given** um trabalho já liberado a outros alunos, **When** o aluno atrasado abre o portal,
   **Then** o trabalho não aparece para ele.
2. **Given** o aluno atrasado, **When** o professor marca a presença dele, **Then** o trabalho
   aparece para ele em até 10 segundos, sem que ele recarregue a página, e ele pode iniciar. O
   prazo é o mesmo da turma.
3. **Given** um aluno marcado que ainda não iniciou, **When** o professor o desmarca, **Then** o
   trabalho deixa de aparecer para ele, e o fato é registrado e auditado.
4. **Given** um aluno marcado que já iniciou, **When** o professor tenta desmarcá-lo, **Then** a
   operação é recusada (`409`) e a interface oferece "Pausar aluno" (US5).
5. **Given** dois cliques em "marcar" para o mesmo aluno, ou duas abas do professor, **When** são
   processados, **Then** há uma única presença registrada, sem duplicata nem erro.

---

### User Story 3 - Aluno sai da sala e a tentativa pausa até o professor liberar (Priority: P1)

Durante a tentativa, o aluno usa "Sair da sala" e escolhe o motivo: "Ir ao banheiro", "Beber
água", "Atender o telefone" ou "Outro", com um texto curto opcional. As respostas são salvas e a
tentativa fica **pausada**. Enquanto ela estiver pausada, nenhum dispositivo do aluno (celular,
outro computador, outra aba) mostra as questões, salva respostas, pede ajuda à IA ou entrega; a
tela diz "Atividade pausada. Ao voltar, peça ao professor para liberar o seu retorno.". Na aba
"Chamada", o professor vê o aluno como "Fora da sala — Ir ao banheiro, desde 10:42". Quando o aluno
volta, o professor clica em "Liberar retorno" e a tentativa reabre exatamente de onde parou, com
todas as respostas. O prazo continua correndo durante a pausa.

**Why this priority**: sem a pausa, o aluno que sai da sala continua respondendo pelo celular,
fora da supervisão, o que anula a chamada.

**Independent Test**: iniciar, responder 2 questões, declarar "Beber água" e conferir que um
segundo dispositivo não vê as questões e não consegue salvar. Liberar o retorno pelo professor e
conferir as 2 respostas intactas e a continuação normal.

**Acceptance Scenarios**:

1. **Given** a tentativa aberta, **When** o aluno abre "Sair da sala", **Then** vê os motivos, o
   aviso de que a atividade ficará pausada até o professor liberar e de que o prazo continua
   correndo, e confirma por ação explícita.
2. **Given** respostas ainda não enviadas ao servidor, **When** o aluno confirma a saída, **Then**
   elas são salvas antes da pausa. Ao voltar, nenhuma resposta salva foi perdida.
3. **Given** a tentativa pausada, **When** o aluno abre o trabalho em qualquer dispositivo ou aba,
   **Then** vê só o aviso de pausa: o servidor não envia enunciados, alternativas nem respostas.
   Salvar, pedir ajuda e entregar são recusados pelo servidor.
4. **Given** a tentativa pausada, **When** o professor abre a aba "Chamada", **Then** vê o aluno
   como "Fora da sala", com o motivo, o horário de saída e o tempo decorrido, e o botão "Liberar
   retorno".
5. **Given** a tentativa pausada, **When** o professor libera o retorno, **Then** em até 10
   segundos a tela do aluno oferece "Retomar". Ao retomar, o aluno volta à questão em que estava,
   com todas as respostas salvas.
6. **Given** um trabalho CONTROLADO (015), **When** o aluno declara a saída, **Then** a tela cheia
   é encerrada sem gerar evento de saída da tela. Durante a pausa nenhum evento de foco é
   registrado. Ao retomar, o aluno volta à tela cheia por ação explícita, como no início.
7. **Given** a tentativa pausada e o prazo vencido durante a pausa, **When** o professor libera o
   retorno, **Then** vale a regra de atraso da 012. Se a atividade não aceita atraso, as respostas
   salvas ficam disponíveis para o professor aceitar como entrega (012 FR-006b).
8. **Given** duas confirmações de saída seguidas ou duas abas, **When** são processadas, **Then**
   há uma única pausa aberta. Dois cliques em "Liberar retorno" encerram essa pausa uma única vez.
9. **Given** um salvamento ou uma entrega concorrendo com a declaração de saída, **When** são
   processados, **Then** a ordem é consistente: o que chega antes da pausa é aceito, e o que chega
   depois dela é recusado sem perder o que já estava salvo.
10. **Given** a pausa e o retorno, **When** registrados, **Then** nenhum dos dois altera a nota, a
    situação da entrega nem o prazo, e nenhum é chamado de fraude ou violação.

---

### User Story 4 - Professor vê presença e pausas ao corrigir (Priority: P2)

Na lista de alunos da atividade (012 FR-006), o professor vê quem esteve presente. Quem não foi
marcado aparece como "Ausente", não como "Não entregou". Ao abrir a tentativa ou a entrega de um
aluno, o professor vê o horário da presença e cada pausa: motivo, saída, retorno e duração. As
pausas aparecem como registro, sem classificação.

**Why this priority**: dá ao professor o quadro da aula, mas o trabalho já chega só aos presentes
sem esta história.

**Independent Test**: com uma atividade com 1 ausente, 1 aluno com 2 pausas e 1 aluno sem pausa,
conferir a situação de cada um na lista e as pausas na correção.

**Acceptance Scenarios**:

1. **Given** um aluno matriculado não marcado, **When** o professor abre a lista de alunos da
   atividade, **Then** o aluno aparece como "Ausente", fora da contagem de "não entregou", e não
   recebe nota automaticamente.
2. **Given** uma entrega com pausas, **When** o professor a abre, **Then** vê cada pausa com o
   motivo, o texto opcional, o horário de saída e de retorno e a duração. A lista de alunos mostra
   o número de pausas e o tempo total fora.
3. **Given** a correção, **When** o professor dá a nota, **Then** presença e pausas não alteram
   nenhum valor automaticamente.
4. **Given** o aluno, depois da entrega, **When** abre o histórico (012 FR-031), **Then** vê as
   próprias pausas com motivo e horários. Ele nunca vê a chamada da turma nem a situação de outro
   aluno.

---

### User Story 5 - Professor pausa um aluno (Priority: P3)

Um aluno saiu da sala sem declarar, ou o professor precisa interromper um aluno por outro motivo.
Na aba "Chamada", o professor usa "Pausar aluno" na tentativa aberta dele. O efeito é o mesmo da
pausa declarada, e o motivo fica registrado como "Pausado pelo professor". O retorno segue a US3.

**Why this priority**: cobre a saída sem declaração. É útil, mas a declaração pelo aluno (US3) é o
fluxo principal.

**Independent Test**: com uma tentativa aberta, pausar pelo professor e conferir que o aluno não
acessa as questões em nenhum dispositivo. Liberar o retorno e conferir a continuação.

**Acceptance Scenarios**:

1. **Given** a tentativa aberta de um aluno presente, **When** o professor usa "Pausar aluno" e
   confirma, **Then** a tentativa pausa com o motivo "Pausado pelo professor". Em até 10 segundos
   a tela do aluno mostra o aviso de pausa, e respostas ainda não enviadas são preservadas no
   navegador para envio após o retorno (012 FR-019).
2. **Given** a pausa feita pelo professor, **When** ele libera o retorno, **Then** o aluno retoma
   como na US3.
3. **Given** um aluno que não iniciou ou que já entregou, **When** o professor tenta pausá-lo,
   **Then** a operação é recusada (`409`).

---

### Edge Cases

- **Aluno marcado presente que nunca inicia**: aparece como "Não iniciou" e, vencido o prazo, como
  "Não entregou" (012). Ele não aparece como "Ausente".
- **Trabalho no celular dentro da sala**: um aluno presente com a tentativa aberta pode usar mais
  de um dispositivo, como na 012. A supervisão em sala é do professor, e a pausa fecha todos os
  dispositivos ao mesmo tempo.
- **Aluno sem conexão ao tentar sair**: a declaração precisa do servidor. A interface diz "Sem
  conexão. Avise o professor antes de sair.", e o professor pode pausá-lo (US5).
- **Pausa pendente quando o professor encerra a atividade**: vale o encerramento da 012. A pausa
  aberta termina com o encerramento, que fica registrado, e as respostas salvas ficam disponíveis
  para FR-006b.
- **Atividade cancelada**: some para todos, como na 012. Chamada e pausas ficam preservadas para
  auditoria.
- **Matrícula removida**: o aluno perde o acesso, como na 012. A presença fica no histórico.
- **Professor marca presença depois do prazo**: é permitido enquanto a atividade está ativa. O
  aluno vê a atividade com a situação e a regra de atraso da 012.
- **Muitas pausas do mesmo aluno**: não há limite de pausas. Cada uma é registrada e o professor
  vê a contagem e o tempo total. Há um limite de frequência por aluno contra abuso (definido no
  plano).
- **Texto do motivo "Outro"**: é opcional, tem até 200 caracteres, é exibido como texto e nunca
  vai para a auditoria nem para a IA.
- **Professor libera o retorno de quem não voltou**: é decisão dele. O sistema só registra o
  horário.
- **Duas abas do professor**: marcar, desmarcar, pausar e liberar são idempotentes. A aba
  "Chamada" se atualiza sozinha.
- **Relógio do navegador errado**: presença, pausa e retorno usam o horário do servidor.
- **Ajuda da IA em andamento na hora da pausa**: o pedido feito antes da pausa termina
  normalmente. A orientação fica guardada e o aluno a vê depois do retorno. Pedidos novos são
  recusados durante a pausa.
- **Prazo vencido durante a pausa sem aceitar atraso**: o professor pode aceitar as respostas
  salvas como entrega (012 FR-006b) mesmo com a pausa aberta e a atividade ativa. A aceitação
  encerra a pausa.

## Requirements *(mandatory)*

### Functional Requirements

**Chamada (professor)**

- **FR-001**: Toda atividade de Trabalho aplicada a partir desta feature DEVE começar sem nenhum
  aluno presente e, portanto, invisível a todos os alunos. Ela só se torna visível a um aluno
  quando ele é marcado presente na chamada daquela atividade. Isso altera a 012 FR-007 para
  Trabalho.
- **FR-002**: A chamada DEVE pertencer à atividade, não a uma aula do calendário (004). Cada
  atividade de Trabalho tem a sua própria chamada.
- **FR-003**: O professor da turma DEVE poder abrir a chamada da atividade, ver os alunos com
  matrícula ACTIVE, marcar e desmarcar presentes (individualmente e com "Marcar todos") e
  confirmar. Cada presença confirmada libera a atividade àquele aluno, com o horário do servidor.
- **FR-004**: O professor DEVE poder marcar presentes a qualquer momento enquanto a atividade
  estiver ativa: antes da publicação, depois dela, depois do prazo e com outros alunos já
  respondendo.
- **FR-005**: Desmarcar DEVE ser permitido só enquanto o aluno não iniciou a tentativa. Depois do
  início, a operação é recusada com `409` e a interface oferece a pausa (FR-016).
- **FR-006**: A lista e o detalhe da atividade (professor) DEVEM mostrar, por texto, "Aguardando
  chamada" quando ninguém foi marcado e "n de m presentes" depois.
- **FR-007**: A chamada DEVE existir só para Trabalho. Atividades de Exercício (013) NÃO DEVEM ter
  chamada, presença nem pausa, e continuam visíveis a todos os matriculados a partir da
  publicação, de qualquer lugar e a qualquer momento.

**Visibilidade (aluno)**

- **FR-008**: O aluno DEVE ver um Trabalho, e operar sobre ele, só se todas estas condições valerem:
  - matrícula ACTIVE na turma;
  - atividade publicada e não cancelada (012);
  - presença registrada na chamada daquela atividade.

  Faltando qualquer uma, a atividade não aparece em listas, dashboard, contadores nem histórico,
  e todo acesso direto responde `404`, auditado como acesso negado (012 FR-008). Isso vale para
  ler, iniciar, salvar, entregar, enviar eventos (015) e pedir ajuda (015).
- **FR-009**: Quando o professor marca a presença, a atividade DEVE aparecer para o aluno em até 10
  segundos, sem que ele recarregue a página. A interface pode consultar periodicamente o servidor.
- **FR-010**: O aluno NUNCA DEVE receber a chamada da turma, a presença ou a pausa de outro aluno,
  nem a informação de que uma atividade existe e ele não foi marcado.

**Pausa por saída da sala**

- **FR-011**: Com a tentativa aberta de um Trabalho, o aluno DEVE poder usar "Sair da sala" e
  escolher um motivo de uma lista fechada: "Ir ao banheiro", "Beber água", "Atender o telefone" ou
  "Outro". "Outro" aceita um texto opcional de até 200 caracteres. A confirmação é por ação
  explícita e informa que a atividade ficará pausada até o professor liberar e que o prazo
  continua correndo.
- **FR-012**: Antes de pausar, a interface DEVE enviar as respostas pendentes. O servidor registra
  a pausa com o horário do servidor, e a tentativa passa de ABERTA para PAUSADA.
- **FR-013**: Com a tentativa PAUSADA, a leitura da atividade pelo aluno DEVE omitir as questões e
  as respostas, em qualquer dispositivo ou sessão: a visão contém só o aviso de pausa, o motivo e o
  horário de saída. O servidor DEVE recusar com `409` os salvamentos, a entrega, os pedidos de ajuda
  e os eventos de foco.
- **FR-014**: Só o professor da turma DEVE poder liberar o retorno. Ao liberar, a tentativa volta a
  ABERTA. O aluno vê "Retomar" em até 10 segundos e, ao retomar, encontra todas as respostas salvas
  e volta à questão em que estava.
- **FR-015**: O prazo, a regra de atraso e o encerramento da 012 DEVEM continuar valendo durante a
  pausa. A pausa não estende o prazo nem impede o encerramento da atividade pelo professor.
- **FR-016**: O professor DEVE poder pausar a tentativa aberta de um aluno ("Pausar aluno"), com o
  motivo "Pausado pelo professor" e o mesmo efeito de FR-013. Pausar quem não iniciou ou já entregou
  é recusado com `409`.
- **FR-017**: Numa tentativa CONTROLADA (015), a pausa DEVE encerrar a tela cheia sem registrar
  saída da tela. Nenhum evento de foco é aceito durante a pausa. Ao retomar, a tela cheia volta por
  ação explícita do aluno. Saídas da tela, copiar e colar continuam **nunca** pausando nem
  bloqueando a tentativa (015 FR-013). Só a declaração do aluno ou a ação do professor pausam.
- **FR-018**: Pausa e retorno NUNCA DEVEM alterar nota, entregar a tentativa, encerrar a atividade
  nem ser chamados de fraude, violação ou cola (constituição X, XI). Não há limite de pausas. O
  professor interpreta.

**Professor e aluno depois**

- **FR-019**: Na lista de alunos da atividade (012 FR-006), quem não foi marcado DEVE aparecer como
  "Ausente", separado de "Não entregou", sem nota automática. Para cada aluno, a lista mostra o
  horário da presença, o número de pausas e o tempo total fora.
- **FR-020**: A aba "Chamada" DEVE mostrar, para cada aluno, a situação na sala: não marcado,
  presente sem iniciar, respondendo, "Fora da sala" (com motivo, horário e tempo decorrido) ou
  entregou. Ela se atualiza sozinha em até 10 segundos.
- **FR-021**: Ao abrir uma tentativa ou entrega, o professor DEVE ver as pausas com motivo, texto
  opcional, saída, retorno, duração e quem iniciou a pausa (aluno ou professor). O aluno vê as
  próprias pausas no histórico (012 FR-031).

**Visões e mensagens**

- **FR-022**: Toda visão do aluno DEVE ser montada no servidor por lista fechada de campos (012
  FR-032). A visão de uma tentativa PAUSADA não contém enunciado, alternativas nem respostas.
- **FR-023**: As telas novas DEVEM ter os estados carregando, vazio, sucesso, erro e sem conexão.
  Elas DEVEM ser responsivas, operáveis por teclado e construídas com os tokens e componentes do
  Design System (005). A situação na sala é mostrada por texto, não só por cor.

**Fora do escopo (garantias)**

- **FR-024**: Esta feature NÃO DEVE:
  - criar Prova (só deixa a regra pronta para ela) nem trabalho "para casa" sem chamada;
  - ligar a chamada a aulas do calendário;
  - criar frequência ou percentual de presença da disciplina;
  - pausar por evento de foco;
  - usar geolocalização, rede, QR code, câmera ou dispositivo para provar presença;
  - estender o prazo por pausa;
  - limitar dispositivos por aluno;
  - aplicar chamada ou pausa a Exercícios;
  - notificar por e-mail.

### Security, Permissions & Audit *(mandatory if feature has protected operations)*

- **Permissions**: os nomes são definidos no plano, e nenhuma checagem usa nome de papel.
  - Professor: uma permissão nova para registrar a chamada, liberar retornos e pausar alunos;
    `entregas.visualizar` (012) para ver presença e pausas na correção.
  - Aluno: `atividades.proprias.responder` (012) para declarar a saída.
- **Resource context**:
  - Professor: responsável pela turma da atividade, que deve ser de Trabalho.
  - Aluno: matrícula ACTIVE, presença registrada e tentativa própria.
  - Fora do contexto → `404`.
- **Audit events**:
  - presença marcada;
  - presença desmarcada;
  - saída declarada pelo aluno;
  - pausa pelo professor;
  - retorno liberado;
  - pausa encerrada pelo encerramento, pelo cancelamento da atividade ou pela aceitação do
    professor (registrada no evento de encerramento, de cancelamento ou de aceitação);
  - acesso negado por falta de presença;
  - toda escrita recusada por tentativa pausada (salvar, entregar, eventos e ajuda).

  Os metadados levam só ids, enums (motivo), horários e durações, nunca o texto de "Outro".
- **Untrusted input**: o cliente nunca define presença, horários, situação da pausa nem quem a
  iniciou. Esses campos, se enviados, são recusados. O motivo vem de lista fechada. O texto de
  "Outro" é limitado e exibido só como texto.
- **States & transitions**:
  - Presença do aluno na atividade: ausente ⇄ presente. Voltar a ausente só é permitido sem
    tentativa.
  - Tentativa (012): ABERTA → PAUSADA → ABERTA, e ABERTA → ENTREGUE. Não existe entrega a partir de
    PAUSADA.
  - Pausa: aberta → encerrada (retorno liberado ou atividade encerrada). Depois de encerrada, ela é
    imutável.
  - Transição inválida → `409 INVALID_STATE_TRANSITION`. O tempo fora é derivado, nunca gravado.
- **Idempotency**:
  - Uma presença por aluno e atividade, garantida pelo banco de dados.
  - No máximo uma pausa aberta por tentativa, garantida pelo banco de dados.
  - Marcar, desmarcar, declarar saída, pausar e liberar são seguros sob cliques repetidos, abas e
    reenvios.
  - Salvamento, entrega e pausa da mesma tentativa são serializados.
- **Evidence vs. decisions**:
  - FACT: presença, saída declarada, horários e durações.
  - RULE_RESULT: visibilidade e recusa durante a pausa.
  - HUMAN_DECISION: marcar presença, pausar pelo professor, liberar o retorno e a nota.
- **Automation risk level**: N/A. Não há IA nesta feature.
- **Domain configurability**: nada depende de disciplina, linguagem ou tecnologia. Os motivos de
  saída são uma lista da plataforma.
- **Sensitive data & adaptations**: presença e pausas são dados acadêmicos do aluno. Só o próprio
  aluno (as dele) e o professor da turma os veem. O texto de "Outro" pode conter dado pessoal: o
  aluno é orientado a não detalhar, e o texto não vai para auditoria, logs nem IA.
- **Curricular traceability**: N/A. A atividade continua ligada aos tópicos do trabalho (012).

### Key Entities *(include if feature involves data)*

- **Presença na atividade**: aluno, atividade de Trabalho, horário em que foi marcada e quem
  marcou. Existe enquanto o aluno está presente. Desmarcar antes do início remove a presença e
  deixa o fato na auditoria.
- **Pausa da tentativa**: tentativa, quem iniciou (aluno ou professor), motivo, texto opcional,
  horário de saída e horário e autor do encerramento (retorno liberado ou atividade encerrada). A
  duração é derivada.
- **Tentativa (012)**: ganha a situação PAUSADA, derivada da existência de uma pausa aberta.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Em 100% dos testes de acesso, um aluno não marcado presente não recebe nenhum dado do
  Trabalho, nem título nem existência, em lista, dashboard, detalhe, início, salvamento, entrega,
  eventos ou ajuda.
- **SC-002**: Um aluno marcado presente, inclusive atrasado, vê a atividade em até 10 segundos após
  a marcação, sem recarregar a página.
- **SC-003**: Com a tentativa pausada, 0 enunciados ou respostas são entregues e 0 salvamentos,
  entregas ou ajudas são aceitos em qualquer dispositivo do aluno. Após o retorno, 100% das
  respostas salvas antes da pausa estão intactas.
- **SC-004**: O professor vê a saída declarada na aba "Chamada" em até 10 segundos e libera o
  retorno com uma ação.
- **SC-005**: O professor faz a chamada de uma turma de 40 alunos e libera o trabalho em menos de 1
  minuto.
- **SC-006**: Atividades de Exercício seguem 100% visíveis a todos os matriculados, sem chamada nem
  pausa (testes da 013 inalterados).
- **SC-007**: Sob 10 operações simultâneas (marcar, declarar saída, liberar, salvar, entregar) sobre
  o mesmo aluno, o estado final é consistente: uma presença, no máximo uma pausa aberta e nenhuma
  entrega a partir de PAUSADA.
- **SC-008**: 0 notas alteradas, entregas automáticas ou rótulos de fraude por presença ou pausa.
- **SC-009**: 100% das marcações, desmarcações, pausas e retornos geram exatamente um evento de
  auditoria, sem o texto de "Outro" nos metadados.
- **SC-010**: O professor faz a chamada e libera um retorno, e o aluno declara a saída e retoma, só
  com o teclado, em celular e desktop.

## Assumptions

- **Marcar é liberar**: o professor aplica o trabalho como hoje (012/015). A chamada é o passo que
  libera o trabalho a cada aluno, sem um botão separado de "liberar a atividade". Quem é marcado
  depois recebe a atividade nesse momento.
- **Trabalhos já aplicados antes desta feature**: continuam visíveis a todos os matriculados, como
  na 012, para não esconder trabalhos em andamento. Toda aplicação nova de Trabalho exige chamada.
- **Prova**: ainda não existe. A spec de Prova deve adotar a mesma chamada e a mesma pausa. Esta
  feature as define sobre Trabalho e não impede estendê-las a outro tipo de atividade presencial.
- **Trabalho para casa**: fica para uma próxima feature, como opção do professor ao aplicar, sem
  chamada e com menos restrições. Até lá, todo Trabalho novo é presencial.
- **Atualização sem tempo real**: sem WebSockets, conforme a regra do projeto. A aba "Chamada", o
  portal do aluno e a tela de pausa consultam o servidor periodicamente; 10 segundos é o tempo
  máximo de atraso aceito.
- **Presença não é frequência**: a chamada serve para liberar a atividade. Ela não gera frequência
  da disciplina, falta nem relatório de presença. Isso poderia ser uma feature futura ligada ao
  calendário (004).
- **Sem prova técnica de presença**: a presença é a palavra do professor (HUMAN_DECISION). O
  sistema não verifica localização, rede nem dispositivo.
- **Limites**: a frequência máxima de declarações de saída por aluno, o intervalo de atualização e
  o tamanho do texto de "Outro" (200 caracteres) são definidos no plano, no padrão das features
  anteriores.
