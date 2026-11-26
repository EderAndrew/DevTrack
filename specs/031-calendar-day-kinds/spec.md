# Feature Specification: Calendário com tipos de data e calendário do aluno

**Feature Branch**: `031-calendar-day-kinds`
**Created**: 2026-11-26
**Status**: Draft
**Input**: User description: "O professor, no calendário da disciplina da turma (004), ao selecionar um dia abre um
modal e escolhe o tipo da data: Aula, Prova, Trabalho (entrega/apresentação), Revisão, Reposição (contam como
encontro: numerados, aceitam tópicos), Feriado, Recesso, Evento especial (palestra, workshop ou outro evento da
faculdade para os alunos, dia sem aula normal) e Falta do professor (não contam como encontro; a falta é um encontro
cancelado). Só Aula não tem campo de descrição; todos os outros exigem uma descrição do professor. Na Falta do
professor há dois campos: um motivo privado que só o professor vê e um aviso opcional para a turma; o aluno vê "Falta
do professor" e o aviso, nunca o motivo. Uma falta ou outro tipo que não é encontro sobre um dia com tópicos segue o
fluxo de resolução do FR-029. As marcações valem só para a disciplina da turma do professor, nunca para a turma
inteira (027). Substitui o FR-026 da 004. Aluno: um card "Seu calendário de aulas" só no Painel, da matéria atual
(026), com faixa semanal (seg–dom), navegação entre semanas, mês/ano, um ponto por dia marcado (cor por tipo) e, ao
clicar num dia, embaixo do calendário a informação do dia: tipo, descrição (ou aviso da falta), matéria e professor.
Tópicos nunca aparecem para o aluno: num dia de aula normal aparece só "Aula". Sem horário, sala ou presença nas
aulas. Forma do aluno montada por allowlist."

## Contexto: o que muda

Hoje (004 US4) o professor marca no calendário da disciplina da turma só os dias em que terá aula. Cada dia marcado é
um **encontro**, numerado em ordem de data, que pode receber tópicos. Por regra (004/FR-026), o sistema não conhece
feriados, recessos nem eventos: o professor simplesmente não marca esses dias. O aluno não vê o calendário.

Esta feature dá um **tipo** a cada dia marcado e leva o calendário ao aluno.

| Ponto | Hoje | Depois desta feature |
|-------|------|----------------------|
| O que um dia marcado é | Sempre um encontro (aula) | Um tipo: Aula, Prova, Trabalho, Revisão, Reposição, Feriado, Recesso, Evento especial ou Falta do professor |
| Marcar um dia | Clique alterna marcado/desmarcado | Clique abre um modal com o tipo e a descrição |
| Descrição | Não existe | Obrigatória em todos os tipos, menos Aula; na Falta, motivo privado + aviso opcional à turma |
| Encontros (numeração, tópicos, "Total de aulas selecionadas") | Todos os dias marcados | Só Aula, Prova, Trabalho, Revisão e Reposição |
| Feriados, recessos e eventos (004/FR-026) | O sistema não conhece | Conhecidos quando o professor os marca; nunca calculados |
| Dia com tópicos que deixa de ser encontro | Só ao desmarcar (FR-029) | Também ao mudar para Feriado, Recesso, Evento especial ou Falta (mesmo fluxo do FR-029) |
| Aluno | Não vê o calendário | Card "Seu calendário de aulas" no Painel, da matéria atual |
| Tópicos, planejamento, ementa | Só o professor | **Não mudam**: o aluno nunca os vê |
| Horário, sala, presença nas aulas | — | **Fora** desta feature |

## Clarifications

### Session 2026-11-26

- Q: O aluno vê os tópicos de cada aula? → A: Não. Num dia de aula normal aparece só "Aula".
- Q: Horário e sala da aula? → A: Não entram.
- Q: Quais tipos? → A: Aula, Prova, Trabalho, Revisão, Reposição, Feriado, Recesso, Evento especial e Falta do
  professor.
- Q: Evento especial conta como aula? → A: Não. É uma palestra, workshop ou outra ação da faculdade para os alunos,
  num dia sem aula normal.
