# Feature Specification: Portal do Aluno — Dashboard, Atividades e Entregas

**Feature Branch**: `012-student-portal`
**Created**: 2026-10-01
**Status**: Draft
**Input**: User description: "Portal do Aluno: o aluno autenticado vê um dashboard com suas
turmas e atividades (exercícios e trabalhos) publicadas para elas, com prazos e situação
(PENDENTE, EM_ANDAMENTO, ENTREGUE, CORRIGIDO, ATRASADO); abre, inicia, responde, salva o
progresso (resistente a recarga, fechamento e queda de conexão), continua depois e entrega com
confirmação, de forma idempotente; consulta o histórico e vê nota e feedback só quando
liberados. Nenhum gabarito chega ao aluno; toda autorização no servidor (IDOR/BOLA); auditoria;
concorrência (duas abas, clique duplo, autosave × entrega, prazo vencendo). Provas, ambiente
controlado, antifraude, IA para o aluno, correção automática por IA, ranking e gamificação ficam
fora; o domínio deve aceitar PROVA e modo de execução CONTROLADO no futuro. Fluxo: professor
cria → publica → aluno vê → inicia → responde → salva → entrega → professor recebe → correção →
aluno consulta o resultado."

## Contexto: o que existe e o que falta

O pedido supõe que o professor já publica atividades para turmas. **Hoje ele não publica**: as
features 010 e 011 criaram **bancos privados de modelos** (exercícios e trabalhos) do professor,
reutilizáveis entre turmas, sem prazo, sem turma e sem aluno. A 011 deixou para esta feature
(Clarifications de 2026-09-30) "a aplicação do trabalho a uma turma, a resposta do aluno, a
correção executada e a liberação do resultado ao aluno". O ciclo ponta a ponta pedido só fecha
se esta feature criar o elo entre o banco e a turma.

| Peça do fluxo | Situação hoje | O que esta feature faz |
|---------------|---------------|------------------------|
| Turma, matrícula, "Minhas turmas" (003) | Existe: o aluno só nasce do convite e tem matrícula `ACTIVE` ou `REMOVED` | Reusa; o acesso do aluno a tudo nesta feature parte da matrícula `ACTIVE` |
| Banco de exercícios (010) e de trabalhos (011) | Existem: modelos do professor, com visão do aluno sem gabarito já definida e testada | **Não mudam.** São a origem do conteúdo da atividade |
| Atividade de turma (constituição XXIII: `EXERCISE`, `ASSIGNMENT`, `EXAM`) | Não existe | Cria a **atividade da turma**: cópia (snapshot) de itens do banco, aplicada a uma turma, com publicação e prazo |
| Publicação pelo professor | Não existe | Fluxo mínimo do professor para aplicar e publicar, com a regra de prazo e a nota total |
| Tentativa, respostas, entrega | Não existem | Cria a tentativa do aluno, o salvamento das respostas e a entrega |
| Correção e liberação | Regras definidas na 011 (estratégias e nota em centésimos), sem execução | Executa as regras sem IA e sem Code Runner; o professor vê as entregas, corrige o resto e libera o resultado |
| Upload de arquivo pelo aluno | Não existe modalidade de entrega por arquivo; o único upload é a ementa (004) | **Não cria** (o pedido proíbe modalidades novas): a seção de arquivos não se aplica |

A relação de domínio desta feature é:

```text
Aluno ──(matrícula ACTIVE)──▶ Turma ──▶ Atividade da turma (snapshot do banco, prazo, tipo, modo)
                                              │
Aluno ─────────────────────────────▶ Tentativa (uma por aluno e atividade nesta versão)
                                              │  respostas: uma por questão, sobrescrita a cada salvamento
                                              ▼
                                         Entrega (a tentativa entregue: data/hora, no prazo ou atrasada, imutável)
                                              │
                                              ▼
                                   Correção (por questão: regra automática ou decisão do professor)
                                              │
                                              ▼
                              Resultado liberado (nota + feedback visíveis ao aluno)
```

A **situação do aluno na atividade** (PENDENTE, EM_ANDAMENTO, ENTREGUE, CORRIGIDO, ATRASADO) não
é gravada: é **derivada no servidor** da tentativa, da entrega, da liberação e do relógio do
servidor.

## Clarifications

> **Emenda (2026-10-03, spec 013)**: as regras de Exercício (nota, prazo, tentativa única,
> liberação) foram substituídas pela
> [013 — Pontuação e Ranking dos Exercícios](../013-exercise-points-ranking/spec.md). Para
> atividades de Exercício valem os requisitos da 013 no lugar destes ids desta spec: FR-001,
> FR-006, FR-009, FR-014–FR-016, FR-024a, FR-027–FR-030, FR-036, US1-7 e US1-8. Trabalho não muda:
> para ele todos os requisitos desta spec continuam valendo.

### Session 2026-10-01

- Q: Quanto do lado do professor entra nesta feature? → A: **A** — aplicar/publicar, ver as
  entregas, corrigir as questões que a regra não corrige e liberar o resultado; o ciclo fecha
  nesta feature (FR-006).
- Q: O que acontece depois do prazo? → A: **C** — o professor escolhe, ao publicar, entre
  "não aceitar entrega atrasada" e "aceitar entrega atrasada, marcada como atrasada"
  (FR-001, FR-024a).
- Q: Atividades de Exercício têm nota? → A: **A** — sim: o professor define a nota total ao
  aplicar, dividida entre as questões em centésimos exatos pela mesma regra dos trabalhos
  (FR-001, FR-028).

