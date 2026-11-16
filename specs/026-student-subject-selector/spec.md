# Feature Specification: Matéria atual do aluno no Painel e em "Minhas atividades"

**Feature Branch**: `026-student-subject-selector`
**Created**: 2026-11-16
**Status**: Draft
**Input**: User description: "Matéria atual do aluno: em "Minhas atividades" e no "Painel", um card no topo mostra a
matéria que o aluno está vendo (disciplina · turma, como "Object Oriented Programming · ADS 3NA") e permite trocar
entre as matérias das turmas em que ele está matriculado (matrícula ativa). As telas nunca misturam matérias: sempre
uma de cada vez, sem opção "Todas"; ao abrir, vale a primeira matéria do aluno (a matrícula mais recente) e a escolha
fica na URL. Em "Minhas atividades", os cartões de resumo, os filtros (situação, tipo), a contagem e a lista valem só
para a matéria escolhida. No "Painel", os contadores, as próximas atividades, as atrasadas e o ranking ficam só dessa
matéria. A API passa a filtrar a lista e o painel do aluno por turma (só turmas da matrícula ativa do próprio aluno;
outra turma responde como inexistente, sem revelar) e "Minhas turmas" passa a trazer o nome da disciplina. Sem
mudança nos bancos, nas notas ou na liberação; um aluno sem matrícula ativa vê o estado vazio de hoje."

## Contexto: o que muda

Na escola, uma turma como "ADS 3NA" tem várias matérias na semana (Java, SQL, Python…). No DevTrack, cada turma é a
oferta de **uma** disciplina por um professor (004 E2), então o aluno de "ADS 3NA" está matriculado em várias turmas,
uma por matéria. Hoje o Painel e "Minhas atividades" (012, visual de 2026-11-16) juntam as atividades de todas essas
turmas numa lista só, e o aluno precisa ler o nome da disciplina em cada cartão para saber de qual matéria é cada
atividade. Os cartões de resumo de "Minhas atividades" somam notas de matérias diferentes.

Esta feature põe no topo das duas telas um card com a **matéria atual** ("Object Oriented Programming · ADS 3NA"),
por onde o aluno troca de matéria. As duas telas passam a mostrar sempre uma matéria por vez.

| Ponto | Hoje | Depois desta feature |
|-------|------|----------------------|
| Em qual matéria estou? | Lido em cada cartão | Um card no topo do Painel e de "Minhas atividades" diz a matéria e permite trocar |
| Lista de "Minhas atividades" | Todas as matérias juntas | Só a matéria escolhida; filtros de situação e tipo continuam, dentro dela |
| Cartões de resumo de "Minhas atividades" | Somam todas as matérias exibidas | Só a matéria escolhida |
| Painel: contadores, próximas, atrasadas | Todas as matérias | Só a matéria escolhida |
| Painel: ranking | Um cartão por turma | Só o ranking da turma da matéria escolhida |
| "Minhas turmas" | Turma, código, período, professor | Também o nome da disciplina |
| Notas, liberação, bancos, histórico, página da atividade | — | **Não mudam** |

## Clarifications

### Session 2026-11-16

- Q: O aluno pode ver todas as matérias juntas? → A: Não. Sempre uma matéria por vez, sem opção "Todas".
- Q: Em quais telas entra o card? → A: Painel e "Minhas atividades". O Histórico e as demais telas não mudam.
- Q: Qual matéria abre primeiro? → A: A da matrícula ativa mais recente do aluno (a primeira de "Minhas turmas").
- Q: Onde fica a escolha? → A: No endereço da página, para que recarregar, voltar e compartilhar o link mantenham a
  matéria.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Aluno vê e troca a matéria em "Minhas atividades" (Priority: P1)

Ao abrir "Minhas atividades", o aluno vê no topo um card "Matéria" com "Object Oriented Programming · ADS 3NA". Os
cartões de resumo, a contagem e a lista mostram só as atividades dessa matéria. Ele abre o card, escolhe "Banco de
Dados · ADS 3NA" e a tela passa a mostrar só as atividades de Banco de Dados, mantendo os filtros de situação e tipo
que estavam escolhidos.

