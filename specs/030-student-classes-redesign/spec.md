# Feature Specification: "Minhas turmas" do aluno redesenhada

**Feature Branch**: `030-student-classes-redesign`
**Created**: 2026-11-25
**Status**: Draft
**Input**: User description: "Atualizar a tela Minhas turmas do aluno usando a imagem enviada como referência. Título
"Minhas turmas" com o subtítulo "Suas disciplinas, professores e rankings em um só lugar." e, à direita, um card "Ano
letivo" com o ano. Abaixo, a aba "Todas as turmas" com a contagem, uma busca "Buscar turma ou disciplina" e um filtro
"Ano: 2026". Cada disciplina vira um card: o código da turma em selo e o nome da turma; o nome da disciplina em
destaque com "Disciplina" abaixo; Professor, Ano e Período; "Entrada na turma" com a data e a hora; o botão "Acessar
turma" e "Código da turma: QA001"; e, à direita, o painel "Ranking da turma" ("Confira a classificação e acompanhe sua
posição nesta turma.") com "Ver ranking". Rodapé "Mostrando 1 de 1 turma" e "Entrada mais recente primeiro". A data
de entrada na turma é a da matrícula do aluno e vem do servidor (escolhido: feature completa com a data, 2026-11-25)."

## Contexto: o que muda

