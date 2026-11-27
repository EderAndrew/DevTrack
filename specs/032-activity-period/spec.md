# Feature Specification: Período de aplicação da prova e do trabalho

**Feature Branch**: `032-activity-period`
**Created**: 2026-11-26
**Status**: Draft
**Input**: User description: "Período de aplicação da prova e do trabalho. Hoje a prova tem início (publishAt, que pode
ser agora ou agendado para outro dia) e uma janela de início de 0 a 60 min: passada a janela, o aluno que ainda não
começou recebe EXAM_START_CLOSED, mesmo que o professor marque presença depois. O trabalho tem início, prazo e política de
atraso. Trocar os dois por um período escolhido pelo professor ao aplicar: a data (hoje ou agendada, como hoje, ex.: dia
30), o horário de início e o horário de fim (ex.: dia 30, 19:10 → 22:00). Sem agendamento, o início é agora e o
professor escolhe só o horário de fim. Antes do início a atividade fica agendada e o aluno não a vê, como hoje. Durante o
período, o professor libera a atividade na chamada para quem está na sala, inclusive quem chega atrasado; depois do
horário de fim, ninguém mais é liberado nem começa. Prova: continua com duração, contada do início de cada aluno, mas
ninguém passa do horário de fim (começou 21:30 com 60 min → termina 22:00); a janela de início deixa de existir.
Trabalho: igual à prova; o prazo e a política de atraso dão lugar ao período, e no horário de fim fecha para todos.
Provas já aplicadas são convertidas na migração com fim = início + janela + duração, sem mudar a situação de quem já
começou. Exercícios não mudam."

## Contexto: o que muda

Na primeira prova com alunos (piloto de 2026-11-26), a janela de início (0–60 min a partir da publicação) mostrou o
problema: o aluno que chega depois da janela não consegue mais começar, mesmo com o professor marcando a presença dele na
chamada. O professor pensa a aula como um período ("a prova é das 19:10 às 22:00") e quer liberar quem estiver na sala a
qualquer momento desse período.

| Ponto | Hoje | Depois desta feature |
|-------|------|----------------------|
| Quando a prova começa | Na publicação (agora ou agendada) | Igual: no início do período (agora ou agendado) |
| Até quando um aluno pode começar a prova | Publicação + janela de início (0–60 min) | Até o fim do período |
| Fim do tempo de um aluno na prova | Início dele + duração (ou encerramento/cancelamento) | O primeiro entre: início dele + duração, **fim do período**, encerramento, cancelamento |
| Janela de início da prova | 0–60 min, padrão 15 | Deixa de existir |
| Trabalho | Início, prazo e política de atraso (recusar ou aceitar marcando atrasado) | Início e fim do período; depois do fim, recusa (como a política "recusar" de hoje) |
| Liberar um aluno que chega atrasado (chamada) | Prova: inútil depois da janela | Prova e trabalho: funciona durante todo o período |
| Marcar presença depois do fim | Aceito | Recusado: depois do fim ninguém é liberado |
| Exercícios | Sem prazo | **Não mudam** |

## Clarifications

### Session 2026-11-26 (decisões do usuário antes do spec)

- Q: O aluno que começa a prova tarde tem a duração inteira? → A: Não. A duração conta do início de cada aluno, mas
  ninguém passa do fim do período (começou 21:30 com 60 min, período até 22:00 → termina 22:00).
- Q: O trabalho muda também? → A: Sim, igual à prova: o prazo e a política de atraso dão lugar ao período; no fim do
  período fecha para todos.
- Q: E as provas já aplicadas? → A: São convertidas: fim = início + janela de início + duração, sem mudar a situação de
  quem já começou.
- Q: A data continua podendo ser hoje ou agendada? → A: Sim, como hoje (ex.: criar hoje uma prova para o dia 30), com
  horário de início e horário de fim.
- Q: Depois de publicada, o fim da prova pode mudar? → A: Só pode ser estendido, nunca antecipado (o tempo de quem já
  começou nunca é cortado). Enquanto agendada, muda livremente.
- Q: O que acontece na migração com os trabalhos que aceitam entrega atrasada? → A: Continuam aceitando entrega marcada
  como atrasada até o professor encerrar; fim = prazo. Trabalhos novos não têm essa opção.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Professor aplica a prova com um período e libera quem chega (Priority: P1)

Ao aplicar uma prova, o professor escolhe a data (hoje ou outro dia), o horário de início e o horário de fim, além da
duração da prova. Durante o período, marca na chamada os alunos presentes, inclusive os que chegam depois do início, e
cada aluno marcado pode começar a prova enquanto o período não termina.