- Q: As marcações valem para a turma inteira? → A: Não, só para a disciplina da turma do professor.
- Q: Onde fica o calendário do aluno? → A: Só um card no Painel.
- Q: Presença nas aulas? → A: Fora.
- Q: O texto da falta aparece para os alunos? → A: Não. Há um motivo privado, só do professor, e um aviso opcional
  para a turma; o aluno vê "Falta do professor" e o aviso.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Professor dá um tipo a cada dia do calendário (Priority: P1)

No calendário da disciplina da turma, o professor clica num dia e abre um modal com os tipos. Escolhe "Aula" e
confirma; ou escolhe "Feriado" e escreve "Proclamação da República"; ou "Prova" e escreve "P1 — Herança e
polimorfismo". O calendário mostra cada dia com o seu tipo, a contagem de aulas considera só os dias que são encontro,
e tudo é gravado de uma vez ao salvar, como hoje.

**Why this priority**: é a base da feature: sem os tipos, o aluno não tem o que ver.

**Independent Test**: numa disciplina de fevereiro a junho, marcar 16 quartas como Aula, uma como Prova, uma como
Feriado e uma como Evento especial; salvar e conferir os tipos, as descrições, "Total de aulas selecionadas: 17" e a
numeração dos encontros.

**Acceptance Scenarios**:

1. **Given** um dia não marcado do período da disciplina, **When** o professor o aciona no calendário, **Then** abre o
   modal "Marcar dia" com a data por extenso e os tipos Aula, Prova, Trabalho, Revisão, Reposição, Feriado, Recesso,
   Evento especial e Falta do professor, com Aula escolhida de início e sem campo de descrição.
2. **Given** o modal com Aula, **When** o professor confirma, **Then** o dia fica marcado como Aula no calendário (ainda
   não gravado) e o modal fecha.
3. **Given** o modal, **When** o professor escolhe qualquer tipo que não seja Aula nem Falta do professor, **Then**
   aparece o campo "Descrição", obrigatório, com uma dica do tipo (ex.: Feriado → "Qual feriado?"; Evento especial →
   "Qual evento?"), e o modal não confirma sem ela.
4. **Given** o modal, **When** o professor escolhe Falta do professor, **Then** aparecem "Motivo (só você vê)",
   obrigatório, e "Aviso para a turma (opcional)"; o modal explica que os alunos verão "Falta do professor" e o aviso,
   nunca o motivo.
5. **Given** dias marcados com tipos diferentes, **When** o calendário é exibido, **Then** cada dia mostra o tipo por
   texto ou ícone com nome acessível (nunca só pela cor) e uma legenda dos tipos; os encontros mostram o número.
6. **Given** um dia já marcado, **When** o professor o aciona, **Then** o modal abre com o tipo e a descrição atuais e
   permite mudar o tipo, a descrição ou "Desmarcar dia".
7. **Given** alterações feitas no calendário, **When** o professor salva, **Then** acréscimos, remoções e mudanças de
   tipo ou descrição são gravados numa única operação, como hoje (004/FR-030).
8. **Given** dias marcados de todos os tipos, **When** o calendário é exibido, **Then** "Total de aulas selecionadas: N"
   conta só Aula, Prova, Trabalho, Revisão e Reposição, numerados em ordem de data; Feriado, Recesso, Evento especial e
   Falta do professor não são numerados nem contados.
9. **Given** um dia marcado que não é encontro, **When** o professor move um tópico, cria um tópico ou conclui a aula
   de um tópico (004 US5–US9), **Then** esse dia não é oferecido como aula.
10. **Given** um tipo que não é Aula mudado para Aula, **When** confirmado, **Then** a descrição deixa de existir.
11. **Given** uma disciplina com dias marcados antes desta feature, **When** o calendário abre pela primeira vez depois
    dela, **Then** todos esses dias aparecem como Aula, com a mesma numeração e os mesmos tópicos.

---

### User Story 2 - Dia com tópicos que deixa de ser aula (Priority: P1)

O professor tinha tópicos na aula de 18/03 e precisa faltar. Ao mudar o dia para Falta do professor, o sistema não
perde nada: pede, como ao desmarcar uma aula (004/FR-029), o que fazer com cada tópico daquele dia antes de gravar.

**Why this priority**: sem isso, mudar o tipo de um dia apagaria ou esconderia tópicos, quebrando o planejamento.