"Minhas turmas" (003 US7, 027 US8) é hoje uma lista por ano letivo: cada turma é uma caixa com o nome, um selo quando
encerrada ou arquivada, "Código" e "Período", e uma tabela das disciplinas da turma (Disciplina, Professor, "Ver
atividades" e, com a permissão, "Ranking"). O aluno não vê quando entrou na turma, não consegue procurar uma disciplina
nem ver só um ano, e a tabela fica apertada no celular.

Esta feature redesenha a tela a partir da imagem de referência: um card por disciplina da turma, com tudo o que o aluno
precisa para entrar nela e ver o ranking.

| Ponto | Hoje | Depois desta feature |
|-------|------|----------------------|
| Cabeçalho | "Minhas turmas" | "Minhas turmas", subtítulo e o card "Ano letivo" com o ano escolhido |
| Unidade da lista | Uma caixa por turma com uma tabela de disciplinas | Um card por disciplina da turma |
| Data de entrada | Não aparece | "Entrada na turma" com data e hora (a matrícula do aluno) |
| Buscar | Não | Busca pelo nome ou código da turma, ou pelo nome da disciplina |
| Ano letivo | Todos os anos, um título por ano | Filtro "Ano", com o ano mais recente escolhido de início e "Todos os anos" |
| Acesso | "Ver atividades" | Botão "Acessar turma" (as atividades da disciplina, como hoje) |
| Ranking | Link "Ranking" na tabela | Painel "Ranking da turma" com "Ver ranking" (com a permissão, como hoje) |
| Rodapé | — | "Mostrando N de M turmas" e "Entrada mais recente primeiro" |
| Turmas e disciplinas que aparecem, quem vê o quê, menu, demais telas | — | **Não mudam** |

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Aluno vê cada disciplina num card (Priority: P1)

Ao abrir "Minhas turmas", o aluno vê o título com o subtítulo "Suas disciplinas, professores e rankings em um só lugar."
e um card por disciplina das turmas em que tem matrícula ativa. Cada card mostra o código da turma num selo e o nome da
turma; o nome da disciplina em destaque, com "Disciplina" abaixo; o professor, o ano e o período; quando entrou na
turma; o botão "Acessar turma" e "Código da turma: <código>"; e, à direita, o painel "Ranking da turma" com "Ver
ranking".

**Why this priority**: é o pedido central e entrega valor sozinho: o aluno encontra de relance cada disciplina, o
professor e o caminho para as atividades e para o ranking.

**Independent Test**: com um aluno matriculado numa turma de duas disciplinas (professores diferentes) e noutra turma
de outro ano, abrir "Minhas turmas" e conferir os cards, o conteúdo de cada um e os destinos de "Acessar turma" e "Ver
ranking".

**Acceptance Scenarios**:

1. **Given** um aluno com matrícula ativa numa turma com disciplinas, **When** abre "Minhas turmas", **Then** vê o
   título "Minhas turmas", o subtítulo "Suas disciplinas, professores e rankings em um só lugar." e um card para cada
   disciplina da turma.
2. **Given** um card, **When** exibido, **Then** mostra o código da turma em selo, o nome da turma, o nome da
   disciplina em destaque com "Disciplina" abaixo, "Professor" com o nome do professor da disciplina, "Ano" com o ano
   letivo da turma, "Período" com o período da turma (ou "—" quando a turma não tem período), "Entrada na turma" com a
   data e a hora da matrícula do aluno ("07/11/2026, 18:08") e "Código da turma: <código>".
3. **Given** o botão "Acessar turma" de um card, **When** o aluno o aciona, **Then** abre "Minhas atividades" daquela
   disciplina (a matéria da 026), como o "Ver atividades" de hoje.
4. **Given** um aluno com a permissão de ver o ranking da turma, **When** vê um card, **Then** o card tem o painel
   "Ranking da turma" com "Confira a classificação e acompanhe sua posição nesta turma." e "Ver ranking", que abre o
   ranking daquela disciplina, como o link "Ranking" de hoje.
5. **Given** um aluno sem a permissão de ver o ranking, **When** vê os cards, **Then** nenhum tem o painel de ranking.
6. **Given** uma turma encerrada ou arquivada, ou uma disciplina encerrada ou arquivada, **When** o card é exibido,
   **Then** diz "Encerrada" ou "Arquivada" em texto, como hoje, e continua com "Acessar turma" para leitura.
7. **Given** uma turma ainda sem disciplinas, **When** exibida, **Then** aparece um card da turma (selo do código, nome,
   ano, período e entrada na turma) com "Ainda não há disciplinas nesta turma.", sem "Acessar turma" nem ranking.
8. **Given** uma disciplina migrada sem nome de disciplina (027/FR-030), **When** exibida, **Then** o destaque é o nome
   da turma e "Disciplina" não aparece abaixo.
9. **Given** um aluno sem nenhuma matrícula ativa, **When** abre "Minhas turmas", **Then** a tela diz "Você ainda não
   participa de nenhuma turma." e não mostra busca, filtro, aba nem card "Ano letivo".
10. **Given** o aluno vindo do aceite de um convite (`?bem-vindo=1`), **When** a tela abre, **Then** anuncia "Você
    agora faz parte da turma." como hoje.

---

### User Story 2 - Buscar e escolher o ano letivo (Priority: P2)

O aluno tem várias disciplinas em dois anos letivos. A tela abre no ano mais recente, com o card "Ano letivo" mostrando
esse ano e a aba "Todas as turmas" com a contagem. Ele digita "orient" na busca e fica só "Object Oriented
Programming"; depois escolhe "Ano: 2025" e vê as disciplinas daquele ano.

**Why this priority**: útil quando a lista cresce, mas a tela já serve sem isso.

**Independent Test**: com disciplinas em 2025 e 2026 e nomes diferentes, conferir o ano escolhido de início, o filtro,
a busca, a contagem da aba e o rodapé.

**Acceptance Scenarios**:

1. **Given** um aluno com matrículas em mais de um ano letivo, **When** abre "Minhas turmas", **Then** o filtro "Ano"
   vem com o ano letivo mais recente, o card "Ano letivo" mostra esse ano e a lista mostra só as disciplinas desse ano.
2. **Given** o filtro "Ano", **When** aberto, **Then** oferece os anos letivos das matrículas ativas do aluno, do mais
   recente ao mais antigo, e "Todos os anos"; escolhido "Todos os anos", o card "Ano letivo" mostra o ano mais recente
   e a lista mostra todas as disciplinas, o ano mais recente primeiro.
3. **Given** a busca "Buscar turma ou disciplina", **When** o aluno digita parte do nome ou do código da turma, ou do
   nome da disciplina, **Then** a lista mostra só os cards que contêm o texto, sem diferenciar maiúsculas, minúsculas e
   acentos, e combinado com o ano escolhido.
4. **Given** uma busca ou ano sem resultado, **When** aplicado, **Then** a tela diz "Nenhuma turma encontrada." e
   permite limpar a busca e o filtro.
5. **Given** a aba "Todas as turmas", **When** exibida, **Then** mostra a contagem de cards do ano escolhido (sem a
   busca), e o rodapé diz "Mostrando N de M turmas" (N = cards mostrados, M = cards do ano escolhido; "turma" no
   singular quando M é 1) e "Entrada mais recente primeiro".
6. **Given** um ano e uma busca escolhidos, **When** o aluno recarrega a página, volta no navegador ou abre o link,
   **Then** o mesmo ano e a mesma busca continuam escolhidos; um ano no endereço que não é de matrícula ativa do aluno
   volta para o ano mais recente.

---

### User Story 3 - Nada além do que o aluno já via (Priority: P1)

A data de entrada é o único dado novo que o servidor passa a entregar na tela; ela e o resto não podem revelar nada de
outro aluno nem de turmas de matrícula encerrada.

**Why this priority**: "Minhas turmas" é a lista de matrículas do aluno; nenhuma regra de quem vê o quê (003, 027) pode
regredir.

**Independent Test**: com um aluno de uma matrícula ativa e outra encerrada, e um colega na mesma turma, conferir que a
resposta e a tela trazem só as matrículas ativas do próprio aluno, com a sua própria data de entrada.

**Acceptance Scenarios**:

1. **Given** um aluno, **When** pede as suas turmas, **Then** recebe só as turmas das suas matrículas ativas, cada uma
   com a data da sua própria matrícula, nunca a de outro aluno.
2. **Given** uma matrícula encerrada, **When** o aluno abre "Minhas turmas", **Then** aquela turma não aparece, como
   hoje.
3. **Given** a resposta do servidor, **When** lida, **Then** traz só os campos de hoje mais a data de entrada: nenhum
   e-mail, RA, outro aluno, convite ou dado de administração.

---

### Edge Cases

- Uma turma com várias disciplinas: um card por disciplina, todos com o mesmo selo, nome de turma e data de entrada (a
  matrícula é da turma, 027).
- Ordem: os cards seguem a ordem de hoje — ano letivo mais recente primeiro; dentro do ano, a matrícula mais recente
  primeiro; dentro da turma, as disciplinas na ordem em que foram adicionadas. Datas de entrada iguais: ordem estável.
- Um aluno que entrou numa turma por convite e outro incluído direto pelo gestor (027): a data de entrada é a da
  matrícula em ambos os casos.
- Busca com espaços nas pontas ou só espaços: espaços nas pontas são ignorados; só espaços é o mesmo que nenhuma busca.
- Nomes de turma, disciplina ou professor com caracteres especiais ou marcação: aparecem como texto, nunca como HTML.
- Nome de disciplina muito longo: quebra em linhas dentro do card, sem rolagem horizontal da página.
- Na largura de celular, o painel de ranking vai para baixo dos dados do card, e Professor, Ano e Período se
  empilham.
- Um único ano letivo: o filtro "Ano" continua aparecendo, com esse ano e "Todos os anos".

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: "Minhas turmas" MUST mostrar o título "Minhas turmas", o subtítulo "Suas disciplinas, professores e
  rankings em um só lugar." e, quando há turmas, o card "Ano letivo" com o ano escolhido no filtro (o mais recente
  quando "Todos os anos").