**Why this priority**: é o pedido central: as atividades não podem misturar matérias.

**Independent Test**: com um aluno matriculado em duas turmas (duas matérias), cada uma com atividades, abrir
"Minhas atividades", conferir que só aparecem as atividades da primeira matéria, trocar de matéria e conferir que só
aparecem as da segunda, com os cartões de resumo recalculados.

**Acceptance Scenarios**:

1. **Given** um aluno com matrícula ativa em duas turmas, **When** abre "Minhas atividades" sem matéria no endereço,
   **Then** o card mostra a matéria da matrícula mais recente ("<disciplina> · <turma>") e a lista, a contagem e os
   cartões de resumo mostram só atividades dessa turma.
2. **Given** a tela numa matéria, **When** o aluno escolhe outra matéria no card, **Then** a lista, a contagem e os
   cartões de resumo passam a mostrar só atividades da turma escolhida, e o endereço da página passa a indicar essa
   matéria.
3. **Given** filtros de situação ou tipo ativos, **When** o aluno troca de matéria, **Then** os filtros continuam
   valendo na nova matéria; "Limpar filtros" limpa só situação e tipo, nunca a matéria.
4. **Given** uma matéria sem nenhuma atividade (ou sem nenhuma com os filtros), **When** escolhida, **Then** a tela
   mostra o estado vazio de hoje ("Você ainda não tem atividades." ou "Nenhuma atividade com esses filtros."),
   e o card continua permitindo trocar de matéria.
5. **Given** mais de uma página de atividades na matéria, **When** o aluno usa "Carregar mais", **Then** as páginas
   seguintes também são só dessa matéria.
6. **Given** uma turma sem disciplina (anterior à 004), **When** aparece no card, **Then** mostra só o nome da turma.
7. **Given** o card, **When** exibido, **Then** tem nome acessível ("Matéria"), funciona por teclado, diz a matéria
   em texto (nunca só por cor ou ícone) e funciona nos temas escuro e claro e na largura de celular.

---

### User Story 2 - Painel por matéria (Priority: P1)

Ao abrir o Painel, o aluno vê o mesmo card de matéria no topo. Os contadores (Pendentes, Em andamento, Atrasadas,
Concluídas), as próximas atividades, as atrasadas que ainda aceitam entrega e o ranking são só dessa matéria. Ao
tocar num contador ou em "Ver todas", ele chega em "Minhas atividades" já na mesma matéria.

**Why this priority**: o Painel é a primeira tela do aluno; misturar matérias ali confunde tanto quanto na lista.

**Independent Test**: com o mesmo aluno de duas matérias, abrir o Painel, conferir contadores, próximas, atrasadas e
ranking só da primeira matéria, trocar de matéria e conferir que tudo muda; tocar em "Pendentes" e conferir que
"Minhas atividades" abre na mesma matéria com o filtro de pendentes.

**Acceptance Scenarios**:

1. **Given** um aluno com duas matérias, **When** abre o Painel sem matéria no endereço, **Then** o card mostra a
   matéria da matrícula mais recente e os contadores, as próximas atividades e as atrasadas contam só essa turma.
2. **Given** o Painel numa matéria, **When** o aluno troca de matéria no card, **Then** contadores, próximas,
   atrasadas e ranking passam a ser da nova matéria.
3. **Given** o Painel numa matéria, **When** exibido, **Then** o ranking mostra só o da turma dessa matéria, com o
   destaque "Seu desempenho" só se o aluno estiver no top 5 dela; os rankings de outras turmas não aparecem.
4. **Given** o Painel numa matéria, **When** o aluno toca num contador ou em "Ver todas", **Then** "Minhas
   atividades" abre nessa mesma matéria (com o filtro do contador, quando houver).
