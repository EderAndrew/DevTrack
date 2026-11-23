# Feature Specification: Histórico do aluno redesenhado

**Feature Branch**: `028-student-history-redesign`
**Created**: 2026-11-19
**Status**: Draft
**Input**: User description: "Histórico aluno redesenhado (melhoria da tela da 012 US6, referência: imagem enviada). No
topo, três cards de totais das atividades entregues pelo aluno: "Atividades entregues", "Aguardando correção" (entregues
sem resultado liberado) e "Atividades corrigidas" (resultado liberado, com "Resultado disponível"). Os totais vêm do
servidor e respeitam o filtro de turma. Abaixo, abas "Todas", "Aguardando" e "Corrigidas" com a contagem de cada uma,
uma busca por nome da atividade e um filtro "Todas as turmas" (as turmas/disciplinas do aluno, como o classId da 026).
As abas, a busca e o filtro valem no servidor e se combinam com a paginação, então a contagem e o resultado nunca
dependem só da primeira página. Cada linha mostra o título com "Ver atividade", o tipo em selo, a turma e a disciplina
em duas linhas, a data de entrega com o dia da semana e a hora (e "com atraso"), a situação em pílula (Entregue /
Corrigida) e a nota: "Aguardando correção" ou "1,80 de 3,00" com uma barra proporcional e o selo "Com feedback". Há
também uma seta para abrir a atividade, um rodapé "Exibindo N de M atividades · Mais recentes primeiro" e a nota final
"As notas aparecem aqui assim que a correção for concluída.". Antes da liberação com correção completa, o aluno nunca vê
nota nem feedback; os totais e as abas nunca revelam uma nota antes da liberação. Fica fora: os itens da barra lateral
da imagem que não existem (Biblioteca, Mensagens, sino), o botão "Todas as entregas" e qualquer mudança no menu."

## Contexto: o que muda

O Histórico (012 US6, FR-031) é hoje uma tabela simples das atividades que o aluno entregou (trabalhos e provas
entregues ou corrigidos, e exercícios concluídos), na ordem do prazo, com "Carregar mais" de 20 em 20. O aluno não sabe
quantas entregas tem, quantas esperam correção e quantas já têm resultado, não consegue procurar uma atividade pelo nome
nem ver só uma matéria, e um exercício concluído aparece com "Aguardando correção" na coluna Nota, embora exercício nunca
tenha nota (013).

Esta feature redesenha a tela a partir da imagem de referência e passa a contar, separar, buscar e filtrar no servidor,
para que números e resultados sejam os de todas as entregas do aluno, não só da página carregada.

| Ponto | Hoje | Depois desta feature |
|-------|------|----------------------|
| Totais | Nenhum | Três cards: entregues, aguardando correção, corrigidas |
| Separar por situação | Não | Abas "Todas", "Aguardando", "Corrigidas", cada uma com a contagem |
| Buscar | Não | Busca pelo nome da atividade |
| Matéria | Todas juntas | Filtro "Matéria": "Todas as matérias" ou uma matéria do aluno (disciplina · turma) |
| Ordem | Pelo prazo | Mais recentes primeiro (data da entrega) |
| Linha | Texto simples | Título + "Ver atividade", tipo em selo, turma e disciplina em duas linhas, data com dia da semana e hora, situação em pílula, nota com barra, seta |
| Exercício concluído | "Aguardando correção" na Nota | Situação "Concluída" e os pontos ("45 de 60 pontos"), nunca uma nota |
| Pílula de um aluno sem permissão de ver notas | "Corrigida" | "Entregue" (a entrega fica em "Aguardando") |
| Rodapé | — | "Exibindo N de M atividades · Mais recentes primeiro" e a nota sobre a correção |
| Quem vê o quê, liberação de notas, página da atividade, menu | — | **Não mudam** |
| Atividades concluídas em "Minhas atividades" (emenda 2026-11-23) | Filtro "Entregues/concluídas" e as atrasadas que não aceitam mais entrega | Só as que o aluno ainda pode fazer; as entregues e as não entregues ficam só no Histórico |
| Não entregues (emenda 2026-11-23) | Em "Minhas atividades" como "Atrasada" | No Histórico, aba "Não entregues", sem nota |
| Painel (emenda 2026-11-23) | "Concluídas" abre "Minhas atividades" filtrada; "Atrasadas" conta todas | "Concluídas" abre o Histórico; "Atrasadas" conta só as que ainda aceitam entrega |