**Independent Test**: com dois tópicos na aula de 18/03 (um concluído), mudar o dia para Falta do professor e conferir
que a gravação exige uma resolução para cada um e que nenhum tópico se perde.

**Acceptance Scenarios**:

1. **Given** um dia de encontro com tópicos, **When** o professor o muda para Feriado, Recesso, Evento especial ou Falta
   do professor, **Then** antes de gravar a interface mostra os tópicos daquele dia e pede, para cada um, mover para
   outra aula, deixar sem data, juntar com outro tópico ou arquivar (um tópico concluído só aceita arquivar), como ao
   desmarcar (004/FR-029).
2. **Given** essas escolhas feitas, **When** o professor salva, **Then** o dia muda de tipo, as resoluções são
   aplicadas e os encontros renumerados numa única operação; nenhum tópico é apagado.
3. **Given** uma gravação que tiraria a condição de encontro de um dia com tópicos sem resolver todos, **When** enviada,
   **Then** é recusada (409), como ao desmarcar hoje, e nada muda.
4. **Given** um dia de encontro com tópicos, **When** o professor o muda para outro tipo de encontro (ex.: Aula →
   Prova), **Then** os tópicos continuam ligados ao dia, sem pedir resolução.
5. **Given** a mudança das datas da disciplina, **When** dias marcados ficariam fora do novo período, **Then** os dias de
   encontro seguem a regra de hoje (004 US4-7) e os demais tipos fora do período são removidos com a mudança.

---

### User Story 3 - Aluno vê o calendário da matéria no Painel (Priority: P1)

No Painel, o aluno vê o card "Seu calendário de aulas" da matéria atual: a semana de segunda a domingo, com o mês e o
ano, setas para a semana anterior e a seguinte, e um ponto colorido em cada dia marcado. Ao clicar num dia, aparece
abaixo da semana o que há naquele dia: "Aula", ou "Feriado — Proclamação da República", ou "Falta do professor" com o
aviso, com a matéria e o professor.

**Why this priority**: é o que o aluno ganha; sem isso as marcações servem só ao professor.

**Independent Test**: com uma disciplina com Aula, Prova, Feriado e uma Falta do professor (com motivo e aviso), abrir o
Painel do aluno nessa matéria, navegar pelas semanas e conferir cada dia; conferir que nenhum tópico nem motivo da falta
aparece na tela nem na resposta do servidor.

**Acceptance Scenarios**:

1. **Given** um aluno com a matéria atual escolhida (026), **When** abre o Painel, **Then** vê o card "Seu calendário de
   aulas" com o intervalo da semana ("16–22 nov"), o mês e o ano ("Novembro 2026"), o nome da matéria, as setas de semana
   anterior e seguinte e os sete dias de segunda a domingo, cada um com o dia da semana abreviado e o número.
2. **Given** o card aberto, **When** exibido pela primeira vez, **Then** mostra a semana de hoje (data do servidor) com
   hoje escolhido; se hoje está fora do período da disciplina, mostra a primeira semana do período (antes dele) ou a
   última (depois dele), com o primeiro dia marcado dessa semana escolhido, ou nenhum.
3. **Given** um dia marcado na semana, **When** exibido, **Then** tem um ponto na cor do tipo e um nome acessível com a
   data e o tipo ("Segunda-feira, 16 de novembro: Aula"); um dia não marcado não tem ponto.
4. **Given** um dia de Aula, **When** o aluno o escolhe, **Then** abaixo da semana aparecem a data, "Aula", a matéria e o
   professor, e nada mais: nenhum tópico, número de encontro ou planejamento.
5. **Given** um dia de Prova, Trabalho, Revisão, Reposição, Feriado, Recesso ou Evento especial, **When** o aluno o
   escolhe, **Then** aparecem a data, o tipo, a descrição do professor, a matéria e o professor.
6. **Given** um dia de Falta do professor, **When** o aluno o escolhe, **Then** aparecem a data, "Falta do professor", o
   aviso para a turma quando houver, a matéria e o professor, e nunca o motivo.