**Why this priority**: É o problema do piloto: aluno presente que não conseguiu começar. Sem isso a prova presencial
continua dependendo de todos chegarem nos primeiros minutos.

**Independent Test**: Aplicar uma prova das 19:10 às 22:00 com 60 min, marcar um aluno presente às 20:30 e verificar que
ele começa e recebe 60 min; marcar outro às 22:01 e verificar a recusa.

**Acceptance Scenarios**:

1. **Given** o professor aplica uma prova para hoje das 19:10 às 22:00 com duração de 60 min, **When** salva, **Then** a
   prova fica agendada até 19:10, publicada a partir de 19:10, e o professor vê o período (19:10–22:00) na prova e no
   monitor, sem nenhuma janela de início.
2. **Given** uma prova publicada das 19:10 às 22:00 e um aluno marcado presente às 20:30, **When** o aluno começa às
   20:31, **Then** o início é aceito e o fim do tempo dele é 21:31.
3. **Given** a mesma prova, **When** o professor tenta marcar presença de um aluno às 22:01, **Then** a marcação é
   recusada com a mensagem de que o período terminou, e o aluno continua sem acesso à prova.
4. **Given** o professor aplica uma prova agendada para o dia 30 das 19:10 às 22:00, **When** um aluno da turma abre
   "Minhas atividades" no dia 29, **Then** a prova não aparece para ele (agendada, como hoje).
5. **Given** o professor aplica uma prova sem agendamento (início agora) às 19:05 com fim às 22:00, **When** salva,
   **Then** o início é a hora do servidor no momento do salvamento e o período vai até 22:00.
6. **Given** o professor informa um fim anterior ou igual ao início, ou um período mais curto que a duração da prova,
   **When** tenta salvar, **Then** a aplicação é recusada indicando o campo do horário de fim, e nada é criado.
7. **Given** uma prova publicada das 19:10 às 22:00 com 60 min e um aluno que começou às 21:30 (fim 22:00), **When** o
   professor estende o fim para 22:30, **Then** o fim do aluno passa a 22:30; **When** o professor tenta antecipar o fim
   para 21:45, **Then** é recusado e nada muda.

---

### User Story 2 - O tempo do aluno na prova termina no fim do período (Priority: P1)

O aluno que começa a prova perto do fim do período vê no relógio o tempo que realmente tem: a duração da prova ou o que
falta até o fim do período, o que for menor. No fim do período, todos os que ainda estão respondendo param ao mesmo
tempo, com a mesma tolerância de hoje para o salvamento e a entrega que já estavam a caminho.

**Why this priority**: Sem o corte, um aluno que começa às 21:59 ficaria na sala até 22:59, depois do horário da aula.
O período só é real se terminar para todos.

**Independent Test**: Aluno começa às 21:30 uma prova de 60 min com período até 22:00; o relógio mostra 30 min, e às
22:00 o salvamento e a entrega são recusados como tempo esgotado.

**Acceptance Scenarios**:

1. **Given** uma prova de 60 min com período até 22:00, **When** um aluno começa às 21:30, **Then** o relógio dele mostra
   30 min e o fim do tempo é 22:00.
2. **Given** o mesmo aluno, **When** ele salva ou entrega até 22:00 (mais a tolerância de hoje de 2 s), **Then** é
   aceito; **When** tenta depois, **Then** é recusado como tempo esgotado, e a tentativa é tratada exatamente como uma
   tentativa que esgotou a duração hoje (finalizada no próximo acesso, nunca anulada).
3. **Given** um aluno que começou às 19:15 uma prova de 60 min com período até 22:00, **When** chega 20:15, **Then** o
   tempo dele acaba pela duração, como hoje; o fim do período não muda nada para ele.
4. **Given** um aluno em espera de decisão do professor (4ª ocorrência) quando o período termina, **When** o professor
   decide depois do fim, **Then** valem as regras de hoje para decisões depois do fim do tempo ("Não cancelar" ou
   cancelar; "retornar" não é possível porque não resta tempo).
5. **Given** o professor encerra ou cancela a prova antes do fim do período, **When** isso acontece, **Then** o tempo de
   todos termina nesse momento, como hoje.

---

### User Story 3 - Trabalho com período no lugar de prazo e política de atraso (Priority: P2)

Ao aplicar um trabalho, o professor escolhe a data, o horário de início e o horário de fim, como na prova, sem duração e
sem política de atraso. Durante o período, libera na chamada quem está na sala (inclusive quem chega atrasado); no fim do
período ninguém mais começa, salva ou entrega.