## Clarifications

### Session 2026-11-19 (análise antes da implementação)

- Q: Um aluno sem permissão de ver as próprias notas vê a pílula "Corrigida"? → A: Não. No Histórico a pílula segue a
  situação da entrega ("Entregue" enquanto aguardando), coerente com as abas e os cards; as outras telas não mudam.
- Q: O filtro se chama "Turma" (como na imagem) ou "Matéria"? → A: "Matéria", com "Todas as matérias" e o aviso da 026:
  desde a 027, "turma" é a turma do gestor e o filtro escolhe a disciplina da turma.
- Q: "A busca não vai para os logs" vale para quais logs? → A: auditoria e logs da aplicação; o log de acesso do proxy do
  ambiente fica fora desta feature.
- Q: Uma prova retida à espera de decisão aparece? → A: Não; só depois de ter uma entrega (entregue, encerrada ou
  decidida pelo professor).

### Session 2026-11-23 (emenda: concluídas só no Histórico)

- Q: Onde ficam as atividades concluídas? → A: Só no Histórico. "Minhas atividades" e o Painel mostram só o que o aluno
  ainda pode fazer.
- Q: E uma atividade que o aluno não entregou e não pode mais entregar (encerrada pelo professor, de disciplina ou turma
  encerrada ou arquivada, prazo vencido sem aceitar atraso, prova cuja janela de início fechou)? → A: Vai para o
  Histórico, na aba nova "Não entregues", sem nota; os três cards continuam só sobre as entregas.
- Q: O card "Concluídas" do Painel? → A: Continua com a contagem e abre o Histórico da mesma matéria; "Atrasadas" passa
  a contar só as que ainda aceitam entrega.
- Q: Isto muda o que a 028 prometia (SC-005, os pedidos da lista de atividades iguais)? → A: Sim, por emenda da 028:
  `GET /me/activities` deixa de devolver as concluídas e as não entregues, e as contagens do Painel mudam como acima.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Aluno vê os totais e a lista redesenhada (Priority: P1)

Ao abrir "Histórico", o aluno vê no topo três cards: "Atividades entregues" (quantas entregou), "Aguardando correção"
(quantas ainda esperam o professor, com "Você já fez a sua parte") e "Atividades corrigidas" (quantas têm resultado, com
"Resultado disponível"). Abaixo, a lista das entregas, mais recentes primeiro, cada linha com o título e "Ver atividade",
o tipo em selo, a turma e a disciplina em duas linhas, a data da entrega com o dia da semana e a hora, a situação em
pílula e a nota (ou "Aguardando correção"), e uma seta para abrir a atividade.

**Why this priority**: é o pedido central e já entrega valor sozinho: o aluno entende de relance a situação das suas
entregas e encontra o resultado de cada uma.

**Independent Test**: com um aluno que entregou um trabalho ainda sem resultado, uma prova com resultado liberado e
concluiu um exercício, abrir o Histórico e conferir os três totais, a ordem pela data da entrega e o conteúdo de cada
linha.

**Acceptance Scenarios**:

1. **Given** um aluno com entregas, **When** abre o Histórico, **Then** vê os cards "Atividades entregues", "Aguardando
   correção" e "Atividades corrigidas" com os totais de todas as suas entregas (não só das linhas carregadas).
2. **Given** a lista, **When** exibida, **Then** as entregas aparecem da mais recente para a mais antiga pela data da
   entrega, e o rodapé diz "Exibindo N de M atividades" e "Mais recentes primeiro".