5. **Given** a matéria escolhida no Painel, **When** o aluno vai para "Minhas atividades" pelo menu, **Then** a lista
   abre na matéria da matrícula mais recente, a menos que o endereço indique outra (a escolha não é guardada fora do
   endereço).

---

### User Story 3 - Só as matérias do próprio aluno (Priority: P1)

O card lista apenas as matérias das turmas em que o aluno tem matrícula ativa. Um endereço com uma turma que não é
dele (de outro aluno, encerrada, ou que não existe) nunca mostra atividades dessa turma nem revela se ela existe.

**Why this priority**: um filtro por turma vindo do navegador é uma entrada não confiável; sem esta regra, o aluno
poderia tentar ler atividades de turmas alheias.

**Independent Test**: com o aluno A, abrir as duas telas com a turma de uma matrícula encerrada dele, com uma turma
só do aluno B e com um identificador inexistente, e conferir que nenhuma atividade dessas turmas aparece e que as
três respostas são indistinguíveis.

**Acceptance Scenarios**:

1. **Given** o card aberto, **When** exibido, **Then** lista só as turmas com matrícula ativa do aluno, na ordem de
   "Minhas turmas" (matrícula mais recente primeiro).
2. **Given** um pedido da lista ou do painel com uma turma em que o aluno não tem matrícula ativa (de outro aluno,
   matrícula encerrada ou turma inexistente), **When** chega ao servidor, **Then** a resposta é a mesma de um recurso
   inexistente (`404`), igual nos três casos, sem dizer se a turma existe, e nenhuma atividade é devolvida; um
   identificador mal formado é recusado como entrada inválida (`400`) antes de qualquer consulta.
3. **Given** o endereço da página com uma turma que não é mais do aluno, **When** a tela abre, **Then** ela volta
   para a matéria da matrícula mais recente e avisa "Essa matéria não está mais disponível para você.", sem mostrar
   nada da turma pedida.
4. **Given** um aluno sem nenhuma matrícula ativa, **When** abre o Painel ou "Minhas atividades", **Then** vê o estado
   vazio de hoje, sem card de matéria.
5. **Given** a turma escolhida, **When** o aluno não foi marcado presente numa atividade da 016, **Then** essa
   atividade continua fora da lista, como hoje.
6. **Given** a matrícula do aluno encerrada enquanto ele está na tela, **When** a tela se atualiza, **Then** passa a
   valer o item 3.

---

### User Story 4 - "Minhas turmas" com a disciplina (Priority: P3)

Em "Minhas turmas", cada turma mostra também o nome da disciplina, o mesmo texto do card de matéria.

**Why this priority**: alinha as duas telas, mas o card de matéria já funciona sem isto na tela de turmas.

**Independent Test**: abrir "Minhas turmas" com o aluno de duas matérias e conferir o nome da disciplina em cada
turma.

**Acceptance Scenarios**:

1. **Given** um aluno com turmas de disciplinas diferentes, **When** abre "Minhas turmas", **Then** cada turma mostra
   o nome da disciplina.
2. **Given** uma turma sem disciplina, **When** listada, **Then** mostra só o que mostra hoje.

---

### Edge Cases

- O aluno tem uma única matrícula ativa: o card mostra a matéria sem nada para trocar (fica claro que é a única).
- Duas turmas da mesma disciplina (por exemplo, a mesma matéria em períodos diferentes, ambas com matrícula ativa):
  aparecem como dois itens; o texto "<disciplina> · <turma>" os distingue e, se ainda empatar, o período e o professor
  completam.
- A turma escolhida é arquivada pelo professor: segue as regras de hoje para turma arquivada; se a matrícula deixa de
  estar ativa, vale User Story 3, cenário 3.
- Um trabalho em grupo (023), uma prova (018) ou um exercício (013) da turma: aparecem na matéria da turma como hoje,
  sem mudança no que cada cartão mostra.
- O endereço tem matéria, situação e tipo inválidos ao mesmo tempo: situação e tipo inválidos são ignorados como hoje
  (012); a matéria segue User Story 3, cenário 3.
