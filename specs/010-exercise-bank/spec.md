# Feature Specification: 010 — Banco de Exercícios: criação manual e geração com IA revisada pelo professor

**Feature Branch**: `010-exercise-bank`
**Created**: 2026-09-27
**Status**: Draft
**Input**: User description: "Implementar o Banco de Exercícios do sistema: professores criam, organizam, revisam e mantêm exercícios (Pergunta e resposta, Múltipla escolha, Exercício de código; dificuldade Básico, Intermediário, Avançado), manualmente ou com IA a partir de um tópico da ementa, em lotes de 3 a 10. Tudo que a IA gera nasce em rascunho e só entra no banco depois da revisão e aprovação do professor. A IA usa exclusivamente a infraestrutura existente (AI Gateway, política de modelos, registro de prompts, auditoria); a dificuldade pedagógica nunca escolhe o modelo. Respostas corretas nunca atravessam a API numa visão de aluno. Sem aplicação de provas, sem execução de código, sem correção automática."

## Contexto do domínio existente

Esta feature é o banco de questões previsto na constituição (roadmap, Fase 004 — Question
Bank), agora que a ementa (004) existe. O pedido chama os itens de **exercícios**; esta spec
mantém esse nome na interface ("Banco de Exercícios"). Um exercício do banco é um **modelo**
reutilizável do professor, não uma atividade de turma: quando atividades, listas e provas
chegarem, cada uma guardará uma cópia (snapshot) do exercício (constituição XXIII,
`Question ≠ ExamQuestion`), e editar o banco nunca mudará o que já foi aplicado.

| Pedido | Situação hoje | O que esta feature faz |
|--------|---------------|------------------------|
| Disciplina, ementa, tópico | Existe (004): a disciplina do professor tem documentos de ementa; cada revisão **confirmada** tem grupos e **itens** de conteúdo | O "tópico da ementa" é um **item de uma revisão confirmada** de ementa de uma disciplina do professor |
| IA, gateway, política de modelos, prompts, auditoria, limites e custo | Existe (006–009): agentes registrados em código, tarefas com política de nível, modelos aprovados por avaliação, propostas L2, auditoria | Registra **um novo agente e uma nova tarefa** de geração de exercícios; nada da infraestrutura é recriado |
| Linguagem de programação | Não existe no domínio | Acrescenta um **catálogo de linguagens** (dados, não código) e a linguagem da **ementa**, escolhida pelo professor ou proposta pelo "Preencher com IA" (ver Clarifications) |
| "Preencher com IA" (007) | Propõe título, ementa, competência e grupos a partir do documento | Passa a propor também a linguagem descrita no documento, entre as do catálogo |
| Permissões | `questoes.*` e `ia.exercicios.gerar` previstas na constituição, ainda não semeadas | Cria as permissões do banco e as concede ao papel TEACHER |
| Visão do aluno | Não há aluno usando exercícios | Define a visão do aluno e garante que ela nunca contém resposta; nenhuma tela de aluno nesta feature |

## Clarifications

### Session 2026-09-27

- Q: De onde vêm as linguagens de um Exercício de código? → A: Da **ementa**: **uma linguagem
  por ementa**. A revisão da ementa (004) ganha o campo **linguagem**, opcional, que o
  professor escolhe numa lista na tela da ementa, sempre com a revisão do professor. No
  "Preencher com IA" (007) a IA identifica a linguagem descrita no documento e a propõe junto
  com o resto da ementa; o professor aceita ou troca. A lista vem de um
  **catálogo de linguagens** guardado como dado (constituição XXI: nada fixo no código), com a
  carga inicial Angular, C, C++, Go, HTML & CSS, Java, JavaScript, Nest, Node, PHP, Python, Rust e TypeScript
  (Node no sentido de desenvolvimento backend; Nest e Angular como frameworks).
  Na geração com IA a linguagem dos exercícios de código é a da ementa do tópico escolhido — o
  professor não a informa de novo e a IA não a inventa. Um lugar para o administrador incluir
  linguagens virá depois; por enquanto, só a carga inicial.
- Q: A criação manual salva sempre de 3 a 10 exercícios de uma vez, ou o professor também pode
  criar um exercício isolado? → A: **B** — o conjunto salvo de uma vez na criação manual tem de
  3 a 10 exercícios, e depois o professor também pode acrescentar exercícios avulsos ao banco,
  um a um, com as mesmas regras de estrutura.

## User Scenarios & Testing *(mandatory)*

Os perfis são o **professor**, dono do seu banco, e o **aluno**, que nesta feature não usa
exercícios, mas cuja visão é definida e protegida desde já. O administrador não tem banco
(conta ADMIN sem papel de professor não vê exercícios).

### User Story 1 - Criar exercícios manualmente, com as mesmas regras de estrutura (Priority: P1)

O professor abre o Banco de Exercícios, escolhe "Criar manualmente", informa o contexto
(disciplina e, quando fizer sentido, o tópico da ementa), a dificuldade, o objetivo cognitivo e
o tipo de cada exercício, preenche o conteúdo e salva de 3 a 10 exercícios. Nenhuma IA é
usada.

**Why this priority**: é o núcleo do banco e funciona sem IA, sem custo e sem modelo aprovado.

**Independent Test**: criar um conjunto manual com um exercício de cada tipo e conferir que
todos entram no banco, com origem manual, e que nenhuma chamada a modelo foi feita.

**Acceptance Scenarios**:

1. **Given** um professor com uma disciplina, **When** salva 3 exercícios válidos, **Then** os
   3 entram no banco com origem MANUAL e a criação é auditada.
2. **Given** um conjunto com 2 ou com 11 exercícios, **When** o professor salva, **Then** a
   criação é recusada e nada é gravado; com 3 e com 10, é aceita.
3. **Given** um exercício de Múltipla escolha com 2 ou 6 alternativas, ou com nenhuma ou duas
   corretas, **When** o professor salva, **Then** o conjunto inteiro é recusado com a indicação
   do exercício e da regra; com 3 a 5 alternativas e exatamente uma correta, é aceito.
4. **Given** um exercício de código sem linguagem, ou com uma linguagem fora do catálogo,
   **When** o professor salva, **Then** a criação é recusada; ligado a um tópico cuja ementa
   tem linguagem, a linguagem sugerida é a da ementa (o professor pode trocá-la).
5. **Given** um exercício manual ligado a um tópico, **When** o tópico não é de uma ementa
   confirmada de uma disciplina do professor, **Then** a criação é recusada sem revelar se o
   tópico existe.
6. **Given** qualquer criação manual, **When** ela termina, **Then** nenhuma execução de IA
   foi criada e nenhum custo de IA foi registrado.

---

### User Story 2 - Pedir exercícios à IA a partir de um tópico da ementa (Priority: P1)

O professor escolhe "Criar com IA", seleciona disciplina → ementa → tópico, a dificuldade, a
quantidade total (3 a 10), os tipos e sua distribuição, as pegadinhas quando houver Múltipla
escolha e a linguagem quando houver código. O pedido segue para a infraestrutura de IA
existente; o resultado validado vira um **lote** de exercícios em rascunho.

**Why this priority**: é o ganho principal pedido (preparar exercícios mais rápido), sempre
sob controle do professor.

**Independent Test**: pedir 10 exercícios mistos para um tópico e conferir que o lote tem
exatamente a distribuição pedida, todos em rascunho, ligados ao tópico, com origem gerada por
IA.

**Acceptance Scenarios**:

1. **Given** um tópico de uma ementa confirmada do professor cuja linguagem é Java, dificuldade
   Intermediário, 10 exercícios com 3 Pergunta e resposta, 4 Múltipla escolha e 3 código e 2
   pegadinhas,
   **When** o professor pede, **Then** um lote é registrado com essa configuração, a geração
   roda em segundo plano e, ao terminar, o lote tem exatamente essa distribuição, todos em
   DRAFT, com origem AI_GENERATED e ligados ao tópico.
2. **Given** um pedido sem tópico, com um tópico inexistente, com um tópico de outra ementa
   que não a informada, ou de uma disciplina de outro professor, **When** é enviado, **Then** é
   recusado antes de qualquer chamada a modelo, sem revelar a existência do recurso de outro
   professor.
3. **Given** um pedido com texto no lugar do tópico, ou com campos de modelo, provedor, nível
   de capacidade ou tarefa, **When** é enviado, **Then** é recusado.
4. **Given** "Distribuir automaticamente" com 10 exercícios em 3 tipos, **When** o pedido é
   registrado, **Then** a distribuição é equilibrada (4, 3 e 3), a diferença entre tipos é no
   máximo 1 e a soma é igual ao total; na distribuição manual, soma diferente do total é
   recusada.
5. **Given** 5 Múltipla escolha e 3 pegadinhas, **When** o professor pede, **Then** é aceito;
   **Given** 2 Múltipla escolha e 3 pegadinhas, ou 4 pegadinhas, ou pegadinhas sem nenhuma
   Múltipla escolha, **Then** é recusado.
6. **Given** a dificuldade Avançado, **When** a geração roda, **Then** o modelo usado é o que a
   política de modelos escolhe para a tarefa de geração de exercícios — a dificuldade
   pedagógica nunca escolhe nível de capacidade, família ou modelo.
7. **Given** a geração indisponível (nenhum modelo aprovado para a tarefa, IA desligada,
   agente desabilitado), **When** o professor abre "Criar com IA", **Then** vê que a geração
   está indisponível no momento e continua podendo criar manualmente.
8. **Given** um tópico cuja ementa não tem linguagem, **When** o professor configura a geração,
   **Then** o tipo Exercício de código não está disponível e um pedido com código é recusado;
   a interface indica que basta definir a linguagem numa nova revisão da ementa.

---

### User Story 3 - Resposta da IA inválida nunca entra no banco (Priority: P1)

Toda resposta da IA passa por validação de estrutura e por validação pedagógica estrutural
antes de virar rascunho. Uma resposta que não cumpre o pedido é recusada por inteiro.

**Why this priority**: o prompt não substitui a validação do backend; é a garantia de que o
banco só tem exercícios que respeitam as regras.

**Independent Test**: simular respostas da IA fora do esquema, com quantidade errada, com um
tipo não pedido, com alternativas inválidas, com linguagem diferente ou com enunciados
repetidos, e conferir que nenhuma cria exercícios.

**Acceptance Scenarios**:

1. **Given** uma resposta fora do esquema, **When** chega, **Then** o lote termina como falha,
   nenhum exercício é gravado e o professor vê que a geração falhou e pode tentar de novo.
2. **Given** uma resposta com quantidade diferente da pedida, com um tipo não pedido, com a
   distribuição por tipo diferente da pedida, com dificuldade diferente da pedida ou com um
   número de pegadinhas diferente do pedido, **When** chega, **Then** é recusada por inteiro.