## User Scenarios & Testing *(mandatory)*

Os perfis são o **aluno** (usuário principal, com o papel STUDENT e matrícula `ACTIVE` na
turma) e o **professor** da turma, que aplica, publica, recebe, corrige e libera. ADMIN e
MANAGER não têm acesso a atividades, respostas, entregas nem notas (constituição XXIV).

### User Story 1 - Professor aplica e publica uma atividade para a turma (Priority: P1)

O professor escolhe, na sua turma, itens aprovados do seu banco — um trabalho (011) ou de 1 a
10 exercícios (010) — e cria uma atividade da turma com título, instruções, data de publicação
e prazo de entrega. A turma recebe uma cópia do conteúdo: editar ou arquivar o item no banco
nunca muda a atividade aplicada. Na data de publicação, a atividade aparece para os alunos
matriculados.

**Why this priority**: sem publicação não há o que o aluno ver; é o primeiro elo do ciclo e
hoje não existe.

**Independent Test**: com um professor, uma turma com dois alunos e um trabalho aprovado,
aplicar e publicar; conferir que os dois alunos veem a atividade e que editar o trabalho no
banco não altera a atividade.

**Acceptance Scenarios**:

1. **Given** um trabalho APPROVED do banco do professor e uma turma ACTIVE dele, **When** o
   professor aplica o trabalho com prazo futuro e publicação imediata, **Then** a atividade do
   tipo Trabalho passa a existir na turma com cópia das questões, valores e gabarito, e os
   alunos com matrícula ACTIVE a veem.
2. **Given** uma atividade aplicada, **When** o professor edita ou arquiva o trabalho no banco,
   **Then** a atividade da turma não muda.
3. **Given** um item DRAFT ou ARCHIVED do banco, ou de outro professor, ou uma turma de outro
   professor, **When** o professor tenta aplicar, **Then** a aplicação é recusada (item ou
   turma de outro professor: "não encontrado").
4. **Given** uma atividade com publicação agendada para amanhã, **When** um aluno consulta hoje,
   **Then** ela não aparece nem pode ser aberta pelo endereço; amanhã aparece.
5. **Given** um prazo anterior à data de publicação, **When** o professor salva, **Then** é
   recusado.
6. **Given** o mesmo pedido de aplicação enviado duas vezes (clique duplo), **When** processado,
   **Then** existe uma só atividade.
7. **Given** 3 exercícios aprovados, **When** o professor os aplica com nota total 1,00, **Then**
   os valores são 0,34, 0,33 e 0,33, na ordem escolhida; nota total fora de 0,01 a 100,00 ou com
   mais de duas casas é recusada.
8. **Given** a publicação, **When** o professor escolhe "não aceitar entrega atrasada" ou
   "aceitar entrega atrasada", **Then** a regra fica registrada na atividade e é aplicada pelo
   servidor depois do prazo (FR-024a).

---

### User Story 2 - Aluno vê o dashboard e "Minhas atividades" (Priority: P1)

Ao entrar, o aluno cai no seu dashboard: contadores de pendentes, em andamento, atrasadas e
concluídas, e a lista das próximas atividades por prazo, com turma/disciplina, tipo, situação e
uma ação direta ("Iniciar", "Continuar", "Ver entrega", "Ver resultado"). "Minhas atividades"
lista todas, filtráveis por situação e por tipo.

**Why this priority**: responde em segundos "o que preciso fazer, o que já fiz, qual o próximo
prazo, o que está atrasado".

**Independent Test**: com um aluno matriculado em duas turmas e atividades em cada situação,
conferir contadores, ordem por prazo, filtros e a ausência de atividades de turmas em que não
está matriculado.

**Acceptance Scenarios**:

1. **Given** um aluno com 3 pendentes, 2 em andamento, 1 atrasada e 8 concluídas, **When** abre o
   dashboard, **Then** vê exatamente esses contadores (concluídas = entregues + corrigidas) e
   as próximas atividades da mais próxima à mais distante do prazo.
2. **Given** uma atividade que vence em menos de 48 horas e não foi entregue, **When** o aluno
   vê o dashboard, **Then** ela aparece destacada como urgente, com o destaque comunicado por
   texto e não só por cor.
3. **Given** atividades de uma turma em que o aluno não está matriculado, ou de que foi removido,
   **When** ele consulta o dashboard ou "Minhas atividades", **Then** elas não aparecem.
4. **Given** "Minhas atividades", **When** o aluno filtra por "Atrasadas" e "Trabalho", **Then**
   vê só os trabalhos atrasados; cada item mostra título, descrição resumida, tipo,
   turma/disciplina, professor, data de publicação, prazo, situação, nota (quando liberada) e
   indicador de feedback (quando liberado).
5. **Given** um aluno sem atividades, **When** abre o dashboard, **Then** vê "Nenhuma atividade
   pendente."; **Given** uma falha ao carregar, **Then** vê "Não foi possível carregar suas
   atividades." com a opção de tentar de novo — mensagens distintas.
6. **Given** uma conta com papéis STUDENT e TEACHER, **When** entra, **Then** o portal do aluno
   mostra só as atividades em que é aluno.

---

### User Story 3 - Aluno inicia, responde e salva uma atividade (Priority: P1)

O aluno abre a atividade (título, descrição, instruções, turma/disciplina, professor, tipo,
publicação, prazo e situação), inicia e responde as questões — Pergunta e resposta, Múltipla
escolha e Código, os tipos que já existem —, navegando entre elas e vendo quais estão
respondidas. As respostas são salvas automaticamente e quando ele troca de questão; a interface
mostra "Salvando…", "Resposta salva" ou "Não foi possível salvar." com a opção de tentar de novo, sem
perder o que está na tela. Ele pode sair e continuar depois, de outro navegador.

