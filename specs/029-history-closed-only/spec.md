# Feature Specification: Histórico só com provas e trabalhos encerrados ou cancelados

**Feature Branch**: `029-history-closed-only`
**Created**: 2026-11-23
**Status**: Draft
**Input**: User description: "Histórico do aluno só com provas e trabalhos encerrados ou cancelados pelo professor (muda a
emenda de 2026-11-23 da 028). (1) O Histórico (GET /me/history, tela /historico) mostra só trabalhos (ASSIGNMENT) e
provas (EXAM) com status CLOSED (encerrada pelo professor) ou CANCELLED (cancelada pelo professor), entregues ou não.
(2) Uma prova ou trabalho cancelado, que hoje some para o aluno, passa a aparecer no Histórico com a situação
"Cancelada", sem nota nem feedback; a entrega, se houver, aparece só como data. As demais rotas do aluno continuam
respondendo 404 para a atividade cancelada. (3) Uma prova ou trabalho ainda ativo fica em "Minhas atividades" mesmo
depois de entregue, ou quando não pode mais ser entregue, até o professor encerrar ou cancelar; aí passa para o
Histórico. (4) Exercícios nunca vão para o Histórico: ficam em "Minhas atividades", inclusive os concluídos. (5) Os
contadores do Painel e de "Minhas atividades" seguem essas regras; o "Concluídas" do Painel continua abrindo o
Histórico. (6) Continua da 028: cards, abas com contagem, busca por título, filtro de matéria, nota só depois da
liberação, tudo calculado no servidor e sem migração. Decidir no spec por qual data ordenar uma linha encerrada sem
entrega ou cancelada, e em que aba a cancelada aparece."

## Contexto: o que muda