**Why this priority**: Mesmo modelo nas duas atividades aplicadas em sala; mas o trabalho já recusava depois do prazo
com a política "recusar", então o ganho é menor que o da prova.

**Independent Test**: Aplicar um trabalho das 19:10 às 22:00, marcar presença às 21:00, o aluno começa e entrega às
21:50; outro aluno com resposta salva não entrega e, às 22:00, o salvamento e a entrega são recusados.

**Acceptance Scenarios**:

1. **Given** o professor aplica um trabalho, **When** abre o formulário, **Then** vê data, horário de início e horário
   de fim, e não vê mais "Prazo" nem "Política de atraso".
2. **Given** um trabalho das 19:10 às 22:00 que toma chamada, **When** o professor marca presença de um aluno às 21:00,
   **Then** o aluno passa a ver o trabalho e pode começar.
3. **Given** o mesmo trabalho, **When** chega 22:00, **Then** nenhum aluno começa, salva ou entrega; quem tinha resposta
   salva sem entregar fica sem entrega, como hoje com a política "recusar" (nunca uma entrega automática).
4. **Given** o mesmo trabalho, **When** o professor tenta marcar presença às 22:01, **Then** é recusado como na prova.
5. **Given** um trabalho em andamento, **When** o professor muda o horário de fim para mais tarde (aula estendida),
   **Then** os alunos voltam a poder salvar e entregar até o novo fim, como hoje com a mudança de prazo.
6. **Given** um trabalho em grupo (023) ou controlado (015), **When** o período termina, **Then** vale a mesma recusa
   para o grupo inteiro e os registros do modo controlado não mudam de sentido.

---

### User Story 4 - Atividades já aplicadas continuam funcionando (Priority: P3)

Provas e trabalhos aplicados antes desta feature passam a ter um período equivalente ao que já tinham, sem que ninguém
que já começou, entregou ou foi corrigido mude de situação.

**Why this priority**: Necessário para a migração, mas não muda nada para o usuário se for bem feito.

**Independent Test**: Com uma prova (publicada 19:00, janela 15 min, 60 min) e um trabalho (prazo 22:00, "recusar")
criados antes da migração, migrar e verificar o período de cada um e a situação de cada aluno antes e depois.

**Acceptance Scenarios**:

1. **Given** uma prova publicada às 19:00 com janela de 15 min e duração de 60 min, **When** a migração roda, **Then** o
   período dela é 19:00–20:15, e o fim do tempo de quem já começou continua o mesmo de antes.
2. **Given** um trabalho com prazo 22:00 e política "recusar", **When** a migração roda, **Then** o período dele vai do
   início ao 22:00, com o mesmo comportamento.
3. **Given** um trabalho com prazo 22:00 e política "aceitar marcando atrasado", **When** a migração roda, **Then** o
   período vai do início ao 22:00 e, depois disso, ele continua aceitando entrega marcada como atrasada até o professor
   encerrar, exatamente como antes; nenhuma entrega já feita perde a marca de atrasada.
4. **Given** qualquer atividade encerrada, cancelada ou de turma arquivada, **When** a migração roda, **Then** nada muda
   no que o professor e o aluno veem dela (notas, Histórico, revisão).

---

### Edge Cases

- **Início agora com fim muito próximo**: um período de poucos minutos é aceito se for pelo menos a duração da prova
  (prova) ou maior que zero (trabalho); é escolha do professor.
- **Aluno começa a 1 minuto do fim**: começa e tem 1 minuto; o sistema não exige um mínimo restante.
- **Período que atravessa a meia-noite ou dura vários dias**: permitido; o fim é uma data e hora completas (o
  formulário sugere o mesmo dia do início).
- **Fuso**: data e horário são escolhidos e mostrados no fuso do navegador do professor e do aluno, como hoje com a
  publicação e o prazo; todas as comparações usam o relógio do servidor.
- **Pausa ("Sair da sala", 016)**: não estende o período nem a duração; o tempo corre, como hoje.
- **Professor desmarca presença**: continua possível só antes de o aluno começar (016), dentro ou fora do período.
- **Alteração do período da prova depois de publicada**: só estender (FR-012). Estender depois do fim já passado não é
  possível: o fim novo e o atual precisam estar no futuro.
- **Estender a prova de um aluno em espera de decisão**: o fim dele muda; "retornar" volta a ser possível se ainda
  restar tempo, pela regra de hoje.
- **App do monitor (024/025)**: mostra o fim do período onde hoje mostra o fechamento da prova; alertas e aviso discreto
  não mudam.