**Why this priority**: é a experiência central; perder respostas destrói a confiança
(constituição III).

**Independent Test**: iniciar uma atividade, responder duas questões, recarregar a página,
encerrar a sessão, entrar de novo e conferir as respostas e a questão em que estava.

**Acceptance Scenarios**:

1. **Given** uma atividade publicada e PENDENTE, **When** o aluno a inicia, **Then** é criada a
   sua tentativa, a situação vira EM_ANDAMENTO e o início é auditado.
2. **Given** a mesma atividade iniciada em duas abas ou com dois cliques, **When** processado,
   **Then** existe uma só tentativa.
3. **Given** uma resposta digitada, **When** o salvamento acontece, **Then** a interface mostra
   "Salvando…" e depois "Resposta salva"; **When** o aluno recarrega a página, fecha o navegador ou
   entra de novo, **Then** a resposta está lá.
4. **Given** a mesma resposta enviada várias vezes (retry, reenvio do navegador), **When**
   processada, **Then** existe uma só resposta por questão, com o conteúdo mais recente.
5. **Given** a conexão caída, **When** o aluno continua respondendo, **Then** a interface avisa
   que está sem conexão, mantém as respostas na tela e as envia quando a conexão volta, sem
   perder nada nem duplicar.
6. **Given** uma falha ao salvar, **When** o aluno toca em "Tentar novamente", **Then** o conteúdo
   da tela é reenviado intacto.
7. **Given** a visão da atividade recebida pelo aluno, **When** inspecionada, **Then** não contém
   resposta esperada, alternativa correta, solução, rubrica, casos de teste privados,
   explicação, pegadinha nem qualquer dado de correção — nem escondidos.
8. **Given** uma questão de Código, **When** o aluno responde, **Then** escreve o código num
   editor, vê o código inicial, a linguagem e os casos de teste públicos; o código não é
   executado nesta feature.

---

### User Story 4 - Aluno entrega a atividade (Priority: P1)