A 028 (mergeada em 2026-11-23, PR #64) redesenhou o Histórico e, pela emenda do mesmo dia, passou para ele tudo o que o
aluno já entregou ou não pode mais entregar, deixando "Minhas atividades" só com o que ainda dá para fazer. No uso real,
o professor quer outra fronteira: uma atividade só vira "história" quando **ele** a encerra ou cancela. Enquanto está
ativa, ela continua na lista de trabalho do aluno, entregue ou não. Exercícios (pontos, sem nota, 013) são prática e
nunca entram no Histórico.

| Ponto | Depois da 028 (emenda) | Depois desta feature |
|-------|------------------------|----------------------|
| O que entra no Histórico | Toda entrega (trabalho, prova, exercício) e toda atividade que não aceita mais entrega | Só trabalhos e provas **encerrados** ou **cancelados** pelo professor, entregues ou não |
| Trabalho ou prova ativo e entregue | Histórico | "Minhas atividades" (Entregue / Corrigida) até o professor encerrar ou cancelar |
| Trabalho ou prova ativo que não aceita mais entrega (prazo vencido sem atraso, janela da prova fechada) | Histórico, "Não entregues" | "Minhas atividades" ("Atrasada") até o professor encerrar ou cancelar |
| Atividade de disciplina ou turma encerrada/arquivada | Histórico, "Não entregues" (se sem entrega) | Segue o status da própria atividade (ver Assumptions) |
| Exercício | Histórico quando concluído | Sempre em "Minhas atividades" |
| Trabalho ou prova cancelado | Some para o aluno | Histórico, aba "Canceladas", pílula "Cancelada", sem nota nem feedback, sem link |
| Filtro "Entregues/concluídas" de "Minhas atividades" | Removido (`400`) | Volta a existir |
| Painel "Concluídas" | Conta as entregas; abre o Histórico | Conta as atividades do Histórico; abre o Histórico |
| Painel "Atrasadas" | Só as que ainda aceitam entrega | Todas as atrasadas sem entrega de "Minhas atividades" |
| Cards, abas com contagem, busca, matéria, nota só após liberação, cálculo no servidor | — | **Não mudam** (as abas ganham "Canceladas") |

## Clarifications

### Session 2026-11-23 (decisões do usuário antes do spec)

- Q: O que o Histórico mostra? → A: Só provas e trabalhos que o professor encerrou ou cancelou.
- Q: Como aparece uma prova ou trabalho cancelado? → A: Com o selo "Cancelada", sem nota; a entrega, se houver, só como
  data.
- Q: Onde fica uma prova ou trabalho entregue mas ainda ativo? → A: Em "Minhas atividades", até o professor encerrar.
- Q: E os exercícios? → A: Ficam em "Minhas atividades", inclusive os concluídos; nunca no Histórico.
- Q: Emenda na 028 ou feature nova? → A: Feature nova (029), porque a 028 já está na `main`.

### Session 2026-11-23 (análise antes da implementação)

- Q: Uma prova encerrada com a tentativa à espera da decisão do professor conta nos cards? → A: Sim. Está em
  "Aguardando" e conta em "Atividades entregues" e "Aguardando correção", para os cards baterem com as abas.
- Q: O que o card "Concluídas" do Painel conta? → A: Todas as linhas do Histórico (a aba "Todas"), não entregues e
  canceladas incluídas: o mesmo número que o aluno encontra ao abri-lo.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - O Histórico só com o que o professor encerrou (Priority: P1)

O aluno abre o Histórico e vê só os trabalhos e as provas que o professor já encerrou: os que ele entregou (aguardando
correção ou corrigidos) e os que ele não entregou. Uma prova que ele acabou de entregar, mas que o professor ainda não
encerrou, não está ali: continua em "Minhas atividades".

**Why this priority**: é a mudança central; sem ela as duas telas continuam com a fronteira da 028.

**Independent Test**: com um trabalho ativo entregue, um trabalho encerrado entregue e corrigido, uma prova encerrada sem
entrega e um exercício concluído, abrir o Histórico e conferir que só os dois encerrados aparecem, com os cards e as
abas certos.

**Acceptance Scenarios**:

1. **Given** um trabalho ou prova encerrado pelo professor com entrega do aluno, **When** o aluno abre o Histórico,
   **Then** ele aparece em "Todas" e em "Aguardando" ou "Corrigidas" (pelas regras da 028), e conta nos cards.
2. **Given** um trabalho ou prova encerrado sem entrega do aluno, **When** o aluno abre o Histórico, **Then** ele aparece
   em "Todas" e "Não entregues", com a pílula "Não entregue" e "—" na Nota, e não conta nos cards.
3. **Given** um trabalho ou prova ainda ativo, entregue ou não, **When** o aluno abre o Histórico, **Then** ele não
   aparece em nenhuma aba nem contagem.
4. **Given** um exercício, concluído ou não, ativo ou encerrado, **When** o aluno abre o Histórico, **Then** ele não
   aparece em nenhuma aba nem contagem.
5. **Given** um trabalho ativo entregue que o professor encerra, **When** o aluno recarrega (ou a consulta periódica
   roda), **Then** ele sai de "Minhas atividades" e passa a aparecer no Histórico.
6. **Given** o Histórico sem nenhuma atividade, **When** aberto, **Then** os cards são 0 e a tela diz "Nenhuma atividade
   encerrada ainda.".

---

### User Story 2 - Provas e trabalhos cancelados no Histórico (Priority: P1)

O professor cancelou uma prova. Hoje ela some para o aluno, que fica sem saber o que houve. Agora ela aparece no
Histórico com a situação "Cancelada", sem nota, e o aluno entende que não precisa mais fazer nada.

**Why this priority**: é o único caso em que o aluno passa a ver algo que hoje não vê; precisa ser seguro (nenhuma nota,
feedback ou conteúdo da atividade cancelada).

**Independent Test**: com um trabalho cancelado que o aluno tinha entregue e corrigido com nota liberada, e uma prova
cancelada sem entrega, abrir o Histórico e conferir a aba "Canceladas", a pílula, a falta de nota e de link, e que as
outras rotas da atividade continuam respondendo `404`.

**Acceptance Scenarios**:

1. **Given** um trabalho ou prova cancelado pelo professor, publicado e liberado para o aluno antes do cancelamento,
   **When** o aluno abre o Histórico, **Then** ele aparece em "Todas" e na aba "Canceladas", com a pílula "Cancelada".
2. **Given** um cancelado em que o aluno tinha entregue, **When** exibido, **Then** a linha mostra a data da entrega
   (como na 028) e "—" na Nota, sem nota nem feedback, mesmo que o resultado tenha sido liberado antes do
   cancelamento.
3. **Given** um cancelado sem entrega, **When** exibido, **Then** a linha mostra "Cancelada em <data>" e "—" na Nota.
4. **Given** uma linha cancelada, **When** exibida, **Then** ela não tem link para a atividade, nem "Ver atividade", nem
   seta; e as rotas da atividade para o aluno (página, tentativa, resultado) continuam respondendo `404`, como hoje.
5. **Given** uma atividade cancelada antes de ser publicada, ou que nunca foi liberada para o aluno (016: sem presença
   marcada), **When** o aluno abre o Histórico, **Then** ela não aparece.
6. **Given** canceladas, **When** os cards são calculados, **Then** elas não contam em "Atividades entregues", "Aguardando
   correção" nem "Atividades corrigidas".

---

### User Story 3 - "Minhas atividades" e o Painel com tudo o que está ativo (Priority: P1)

O aluno entregou um trabalho que ainda está ativo. Ele continua em "Minhas atividades" como "Entregue" (ou "Corrigida",
depois da liberação), e aparece no filtro "Entregues/concluídas". Os exercícios concluídos também continuam lá. O Painel
conta isso de acordo, e o "Concluídas" leva ao Histórico.

**Why this priority**: sem isso, uma atividade entregue e ainda ativa sumiria das duas telas.

**Independent Test**: com uma atividade de cada situação (pendente, em andamento, atrasada aceitando entrega, atrasada
sem aceitar, entregue ativa, corrigida ativa, exercício concluído, trabalho encerrado, prova cancelada), abrir "Minhas
atividades", o Painel e o Histórico e conferir que cada uma está em exatamente uma das duas telas e que as contagens
batem.

**Acceptance Scenarios**:

1. **Given** um trabalho ou prova ativo entregue, **When** o aluno abre "Minhas atividades", **Then** ele aparece com
   "Entregue" ou "Corrigida" (pelas regras de hoje da 012), em "Todas" e no filtro "Entregues/concluídas".
2. **Given** um exercício concluído (ativo ou encerrado), **When** o aluno abre "Minhas atividades", **Then** ele aparece
   com "Concluída", em "Todas" e no filtro "Entregues/concluídas", e o aluno pode "Tentar novamente" como hoje (013).
3. **Given** um trabalho ou prova ativo sem entrega que não aceita mais entrega (prazo vencido sem aceitar atraso, janela
   de início da prova fechada), **When** o aluno abre "Minhas atividades", **Then** ele aparece como "Atrasada", em
   "Todas" e no filtro "Atrasadas".
4. **Given** um trabalho ou prova encerrado ou cancelado, **When** o aluno abre "Minhas atividades" ou o Painel, **Then**
   ele não aparece em nenhum filtro, lista ou contagem.
5. **Given** o Painel, **When** exibido, **Then** "Pendentes", "Em andamento" e "Atrasadas" contam as atividades de
   "Minhas atividades" nessas situações, e "Concluídas" conta as atividades do Histórico (todas as abas) e abre o
   Histórico com a mesma matéria.
6. **Given** um endereço de "Minhas atividades" com `?situacao=concluidas`, **When** aberto, **Then** o filtro
   "Entregues/concluídas" vem escolhido.

---

### Edge Cases

- Uma prova encerrada com uma tentativa retida à espera da decisão do professor (018): aparece no Histórico em
  "Aguardando", sem nota, com "Encerrada em …", e conta nos cards "Atividades entregues" e "Aguardando correção" até
  a decisão; nunca como "Não entregue".
- Um trabalho ou prova cancelado depois de uma prova "zerada" por decisão do professor (018 "cancelar" a tentativa):
  quem decide é o status da atividade; cancelada a atividade, a linha é "Cancelada", sem nota.
- O cancelamento da **tentativa** de uma prova (decisão 018) não é o cancelamento da atividade: a prova ativa continua em
  "Minhas atividades"; encerrada, entra no Histórico como entrega, com a nota (zero) só depois da liberação.
- Uma atividade encerrada não é reaberta (a 012 só permite ACTIVE → CLOSED, ACTIVE → CANCELLED e CLOSED → CANCELLED);
  uma encerrada que o professor depois cancela passa de "Não entregues"/entregas para "Canceladas" na próxima leitura.
- Um trabalho em grupo (023): encerrado ou cancelado, aparece uma vez para cada membro, com a entrega do grupo.
- A matrícula encerrada: as atividades dessa turma deixam as duas telas, como hoje.
- A ordem da lista: "Mais recentes primeiro" pela data da linha (FR-006); empates com ordem estável entre páginas.
- Busca e matéria valem para as canceladas como para as outras linhas.
- O nome de uma atividade cancelada aparece como texto, nunca HTML.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: O Histórico MUST conter só os trabalhos e as provas do aluno cujo status é **encerrada** ou **cancelada**
  pelo professor, entregues ou não, das turmas de matrícula ativa e liberados para o aluno (publicados e, quando a
  atividade exige chamada, com a presença do aluno marcada, 016), derivado a cada leitura. Exercícios e atividades ativas
  MUST NOT aparecer nele.
- **FR-002**: Cada linha do Histórico MUST estar em exatamente uma situação: **cancelada** (atividade cancelada),
  **não entregue** (encerrada, sem entrega), **corrigida** ou **aguardando** (encerrada, com entrega, pelas regras de
  liberação da 028 FR-002; uma prova encerrada com tentativa retida conta como aguardando).
- **FR-003**: O Histórico MUST ter as abas "Todas", "Aguardando", "Corrigidas", "Não entregues" e "Canceladas",
  cada uma com a sua contagem; "Todas" soma as cinco situações.
- **FR-004**: Os cards "Atividades entregues", "Aguardando correção" e "Atividades corrigidas" MUST contar só as linhas
  aguardando e corrigida ("Atividades entregues" = aguardando + corrigida, a prova encerrada retida incluída em
  aguardando); canceladas e não entregues MUST NOT contar.
- **FR-005**: Uma linha cancelada MUST mostrar a pílula "Cancelada", "—" na Nota, nenhuma nota, barra ou feedback (mesmo
  com resultado liberado antes do cancelamento), e nenhum link para a atividade. As rotas da atividade cancelada para o
  aluno MUST continuar respondendo `404` (012).
- **FR-006**: A data de cada linha (mostrada e usada na ordem "Mais recentes primeiro") MUST ser: a data da entrega,
  quando houver (encerrada ou cancelada), mostrada como na 028; senão, a data do encerramento ("Encerrada em …") ou do
  cancelamento ("Cancelada em …").
- **FR-007**: "Minhas atividades" MUST conter todos os exercícios visíveis ao aluno e os trabalhos e provas **ativos**,
  em qualquer situação de hoje da 012/013 (pendente, em andamento, atrasada, entregue, corrigida, concluída), e MUST NOT
  conter trabalhos ou provas encerrados ou cancelados.
- **FR-008**: O filtro "Entregues/concluídas" de "Minhas atividades" MUST voltar a existir (no servidor, a situação
  `COMPLETED` volta a ser aceita), com as entregues, corrigidas e concluídas da lista.
- **FR-009**: No Painel, "Pendentes", "Em andamento" e "Atrasadas" MUST contar as atividades de "Minhas atividades" nessas
  situações ("Atrasadas" inclui as que não aceitam mais entrega), e "Concluídas" MUST contar as linhas do Histórico com a
  mesma matéria e abrir o Histórico com essa matéria.
- **FR-010**: MUST continuar valendo da 028: cards, abas com contagem calculadas no servidor sobre tudo (não só a página
  carregada), busca por título (contém, sem diferenciar maiúsculas, minúsculas e acentos, até 100 caracteres, fora dos
  logs), filtro "Matéria" (026, `404` igual para matéria de outro aluno, encerrada ou inexistente), aba, busca e matéria
  no endereço, paginação estável, nota só depois da liberação com correção completa e permissão, linhas como texto.
- **FR-011**: Os estados vazios MUST ser: Histórico sem linhas — "Nenhuma atividade encerrada ainda."; aba "Canceladas"
  vazia — "Nenhuma atividade cancelada."; os demais como na 028.
- **FR-012**: Nada MUST ser guardado: situação, aba e data são derivadas a cada leitura; nenhuma migração.

### Security, Permissions & Audit

- **Permissions**: nenhuma nova; `atividades.proprias.visualizar` e, para notas, `notas.proprias.visualizar`, como hoje.
- **Resource context**: só as atividades do próprio aluno, de turmas com matrícula ativa, publicadas e liberadas para ele
  (016). A atividade cancelada entra só no Histórico, só com os campos da linha (FR-005); nenhuma outra rota passa a
  servi-la.
- **Audit events**: nenhum novo (leituras). Ver o Histórico não registra resultado visto.
- **Untrusted input**: como na 028; a aba ganha o valor "Canceladas" da lista fechada; a situação `COMPLETED` volta a ser
  aceita na lista de atividades.
- **States & transitions**: nenhum estado novo; "cancelada" e "não entregue" são derivados do status da atividade, nunca
  guardados.
- **Idempotency**: só leituras.
- **Evidence vs. decisions**: N/A.
- **Automation risk level**: N/A (sem IA).
- **Domain configurability**: nada de turma, disciplina ou tipo fixo além dos tipos já existentes.
- **Sensitive data & adaptations**: a linha cancelada não leva nota, feedback, enunciado nem resposta; nenhum dado novo.
- **Curricular traceability**: N/A.

### Key Entities

- **Linha do Histórico**: um trabalho ou prova encerrado ou cancelado do aluno, com a situação derivada (aguardando,
  corrigida, não entregue, cancelada) e a data da linha (FR-006).
- **Atividade de "Minhas atividades"**: um exercício, ou um trabalho ou prova ativo, com a situação de hoje da 012/013.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Para um aluno com atividades em cada situação (pendente, em andamento, atrasada aceitando e não aceitando
  entrega, entregue ativa, corrigida ativa, exercício concluído ativo e encerrado, trabalho encerrado entregue, prova
  encerrada sem entrega, prova encerrada retida, trabalho cancelado entregue, prova cancelada sem entrega), cada uma aparece
  em exatamente uma das duas telas, na situação esperada, em 100% dos casos, e as contagens do Painel, das abas e dos cards
  batem com isso.
- **SC-002**: 0 notas, barras ou feedbacks aparecem, na tela ou nas respostas do servidor, para linhas canceladas ou para
  entregas sem liberação com correção completa, em qualquer combinação de aba, busca e matéria.
- **SC-003**: 0 atividades canceladas antes da publicação, ou nunca liberadas para o aluno, aparecem no Histórico; as
  rotas de uma atividade cancelada continuam respondendo `404` ao aluno.
- **SC-004**: Uma busca ou troca de aba ou matéria no Histórico mostra o resultado em até 2 segundos com até 500 linhas
  no histórico do aluno.
- **SC-005**: As expectativas dos testes existentes mudam só onde a emenda da 028 tirou atividades de "Minhas atividades"
  ou do Painel, ou pôs exercícios e atividades ativas no Histórico; cada mudança cita `029/FR-001`, `029/FR-007` ou
  `029/FR-009`.
- **SC-006**: A tela passa nas verificações automáticas de acessibilidade e contraste nos temas escuro e claro e não tem
  rolagem horizontal na largura de 360 px.

## Assumptions

- "Encerrada" e "cancelada" são o status da própria atividade, mudado pelo professor. Uma atividade ativa de uma
  disciplina ou turma encerrada ou arquivada (027) não entra no Histórico por isso: continua em "Minhas atividades"
  enquanto a matrícula estiver ativa, como antes da emenda da 028.
- Um trabalho ou prova ativo que não aceita mais entrega volta a ser "Atrasada" em "Minhas atividades", como era antes da
  emenda da 028.
- A situação de uma linha encerrada com entrega segue a 028 (aguardando/corrigida), inclusive a regra da permissão de
  ver notas.
- Em "Minhas atividades", entregue, corrigida e concluída voltam a aparecer como antes da emenda da 028 (012/013).
- A consulta periódica de 5 s das telas do aluno continua valendo; o encerramento ou cancelamento chega ao aluno por ela.
- A página de uma atividade encerrada continua abrindo, só para leitura, pelo link da linha do Histórico.