- **Histórico (029)**: o fim do período não move a atividade para o Histórico; ela continua em "Minhas atividades" até o
  professor encerrar ou cancelar.
- **Atividade agendada aberta pelo aluno por endereço direto antes do início**: `404`, como hoje.

## Requirements *(mandatory)*

### Functional Requirements

**Período**

- **FR-001**: Ao aplicar uma prova ou um trabalho, o professor MUST informar o período: início (agora ou uma data e hora
  futuras, como a publicação de hoje) e fim (data e hora). Exercícios não têm período e não mudam.
- **FR-002**: O fim MUST ser posterior ao início; para uma prova, o período MUST ter pelo menos a duração da prova. Caso
  contrário a aplicação é recusada (`422 INVALID_SCHEDULE`, campo do fim) e nada é criado. Com "início agora", a
  comparação usa a hora do servidor no momento do salvamento.
- **FR-003**: O formulário MUST apresentar o período como data, horário de início e horário de fim, com o fim no mesmo
  dia do início por padrão e a possibilidade de escolher outra data de fim.
- **FR-004**: Antes do início, a atividade MUST continuar agendada e invisível ao aluno, exatamente como hoje.

**Prova**

- **FR-005**: A janela de início MUST deixar de existir: o corpo da aplicação de prova não a aceita (`400`) e nenhuma
  tela a mostra.
- **FR-006**: Um aluno marcado presente MUST poder começar a prova do início até o fim do período, inclusive; depois
  disso o início é recusado (`409 EXAM_START_CLOSED`, como hoje).
- **FR-007**: O fim do tempo de um aluno MUST ser o primeiro entre: o início dele + a duração, o fim do período, o
  encerramento e o cancelamento da prova. O relógio do aluno, o monitor do professor, a revisão e o app mostram esse fim.
  Tolerância de salvamento/entrega, tempo esgotado, finalização no próximo acesso, espera de decisão e decisões seguem
  as regras de hoje (018) com esse fim. Terminar pela duração ou pelo fim do período é "tempo esgotado"
  (`TIME_EXPIRED`); só o encerramento ou o cancelamento são `ACTIVITY_CLOSED`, como hoje.
- **FR-008**: O professor MUST ver o período da prova na lista, no detalhe e no monitor no lugar da janela de início e
  do "fecha às" de hoje.

**Trabalho**

- **FR-009**: O trabalho MUST ter início e fim de período no lugar do prazo e da política de atraso; o corpo da
  aplicação não aceita mais a política de atraso (`400`).
- **FR-010**: Depois do fim do período, um trabalho MUST recusar início, salvamento, entrega, pedido de ajuda e execução
  de código como hoje a política "recusar" depois do prazo; nunca há entrega automática nem marca de atrasada em um
  trabalho novo.
- **FR-011**: As situações do aluno e da lista do professor MUST seguir as de hoje para um trabalho com prazo vencido e
  política "recusar" (o aluno sem entrega aparece como atrasado/não entregue, sem nova situação).

**Alteração**

- **FR-012**: O professor MUST poder alterar o início enquanto a atividade está agendada (como hoje). O fim de um
  trabalho pode ser alterado enquanto a atividade está ativa (como o prazo hoje). O fim de uma prova pode ser alterado
  livremente enquanto ela está agendada; depois de publicada, só pode ser **estendido** (um fim novo mais tarde que o
  atual, com o fim atual ainda não passado, senão `409 ACTIVITY_PERIOD_ENDED`), nunca antecipado
  (`422 EXAM_END_CANNOT_MOVE_EARLIER`), de modo que o tempo de quem já
  começou nunca é cortado. Estender devolve a quem já começou o tempo que o corte do período tirava, até a duração. O
  período continua respeitando FR-002 depois de qualquer mudança, inclusive só do início de uma atividade agendada.

**Chamada**

- **FR-013**: Durante o período, marcar presença MUST liberar a atividade para o aluno (016), em qualquer momento,
  inclusive depois do início.
- **FR-014**: Depois do fim do período, marcar presença MUST ser recusado (`409 ACTIVITY_PERIOD_ENDED`) sem registro na
  chamada, exceto num trabalho antigo que mantém "aceitar marcando atrasado" (FR-016), que continua aceitando presença
  como aceita entregas; desmarcar continua com a regra de hoje (só antes de o aluno começar). A tela da chamada mostra
  quando o período terminou.

**Migração**

- **FR-015**: Na migração, cada prova MUST receber fim = publicação + janela de início + duração (o "fecha às" de hoje),
  sem mudar o fim do tempo de nenhuma tentativa já iniciada nem a situação de nenhum aluno.