O aluno toca em "Entregar atividade", confirma ("Tem certeza de que deseja entregar esta
atividade? Depois de entregue, não será possível alterar as respostas.") e recebe a confirmação
clara da entrega com data e hora. As respostas ainda não salvas vão junto com a entrega. Depois
de entregue, a atividade fica só para leitura.

**Why this priority**: sem entrega o professor não recebe nada; é o ponto mais sensível a
duplicação e a perda.

**Independent Test**: responder parte das questões, entregar com dois cliques e com a conexão
caindo após o envio; conferir uma só entrega, com todas as respostas, e a situação ENTREGUE.

**Acceptance Scenarios**:

1. **Given** uma tentativa EM_ANDAMENTO dentro do prazo, **When** o aluno confirma a entrega,
   **Then** o servidor valida aluno, matrícula ACTIVE, atividade publicada da turma, prazo e
   situação, grava as respostas pendentes, registra a entrega com data e hora do servidor, a
   situação vira ENTREGUE e o professor passa a vê-la.
2. **Given** um clique duplo ou o reenvio após queda de conexão, **When** a entrega é repetida,
   **Then** existe uma só entrega e a repetição responde com a mesma entrega, sem novo evento.
3. **Given** um salvamento automático chegando ao mesmo tempo que a entrega, **When** os dois
   são processados, **Then** a entrega contém um estado consistente das respostas e nenhum
   salvamento altera a entrega depois de registrada (recusado com aviso de "já entregue").
4. **Given** questões sem resposta, **When** o aluno toca em "Entregar atividade", **Then** a
   confirmação informa quantas estão em branco; ele pode entregar assim mesmo.
5. **Given** uma entrega recusada (prazo encerrado, matrícula removida, atividade encerrada),
   **When** o servidor recusa, **Then** o aluno vê o motivo, suas respostas continuam salvas e
   a tentativa inválida é auditada.
6. **Given** o prazo vencendo enquanto o aluno responde, **When** faltam 10 minutos e 1 minuto,
   **Then** a interface avisa; **When** o prazo vence, **Then** a atividade que não aceita atraso
   recusa salvar e entregar (respostas já salvas são preservadas), e a que aceita segue
   permitindo, com aviso de que a entrega será marcada como atrasada.

---

### User Story 5 - Professor recebe, corrige e libera o resultado (Priority: P2)

O professor vê, por atividade, quem entregou, quem está em andamento, quem não entregou e quem
entregou atrasado, e abre cada entrega. As Múltiplas escolhas já chegam corrigidas pela regra
da 011 (comparação exata, sem IA). Pergunta e resposta e Código ficam pendentes de correção do
professor, que dá a nota de cada questão (entre 0 e o valor dela) e um feedback opcional por
questão e geral. Quando decide, libera o resultado da atividade para a turma.

**Why this priority**: fecha o ciclo "professor recebe → correção → aluno consulta"; vem depois
da entrega porque o aluno já ganha valor ao entregar.

**Independent Test**: com duas entregas de um trabalho misto, conferir a correção automática das
Múltiplas escolhas, corrigir as demais, liberar e conferir o que cada aluno vê antes e depois.

**Acceptance Scenarios**:

1. **Given** uma entrega com Múltiplas escolhas, **When** registrada, **Then** cada uma tem nota
   final pela regra EXACT_MATCH da 011, sem IA.
2. **Given** questões de Pergunta e resposta ou Código, **When** o professor ainda não corrigiu,
   **Then** ficam pendentes, sem nota zero automática, e a nota da entrega é parcial.
3. **Given** uma nota do professor fora de 0 a valor da questão ou com mais de duas casas,
   **When** salva, **Then** é recusada.
4. **Given** uma atividade com entregas corrigidas, **When** o professor libera o resultado,
   **Then** os alunos passam a ver nota e feedback, e a situação vira CORRIGIDO para quem
   tem correção completa.
5. **Given** um aluno de outra turma ou um professor de outra turma, **When** tenta ver as
   entregas, **Then** recebe "não encontrado".
6. **Given** um aluno que perdeu a conexão às 23:59 numa atividade que não aceita atraso, com as
   respostas salvas até 23:58, **When** o professor abre a tentativa e escolhe "Aceitar como
   entrega", **Then** existe uma entrega com aquelas respostas, marcada como atrasada e aceita
   pelo professor, as Múltiplas escolhas são corrigidas e o aluno passa a vê-la como ENTREGUE;
   repetir a ação não cria outra entrega.

---

### User Story 6 - Aluno consulta histórico, nota e feedback (Priority: P2)

O aluno vê suas atividades entregues (atividade, tipo, turma/disciplina, data da entrega,
situação, nota e feedback quando liberados) e abre cada entrega para ver suas próprias
respostas, só para leitura.

**Why this priority**: responde "o meu trabalho foi entregue?" e "qual foi minha nota?".

**Independent Test**: com uma entrega corrigida e não liberada e outra liberada, conferir que a
nota só aparece na liberada e que nenhuma resposta da API traz a nota não liberada.

**Acceptance Scenarios**:

1. **Given** uma entrega corrigida pelo professor e não liberada, **When** o aluno a consulta,
   **Then** vê ENTREGUE, sem nota nem feedback — e esses dados não estão na resposta da API.
2. **Given** uma entrega liberada, **When** o aluno a consulta, **Then** vê a nota total, a nota
   por questão, o feedback e a situação CORRIGIDO; a visualização é auditada uma vez.
3. **Given** o identificador de uma atividade de turma em que o aluno não está matriculado, ou
   o identificador da tentativa ou da entrega de outro aluno posto no endereço ou no corpo,
   **When** o aluno consulta ou envia, **Then** recebe "não encontrado" (ou o campo é recusado),
   nunca dados alheios, e a tentativa é auditada.
4. **Given** uma entrega liberada, **When** o aluno a consulta, **Then** a resposta esperada, a
   alternativa correta, a solução de referência e os casos de teste privados continuam
   ausentes nesta feature (Assumptions).

---

### Edge Cases

- **Matrícula removida** (003) com tentativa em andamento: o aluno perde o acesso à atividade e
  não entrega mais; a tentativa e as respostas ficam preservadas para o professor. Entregas já
  feitas continuam na turma.
- **Aluno matriculado depois da publicação**: vê a atividade, inclusive se o prazo já passou
  (aparece como ATRASADO e só pode entregar se a atividade aceitar atraso).
- **Turma INACTIVE ou ARCHIVED**: atividades ficam só para consulta; não se inicia, salva nem
  entrega.
- **Atividade com um só exercício**: a navegação entre questões some; o resto é igual.
- **Resposta muito longa**: limite de tamanho por resposta (texto e código), recusado com
  mensagem clara, nunca truncado em silêncio.
- **Conteúdo do aluno com HTML ou script**: exibido como texto, nunca interpretado, em qualquer
  tela (aluno e professor).
- **Relógio do navegador errado**: prazo e situação vêm sempre do servidor.
- **Atividade cancelada pelo professor**: some do portal do aluno; entregas existentes são
  preservadas e não contam nos contadores.
- **Dois salvamentos de abas diferentes na mesma questão**: vale o primeiro que o servidor
  gravar; a aba que salvar a partir de uma versão anterior é avisada de que a resposta foi
  alterada em outro lugar, nada é sobrescrito em silêncio e ela recarrega a versão do servidor
  antes de o aluno continuar. O mesmo vale para as respostas enviadas junto com a entrega.
- **Rate limit**: salvamentos e entregas acima do limite por aluno são recusados com mensagem
  clara; o conteúdo da tela é preservado e reenviado depois.
- **Conta com STUDENT e TEACHER na mesma turma**: impossível pela 003 (o professor da turma não
  se matricula nela); em turmas diferentes, cada papel vê o seu lado.

## Requirements *(mandatory)*

### Functional Requirements

**Atividade da turma (professor)**

- **FR-001**: O professor DEVE poder aplicar a uma turma sua ACTIVE um trabalho APPROVED do seu
  banco (011) ou de 1 a 10 exercícios APPROVED do seu banco (010), criando uma atividade da
  turma com tipo (Exercício ou Trabalho), título, descrição/instruções, data de publicação,
  prazo de entrega e a regra de atraso ("não aceitar" ou "aceitar marcada como atrasada"). Num
  Trabalho, a nota total e os valores vêm do trabalho; num Exercício, o professor define a nota
  total (0,01 a 100,00), dividida entre as questões em centésimos exatos pela regra da 011 (resto
  um centésimo por questão às primeiras posições).
- **FR-002**: A atividade DEVE guardar uma cópia (snapshot) das questões, valores, gabarito e
  estratégias de correção no momento da aplicação; mudanças no banco NUNCA alteram atividades
  aplicadas (constituição XXIII).
- **FR-003**: O tipo da atividade e o modo de execução DEVEM ser conceitos de domínio
  extensíveis: nesta feature existem os tipos Exercício e Trabalho e só o modo NORMAL; Prova e
  modo CONTROLADO ficam reservados e NÃO DEVEM ser criáveis, aceitos nem exibidos.
- **FR-004**: A atividade DEVE ter estados explícitos — ativa, encerrada, cancelada — com
  transições validadas no servidor (ativa → encerrada; ativa ou encerrada → cancelada); transição
  inválida → `409 INVALID_STATE_TRANSITION`. "Agendada" e "publicada" são as fases de uma
  atividade ativa antes e depois da data de publicação, pelo relógio do servidor, sem job nem
  flag (research P4).
- **FR-005**: O prazo DEVE ser posterior à publicação; aplicar a mesma atividade com a mesma
  chave de pedido DEVE criar uma só atividade.
- **FR-005a**: Ao aplicar, o servidor DEVE calcular deterministicamente o escopo ensinado da turma
  (itens da ementa ligados a tópicos concluídos do planejamento da turma, 004) e sinalizar os
  tópicos das questões fora dele; a aplicação com tópicos fora do escopo só prossegue com a
  confirmação explícita do professor, registrada na auditoria (constituição XXIII: "itens fora
  dele são rejeitados ou sinalizados"). Um trabalho só pode ser aplicado a turma da mesma
  disciplina.
- **FR-006**: O professor da turma DEVE poder, por atividade: ver a situação de cada aluno
  matriculado (não iniciou, em andamento, entregou, entregou atrasado, não entregou), abrir cada
  entrega com as respostas e o gabarito, dar a nota de cada questão pendente (0 a valor da
  questão, em centésimos) com feedback opcional por questão e geral, e liberar o resultado da
  atividade. Ajustar uma nota depois de liberada DEVE ser possível, auditado, e passa a valer
  para o aluno imediatamente. A liberação é da atividade inteira; entregas ainda sem correção
  completa continuam ENTREGUE para o aluno até serem corrigidas, e então aparecem.
- **FR-006b**: Quando um aluno tem tentativa com respostas salvas e não entregou — prazo vencido
  numa atividade que não aceita atraso, ou atividade encerrada —, o professor DEVE poder aceitar
  essa tentativa como entrega: as respostas salvas viram a entrega, marcada como atrasada e como
  aceita pelo professor, corrigida pelas mesmas regras, e o fato é auditado. Assim uma falha
  transitória no fim do prazo nunca faz o aluno perder o trabalho (constituição III).

**Visibilidade e autorização do aluno**

- **FR-007**: O aluno DEVE ver somente atividades publicadas (data de publicação atingida pelo
  relógio do servidor) e não canceladas de turmas em que tem matrícula ACTIVE.
- **FR-008**: Toda operação do aluno DEVE derivar a identidade da sessão e verificar no servidor:
  matrícula ACTIVE do aluno na turma → atividade da turma → atividade publicada → tentativa ou
  entrega do próprio aluno. Identificadores de turma, atividade, tentativa, entrega ou usuário
  vindos do cliente NUNCA bastam. Recurso fora do contexto do aluno → `404`; falta de permissão
  → `403`.
- **FR-009**: O aluno NUNCA DEVE receber respostas, tentativas, entregas, notas ou feedback de
  outro aluno, nem a lista de alunos da turma.

**Dashboard e listas**

- **FR-010**: O sistema DEVE oferecer ao aluno um dashboard, que passa a ser sua página inicial,
  com: saudação pelo nome, contadores de PENDENTE, EM_ANDAMENTO, ATRASADO e concluídas (ENTREGUE
  + CORRIGIDO), e as próximas atividades não entregues ordenadas pelo prazo mais próximo (até 5),
  cada uma com título, turma/disciplina, tipo, prazo, situação e a ação adequada.
- **FR-011**: Atividades não entregues com prazo nas próximas 48 horas, e as atrasadas que ainda
  aceitam entrega, DEVEM ser destacadas como urgentes, com texto além da cor; as demais atrasadas
  mostram a situação "Atrasada" por texto, sem o destaque de urgência.
- **FR-012**: "Minhas atividades" DEVE listar todas as atividades do aluno, paginadas, filtráveis
  por situação (todas, pendentes, em andamento, entregues/concluídas, atrasadas) e por tipo,
  mostrando título, descrição resumida, tipo, turma/disciplina, professor, data de publicação,
  prazo, situação, nota quando liberada e indicador de feedback quando liberado.
- **FR-013**: O aluno DEVE continuar vendo suas turmas ("Minhas turmas", 003) a partir do
  portal.

**Situação do aluno na atividade**

- **FR-014**: A situação DEVE ser derivada no servidor, nunca enviada pelo cliente:
  - PENDENTE: sem tentativa, prazo não vencido;
  - EM_ANDAMENTO: tentativa iniciada e não entregue, prazo não vencido;
  - ATRASADO: sem entrega e prazo vencido (com ou sem tentativa);
  - ENTREGUE: entrega registrada e resultado não liberado (inclusive se já corrigida);
  - CORRIGIDO: entrega com correção completa e resultado liberado.
  Uma entrega feita depois do prazo, quando permitida, é ENTREGUE/CORRIGIDO com a marca
  "entregue com atraso".
- **FR-015**: Transições do aluno: PENDENTE → EM_ANDAMENTO → ENTREGUE → CORRIGIDO; PENDENTE ou
  EM_ANDAMENTO → ATRASADO pelo prazo; ATRASADO → ENTREGUE só se a atividade aceitar atraso. Nenhuma
  transição volta de ENTREGUE para EM_ANDAMENTO nesta feature (sem reabertura).

**Tentativa, respostas e salvamento**

- **FR-016**: Iniciar DEVE criar no máximo uma tentativa por aluno e atividade (garantido pelo
  banco de dados), idempotente sob cliques e abas repetidos.
- **FR-017**: Cada salvamento DEVE gravar no máximo uma resposta por questão da tentativa,
  sobrescrevendo a anterior (atualização idempotente); reenvios do mesmo conteúdo não criam
  registros nem eventos novos.
- **FR-018**: Salvamentos DEVEM ocorrer automaticamente durante a edição e na troca de questão;
  a interface DEVE mostrar o estado do salvamento com os textos oficiais do `SaveStatus` do
  contrato de Exam Mode (005): "Salvando…", "Resposta salva" e "Não foi possível salvar. Sua
  resposta continua na tela; tentaremos de novo. …", com "Tentar novamente", sem descartar o
  conteúdo da tela.
- **FR-019**: Sem conexão, a interface DEVE manter as respostas não enviadas no navegador do
  aluno, avisar que está sem conexão e enviá-las quando a conexão voltar; a cópia local é
  apagada após a entrega e ao sair da conta.
- **FR-020**: A resposta DEVE respeitar o tipo da questão: texto para Pergunta e resposta; uma
  alternativa da própria questão para Múltipla escolha; código para Código. Valores fora disso,
  questões de outra atividade e campos desconhecidos DEVEM ser recusados; respostas acima do
  limite de tamanho, recusadas com mensagem clara.
- **FR-021**: Salvar DEVE ser recusado depois da entrega, com a atividade encerrada ou
  cancelada, com a matrícula removida, com a turma não ACTIVE, e depois do prazo quando a atividade não aceita atraso.
- **FR-022**: A interface DEVE indicar a questão atual, permitir navegar entre as questões e
  marcar quais estão respondidas e quais não.

**Entrega**

- **FR-023**: Entregar DEVE exigir ação explícita e confirmação, que informa quantas questões
  estão em branco. Uma questão está em branco quando não tem resposta salva, quando a Múltipla
  escolha não tem alternativa marcada, quando o texto fica vazio depois de tirar os espaços, ou
  quando o código fica vazio depois de tirar os espaços ou igual ao código inicial.
- **FR-024**: A entrega DEVE, numa única operação consistente: validar aluno, matrícula ACTIVE,
  atividade publicada da turma, prazo pelo relógio do servidor (FR-024a) e situação; gravar as
  respostas enviadas junto; registrar a entrega com data e hora do servidor e a marca de
  atraso; e tornar a tentativa imutável.
- **FR-024a**: Depois do prazo, a regra escolhida pelo professor ao publicar DEVE valer: "não
  aceitar" recusa salvar e entregar (`409`, com motivo, respostas salvas preservadas e visíveis
  ao professor como não entregue); "aceitar" permite salvar e entregar até o encerramento da
  atividade pelo professor, registrando a entrega como atrasada. A regra pode ser alterada pelo
  professor enquanto a atividade não estiver encerrada; entregas já feitas não mudam.
- **FR-025**: A entrega DEVE ser idempotente: repetições (clique duplo, reenvio após queda)
  devolvem a mesma entrega, sem segunda entrega nem evento duplicado; salvamentos concorrentes
  nunca alteram uma entrega registrada.
- **FR-026**: Depois da entrega, a interface DEVE mostrar confirmação com data e hora, e a
  atividade fica somente leitura.

**Correção e resultado**

- **FR-027**: Ao registrar a entrega, o servidor DEVE corrigir as Múltiplas escolhas pela regra
  EXACT_MATCH da 011, sem IA. Pergunta e resposta e Código ficam pendentes de decisão do
  professor: nesta feature não há sugestão por IA (WorkEvaluationAgent) nem Code Runner, e falta
  de correção automática nunca vira nota zero (regras da 011).
- **FR-028**: A nota da entrega DEVE seguir a regra da 011: soma das notas finais das questões,
  em centésimos exatos, entre 0 e a nota total, parcial enquanto houver questão sem nota final.
  Vale para Exercício e Trabalho. Entrega atrasada não sofre desconto automático nesta feature.
- **FR-029**: Nota e feedback NUNCA DEVEM estar na resposta da API ao aluno antes da liberação
  do resultado pelo professor; a existência de nota no banco de dados não implica visibilidade.
- **FR-030**: Mesmo após a liberação, a visão do aluno NÃO DEVE conter resposta esperada,
  alternativa correta, solução de referência, rubrica, casos de teste privados, explicação nem
  pegadinha; ela só acrescenta a sua nota por questão, a nota total e o feedback do professor.

**Histórico**

- **FR-031**: O aluno DEVE ver o histórico das suas entregas (atividade, tipo, turma/disciplina,
  data da entrega, situação, marca de atraso, nota e feedback quando liberados) e abrir cada uma
  para ver suas respostas somente leitura.

**Visões e mensagens**

- **FR-032**: Toda visão do aluno DEVE ser montada no servidor a partir de lista fechada de
  campos permitidos (as visões de aluno da 010 FR-036/037 e da 011 FR-033/034, aplicadas ao
  snapshot), com contratos próprios distintos dos do professor.
- **FR-033**: Toda tela de dados DEVE ter os estados carregando, vazio, sucesso, erro e sem
  conexão, com mensagens distintas para vazio ("Nenhuma atividade pendente.") e erro ("Não foi
  possível carregar suas atividades.").
- **FR-034**: As telas DEVEM ser responsivas, operáveis por teclado e com o contraste e os
  componentes do Design System (005); situação e urgência nunca dependem só de cor.
- **FR-035**: Conteúdo produzido por aluno ou professor DEVE ser exibido como texto, nunca
  interpretado como HTML ou script.

**Fora do escopo (garantias)**

- **FR-036**: Esta feature NÃO DEVE implementar: provas, modo controlado, fullscreen, bloqueio
  de abas ou de copiar/colar, detecção de foco, cronômetro, eventos antifraude, encerramento
  automático por tempo, IA para o aluno, sugestão ou correção por IA, execução de código,
  upload de arquivo pelo aluno, reabertura de entrega, múltiplas tentativas, ranking,
  gamificação nem comunicação entre alunos.

### Security, Permissions & Audit *(mandatory if feature has protected operations)*

- **Permissions**: aluno — `atividades.proprias.visualizar` (dashboard, listas, atividade,
  histórico), `atividades.proprias.responder` (iniciar, salvar, entregar) e
  `notas.proprias.visualizar` (nota e feedback liberados; nome da constituição), concedidas a
  STUDENT. Professor — `atividades.aplicar` (aplicar, publicar, agendar, encerrar, cancelar),
  `atividades.visualizar`, `entregas.visualizar`, `notas.lancar` (nome da
  constituição) e `notas.liberar`, concedidas a TEACHER. Nenhuma a ADMIN ou MANAGER. Nenhuma
  checagem por nome de papel.
- **Resource context**: aluno — matrícula ACTIVE na turma da atividade, atividade publicada e
  não cancelada, tentativa/entrega do próprio aluno. Professor — professor responsável pela
  turma; itens do banco do próprio professor. Fora do contexto → `404`.
- **Audit events**: atividade aplicada/publicada (`ACTIVITY_PUBLISHED`), encerrada e cancelada;
  tentativa iniciada (`ACTIVITY_ATTEMPT_STARTED`); progresso salvo (`ACTIVITY_PROGRESS_SAVED`, no
  máximo um por tentativa a cada 15 minutos, com a quantidade de questões respondidas);
  entrega (`ACTIVITY_SUBMITTED`, com marca de atraso e quantidade em branco); entrega ou
  salvamento recusado (`ACTIVITY_SUBMISSION_REJECTED`, com o código do motivo); acesso negado a
  recurso de outro aluno ou turma (`STUDENT_ACCESS_DENIED`); correção do professor
  (`SUBMISSION_GRADED`); tentativa aceita como entrega pelo professor
  (`SUBMISSION_ACCEPTED_BY_TEACHER`); resultado liberado (`ACTIVITY_RESULT_RELEASED`); primeira visualização
  do resultado pelo aluno (`ACTIVITY_RESULT_VIEWED`). Cada evento tem ator, ação, recurso, data,
  resultado e correlação, no mesmo commit da operação (acesso negado e operação recusada, que não
  alteram nada, são gravados em transação própria). Metadados só com ids, contagens, enums e
  códigos — nunca resposta do aluno, enunciado, gabarito, nota em texto livre ou feedback.
- **Untrusted input**: identificadores do cliente nunca autorizam; campos desconhecidos, campos
  de situação, nota, data de entrega ou dono enviados pelo aluno são recusados (mass
  assignment); respostas com tipo, alternativa ou tamanho inválidos são recusadas; código do
  aluno é dado não confiável, nunca executado; todo texto de aluno é exibido escapado.
  Operações que alteram estado exigem origem permitida (proteção CSRF existente) e são limitadas por
  aluno (salvar, entregar) e por professor (aplicar, corrigir).
- **States & transitions**: atividade (ativa → encerrada; ativa ou encerrada → cancelada; agendada
  e publicada são fases derivadas da ativa); tentativa (EM_ANDAMENTO → ENTREGUE, imutável depois); correção por questão
  (pendente → corrigida pela regra ou pelo professor); resultado (não liberado → liberado). A
  situação do aluno é derivada (FR-014). Transição inválida → `409 INVALID_STATE_TRANSITION`.
- **Idempotency**: aplicar com chave de pedido; uma tentativa por aluno e atividade (restrição
  única); uma resposta por questão da tentativa (restrição única, sobrescrita); uma entrega por
  tentativa (restrição única + transição condicional); liberar algo liberado não muda nada nem
  gera evento.
- **Evidence vs. decisions**: respostas, horários de início, salvamento e entrega são FACT;
  correção de Múltipla escolha, cálculo da nota e situação derivada são RULE_RESULT; nota de
  Pergunta e resposta e Código, feedback e liberação são HUMAN_DECISION.
- **Automation risk level**: N/A — nenhuma operação de IA nesta feature.
- **Domain configurability**: nenhuma disciplina, linguagem ou tecnologia codificada; tipos de
  atividade, modos de execução e tipos de questão são conceitos da plataforma.
- **Sensitive data & adaptations**: respostas, entregas, notas e feedback são dados sensíveis de
  avaliação, visíveis só ao próprio aluno e ao professor da turma; nada é enviado à IA. Sem
  adaptações por aluno nesta feature.
- **Curricular traceability**: a atividade herda os vínculos de tópicos da ementa do item do
  banco (snapshot); ao aplicar, os tópicos fora do escopo ensinado da turma são sinalizados e
  exigem confirmação do professor (FR-005a, constituição XXIII).

### Key Entities *(include if feature involves data)*

- **Atividade da turma**: pertence a uma turma; tipo (Exercício, Trabalho; Prova reservada),
  modo de execução (NORMAL; CONTROLADO reservado), título, descrição/instruções, data de
  publicação, prazo, regra de atraso, estado, origem no banco (referência informativa) e nota total.
- **Questão da atividade**: cópia de uma questão do banco — posição, tipo, enunciado, valor,
  alternativas, código inicial, linguagem, casos de teste, gabarito e estratégia de correção.
  Só os campos permitidos chegam ao aluno.
- **Tentativa**: do aluno numa atividade (uma nesta versão, modelada para permitir mais no
  futuro); início, último salvamento, estado.
- **Resposta**: uma por questão da tentativa; conteúdo conforme o tipo e momento do último
  salvamento.
- **Entrega**: o registro imutável da tentativa entregue — data e hora do servidor, marca de
  atraso, quantidade em branco.
- **Correção da questão**: nota final por regra ou decisão do professor, feedback opcional,
  autor e data da decisão.
- **Resultado da atividade**: liberado ou não pelo professor, com data e autor da liberação;
  governa o que o aluno vê.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Um aluno identifica no dashboard a próxima atividade a fazer e o seu prazo em até
  10 segundos, sem rolar a página, em celular e desktop.
- **SC-002**: Em 100% dos testes de acesso cruzado (trocar ids de turma, atividade, tentativa,
  entrega e aluno), nenhum aluno lê ou altera dado de turma em que não está matriculado ou de
  outro aluno; todos respondem "não encontrado".
- **SC-003**: Em 100% das respostas ao aluno, nos três tipos de questão e em todas as situações
  (inclusive após a liberação), não há gabarito, solução, rubrica, caso de teste privado,
  explicação, pegadinha nem dado de correção.
- **SC-004**: Em 100% das respostas ao aluno anteriores à liberação, não há nota nem feedback,
  mesmo com a correção feita.
- **SC-005**: 0 respostas perdidas nos cenários de recarregar a página, fechar e reabrir o
  navegador, sair e entrar de novo e queda de conexão de até 5 minutos.
- **SC-006**: 0 entregas duplicadas e 0 tentativas duplicadas sob 10 pedidos simultâneos de
  iniciar ou de entregar a mesma atividade, e sob salvamento concorrente com a entrega.
- **SC-007**: A situação mostrada ao aluno coincide com a derivada pelas regras em 100% dos
  casos de teste, inclusive com o relógio do navegador adiantado ou atrasado.
- **SC-008**: Uma entrega feita pelo aluno aparece para o professor da turma imediatamente após
  a confirmação.
- **SC-009**: O aluno conclui o ciclo iniciar → responder → entregar de uma atividade de 5
  questões só com o teclado.
- **SC-010**: Toda tela do portal mostra estados distintos de carregando, vazio, erro e sem
  conexão nos testes de interface.
- **SC-011**: 100% das operações auditáveis listadas geram exatamente um evento, sem conteúdo de
  resposta, gabarito, nota em texto livre ou feedback nos metadados.
- **SC-012**: Nenhuma tela, rota ou contrato desta feature aceita ou mostra o tipo Prova ou o
  modo CONTROLADO.

## Assumptions

- **Fluxo do professor mínimo**: aplicar/publicar, receber, corrigir e liberar
  é construído só no necessário para fechar o ciclo; os bancos 010/011 não mudam.
- **Composição**: atividade de Trabalho = um trabalho do banco; atividade de Exercício = 1 a 10
  exercícios aprovados escolhidos pelo professor, na ordem que ele define.
- **Uma tentativa e uma entrega** por aluno e atividade; a constituição prevê múltiplas tentativas
  e feedback imediato para exercícios de prática — a modelagem permite, mas fica para spec
  futura. Sem reabertura de entrega.
- **Sem gabarito para o aluno nesta feature**: a liberação mostra nota e feedback; mostrar
  resposta esperada e solução ao aluno depois do encerramento fica para spec futura.
- **Sem IA e sem Code Runner**: Pergunta e resposta e Código são corrigidos pelo professor; o
  AI_REVIEW e o TEST_CASES da 011 continuam definidos e serão executados quando o
  WorkEvaluationAgent e o Code Runner chegarem.
- **Sem upload de arquivo**: nenhum trabalho existente tem entrega por arquivo; a seção de
  arquivos do pedido não se aplica.
- **Prazo e fuso**: o prazo é data e hora definidos pelo professor e comparados com o relógio do
  servidor; a interface mostra no fuso do navegador do aluno, com a data por extenso.
- **Urgência**: "urgente" = vence em até 48 horas; "próximas atividades" mostra até 5.
- **Página inicial**: o aluno passa a cair no dashboard em vez de "Minhas turmas"; contas também
  professoras continuam caindo em "Minhas disciplinas".
- **Escopo ensinado** (revisto no plano, research P5): a constituição XXIII diz que o modelo do
  banco, ao entrar numa atividade de turma, passa pela regra do escopo ensinado. Nesta feature o
  escopo é o conjunto de itens da ementa ligados a tópicos concluídos (004 US9) do planejamento da
  turma; tópicos fora dele são sinalizados e o professor confirma (FR-005a), sem emenda.
- **Limites**: limites de requisição por aluno para salvar e entregar e por professor para
  aplicar e corrigir são definidos no plano, no padrão das features anteriores.
- **Notificações**: sem e-mail ao publicar ou liberar nesta feature.