3. **Given** uma Múltipla escolha com 2 ou 6 alternativas, ou sem exatamente uma correta, ou
   um exercício sem um campo obrigatório do seu tipo, **When** chega, **Then** é recusada.
4. **Given** um exercício de código com linguagem diferente da pedida, **When** chega, **Then**
   é recusada; a linguagem do exercício é sempre a do pedido.
5. **Given** dois enunciados iguais no mesmo lote (ignorando maiúsculas, acentos e espaços
   repetidos), **When** chega, **Then** é recusada.
6. **Given** uma resposta que traz identificadores (tópico, lote, exercício), **When** chega,
   **Then** eles são ignorados: tópico, lote e dificuldade vêm do pedido registrado, nunca da
   IA.
7. **Given** uma resposta válida, **When** é gravada, **Then** o lote, os exercícios e as
   alternativas entram juntos ou nada entra (falha no meio não deixa lote pela metade).

---

### User Story 4 - Revisar, editar e aprovar o que a IA gerou (Priority: P1)

O professor abre o lote gerado, lê cada exercício, edita o que quiser (enunciado,
alternativas, resposta, explicação, código, solução, dificuldade, objetivo cognitivo),
exclui exercícios individuais que não servem e aprova os que aceita. Só exercícios aprovados
ficam disponíveis no banco.

**Why this priority**: a IA é autora da sugestão; o professor é responsável pela aprovação
pedagógica (constituição XIII: IA nunca publica).

**Independent Test**: gerar um lote, editar um exercício, excluir outro e aprovar os demais;
conferir quem revisou, quando, o que foi editado, e que a origem continua AI_GENERATED.

**Acceptance Scenarios**:

1. **Given** um exercício AI_GENERATED em DRAFT, **When** o professor o aprova, **Then** ele
   passa a APPROVED, fica registrado quem revisou e quando, e a aprovação é auditada.
2. **Given** um exercício AI_GENERATED editado pelo professor antes da aprovação, **When** é
   aprovado, **Then** fica registrado que foi editado por pessoa, e a origem continua
   AI_GENERATED.
3. **Given** um exercício em DRAFT, **When** o professor o exclui do lote, **Then** ele deixa
   de aparecer e não pode ser aprovado; o lote registra que foi descartado.
4. **Given** uma edição que quebra uma regra (ex.: Múltipla escolha com duas corretas),
   **When** o professor salva, **Then** a edição é recusada e o exercício fica como estava.
5. **Given** qualquer execução de IA, **When** ela termina, **Then** nenhum exercício está
   APPROVED: não existe caminho pelo qual a IA aprove ou publique exercício.
6. **Given** um lote cuja geração o professor não aproveitou, **When** ele pede para gerar de
   novo com a mesma configuração, **Then** um novo lote é criado e ligado ao anterior; os
   rascunhos do anterior continuam até o professor aprová-los ou excluí-los.
7. **Given** duas abas aprovando ou editando o mesmo exercício, **When** agem ao mesmo tempo,
   **Then** só uma alteração vale e a outra recebe um aviso de que o exercício mudou.

---

### User Story 5 - Consultar e manter o Banco de Exercícios (Priority: P2)

O professor consulta o seu banco com filtros (disciplina, ementa, tópico, dificuldade, tipo,
origem, situação, linguagem) e busca por texto do enunciado, com paginação. Edita um
exercício aprovado e arquiva o que não quer mais usar.

**Why this priority**: sem consulta o banco não é reutilizável; vem depois de haver
exercícios.

**Independent Test**: com 60 exercícios de várias disciplinas, filtrar por tópico e tipo,
buscar uma palavra do enunciado e paginar; conferir que só aparecem exercícios do professor.

**Acceptance Scenarios**:

1. **Given** um banco com exercícios, **When** o professor filtra e busca, **Then** vê só os
   seus exercícios que atendem a todos os filtros, em páginas, nunca o banco inteiro de uma
   vez.
2. **Given** a busca "herança", **When** executada, **Then** encontra enunciados com "Herança"
   ou "heranca" (sem diferenciar maiúsculas e acentos).
3. **Given** um exercício APPROVED, **When** o professor o edita, **Then** as regras de
   estrutura valem de novo, a edição é auditada e o exercício continua APPROVED.
4. **Given** um exercício APPROVED ou DRAFT, **When** o professor o arquiva, **Then** ele passa
   a ARCHIVED, deixa de aparecer na consulta padrão (aparece filtrando por arquivados), não
   pode ser editado nem aprovado, e pode ser restaurado para o estado anterior.
5. **Given** o professor B, **When** tenta ver, editar, aprovar ou arquivar um exercício do
   professor A por qualquer caminho, **Then** recebe "não encontrado".
6. **Given** um banco já com exercícios, **When** o professor acrescenta um exercício avulso,
   **Then** ele entra com origem MANUAL, com as mesmas regras de estrutura, sem o mínimo de 3.

---

### User Story 6 - A visão do aluno nunca contém a resposta (Priority: P1)

Existe uma visão do exercício própria para o aluno, que o servidor monta sem resposta
esperada, sem indicação de alternativa correta, sem solução esperada, sem explicação da
resposta e sem nenhum dado de correção. Nenhuma tela de aluno usa exercícios nesta feature,
mas a separação é garantida agora para as fases de atividades e provas.

**Why this priority**: esconder a resposta na interface não basta; ela não pode sair do
servidor quando quem consulta é aluno. É requisito de base do projeto (avaliação íntegra).