7. **Given** um dia sem marcação, **When** o aluno o escolhe, **Then** aparece "Nada marcado neste dia."
8. **Given** as setas, **When** o aluno avança ou volta, **Then** a semana muda, o mês e o ano acompanham e nenhum dia
   fica escolhido até o aluno escolher; as setas param na semana do primeiro e na do último dia do período da
   disciplina.
9. **Given** o aluno troca de matéria no card da 026, **When** o Painel recarrega, **Then** o calendário passa a ser o da
   nova matéria, de novo na semana de hoje.
10. **Given** uma disciplina sem nenhum dia marcado, **When** o card é exibido, **Then** diz "O professor ainda não
    publicou o calendário desta matéria." e não mostra a semana.
11. **Given** o professor grava uma mudança no calendário, **When** o aluno abre ou recarrega o Painel, **Then** vê a
    mudança.

---

### User Story 4 - Só o que o aluno pode ver (Priority: P1)

O calendário do aluno é uma leitura nova de dados que até hoje eram só do professor. Nada do planejamento, do motivo da
falta ou de outra disciplina pode escapar.

**Why this priority**: tópicos e motivos são do professor; a matrícula define o que o aluno vê (003, 026, 027).

**Independent Test**: com dois alunos, um matriculado e outro não, e uma disciplina com tópicos e uma falta com motivo,
pedir o calendário pelo servidor com cada um e conferir a resposta campo a campo.

**Acceptance Scenarios**:

1. **Given** um aluno com matrícula ativa na turma da disciplina, **When** pede o calendário dela, **Then** recebe, por
   dia marcado, só a data, o tipo e o texto que o aluno pode ver (a descrição, ou o aviso da falta), e da disciplina só
   o nome da matéria, o professor e o período.
2. **Given** a resposta, **When** lida, **Then** não traz tópico, número ou situação de encontro, motivo da falta, id de
   tópico, autor ou data de alteração.
3. **Given** uma disciplina de turma em que o aluno não tem matrícula ativa (de outra turma, encerrada ou inexistente),
   **When** pede o calendário, **Then** recebe `404` com a mesma resposta nos três casos; um id mal formado é `400`.
4. **Given** um professor, gestor ou administrador sem a permissão de aluno, **When** pede o calendário pela rota do
   aluno, **Then** recebe `403`.
5. **Given** uma disciplina de turma encerrada (027), **When** o aluno ainda tem a matrícula ativa, **Then** continua
   vendo o calendário, só para leitura.

---

### Edge Cases

- Um dia tem no máximo uma marcação por disciplina da turma; duas disciplinas da mesma turma podem marcar o mesmo dia
  com tipos diferentes (ex.: Feriado numa e Aula noutra), e cada aluno vê o da matéria escolhida.
- Marcações só dentro do período da disciplina; fora dele, recusadas, como hoje.
- Limites: no máximo uma marcação por data do período (encontro ou dia sem aula); no máximo 200 encontros por
  disciplina, como hoje; dias sem aula não têm limite além de um por data; uma gravação aceita até 400 entradas com tipo.
- Descrição: espaços nas pontas ignorados; só espaços é o mesmo que vazio (recusado); até 120 caracteres. Motivo da
  falta: até 500; aviso: até 200, só espaços é o mesmo que nenhum aviso.
- Textos com marcação ou caracteres especiais aparecem como texto, nunca como HTML, para o professor e para o aluno.
- Uma Falta do professor num dia que antes não estava marcado não pede resolução (não havia tópicos).
- Mudar de Falta do professor para Aula torna o dia encontro de novo: o motivo e o aviso deixam de existir, e os
  tópicos que foram movidos não voltam sozinhos.
- Um encontro com a situação `CANCELLED` nunca existiu até hoje (004/FR-028); a Falta do professor é a forma de um dia
  cancelado, e a 004 continua sem usar `COMPLETED` nem `CANCELLED` nos encontros.
- Duas gravações simultâneas do mesmo calendário: a segunda é recusada pela concorrência de hoje (004, revisão do
  planejamento) e o professor recarrega.
- O calendário do aluno numa largura de celular: os sete dias cabem na largura sem rolagem horizontal da página; o
  detalhe do dia fica abaixo.
- Semana que cruza meses ("28 out–3 nov"): o mês e o ano mostrados são os da segunda-feira da semana.
- Um aluno sem nenhuma matrícula ativa não tem matéria atual e o card não aparece (026).