- O aluno abre um link antigo de "Minhas atividades" sem matéria (salvo antes desta feature): abre na matéria da
  matrícula mais recente.
- O Histórico continua listando todas as matérias juntas (fora do escopo).

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: O Painel e "Minhas atividades" MUST mostrar no topo um card "Matéria" com a matéria atual escrita como
  "<disciplina> · <turma>" (só "<turma>" quando a turma não tem disciplina), a partir do qual o aluno troca de matéria.
- **FR-002**: O card MUST listar só as turmas em que o aluno tem matrícula ativa, na ordem de "Minhas turmas"
  (matrícula mais recente primeiro), e MUST NOT oferecer uma opção que junte matérias ("Todas").
- **FR-003**: Sem matéria no endereço, as duas telas MUST abrir na turma da matrícula ativa mais recente do aluno.
- **FR-004**: A matéria escolhida MUST ficar no endereço da página, de modo que recarregar, voltar e abrir o link
  mantenham a matéria; ela MUST NOT ser guardada no navegador nem na conta.
- **FR-005**: Em "Minhas atividades", a lista, "Carregar mais", a contagem ("Exibindo N atividades") e os cartões de
  resumo MUST considerar só as atividades da turma escolhida; os filtros de situação e tipo MUST continuar
  funcionando dentro dela, e "Limpar filtros" MUST NOT mudar a matéria.
- **FR-006**: No Painel, os contadores, as próximas atividades, as atrasadas que ainda aceitam entrega e o ranking MUST
  considerar só a turma escolhida; o destaque "Seu desempenho" segue a regra de hoje (só com o aluno no top 5), agora
  dessa turma.
- **FR-007**: Os links do Painel para "Minhas atividades" (contadores, "Ver todas") MUST levar a matéria escolhida.
- **FR-008**: O servidor MUST aceitar, na lista de atividades do aluno e no painel do aluno, a indicação de uma turma, e
  MUST devolver só atividades dessa turma; sem a indicação, as respostas MUST continuar como hoje (compatibilidade).
- **FR-009**: Uma turma em que o aluno não tem matrícula ativa (de outro aluno, matrícula encerrada ou inexistente)
  MUST ser respondida como recurso inexistente (`404`), igual nos três casos e sem devolver atividade alguma; um
  identificador mal formado MUST ser recusado como entrada inválida (`400`) antes de qualquer consulta, nunca como erro
  do servidor.
- **FR-010**: Com a turma indicada, todas as regras de hoje sobre o que o aluno vê MUST continuar valendo: só
  atividades publicadas, a chamada da 016 (aluno não marcado presente não vê o trabalho), nenhuma nota antes da
  liberação (012), pontos de exercício nunca como nota (013) e os cartões montados pela lista permitida da visão do
  aluno.
- **FR-011**: Se o endereço indicar uma turma que o aluno não pode ver, a tela MUST voltar para a matéria da matrícula
  mais recente e mostrar "Essa matéria não está mais disponível para você.", sem nenhum dado da turma pedida.
- **FR-012**: Um aluno sem matrícula ativa MUST ver nas duas telas o estado vazio de hoje, sem card de matéria.
- **FR-013**: "Minhas turmas" MUST trazer o nome da disciplina de cada turma (vazio quando a turma não tem disciplina)
  e a tela "Minhas turmas" MUST mostrá-lo.
- **FR-014**: O card MUST ter nome acessível, ser operável por teclado, anunciar a matéria em texto e usar só tokens e
  componentes do Design System, nos temas escuro e claro e na largura de celular.
- **FR-015**: A consulta periódica do Painel e da lista (5 s com a página visível, 016) MUST continuar, agora com a
  matéria escolhida.

### Security, Permissions & Audit

- **Permissions**: nenhuma permissão nova. As telas e as rotas continuam exigindo `atividades.proprias.visualizar`; o
  ranking no Painel continua exigindo `ranking.turma.visualizar` (013); "Minhas turmas" continua com a permissão de hoje.