- **FR-016**: Na migração, cada trabalho com política "recusar" MUST receber fim = prazo. Um trabalho com política
  "aceitar marcando atrasado" MUST manter essa regra até ser encerrado: recebe fim = prazo, e depois do fim continua
  aceitando entrega marcada como atrasada, exatamente como hoje; é a única forma de um trabalho aceitar depois do fim, e
  nenhum trabalho novo pode tê-la. Em nenhum caso uma entrega já feita perde a marca de atrasada.
- **FR-017**: Atividades encerradas, canceladas ou de turma/disciplina encerrada ou arquivada MUST ficar como estão para
  professor e aluno (notas, Histórico, revisão, ranking).

### Security, Permissions & Audit

- **Permissions**: As de hoje: aplicar e alterar atividade (`atividades.*` do professor), chamada (`chamada.registrar`);
  nenhuma permissão nova.
- **Resource context**: Professor da disciplina da turma (027) e aluno com matrícula ATIVA na turma, marcado presente;
  fora do contexto, `404` como hoje.
- **Audit events**: Os de hoje com o período nos metadados no lugar de prazo/janela (`class_activity.created`,
  `class_activity.updated` com os campos alterados); as recusas (período inválido, antecipar o fim da prova, presença
  ou alteração depois do fim) não são auditadas, como as recusas de chamada e de agendamento de hoje.
- **Untrusted input**: Início e fim como data e hora ISO validadas no contrato; a janela de início e a política de
  atraso no corpo → `400`; fim inválido → `422 INVALID_SCHEDULE`.
- **States & transitions**: Nenhum estado novo. Agendada/publicada, dentro/fora do período e o fim de cada tentativa são
  derivados a cada leitura pelo relógio do servidor, nunca guardados.
- **Idempotency**: A aplicação continua idempotente pela chave de hoje; a marcação de presença continua idempotente.
- **Evidence vs. decisions**: Sem mudança: o fim do tempo é uma regra (RULE_RESULT); cancelar, retornar e "Não cancelar"
  continuam decisões do professor.
- **Automation risk level**: N/A (sem IA).
- **Domain configurability**: Período e duração são dados escolhidos pelo professor por atividade.
- **Sensitive data & adaptations**: Nenhum dado novo.
- **Curricular traceability**: N/A.

### Key Entities

- **Atividade aplicada (prova ou trabalho)**: ganha o fim do período; o início continua sendo a publicação. A prova
  perde a janela de início e mantém duração e limite de inatividade; o trabalho novo não tem política de atraso (o prazo de
  hoje vira o fim do período); só os trabalhos antigos com "aceitar marcando atrasado" a mantêm (FR-016).
- **Tentativa de prova**: fim derivado (início + duração, fim do período, encerramento, cancelamento), nunca guardado.
- **Chamada (016)**: passa a recusar presença depois do fim do período.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% dos alunos marcados presentes durante o período conseguem começar a prova ou o trabalho, inclusive os
  marcados depois do início.
- **SC-002**: Nenhum aluno responde a uma prova ou trabalho depois do fim do período (além da tolerância de 2 s de hoje
  para o que já estava a caminho).
- **SC-003**: O tempo mostrado a um aluno que começa a prova tarde é o menor entre a duração e o que falta até o fim do
  período, em 100% dos casos.
- **SC-004**: O formulário de aplicação de prova e de trabalho tem como campos de tempo só Início, Término e (na prova)
  Duração: o professor nunca precisa calcular janela de início ou prazo.
- **SC-005**: Depois da migração, nenhuma tentativa iniciada, entrega, nota ou situação de aluno de atividades antigas
  muda.
- **SC-006**: Exercícios se comportam exatamente como antes desta feature.

## Assumptions

- O início continua sendo a publicação de hoje (agora ou agendada); a feature acrescenta o fim e remove a janela de
  início e a política de atraso.
- O fim do período não encerra a atividade: o encerramento continua sendo ato do professor (029 depende disso), e até lá
  a atividade fica em "Minhas atividades" sem aceitar mais nada.
- A duração da prova continua obrigatória (1–120 min) e o limite de inatividade não muda.
- A duração por aluno não estende o período e o período não estende a duração.
- Um trabalho não tem duração por aluno: quem começa perto do fim tem só o tempo até o fim.
- Sem dependência nova; as atualizações de tela continuam por consulta periódica, sem WebSockets.
- Uma migração de banco é esperada (fim do período, conversão das provas e trabalhos).