3. **Given** uma entrega sem resultado liberado, **When** exibida, **Then** a situação é "Entregue" (ou "Entregue com
   atraso") e a coluna Nota diz "Aguardando correção", sem nenhum número de nota.
4. **Given** uma entrega com resultado liberado e correção completa, **When** exibida, **Then** a situação é
   "Corrigida" (ou "Corrigida com atraso") e a Nota mostra "1,80 de 3,00" com uma barra proporcional à nota e, quando o
   professor deu feedback, o selo "Com feedback".
5. **Given** um exercício concluído, **When** exibido, **Then** a situação é "Concluída" e a Nota mostra os pontos
   ("45 de 60 pontos", ou "Pontos aguardando correção" quando uma resposta espera o professor), nunca uma nota nem a
   barra de nota.
6. **Given** uma linha, **When** o aluno clica no título, em "Ver atividade" ou na seta, **Then** abre a página da
   atividade com as suas respostas somente leitura, como hoje.
7. **Given** a tela, **When** exibida, **Then** termina com "As notas aparecem aqui assim que a correção for
   concluída.".
8. **Given** um aluno sem nenhuma entrega, **When** abre o Histórico, **Then** os três totais são 0 e a tela mostra o
   estado vazio de hoje ("Você ainda não entregou nenhuma atividade.").
9. **Given** mais entregas do que cabem numa página, **When** o aluno pede mais, **Then** as páginas seguintes continuam
   na mesma ordem, sem repetir nem pular entregas, e o "N" do rodapé cresce até "M".

---

### User Story 2 - Abas "Todas", "Aguardando" e "Corrigidas" (Priority: P1)

O aluno quer ver só o que já tem resultado. Ele escolhe a aba "Corrigidas" (com a contagem ao lado) e a lista passa a
mostrar só as entregas com resultado disponível; em "Aguardando", só as que esperam o professor.

**Why this priority**: separar o que tem resultado do que espera correção é o uso mais comum da tela.

**Independent Test**: com entregas nas duas situações, em quantidade maior que uma página, escolher cada aba e conferir
que a lista e a contagem trazem só as entregas daquela situação, em todas as páginas.

**Acceptance Scenarios**:

1. **Given** o Histórico, **When** exibido, **Then** há as abas "Todas", "Aguardando" e "Corrigidas", cada uma com a
   contagem de entregas, e "Todas" vem escolhida.
2. **Given** a aba "Aguardando", **When** escolhida, **Then** a lista mostra só as entregas que esperam o professor
   (trabalho ou prova sem resultado liberado, e exercício com pontos aguardando correção), em todas as páginas.
3. **Given** a aba "Corrigidas", **When** escolhida, **Then** a lista mostra só as entregas com resultado disponível
   (trabalho ou prova com resultado liberado e correção completa, e exercício concluído sem nada esperando o
   professor), em todas as páginas.
4. **Given** uma aba sem nenhuma entrega, **When** escolhida, **Then** a tela diz que não há entregas nessa situação e
   continua mostrando os cards e as abas.
5. **Given** uma aba escolhida, **When** o aluno recarrega a página, volta no navegador ou abre o link, **Then** a mesma
   aba continua escolhida.

---

### User Story 3 - Buscar e filtrar por turma (Priority: P2)

O aluno lembra de "Prova de teste" e digita "prova" na busca: a lista mostra só as entregas cujo nome contém "prova".
Depois escolhe "Object Oriented Programming · ADS 3NA" no filtro de matérias, e os cards, as abas e a lista passam a
valer só para essa matéria.

**Why this priority**: útil quando o histórico cresce, mas a tela já serve sem isso.

**Independent Test**: com entregas em duas matérias e com nomes diferentes, buscar por parte de um nome e
escolher uma matéria, conferindo a lista, as contagens das abas e os cards.

**Acceptance Scenarios**:

1. **Given** a busca, **When** o aluno digita parte do nome de uma atividade, **Then** a lista mostra só as entregas
   cujo nome contém o texto, sem diferenciar maiúsculas, minúsculas e acentos, em todas as páginas, e as contagens das
   abas passam a contar só essas entregas.
2. **Given** uma busca sem resultado, **When** aplicada, **Then** a tela diz "Nenhuma atividade encontrada." e permite
   limpar a busca.
3. **Given** o filtro "Matéria", **When** aberto, **Then** oferece "Todas as matérias" e as matérias do aluno (as
   disciplinas das turmas em que tem matrícula ativa), escritas como no card "Matéria" da 026 ("<disciplina> · <turma>").
4. **Given** uma matéria escolhida, **When** aplicada, **Then** os cards, as contagens das abas, a lista e o rodapé
   passam a valer só para as entregas dessa matéria.
5. **Given** aba, busca e matéria escolhidas, **When** combinadas, **Then** a lista mostra só as entregas que atendem às
   três, e a busca e a matéria ficam no endereço da página como a aba.
6. **Given** uma matéria no endereço que o aluno não pode ver (de outro aluno, matrícula encerrada ou inexistente),
   **When** a página abre, **Then** volta para "Todas as matérias" com "Essa matéria não está mais disponível para
   você.", sem nenhum dado da matéria pedida.

---

### User Story 4 - Nada de nota antes da liberação (Priority: P1)

Os totais, as abas e a busca são novos caminhos de leitura das entregas do aluno; nenhum deles pode deixar escapar uma
nota, um feedback ou a existência de uma correção ainda não liberada.

**Why this priority**: é a regra de mais risco da 012 (FR-027–FR-030) e não pode regredir.

**Independent Test**: com uma entrega já corrigida pelo professor mas ainda não liberada, e outra liberada com correção
incompleta, conferir que ambas contam como "Aguardando correção", aparecem na aba "Aguardando" e não mostram nota em
nenhuma resposta do servidor nem na tela.

**Acceptance Scenarios**:

1. **Given** uma entrega corrigida pelo professor mas ainda não liberada, **When** o aluno abre o Histórico, **Then**
   ela conta em "Aguardando correção", aparece só na aba "Aguardando" e não traz nota nem feedback.
2. **Given** uma entrega liberada com correção incompleta, **When** exibida, **Then** é tratada como aguardando
   correção, sem nota.
3. **Given** um aluno sem a permissão de ver as próprias notas, **When** abre o Histórico, **Then** nenhuma entrega
   conta nem aparece como corrigida (cards, abas e pílula) e nenhuma nota é mostrada.
4. **Given** qualquer combinação de aba, busca e matéria, **When** o servidor responde, **Then** a resposta traz só os
   campos permitidos da visão do aluno, sem nota antes da liberação.

---

### User Story 5 - Concluídas só no Histórico (Priority: P1) *(emenda 2026-11-23)*

> Substituída pela 029 em 2026-11-23 (`specs/029-history-closed-only/`): o Histórico tem só provas e trabalhos encerrados ou cancelados pelo professor; FR-022–FR-025 e US5 passam a valer como 029/FR-001–FR-009.

O aluno abre "Minhas atividades" e vê só o que ainda pode fazer. O que ele entregou e o que não entregou mas não pode
mais entregar ficam no Histórico, este na aba "Não entregues", e o Painel leva ao Histórico pelo card "Concluídas".

**Why this priority**: separar o que falta fazer do que já passou é o pedido do uso real; com as duas telas misturadas,
"Minhas atividades" cresce com o que não exige mais nada do aluno.

**Independent Test**: com uma atividade pendente, uma entregue, uma encerrada pelo professor sem entrega, uma de
disciplina arquivada sem entrega e uma atrasada que ainda aceita entrega, abrir "Minhas atividades", o Painel e o
Histórico e conferir onde cada uma aparece e as contagens.

**Acceptance Scenarios**:

1. **Given** atividades entregues (trabalho ou prova entregue ou corrigido, exercício concluído), **When** o aluno abre
   "Minhas atividades", **Then** elas não aparecem em nenhum filtro, e o filtro "Entregues/concluídas" não existe mais;
   elas continuam no Histórico.
2. **Given** uma atividade sem entrega que o aluno não pode mais entregar (encerrada pelo professor, de disciplina ou
   turma encerrada ou arquivada, prazo vencido sem aceitar atraso, prova com a janela de início fechada), **When** o
   aluno abre "Minhas atividades", **Then** ela não aparece; **When** abre o Histórico, **Then** ela está nas abas
   "Todas" e "Não entregues", com a pílula "Não entregue", sem nota nem barra, e não conta nos três cards.
3. **Given** uma atividade atrasada que ainda aceita entrega (prazo vencido com entrega atrasada aceita), **When** o
   aluno abre "Minhas atividades", **Then** ela continua lá como "Atrasada", e não está no Histórico.
4. **Given** o Painel, **When** exibido, **Then** o card "Concluídas" tem a contagem das entregas e abre o Histórico da
   mesma matéria, e "Atrasadas" conta só as atrasadas que ainda aceitam entrega.
5. **Given** a aba "Não entregues" sem nenhuma atividade, **When** escolhida, **Then** a tela diz "Nenhuma atividade não
   entregue." e continua mostrando os cards e as abas.
6. **Given** uma atividade não entregue que o professor depois aceita como entrega atrasada (012 FR-006b), **When** o
   aluno abre o Histórico, **Then** ela passa a ser uma entrega ("Aguardando" ou "Corrigidas"), não mais "Não
   entregue".

---

### Edge Cases

- Um trabalho em grupo (023): aparece uma vez para cada membro, com a entrega do grupo (data, situação e, depois da
  liberação, a nota do grupo), como hoje.
- Uma prova (018) aparece no Histórico só depois de ter uma entrega: entregue pelo aluno, encerrada por tempo ou por
  avisos, ou cancelada pelo professor; enquanto retida à espera da decisão do professor, ainda não é entrega e não
  aparece. Depois, a nota (inclusive zero) só com a liberação.
- Uma entrega de uma turma encerrada (027, turma INACTIVE com matrícula ativa): continua no Histórico e no filtro de
  matérias.
- Uma matrícula encerrada: as entregas dessa turma deixam o Histórico, como hoje (o aluno vê só turmas de matrícula
  ativa).
- Um trabalho de nota total 0,00 ou uma nota maior que a total por algum ajuste: a barra fica entre vazia e cheia,
  nunca fora disso.
- A busca com espaços nas pontas ou só espaços: espaços nas pontas são ignorados; só espaços é o mesmo que nenhuma
  busca.
- A busca muito longa: limitada a 100 caracteres; acima disso é recusada como entrada inválida.
- Entregas com a mesma data e hora: a ordem é estável entre páginas (sem repetir nem pular).
- O nome da atividade, da turma ou da disciplina com caracteres especiais ou marcação: aparece como texto, nunca como
  HTML.
- Turma sem disciplina (anterior à 004): aparece só com o nome da turma, numa linha.
- *(Emenda 2026-11-23)* Uma prova retida à espera da decisão do professor não é entrega nem "Não entregue": continua em
  "Minhas atividades" até a decisão. Uma tentativa pausada (016) continua lá enquanto o aluno ainda puder entregar.
- *(Emenda 2026-11-23)* Um exercício concluído sai de "Minhas atividades"; para tentar de novo (013), o aluno abre o
  exercício pelo Histórico, onde a página da atividade continua com "Tentar novamente".
- *(Emenda 2026-11-23)* A data de uma "Não entregue" é quando ela deixou de aceitar entrega (o prazo, o encerramento da
  atividade, o fim da janela de início da prova ou o encerramento ou arquivamento da disciplina ou da turma, o que veio
  primeiro); ela ordena a linha entre as entregas, mais recentes primeiro.
- *(Emenda 2026-11-23)* Um endereço antigo de "Minhas atividades" com `?situacao=concluidas` abre com "Todas".

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: O Histórico MUST mostrar três cards de totais das entregas do aluno: "Atividades entregues" (todas),
  "Aguardando correção" (as que esperam o professor) e "Atividades corrigidas" (as com resultado disponível), com os
  textos de apoio "Seu histórico de entregas", "Você já fez a sua parte" e "Resultado disponível".
- **FR-002**: Uma entrega MUST estar em exatamente uma de duas situações: **corrigida** (trabalho ou prova com
  resultado liberado e correção completa e o aluno com permissão de ver as próprias notas; exercício concluído sem
  resposta à espera do professor) ou **aguardando** (todas as outras). "Atividades entregues" MUST ser a soma das duas.
- **FR-003**: Os totais e as contagens MUST ser calculados pelo servidor sobre todas as entregas do aluno que atendem
  aos filtros, nunca sobre as linhas já carregadas na tela.
- **FR-004**: O Histórico MUST ter as abas "Todas", "Aguardando", "Corrigidas" e *(emenda 2026-11-23)* "Não
  entregues", cada uma com a sua contagem; "Todas" soma as entregas e as não entregues; a aba escolhida MUST restringir a
  lista no servidor, em todas as páginas.
- **FR-005**: O Histórico MUST ter uma busca pelo nome da atividade (contém, sem diferenciar maiúsculas, minúsculas e
  acentos, espaços nas pontas ignorados, até 100 caracteres), aplicada no servidor, em todas as páginas.
- **FR-006**: O Histórico MUST ter um filtro "Matéria" com "Todas as matérias" e as matérias do aluno (as disciplinas
  das turmas em que tem matrícula ativa), na ordem de "Minhas turmas" e com o texto do card "Matéria" da 026; uma
  matéria escolhida MUST restringir no servidor a lista, as contagens das abas e os cards.
- **FR-007**: Os cards MUST respeitar o filtro de matéria e MUST NOT mudar com a aba nem com a busca; as contagens das
  abas MUST respeitar a matéria e a busca; a lista e o "M" do rodapé MUST respeitar a aba, a busca e a matéria.
- **FR-008**: A lista MUST vir em ordem da entrega mais recente para a mais antiga (para o exercício, a data da
  conclusão), com desempate estável, e a paginação MUST continuar a mesma ordem sem repetir nem pular entregas.
- **FR-009**: Cada linha MUST mostrar: o título como link e "Ver atividade"; o tipo em selo ("Trabalho", "Prova",
  "Exercício"); a turma e, abaixo, a disciplina; a data da entrega e, abaixo, o dia da semana e a hora (com "com
  atraso" quando a entrega foi atrasada); a situação em pílula; a nota; e uma seta que abre a atividade.
- **FR-010**: A situação em pílula MUST seguir a situação da entrega: "Corrigida" quando corrigida e "Entregue" quando
  aguardando (com "com atraso" quando for o caso) para trabalho e prova, e "Concluída" para exercício, sempre em texto,
  nunca só por cor ou ícone. Uma entrega aguardando nunca mostra "Corrigida", mesmo que o professor já tenha corrigido.
- **FR-011**: A Nota MUST mostrar, para uma entrega corrigida, "<nota> de <total>" com vírgula decimal e uma barra
  proporcional (limitada entre vazia e cheia), mais o selo "Com feedback" quando houver feedback; para um trabalho ou
  prova aguardando, "Aguardando correção"; para um exercício, os pontos ("<ganhos> de <possíveis> pontos" ou "Pontos
  aguardando correção"), nunca uma nota nem a barra de nota.
- **FR-012**: O rodapé MUST mostrar "Exibindo N de M atividades" (N = linhas carregadas, M = total da lista com a aba,
  a busca e a matéria) e "Mais recentes primeiro"; abaixo da lista, a tela MUST mostrar "As notas aparecem aqui assim que
  a correção for concluída.".
- **FR-013**: A aba, a busca e a matéria MUST ficar no endereço da página, de modo que recarregar, voltar e abrir o link
  as mantenham; valores inválidos de aba MUST ser ignorados (volta "Todas").
- **FR-014**: Uma matéria no endereço que o aluno não pode ver MUST fazer a tela voltar para "Todas as matérias" com
  "Essa matéria não está mais disponível para você." (a frase da 026), sem dado algum da matéria pedida.
- **FR-015**: Os estados vazios MUST distinguir: sem nenhuma entrega ("Você ainda não entregou nenhuma atividade.", como
  hoje); aba sem entregas ("Nenhuma entrega aguardando correção." / "Nenhuma entrega corrigida ainda."); busca ou matéria
  sem resultado ("Nenhuma atividade encontrada.", com como limpar a busca e o filtro); *(emenda 2026-11-23)* aba "Não
  entregues" vazia ("Nenhuma atividade não entregue."). O estado "sem nenhuma entrega" só aparece sem entregas e sem
  não entregues.
- **FR-016**: O servidor MUST aceitar, no histórico do aluno, a situação (aguardando/corrigida), o texto da busca e a
  matéria (a disciplina da turma), e MUST devolver as entregas da página junto com o total da lista e as contagens das abas e dos cards; os pedidos
  já existentes da lista de atividades do aluno (012, 026) MUST continuar respondendo como hoje, exceto pelo que a
  emenda de 2026-11-23 muda (FR-022–FR-025).
- **FR-017**: Uma matéria que não é de matrícula ativa do aluno MUST ser respondida como inexistente (`404`), igual
  para a de outro aluno, a de matrícula encerrada e uma inexistente; um identificador mal formado, uma situação desconhecida
  ou uma busca acima do limite MUST ser recusados como entrada inválida (`400`) antes de qualquer consulta.
- **FR-018**: Todas as regras de hoje sobre o que o aluno vê MUST continuar valendo no Histórico: só as suas entregas,
  das turmas de matrícula ativa; nenhuma nota nem feedback antes da liberação com correção completa (012 FR-027–FR-030);
  pontos de exercício nunca como nota (013); a chamada (016) e as provas (018) como hoje; cada linha montada pela lista
  permitida da visão do aluno.
- **FR-019**: Os nomes de atividade, turma e disciplina MUST aparecer como texto, nunca como HTML.
- **FR-020**: A tela MUST usar só tokens e componentes do Design System, funcionar nos temas escuro e claro e na
  largura de celular (sem rolagem horizontal da página; a tabela pode virar uma lista de cartões), e cada controle MUST
  ter nome acessível e ser operável por teclado; as abas MUST anunciar a escolhida e a contagem.
- **FR-021**: A página da atividade, o menu, a barra lateral, a liberação de notas e as demais telas do aluno MUST NOT
  mudar, exceto "Minhas atividades" e o Painel pela emenda de 2026-11-23 (FR-022–FR-025); os itens da imagem que não existem no DevTrack (Biblioteca, Mensagens, sino, "Todas as entregas") MUST NOT
  ser criados.

#### Emenda 2026-11-23: concluídas só no Histórico

> Substituída pela 029 em 2026-11-23 (`specs/029-history-closed-only/`): o Histórico tem só provas e trabalhos encerrados ou cancelados pelo professor; FR-022–FR-025 e US5 passam a valer como 029/FR-001–FR-009.

- **FR-022**: Uma atividade MUST ser **não entregue** quando, sem entrega do aluno (trabalho ou prova sem entrega,
  exercício sem a primeira conclusão), o aluno não pode mais começá-la nem continuá-la: a atividade encerrada pelo
  professor; a disciplina ou a turma não ativa (encerrada ou arquivada, 027); o prazo vencido sem aceitar entrega
  atrasada; a janela de início da prova fechada sem tentativa. Uma prova retida à espera da decisão MUST NOT ser não
  entregue; uma tentativa pausada (016) segue a mesma regra das outras (a pausa não muda o prazo nem o encerramento). É
  derivada a cada leitura, nunca guardada.
- **FR-023**: "Minhas atividades" MUST mostrar só as atividades que o aluno ainda pode fazer ou está fazendo (pendentes,
  em andamento — pausadas inclusive — e atrasadas que ainda aceitam entrega, mais as provas retidas); entregas e não
  entregues MUST NOT aparecer, em nenhum filtro nem página, e o filtro "Entregues/concluídas" MUST deixar de existir
  (no servidor, um pedido com essa situação é entrada inválida, `400`).
- **FR-024**: O Histórico MUST mostrar as não entregues na aba "Não entregues" e em "Todas", na ordem pela data em que
  deixaram de aceitar entrega (FR-008 com essa data), com a pílula "Não entregue", a data com o dia da semana e a hora,
  e "—" na Nota; elas MUST NOT contar nos três cards; a busca e a matéria valem para elas como para as entregas.
- **FR-025**: No Painel, o card "Concluídas" MUST abrir o Histórico (com a matéria escolhida), e "Atrasadas" MUST contar
  só as atrasadas que ainda aceitam entrega; as listas do Painel não mudam.
- **FR-026**: A página de uma atividade concluída ou não entregue MUST continuar abrindo, só para leitura, pelo Histórico
  (e pelo endereço), como hoje.

### Security, Permissions & Audit

- **Permissions**: nenhuma permissão nova. A tela e a rota continuam exigindo `atividades.proprias.visualizar`; uma
  entrega só conta como corrigida, e a nota só aparece, com `notas.proprias.visualizar`, como hoje (012).
- **Resource context**: só as entregas do próprio aluno (a sessão), das turmas de matrícula ativa; a matéria indicada é
  checada pelo servidor contra as matrículas ativas do aluno, nunca pelo navegador. Fora disso, `404` sem revelar
  existência.
- **Audit events**: nenhum evento novo. São leituras; o primeiro olhar de um resultado continua registrado só ao abrir
  a atividade, como hoje (o Histórico não marca resultado como visto).
- **Untrusted input**: aba/situação de uma lista fechada; busca como texto (até 100 caracteres, sem caractere nulo),
  usada só como texto a procurar, nunca como padrão ou comando; matéria validada no formato de identificador universal.
- **States & transitions**: nenhum estado novo; "aguardando", "corrigida" e *(emenda)* "não entregue" são derivados a cada leitura das situações da
  012/013/018, nunca guardados.
- **Idempotency**: só leituras.
- **Evidence vs. decisions**: N/A (nenhuma decisão nova).
- **Automation risk level**: N/A (sem IA).
- **Domain configurability**: tipos, turmas e disciplinas continuam dados; nada de turma ou disciplina fixa no código.
- **Sensitive data & adaptations**: nenhum dado novo do aluno; a busca não é registrada em auditoria nem nos logs da
  aplicação (o log de requisições da API leva o valor trocado por um marcador). O log de acesso do servidor web do
  ambiente (proxy) segue a configuração da infraestrutura e fica fora desta feature.
- **Curricular traceability**: N/A.

### Key Entities

- **Entrega do aluno**: uma atividade do Histórico de hoje (trabalho ou prova entregue ou corrigido, exercício
  concluído) com a sua situação derivada **aguardando** ou **corrigida**; nenhum dado novo é guardado.
- **Totais do Histórico**: as contagens de entregues, aguardando e corrigidas, derivadas a cada leitura, com a matéria; e
  as contagens das abas, com a matéria e a busca.
- **Não entregue** *(emenda 2026-11-23)*: uma atividade sem entrega que o aluno não pode mais fazer (FR-022), com a
  data em que deixou de aceitar entrega; derivada a cada leitura, nunca guardada.
- **Matéria do aluno**: a disciplina de uma turma de "Minhas turmas" (matrícula ativa, 003/026/027), usada no filtro.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Com um aluno de mais de uma página de entregas, os três cards, as contagens das abas e o "M" do rodapé
  batem em 100% dos casos com a contagem real das entregas, para cada combinação de aba, busca e matéria testada.
- **SC-002**: 0 notas ou feedbacks aparecem, na tela ou nas respostas do servidor, para entregas sem liberação com
  correção completa, em qualquer combinação de aba, busca e matéria.
- **SC-003**: O aluno descobre quantas entregas esperam correção sem nenhuma interação (visível no topo, sem rolar, em
  computador e celular) e chega à lista de corrigidas com 1 interação.
- **SC-004**: Uma busca ou troca de aba ou matéria mostra o resultado em até 2 segundos numa conexão comum, com até 500
  entregas no histórico do aluno.
- **SC-005**: Os pedidos já existentes da lista de atividades do aluno respondem como antes desta feature, exceto pela
  emenda de 2026-11-23: as expectativas da API da 012, 013, 016, 018, 023 e 026 mudam só onde listam uma atividade
  entregue ou não entregue em "Minhas atividades", pedem o filtro "Entregues/concluídas" ou contam "Atrasadas" do
  Painel, e cada mudança cita `028/FR-023` ou `028/FR-025`.
- **SC-006**: Para uma matéria sem matrícula ativa do aluno (de outro aluno, encerrada, inexistente), as respostas são
  indistinguíveis entre si e não trazem nenhuma entrega nem contagem.
- **SC-007**: A tela passa nas verificações automáticas de acessibilidade e de contraste nos temas escuro e claro e não
  tem rolagem horizontal da página na largura de 360 px.
- **SC-008** *(emenda 2026-11-23)*: Para um aluno com atividades em cada situação (pendente, em andamento, atrasada
  aceitando entrega, entregue, corrigida, exercício concluído, encerrada sem entrega, de disciplina arquivada sem
  entrega, prova retida), cada atividade aparece em exatamente uma das duas telas ("Minhas atividades" ou Histórico),
  em 100% dos casos, e as contagens do Painel e das abas batem com isso.

## Assumptions

- "Entregues" são as mesmas atividades do Histórico de hoje: trabalhos e provas entregues ou corrigidos e exercícios
  concluídos (012 US6, 013).
- Exercício entra no Histórico e nas abas: "Aguardando" quando uma resposta da primeira conclusão espera o professor
  ("Pontos aguardando correção", 013), "Corrigidas" quando os pontos estão definidos; mostra pontos, nunca nota. Se
  for preferível tirar os exercícios do Histórico, isso muda o escopo e vai para a clarificação.
- A ordem "Mais recentes primeiro" é fixa; não há troca de ordem na tela.
- A paginação continua de 20 em 20 com "Carregar mais"; o rodapé conta as linhas carregadas.
- A consulta periódica de hoje das telas do aluno (5 s com a página visível) continua valendo para o Histórico.
- A busca é só pelo nome da atividade, não pelo nome da turma, da disciplina ou do professor.
- A imagem de referência define a disposição e os textos; cores, espaçamentos e ícones vêm do Design System (005) nos
  temas escuro e claro (022).
- O filtro "Matéria" segue a 026 (matrícula ativa, `404` igual para os três casos), mas aqui "Todas as matérias" existe
  e é o padrão, ao contrário do card "Matéria" da 026. A imagem diz "Todas as turmas"; o texto segue o vocabulário da
  027 (turma = a turma do gestor; matéria = a disciplina da turma).
- O endereço da página guarda a busca (`?busca=`), como guarda a aba e a matéria; ele é do próprio aluno (histórico do
  navegador).