## Requirements *(mandatory)*

### Functional Requirements

**Professor: tipos de data**

- **FR-001**: Cada dia marcado no calendário de uma disciplina da turma MUST ter exatamente um tipo entre `CLASS`
  (Aula), `EXAM` (Prova), `ASSIGNMENT` (Trabalho), `REVIEW` (Revisão), `MAKEUP` (Reposição), `HOLIDAY` (Feriado),
  `RECESS` (Recesso), `SPECIAL_EVENT` (Evento especial) e `TEACHER_ABSENCE` (Falta do professor).
- **FR-002**: Os tipos `CLASS`, `EXAM`, `ASSIGNMENT`, `REVIEW` e `MAKEUP` MUST ser encontros: numerados em ordem de data
  (004/FR-027), contados em "Total de aulas selecionadas", aceitam tópicos e são as aulas oferecidas em todo o
  planejamento (mover, criar, concluir, propostas de IA da 007 que usam o número de encontros). Os demais tipos MUST NOT
  ser encontros.
- **FR-003**: Acionar um dia do período no calendário MUST abrir um modal com a data por extenso e os nove tipos; num dia
  não marcado, o tipo inicial MUST ser Aula; num marcado, o tipo e os textos atuais, com "Desmarcar dia".
- **FR-004**: Aula MUST NOT ter texto. Os tipos `EXAM`, `ASSIGNMENT`, `REVIEW`, `MAKEUP`, `HOLIDAY`, `RECESS` e
  `SPECIAL_EVENT` MUST ter uma descrição obrigatória (1–120 caracteres após remover espaços nas pontas), com uma dica por
  tipo.
- **FR-005**: `TEACHER_ABSENCE` MUST ter um motivo obrigatório (1–500), visto só pelo professor da disciplina, e um aviso
  para a turma opcional (até 200); o modal MUST dizer que os alunos veem "Falta do professor" e o aviso, nunca o motivo.
- **FR-006**: Mudar o tipo de um dia MUST descartar os textos que o novo tipo não tem (ex.: para Aula, a descrição; de
  Falta para outro tipo, o motivo e o aviso).
- **FR-007**: As mudanças MUST ficar pendentes no calendário até "Salvar" e ser gravadas numa única operação com os
  acréscimos, remoções, mudanças de tipo e de texto e as resoluções de tópicos (004/FR-030).
- **FR-008**: Tirar a condição de encontro de um dia com tópicos (desmarcar, ou mudar para um tipo que não é encontro)
  MUST seguir o 004/FR-029: a interface identifica os tópicos antes de salvar e pede mover, deixar sem data, juntar ou
  arquivar (concluído: só arquivar); sem resolução para cada um, `409` e nada muda. Mudar entre tipos de encontro MUST
  manter os tópicos.
- **FR-009**: Uma mudança de período da disciplina MUST tratar os encontros fora do novo período como hoje (004 US4-7) e
  remover junto os dias de outros tipos fora dele.
- **FR-010**: O calendário do professor MUST mostrar o tipo de cada dia por texto ou ícone com nome acessível, nunca só
  pela cor, com uma legenda, e continuar operável só com teclado (004/FR-052), inclusive o modal.
- **FR-011**: Os dias marcados antes desta feature MUST passar a ser Aula, sem texto, com a mesma numeração e os mesmos
  tópicos.
- **FR-012**: Este requisito MUST substituir o 004/FR-026: o sistema conhece feriados, recessos e eventos só como o
  professor os marca, nunca por cálculo, calendário oficial ou importação, e continua sem pedir motivo para dias não
  marcados.
- **FR-013**: As marcações MUST pertencer só à disciplina da turma (`classes`) do professor; nenhuma marcação vale para a
  turma (027) nem para outra disciplina dela, e o gestor não as cria nem as vê.

**Aluno: calendário no Painel**

- **FR-014**: O Painel do aluno MUST ter o card "Seu calendário de aulas" da matéria atual (026), e nenhuma outra tela
  ou item de menu novo.