- **FR-002**: A lista MUST ter um card por disciplina da turma das matrículas ativas do aluno, e um card da turma para
  uma turma sem disciplinas, na ordem de hoje (ano letivo mais recente, matrícula mais recente, disciplinas na ordem em
  que foram adicionadas).
- **FR-003**: Cada card MUST mostrar o código da turma em selo, o nome da turma, o nome da disciplina em destaque com
  "Disciplina" abaixo (ou o nome da turma, sem "Disciplina", quando a disciplina não tem nome), "Professor", "Ano",
  "Período" (ou "—"), "Entrada na turma" com data e hora no formato da plataforma e "Código da turma: <código>"; os
  rótulos com ícone MUST ter o texto, nunca só o ícone.
- **FR-004**: "Acessar turma" MUST abrir "Minhas atividades" da disciplina (`materia` da 026), inclusive numa turma ou
  disciplina encerrada ou arquivada (para leitura); um card de turma sem disciplinas MUST NOT ter "Acessar turma".
- **FR-005**: Com a permissão de ver o ranking da turma, cada card de disciplina MUST ter o painel "Ranking da turma",
  com "Confira a classificação e acompanhe sua posição nesta turma." e "Ver ranking", que abre o ranking da disciplina;
  sem a permissão, MUST NOT haver painel. Os nomes acessíveis de "Acessar turma" e "Ver ranking" MUST incluir a
  disciplina e a turma, para distinguir os cards.
- **FR-006**: Uma turma ou disciplina encerrada ou arquivada MUST dizer "Encerrada" ou "Arquivada" em texto no card,
  com o mesmo critério de hoje (o selo da turma; o da disciplina só quando a turma está ativa).
- **FR-007**: O filtro "Ano" MUST oferecer os anos letivos das matrículas ativas do aluno, do mais recente ao mais
  antigo, e "Todos os anos"; de início MUST vir o ano mais recente.
- **FR-008**: A busca "Buscar turma ou disciplina" MUST restringir os cards aos que contêm o texto no nome ou no código
  da turma ou no nome da disciplina (contém, sem diferenciar maiúsculas, minúsculas e acentos, espaços nas pontas
  ignorados, até 100 caracteres), combinada com o ano.
- **FR-009**: A aba "Todas as turmas" MUST mostrar a contagem de cards do ano escolhido; o rodapé MUST mostrar "Mostrando
  N de M turmas" (singular quando M é 1) e "Entrada mais recente primeiro".
- **FR-010**: O ano e a busca MUST ficar no endereço da página, de modo que recarregar, voltar e abrir o link os
  mantenham; um ano que não é de matrícula ativa do aluno ou mal formado MUST ser ignorado (volta o mais recente).