**Independent Test**: montar a visão de aluno de exercícios de cada tipo e conferir, no
conteúdo que sairia pela rede, que nenhuma informação de resposta está presente.

**Acceptance Scenarios**:

1. **Given** um exercício de Pergunta e resposta, **When** a visão de aluno é montada, **Then**
   ela tem o enunciado e não tem a resposta esperada nem a explicação.
2. **Given** um exercício de Múltipla escolha, **When** a visão de aluno é montada, **Then**
   ela tem o enunciado e o texto das alternativas, e não tem qual é a correta, nem marcação por
   alternativa, nem explicação, nem indicação de pegadinha.
3. **Given** um exercício de código, **When** a visão de aluno é montada, **Then** ela tem
   enunciado, instruções, código inicial e linguagem, e não tem a solução esperada nem a
   explicação.
4. **Given** qualquer rota que responde a um aluno ou a quem não tem permissão de ver o banco,
   **When** consultada, **Then** nenhuma resposta contém resposta esperada, alternativa correta
   ou solução esperada.
5. **Given** a visão de aluno e a do professor, **When** comparadas, **Then** a do aluno é
   construída a partir de uma lista fechada de campos permitidos: um campo novo do exercício
   nunca aparece para o aluno sem decisão explícita.

---

### User Story 7 - A ementa declara a linguagem (Priority: P2)

Ao montar ou revisar uma ementa (004), o professor escolhe numa lista a linguagem da ementa,
ou nenhuma — uma linguagem por ementa. No "Preencher com IA" (007), a IA identifica a
linguagem descrita no documento e a propõe; o professor aceita ou troca. A linguagem fica registrada na revisão e passa a orientar os
exercícios de código gerados a partir dos tópicos dessa ementa.

**Why this priority**: deixa os exercícios mais direcionados e impede que a IA invente uma
linguagem; é pré-requisito da geração com código.

**Independent Test**: definir Java numa revisão em rascunho (à mão ou aceitando a proposta do
"Preencher com IA"), confirmá-la e pedir exercícios de código de um tópico dela; conferir que
todos saem em Java.

**Acceptance Scenarios**:

1. **Given** uma revisão da ementa em rascunho, **When** o professor escolhe uma linguagem da
   lista (ou nenhuma) e confirma a revisão, **Then** a linguagem fica registrada nela e a mudança
   é auditada como as demais edições da ementa.
2. **Given** um valor fora do catálogo de linguagens, **When** enviado, **Then** é recusado.
3. **Given** uma revisão confirmada, **When** o professor quer outra linguagem, **Then** cria
   uma nova revisão, como para qualquer mudança de uma ementa confirmada (004).
4. **Given** as ementas confirmadas antes desta feature, **When** consultadas, **Then** não têm
   linguagem e continuam válidas; o professor define a linguagem numa nova revisão.
5. **Given** a lista de linguagens, **When** o professor abre a lista, **Then** vê Angular, C,
   C++, Go, HTML & CSS, Java, JavaScript, Nest, Node, PHP, Python, Rust e TypeScript, em ordem
   alfabética.