- **FR-015**: O card MUST mostrar o intervalo da semana, o mês e o ano da segunda-feira da semana, o nome da matéria, as
  setas de semana anterior e seguinte (com nomes acessíveis) e os sete dias de segunda a domingo, cada um com o dia da
  semana abreviado, o número e, se marcado, um ponto na cor do tipo; cada dia MUST ter um nome acessível com a data e o
  tipo, e hoje MUST ser identificado por texto acessível, não só visualmente.
- **FR-016**: O card MUST abrir na semana de hoje pela data do servidor, com hoje escolhido; fora do período, na primeira
  ou na última semana do período, com o primeiro dia marcado dessa semana escolhido, ou nenhum. A navegação MUST ficar
  entre a semana do primeiro e a do último dia do período.
- **FR-017**: Ao escolher um dia, o card MUST mostrar abaixo da semana a data por extenso e: "Aula" num encontro do tipo
  Aula; o tipo e a descrição nos tipos com descrição; "Falta do professor" e o aviso, quando houver, numa falta; "Nada
  marcado neste dia." num dia sem marcação; "Escolha um dia para ver o que há nele." quando nenhum dia está escolhido;
  e, num dia marcado, o nome da matéria e o professor.
- **FR-018**: Os estados do card MUST distinguir: carregando; falha ao carregar com "Tentar novamente"; disciplina sem
  dias marcados ("O professor ainda não publicou o calendário desta matéria.").
- **FR-019**: O card MUST seguir a troca de matéria do 026 e as regras dela: uma matéria que o aluno não pode mais ver
  volta para a matrícula mais recente.
- **FR-020**: Uma gravação do professor MUST aparecer para o aluno na próxima leitura do Painel; não há aviso imediato,
  WebSockets nem polling novo.

**Servidor: o que o aluno recebe**

- **FR-021**: O aluno MUST ler o calendário de uma disciplina da turma só com matrícula ativa na turma dela (027), checada
  antes de qualquer leitura; senão, `404` com a mesma resposta para outra turma, matrícula encerrada ou disciplina
  inexistente; um id mal formado MUST ser `400`.
- **FR-022**: A resposta ao aluno MUST ser montada copiando uma lista fechada de campos: da disciplina, o nome da
  matéria, o nome do professor e o período; de cada dia marcado, a data, o tipo e o texto visível ao aluno (a descrição,
  ou o aviso da falta, ou nada na Aula). MUST NOT trazer tópicos, número ou situação de encontro, motivo da falta,
  planejamento, ementa, ids de tópico, autores ou datas de alteração.
- **FR-023**: Os textos MUST aparecer como texto, nunca como HTML, no calendário do professor e no do aluno.
- **FR-024**: As telas MUST usar só tokens e componentes do Design System, funcionar nos temas escuro e claro e na
  largura de celular sem rolagem horizontal da página, e cada controle MUST ter nome acessível e ser operável por
  teclado; as cores dos tipos MUST ter contraste suficiente nos dois temas.
- **FR-025**: O que a 004 e as features seguintes fazem com encontros e tópicos (planejamento, cobertura, conclusão de
  aula, propostas de IA da 007, atividades, provas) MUST continuar igual para os dias de encontro; nenhuma prova ou
  trabalho é criado, aplicado ou ligado a partir de uma marcação.

### Security, Permissions & Audit

- **Permissions**: o professor continua com `calendario.gerenciar` para marcar e `planejamento.visualizar` para ler o
  próprio calendário. Nova permissão do aluno, só do papel `STUDENT`: `calendario.turma.visualizar` (ler o calendário das
  disciplinas das suas turmas). MANAGER e ADMIN não recebem nenhuma das duas.
- **Resource context**: professor, só as suas disciplinas da turma (`404` para as de outros, inclusive na mesma turma,
  027); aluno, só as disciplinas das turmas da sua matrícula ativa (`404`).
- **Audit events**: `class_meetings.updated` (004) continua um por gravação e ganha a quantidade por tipo e quantas
  mudanças de tipo houve; nunca descrição, motivo ou aviso. A leitura do aluno não é auditada, e a recusa por contexto
  é `404` sem evento, como a checagem de matéria da 026.
- **Untrusted input**: tipo de uma lista fechada; datas no período; textos aparados, com limite, sem NUL, nunca
  interpretados como HTML ou comando; o corpo do professor nunca traz autor ou hora; o id da disciplina do aluno é
  validado antes da consulta.