- **FR-011**: Os estados MUST distinguir: carregando; falha ao carregar (mensagem e "Tentar novamente", como hoje); sem
  nenhuma turma ("Você ainda não participa de nenhuma turma.", sem busca, filtro, aba nem card "Ano letivo"); busca ou
  ano sem resultado ("Nenhuma turma encontrada.", com como limpar).
- **FR-012**: O servidor MUST devolver, em cada turma de "Minhas turmas", a data e a hora da matrícula ativa do próprio
  aluno nessa turma; tudo o mais da resposta MUST continuar como hoje.
- **FR-013**: Os nomes de turma, disciplina e professor e o código MUST aparecer como texto, nunca como HTML.
- **FR-014**: A tela MUST usar só tokens e componentes do Design System, funcionar nos temas escuro e claro e na largura
  de celular (sem rolagem horizontal da página), e cada controle MUST ter nome acessível e ser operável por teclado.
- **FR-015**: O menu, a barra lateral, o topo, as demais telas do aluno e o card "Matéria" da 026 MUST NOT mudar; os
  itens da imagem que não existem no DevTrack (Mensagens, "Precisa de ajuda?", o sino) MUST NOT ser criados.

### Security, Permissions & Audit

- **Permissions**: nenhuma permissão nova. A tela e a rota continuam exigindo `turmas.proprias.listar`; o painel de
  ranking, `ranking.turma.visualizar`, como hoje.
- **Resource context**: só as matrículas ativas do aluno da sessão; a data de entrada é a da matrícula dele. Nada de
  outro aluno.
- **Audit events**: nenhum evento novo; é uma leitura.
- **Untrusted input**: o ano e a busca vêm do endereço e são usados só no navegador para filtrar a lista já recebida; o
  ano é validado como um dos anos da lista; a busca é tratada como texto, nunca como padrão ou comando. A rota não
  ganha parâmetros.
- **States & transitions**: nenhum estado novo.
- **Idempotency**: só leituras.
- **Evidence vs. decisions**: N/A.
- **Automation risk level**: N/A (sem IA).
- **Domain configurability**: turmas, disciplinas e anos continuam dados; nada fixo no código.
- **Sensitive data & adaptations**: o único dado novo na resposta é a data da própria matrícula do aluno; nenhum e-mail
  ou RA.
- **Curricular traceability**: N/A.

### Key Entities

- **Disciplina da turma do aluno**: uma disciplina (`classes`) de uma turma em que o aluno tem matrícula ativa, com o
  professor e a situação efetiva, como hoje.
- **Entrada na turma**: a data e a hora da matrícula ativa do aluno na turma (027: a matrícula é da turma e vale para
  todas as suas disciplinas); já guardada, passa a ser mostrada ao aluno.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Para um aluno com turmas em dois anos letivos e várias disciplinas, cada disciplina das matrículas ativas
  aparece em exatamente um card (100% dos casos), com o professor, o ano, o período e a data de entrada corretos.
- **SC-002**: O aluno chega às atividades ou ao ranking de uma disciplina com 1 interação a partir de "Minhas turmas".
- **SC-003**: Uma busca ou troca de ano mostra o resultado em menos de 1 segundo, sem nova consulta ao servidor, com até
  50 disciplinas.
- **SC-004**: 0 dados de outro aluno ou de matrículas encerradas aparecem na resposta do servidor ou na tela.
- **SC-005**: A tela passa nas verificações automáticas de acessibilidade e de contraste nos temas escuro e claro e não
  tem rolagem horizontal da página na largura de 360 px.
- **SC-006**: Os demais consumidores da lista de turmas do aluno (o card "Matéria" da 026, os filtros do Histórico da
  028, o ranking) continuam funcionando como antes.

## Assumptions

- O card é por disciplina, como na imagem (um card = uma disciplina da turma); "Todas as turmas" e "Mostrando N de M
  turmas" contam esses cards.
- A busca e o filtro de ano rodam no navegador sobre a lista completa já recebida: a lista do aluno é pequena (sem
  paginação hoje) e a rota continua sem parâmetros.
- O ano escolhido de início é o mais recente; "Todos os anos" existe para ver os anteriores sem perder nada do que a
  tela mostra hoje.
- "Acessar turma" leva às atividades da disciplina (o destino de "Ver atividades" de hoje); não existe uma página
  própria da turma para o aluno.
- A data e a hora seguem o formato já usado na plataforma ("07/11/2026, 18:08").
- O topo da página (trilha "Área do aluno / Minhas turmas", sino) e a barra lateral da imagem são o layout do aluno, que
  não muda nesta feature.