- **Resource context**: a turma indicada só vale se o próprio aluno tiver matrícula **ativa** nela; a checagem é do
  servidor, em consulta com escopo do aluno, nunca do navegador. Fora disso, `404` sem revelar existência.
- **Audit events**: nenhum evento novo. São leituras; o tratamento de acesso negado segue o de hoje para turma alheia
  (mesmo comportamento do ranking da turma do aluno, 013).
- **Untrusted input**: o identificador da turma vem do endereço da página: validado no formato (identificador
  universal) e checado contra as matrículas ativas do aluno; situação e tipo continuam validados como hoje.
- **States & transitions**: nenhum estado novo; a matrícula ativa/encerrada é a da 003.
- **Idempotency**: só leituras.
- **Evidence vs. decisions**: N/A (nenhuma decisão nova).
- **Automation risk level**: N/A (sem IA).
- **Domain configurability**: disciplinas e turmas continuam dados do professor (004); nada de disciplina fixa no
  código.
- **Sensitive data & adaptations**: nenhum dado novo do aluno; o card mostra só disciplina, turma e, para desempatar,
  período e professor, que o aluno já vê em "Minhas turmas".
- **Curricular traceability**: N/A.

### Key Entities

- **Matéria atual**: não é um dado novo; é a turma da matrícula ativa do aluno escolhida na tela (cada turma é a oferta
  de uma disciplina), indicada no endereço da página.
- **Turma do aluno ("Minhas turmas")**: ganha o nome da disciplina da turma (pode faltar em turmas anteriores à 004).
- **Atividade do aluno, painel do aluno**: os mesmos de hoje (012/013/016/018/023), agora restritos a uma turma quando
  ela é indicada.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Em 100% das visitas ao Painel e a "Minhas atividades" de um aluno com matrícula ativa, a matéria atual
  está escrita no topo da tela, visível sem rolar, na largura de celular e de computador.
- **SC-002**: Com a matéria escolhida, 0 atividades de outra turma aparecem na lista, na contagem, nos cartões de
  resumo, nos contadores, nas próximas, nas atrasadas ou no ranking (conferido com um aluno de duas matérias com
  atividades em ambas).
- **SC-003**: Trocar de matéria leva no máximo 2 interações (abrir o card e escolher) e a tela mostra a nova matéria
  em até 2 segundos numa conexão comum.
- **SC-004**: Para uma turma sem matrícula ativa do aluno (outro aluno, encerrada, inexistente), as respostas da lista
  e do painel são indistinguíveis entre si e não trazem nenhuma atividade.
- **SC-005**: Sem a turma indicada, a lista e o painel respondem exatamente como antes desta feature (os testes
  existentes da 012, 013, 016, 018 e 023 continuam passando sem mudança nas expectativas da API).
- **SC-006**: Recarregar a página, voltar no navegador ou abrir o link copiado mantém a matéria escolhida em 100% dos
  casos.

## Assumptions

- "Matéria" é a disciplina da turma: no DevTrack, cada turma é a oferta de uma disciplina por um professor (004 E2).
  Um aluno com várias matérias na mesma turma da escola tem uma matrícula em cada turma do DevTrack.
- A ordem e o conjunto das matérias são os de "Minhas turmas" (matrículas ativas, mais recente primeiro, 003).
- A escolha não é guardada fora do endereço: cada tela aberta pelo menu começa na matrícula mais recente. Guardar a
  última matéria escolhida pode ser uma evolução, mas não é pedido.
- O Histórico, a página de uma atividade, a página de responder, o ranking completo da turma e "Meus feedbacks" não
  mudam.
- O visual de 2026-11-16 do Painel e de "Minhas atividades" (PR #61) é a base desta feature.
- Os cartões de resumo de "Minhas atividades" continuam calculados sobre as atividades exibidas (agora só da matéria),
  como no visual de 2026-11-16.