- **States & transitions**: o tipo de um dia muda livremente entre os nove; só a saída da condição de encontro com
  tópicos exige resolução (`409` sem ela). Nenhum estado novo de encontro.
- **Idempotency**: a gravação do calendário segue a de hoje (acrescentar um dia existente com o mesmo tipo e textos não
  muda nada; a concorrência pela revisão do planejamento).
- **Evidence vs. decisions**: N/A.
- **Automation risk level**: N/A (sem IA nesta feature).
- **Domain configurability**: os nove tipos são fixos desta feature; feriados e eventos são texto do professor, nunca uma
  lista no código.
- **Sensitive data & adaptations**: o motivo da falta pode ter dado pessoal do professor: só ele o vê; nunca vai para o
  aluno, auditoria ou logs.
- **Curricular traceability**: os tópicos continuam ligados só a encontros; nenhuma marcação muda a ementa.

### Key Entities

- **Encontro** (`class_meetings`, como na 004): um dia marcado de tipo Aula, Prova, Trabalho, Revisão ou Reposição;
  numerado em ordem de data e recebe tópicos.
- **Dia sem aula** (novo): um dia marcado de tipo Feriado, Recesso, Evento especial ou Falta do professor; não é numerado
  nem recebe tópicos. Uma data da disciplina é um encontro ou um dia sem aula, nunca os dois.
- **Descrição**: texto do professor nos tipos que não são Aula nem Falta; visível ao aluno.
- **Falta do professor**: dia que não é encontro, com o motivo (só do professor) e o aviso opcional (visível ao aluno).
- **Calendário do aluno**: a leitura, para o aluno matriculado, dos dias marcados de uma disciplina com só o tipo e o texto
  visível, mais a matéria, o professor e o período.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: O professor marca um dia com tipo e descrição em no máximo 3 interações a partir do calendário: acionar o
  dia, escolher o tipo, confirmar (escrever a descrição não conta como interação).
- **SC-002**: Em 100% das gravações, "Total de aulas selecionadas" e a numeração contam exatamente os dias de Aula, Prova,
  Trabalho, Revisão e Reposição.
- **SC-003**: 0 tópicos perdidos quando um dia deixa de ser encontro: todo tópico daquele dia termina movido, sem data,
  juntado ou arquivado, por escolha do professor.
- **SC-004**: 0 tópicos, números de encontro ou motivos de falta aparecem na resposta do servidor ou na tela do aluno, em
  todos os tipos de dia.
- **SC-005**: 0 calendários de disciplinas fora das matrículas ativas do aluno são lidos: cada caso recebe a mesma
  resposta `404`.
- **SC-006**: O aluno vê o que há num dia com 1 interação a partir do Painel, e chega a qualquer semana do período só com
  as setas.
- **SC-007**: Os calendários antigos continuam com o mesmo total de aulas, a mesma numeração e os mesmos tópicos depois
  da mudança (100% das disciplinas).
- **SC-008**: As duas telas passam nas verificações automáticas de acessibilidade e contraste nos temas escuro e claro, e
  o card do aluno não tem rolagem horizontal da página na largura de 360 px.

## Assumptions

- "Encontro" continua sendo o conceito da 004 (a aula numerada que recebe tópicos); os tipos novos são uma propriedade do
  dia marcado, e não se cria um segundo calendário.
- A falta do professor não é um encontro com tópicos travados: o professor resolve os tópicos e, se quiser repor, marca
  um dia de Reposição.
- Reposição exige descrição (ex.: "Reposição da aula de 18/03"); a ligação com o dia faltado é só esse texto.
- Prova e Trabalho no calendário são avisos ao aluno; não se ligam às provas e trabalhos aplicados (011, 018) nem mudam a
  liberação, a presença ou os prazos deles.
- "Hoje" é a data do servidor no fuso da plataforma, como o resto do portal do aluno.
- O card fica no Painel, abaixo dos blocos que já existem; a disposição exata segue a imagem de referência dentro do
  layout atual do Painel.
- As cores dos tipos vêm dos tokens do Design System; o ponto é complementado pelo nome acessível e pelo texto do
  detalhe.
- O app móvel (024) não muda.