6. **Given** um documento de ementa que descreve a linguagem (ex.: "Programação Orientada a
   Objetos com Java"), **When** o professor usa "Preencher com IA", **Then** a proposta traz
   Java como linguagem, que o professor aceita ou troca antes de aplicar; aplicada, ela vai
   para o rascunho da revisão, que o professor ainda edita e confirma como sempre.
7. **Given** um documento que não descreve linguagem, ou descreve uma fora do catálogo, **When**
   a IA analisa, **Then** a proposta vem sem linguagem (nunca uma linguagem inventada ou fora
   do catálogo), e o professor pode escolher uma na tela da ementa.
8. **Given** uma proposta cuja linguagem não aparece no texto do documento, **When** a proposta
   é mostrada, **Then** a linguagem é sinalizada como sem apoio no documento, como os demais
   campos inventados (007).

---

### Edge Cases

- **Nenhum modelo aprovado para a geração de exercícios**: "Criar com IA" fica indisponível
  (como "Preencher com IA" na 007/009), com o motivo só nos logs operacionais; a criação
  manual segue normal.
- **Ementa com várias revisões confirmadas**: o professor escolhe entre os itens de revisões
  confirmadas; a interface oferece a mais recente. Um item de revisão ainda em rascunho não é
  tópico válido.
- **Nova revisão da ementa depois de criados os exercícios**: os exercícios continuam ligados
  ao item da revisão em que foram criados; nada muda sozinho.
- **Disciplina arquivada**: seus exercícios continuam no banco e consultáveis; não se gera com
  IA para disciplina arquivada.
- **Pedido repetido (clique duplo, reenvio)**: o mesmo pedido cria um só lote e uma só
  geração.
- **Geração cancelada ou expirada**: o lote termina sem exercícios, com o motivo; nada fica
  pela metade.
- **Resposta da IA com uma pegadinha a mais ou a menos**: recusada por inteiro (pegadinha é
  parte do pedido).
- **Exercício de código sem código inicial**: aceito; o código inicial é opcional.
- **Linguagem desativada no catálogo no futuro**: exercícios e ementas que a usam continuam
  válidos e mostram o nome; ela só deixa de aparecer para novas escolhas.
- **Professor troca, na revisão, a linguagem de um exercício gerado**: permitido (qualquer
  linguagem do catálogo); fica registrado que o exercício foi editado por pessoa.
- **Múltipla escolha com alternativas repetidas**: recusada (duas alternativas iguais não
  medem nada).
- **Tópico com texto muito longo ou com instruções dirigidas à IA**: o texto do tópico chega à
  IA só como conteúdo, nunca como instrução; não muda quantidade, tipos, dificuldade nem
  modelo.
- **Arquivar um exercício de um lote ainda em revisão**: permitido; o lote registra quantos
  foram aprovados, descartados e arquivados.
- **Conta com papéis ADMIN e TEACHER**: vê apenas o próprio banco, como professor.

## Requirements *(mandatory)*

### Functional Requirements

**Exercício, tipos e regras de estrutura**

- **FR-001**: O sistema DEVE manter exercícios de três tipos: Pergunta e resposta
  (`OPEN_ANSWER`), Múltipla escolha (`MULTIPLE_CHOICE`) e Exercício de código (`CODE`). Um tipo
  novo DEVE poder ser acrescentado definindo sua estrutura, suas regras e sua visão de aluno,
  sem reescrever os tipos existentes (constituição VIII, OCP).
- **FR-002**: Todo exercício DEVE ter enunciado, tipo, dificuldade pedagógica, objetivo
  cognitivo, origem, situação e explicação.
- **FR-003**: Pergunta e resposta DEVE ter resposta esperada.
- **FR-004**: Múltipla escolha DEVE ter de 3 a 5 alternativas, sem textos repetidos, exatamente
  uma correta, em ordem definida, e a indicação de pegadinha (sim/não).
- **FR-005**: Exercício de código DEVE ter instruções, solução esperada e linguagem; o código
  inicial é opcional. A linguagem DEVE ser uma entrada ativa do catálogo de linguagens; nenhuma
  linguagem é fixa no código (constituição XXI).
- **FR-006**: Todas as regras de estrutura DEVEM ser verificadas no servidor, na criação
  manual, na edição e na resposta da IA, independentemente do que a interface ou a IA
  garantam.

**Dificuldade e objetivo cognitivo**

- **FR-007**: A dificuldade pedagógica DEVE ter três níveis — Básico (`BASIC`),
  Intermediário (`INTERMEDIATE`) e Avançado (`ADVANCED`) — e DEVE ser um conceito distinto do
  nível de capacidade de modelos de IA (009): nenhum valor de um implica valor do outro, e a
  dificuldade NÃO DEVE influenciar a escolha de modelo.
- **FR-008**: Todo exercício DEVE ter um objetivo cognitivo, eixo independente da dificuldade
  (constituição XXI): Reconhecer, Compreender, Aplicar, Analisar ou Criar. Na geração com IA, a
  IA propõe o objetivo de cada exercício e o professor pode trocá-lo na revisão.

**Origem, situação e revisão**

- **FR-009**: Todo exercício DEVE ter origem `MANUAL` ou `AI_GENERATED`, definida na criação e
  nunca alterada, mesmo depois de editado.
- **FR-010**: Todo exercício DEVE estar em uma situação: `DRAFT` (em preparação), `APPROVED`
  (disponível no banco) ou `ARCHIVED` (mantido para histórico, indisponível para novos usos).
  Transições permitidas: DRAFT → APPROVED, DRAFT → ARCHIVED, APPROVED → ARCHIVED, ARCHIVED →
  situação anterior (restaurar); qualquer outra DEVE ser recusada.
- **FR-011**: Exercícios manuais DEVEM ser salvos como APPROVED (o professor é o autor e
  revisou ao salvar) ou como DRAFT, à escolha do professor.
- **FR-012**: Exercícios `AI_GENERATED` DEVEM nascer em DRAFT e só podem passar a APPROVED por
  ação explícita de um usuário autorizado. Nenhuma execução de IA pode aprovar, publicar ou
  arquivar exercício.
- **FR-013**: Para exercícios `AI_GENERATED`, o sistema DEVE registrar se foram revisados por
  pessoa, se foram editados por pessoa, quem revisou e quando.
- **FR-014**: Exercícios em DRAFT de um lote DEVEM poder ser editados, excluídos
  individualmente ou aprovados um a um ou vários de uma vez; um exercício excluído de um lote
  deixa de existir para uso, mas o lote registra quantos foram descartados.
- **FR-015**: Exercícios ARCHIVED NÃO PODEM ser editados nem aprovados; podem ser restaurados.

**Quantidade**

- **FR-016**: Cada conjunto da criação manual e cada geração com IA DEVE ter de 3 a 10
  exercícios, verificado no servidor. Além disso, o professor DEVE poder acrescentar ao banco
  um exercício manual avulso, com as mesmas regras de estrutura.

**Geração com IA — pedido**

- **FR-017**: A geração com IA DEVE exigir um tópico: um item de uma revisão confirmada de
  ementa de uma disciplina ativa do professor. O servidor DEVE verificar que a ementa existe,
  que o item existe, que pertence à revisão informada e que a disciplina é do professor; caso
  contrário, recusa sem chamar modelo e sem revelar recursos de outros professores.
- **FR-018**: O pedido DEVE informar: tópico, dificuldade, quantidade total (3 a 10), tipos
  (um, dois ou três) e a quantidade por tipo ou "distribuir automaticamente", e o número de
  pegadinhas quando houver Múltipla escolha. A linguagem dos exercícios de código NÃO é
  informada no pedido: é a da revisão da ementa do tópico, registrada no lote. Sem linguagem
  na ementa, um pedido com código DEVE ser recusado.
- **FR-019**: Na distribuição manual, a soma das quantidades por tipo DEVE ser igual ao total,
  e cada tipo escolhido DEVE ter ao menos 1 exercício. Na automática, o servidor DEVE
  distribuir o total entre os tipos escolhidos com diferença de no máximo 1 entre eles, de
  forma determinística (a mesma escolha gera sempre a mesma distribuição).
- **FR-020**: O número de pegadinhas DEVE estar entre 0 e 3 e nunca passar do número de
  Múltipla escolha; sem Múltipla escolha, DEVE ser 0.
- **FR-021**: O pedido NÃO PODE conter modelo, provedor, família, nível de capacidade, tarefa,
  instruções livres para a IA nem texto no lugar do tópico; campos desconhecidos DEVEM ser
  recusados.
- **FR-022**: Cada pedido DEVE ser registrado como um **lote de geração** com o professor, o
  tópico, a dificuldade, a quantidade total, as quantidades por tipo, o número de pegadinhas,
  a linguagem, a situação do lote e a execução de IA correspondente. Repetir o mesmo pedido
  (mesma chave de idempotência) DEVE reaproveitar o mesmo lote.
- **FR-023**: Gerar de novo a partir de um lote DEVE criar um novo lote com a mesma
  configuração, ligado ao anterior; os exercícios do anterior não mudam.

**Geração com IA — execução e validação**

- **FR-024**: A geração DEVE rodar exclusivamente pela infraestrutura de IA existente: um
  agente registrado, uma tarefa com política de modelos (009), o gateway, os limites por
  execução, por usuário e por agente, o custo, a auditoria e os logs já existentes. O módulo de
  exercícios NÃO PODE escolher modelo, provedor, nível de capacidade ou credencial, nem chamar
  provedor diretamente.
- **FR-025**: A política de modelos DEVE decidir o nível de capacidade e o modelo da geração com
  base nas avaliações; nenhuma dificuldade pedagógica leva a um modelo mais caro. Enquanto
  nenhum modelo estiver aprovado para a tarefa, a geração fica indisponível.
- **FR-026**: A IA DEVE receber somente o contexto autorizado: o texto do item escolhido, o
  título do grupo a que pertence, o título, a competência e a linguagem da revisão da ementa e
  a configuração do pedido (dificuldade, quantidade, tipos e distribuição, pegadinhas, linguagem
  e as regras de estrutura, incluindo o que torna uma pegadinha aceitável ou proibida). Nenhum
  dado de aluno, de turma, de outro professor nem de outras ementas.
- **FR-027**: O conteúdo da ementa DEVE chegar à IA como conteúdo não confiável, separado das
  instruções; instruções embutidas nele NÃO PODEM mudar o pedido, o modelo nem as regras.
- **FR-028**: A resposta da IA DEVE ser saída estruturada validada contra o esquema da tarefa;
  texto livre nunca é gravado.
- **FR-029**: Depois do esquema, o servidor DEVE validar a resposta contra o pedido registrado:
  quantidade total, tipos e quantidade por tipo, dificuldade, número de pegadinhas (só em
  Múltipla escolha), linguagem, campos obrigatórios de cada tipo, regras de Múltipla escolha e
  enunciados repetidos no lote (comparação exata após normalizar maiúsculas, acentos e espaços).
  Qualquer violação recusa a resposta inteira.
- **FR-030**: Uma resposta recusada NÃO PODE gravar nenhum exercício; o lote termina como falha
  com o motivo (sem conteúdo da resposta), e o professor pode pedir de novo.
- **FR-031**: Tópico, dificuldade, lote e identificadores de todos os exercícios DEVEM vir do
  pedido registrado e ser atribuídos pelo sistema; valores desses campos na resposta da IA são
  ignorados.
- **FR-032**: Uma resposta válida DEVE gravar o lote, os exercícios e as alternativas numa única
  operação: ou tudo, ou nada.
- **FR-033**: A geração DEVE ser um agente L2 (sugestão): seu resultado vira rascunhos que o
  professor revisa; o agente só lê o tópico do próprio pedido, por ferramenta autorizada, e
  DEVE ter conjunto de referência e avaliação sob demanda antes de ser habilitado (constituição
  XIII, XIX; 009 portão de qualidade).

**Linguagem da ementa e catálogo de linguagens**

- **FR-038**: O sistema DEVE manter um catálogo de linguagens como dado (nome e se está ativa),
  com a carga inicial C, C++, Java, PHP, JavaScript, TypeScript, Python, Go, Node, HTML & CSS
  e Rust. Nenhuma tela ou rota desta feature altera o catálogo; a gestão pelo administrador
  virá em spec própria.
- **FR-039**: A revisão da ementa (004) DEVE ter uma linguagem opcional — uma por ementa —,
  escolhida pelo professor numa lista das linguagens ativas, editável enquanto a revisão está em rascunho,
  imutável depois de confirmada como o resto da revisão, e auditada como as demais edições.
- **FR-040**: Exercícios de código de um lote gerado DEVEM usar a linguagem da ementa do tópico;
  exercícios manuais ligados a um tópico começam com a linguagem da ementa sugerida e o
  professor pode trocá-la por outra do catálogo.
- **FR-041**: O "Preencher com IA" (007) DEVE propor a linguagem descrita no documento da ementa,
  escolhida só entre as linguagens ativas do catálogo, ou nenhuma quando o documento não
  descreve uma; uma linguagem proposta que não aparece no texto do documento DEVE ser
  sinalizada como sem apoio (checagem determinística da 007). A linguagem é um campo da
  proposta como os outros: o professor a aceita ou não, e só vai para a ementa pelo fluxo de
  aplicação da 007, em rascunho. Isso é uma nova versão do agente de ementa, com o conjunto de
  referência e a avaliação atualizados.

**Banco de Exercícios (consulta)**

- **FR-034**: O professor DEVE consultar só os próprios exercícios, com filtros combináveis por
  disciplina, ementa, tópico, dificuldade, objetivo cognitivo, tipo, origem, situação e
  linguagem, busca por texto do enunciado sem diferenciar maiúsculas e acentos, e paginação com
  tamanho de página limitado. Arquivados só aparecem quando filtrados.
- **FR-035**: O professor DEVE ver os lotes de geração com sua configuração, situação e quantos
  exercícios foram aprovados, descartados e arquivados.

**Visões professor × aluno**

- **FR-036**: O sistema DEVE ter duas visões de exercício com contratos distintos: a do
  professor (completa) e a do aluno, montada no servidor a partir de uma lista fechada de campos
  permitidos: enunciado, tipo, dificuldade, instruções, código inicial, linguagem e o texto das
  alternativas na ordem de apresentação.
- **FR-037**: A visão do aluno NÃO PODE conter resposta esperada, alternativa correta ou
  marcação de correta por alternativa, solução esperada, explicação, indicação de pegadinha,
  origem, dados de revisão nem qualquer dado de correção. Nenhuma rota desta feature responde a
  alunos; rotas futuras de alunos DEVEM usar essa visão.

### Security, Permissions & Audit *(mandatory if feature has protected operations)*

- **Permissions**: `questoes.visualizar` (consultar o banco e os lotes), `questoes.criar`
  (criação manual, em conjunto ou avulsa), `questoes.editar` (editar, excluir rascunho, arquivar e restaurar),
  `questoes.aprovar` (aprovar exercícios) e `ia.exercicios.gerar` (pedir geração com IA; exige
  também `ia.execucoes.visualizar`, como na 007). Todas concedidas ao papel TEACHER; nenhuma a
  ADMIN, MANAGER ou STUDENT. Definir a linguagem da ementa usa a permissão de revisar a
  ementa que já existe (004, `ementas.revisar`).
- **Resource context**: o banco é privado de cada professor; toda consulta e alteração é
  filtrada pelo professor da sessão, e recurso de outro professor responde "não encontrado".
  O tópico de um pedido é verificado contra as disciplinas e ementas do professor (004).
- **Audit events**: exercício criado manualmente, geração pedida, lote gerado (ou falho),
  exercício editado, exercício revisado, aprovado, descartado, arquivado e restaurado — com
  ator, exercício ou lote, data e identificador de correlação; metadados só com ids,
  contagens, tipos e códigos, nunca enunciado, resposta, solução ou texto da ementa.
- **Untrusted input**: pedidos HTTP com campos desconhecidos, texto no lugar de tópico ou
  campos de modelo são recusados; o texto da ementa é conteúdo não confiável para a IA; a
  resposta da IA é validada contra esquema e contra o pedido antes de qualquer gravação.
- **States & transitions**: exercício (DRAFT → APPROVED → ARCHIVED, DRAFT → ARCHIVED,
  restaurar de ARCHIVED); lote (PENDING → GENERATED | FAILED | CANCELLED); transição inválida →
  `409 INVALID_STATE_TRANSITION`.
- **Idempotency**: o pedido de geração usa chave de idempotência (mesma chave → mesmo lote);
  aprovar ou arquivar de novo algo já nesse estado não muda nada nem gera evento; edições usam
  controle de concorrência (a segunda edição sobre uma versão antiga é recusada).
- **Evidence vs. decisions**: a resposta da IA é SUGGESTION; a validação estrutural é
  RULE_RESULT; aprovar, editar, descartar e arquivar são HUMAN_DECISION.
- **Automation risk level**: L2 — a IA sugere rascunhos; aprovar e disponibilizar é sempre do
  professor.
- **Domain configurability**: nenhuma linguagem, disciplina ou tecnologia é codificada — as
  linguagens são um catálogo de dados com carga inicial, e a ementa referencia uma delas;
  tipos de exercício, dificuldades e objetivos cognitivos são conceitos da plataforma
  (constituição XXI).
- **Sensitive data & adaptations**: nenhum dado de aluno nem de adaptação é tocado ou enviado
  à IA; respostas e soluções são dados sensíveis de avaliação e só saem na visão do professor.
- **Curricular traceability**: exercícios gerados são sempre ligados ao item da ementa do
  pedido; manuais podem ser ligados a um item. O escopo "ensinado na turma" (XXIII) se aplica
  às atividades de turma, que não fazem parte desta feature.

### Key Entities *(include if feature involves data)*

- **Exercício**: modelo reutilizável do professor — tipo, enunciado, dificuldade, objetivo
  cognitivo, explicação, origem, situação, vínculo opcional a um item da ementa, linguagem
  (código), dados de revisão (revisado, editado, por quem, quando), lote de origem (gerados) e
  versão para controle de concorrência.
- **Alternativa**: opção de uma Múltipla escolha — texto, se é a correta, posição.
- **Conteúdo específico do tipo**: resposta esperada (Pergunta e resposta); instruções, código
  inicial e solução esperada (código).
- **Lote de geração**: um pedido de geração com IA — professor, tópico, dificuldade, total,
  quantidade por tipo, pegadinhas, linguagem, situação, execução de IA, lote anterior
  (regeneração) e contagens de aprovados, descartados e arquivados.
- **Linguagem**: entrada do catálogo de linguagens (nome, ativa) — linguagens e tecnologias
  de desenvolvimento; referenciada pela revisão da ementa e pelos exercícios de código. Carga
  inicial de 13 entradas.
- **Revisão da ementa (004, alterada)**: ganha a linguagem opcional.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Um professor cria 3 exercícios manuais (um de cada tipo) em menos de 5 minutos,
  sem nenhuma chamada a modelo de IA.
- **SC-002**: Um professor pede 10 exercícios com IA e tem o lote em rascunho para revisar em
  menos de 2 minutos em 95% dos pedidos, com exatamente a distribuição pedida.
- **SC-003**: 100% dos casos de fronteira das regras (2/3/10/11 exercícios; 2/3/5/6
  alternativas; 0/1/2 corretas; 0/3/4 pegadinhas e pegadinhas acima da Múltipla escolha) têm o
  resultado esperado, na criação manual, na edição e na resposta da IA.
- **SC-004**: 0 exercícios gravados a partir de respostas da IA inválidas nos testes (fora do
  esquema, quantidade, tipo, distribuição, pegadinhas, linguagem, alternativas ou duplicados).
- **SC-005**: 0 exercícios AI_GENERATED chegam a APPROVED sem uma ação de professor
  registrada com autor e data.
- **SC-006**: Em 100% das visões de aluno montadas nos testes, para os três tipos, não há
  resposta esperada, alternativa correta, marcação de correta, solução nem explicação.
- **SC-007**: Nenhum professor consegue ver ou alterar exercício, lote ou tópico de outro
  professor por nenhuma rota (matriz de autorização completa).
- **SC-008**: A consulta ao banco com 1.000 exercícios de um professor devolve a primeira
  página filtrada em menos de 1 segundo, e nenhuma resposta traz mais que uma página.
- **SC-009**: A escolha de modelo da geração é idêntica para as três dificuldades
  pedagógicas, com o mesmo catálogo e a mesma política.
- **SC-010**: O conjunto de referência da geração de exercícios atinge os limiares de
  qualidade definidos no plano (estrutura válida, fidelidade ao tópico, pegadinhas aceitáveis)
  no modelo aprovado, e roda no CI com respostas gravadas.
- **SC-011**: 100% dos exercícios de código gerados a partir de um tópico usam a linguagem da
  ementa desse tópico.
- **SC-012**: No conjunto de referência da 007, a linguagem proposta pelo "Preencher com IA" é
  a esperada em todos os documentos que descrevem uma, e nenhuma proposta traz linguagem fora
  do catálogo.

## Assumptions

- **Tópico da ementa = item de conteúdo**: é o item de uma revisão **confirmada** de ementa
  (004), não o tópico do planejamento de uma turma (esse pertence a uma turma, e o banco é do
  professor, reutilizável entre turmas). Grupos da ementa são títulos de unidade, não tópicos.
- **Nome**: "exercício" é o item do banco de questões da constituição; o tipo de atividade
  `EXERCISE` (prática com tentativas e feedback) chega com a fase de atividades e usará
  snapshots destes exercícios.
- **Objetivo cognitivo**: acrescentado ao pedido por exigência da constituição (XXI: questões
  carregam dificuldade e objetivo cognitivo como eixos independentes).
- **Permissões**: seguem os nomes da constituição (`questoes.*`, `ia.exercicios.gerar`);
  `questoes.visualizar` e `questoes.aprovar` são acrescentadas.
- **Uma só tarefa de IA**: a geração usa uma tarefa, com a dificuldade como parâmetro do
  pedido; a política de modelos (009) decide o nível pelas avaliações. Tarefas separadas por
  dificuldade induziriam a associação dificuldade → modelo que o pedido quer evitar.
- **Execução assíncrona**: a geração roda em segundo plano como as execuções de IA existentes
  (006); a interface acompanha a situação do lote.
- **Visão do aluno sem rota**: nenhuma rota de aluno nesta feature (sem atividades); a visão é
  definida, construída no servidor e coberta por testes, e é obrigatória para as rotas futuras.
- **Regeneração**: regenera o lote inteiro com a mesma configuração; regenerar um exercício
  isolado fica para uma spec futura.
- **Duplicidade**: só enunciados idênticos (após normalização) dentro do mesmo lote; detecção
  semântica e duplicidade contra o banco inteiro ficam para depois, sem nova chamada de IA.
- **Sem execução de código**: a solução esperada não é executada nem conferida
  automaticamente; o Code Runner é fase própria (constituição, Fase 009 do roadmap).
- **Uma linguagem por ementa** (decisão do usuário): a ementa tem uma linguagem ou nenhuma.
- **Catálogo = linguagens e tecnologias**: Node (desenvolvimento backend), Nest e Angular
  (frameworks) e HTML & CSS entram ao lado das linguagens, como pedido; o catálogo é o lugar
  do que o professor escolhe, não uma classificação técnica.
- **O Curriculum Agent (007) propõe a linguagem**: nova versão do agente (a 007 continua
  valendo para o resto da proposta), com o conjunto de referência ganhando a linguagem esperada
  de cada documento, e a avaliação refeita antes de habilitar a versão nova.
- **Sem compartilhamento**: o banco é privado; compartilhar entre professores exige spec.
- **Limites e custo**: a geração conta nos limites existentes por usuário e por agente e no
  custo e orçamentos da 009; um limite próprio por professor por hora é definido no plano.
