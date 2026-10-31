# Feature Specification: Trabalho individual ou em grupo

**Feature Branch**: `023-group-work`
**Created**: 2026-10-30
**Status**: Draft
**Input**: User description: "Trabalho individual ou em grupo. Ao aplicar um trabalho, o professor escolhe
"Individual" (como hoje) ou "Em grupo" com o máximo de integrantes de 2 a 5, contando o líder. Exercícios e
provas continuam individuais. Ao clicar em iniciar um trabalho em grupo, o aluno vê "Esse trabalho é em grupo,
escolha os integrantes do grupo. Você pode incluir até N", com a lista dos alunos da turma marcados presentes na
chamada que ainda não começaram esse trabalho (sozinhos ou em outro grupo), e a opção "Continuar sozinho". Quem
escolhe os integrantes é o líder do grupo; os escolhidos entram direto, sem aceitar, e veem um aviso. Quem já
está num grupo e abre o mesmo trabalho vê que já participa de um grupo que está fazendo o trabalho. Enquanto o
trabalho está em andamento, o líder pode incluir mais alunos até o máximo; por enquanto ninguém sai e ninguém é
removido. A edição é individual: só um integrante edita por vez; o líder passa a edição para outro integrante,
que edita do próprio computador, e pode pegá-la de volta; os demais veem o trabalho só para leitura, atualizado
por polling (sem WebSockets). Cada edição fica registrada por aluno para o professor saber quem editou; o
registro é só controle, nunca nota. Só o líder entrega; o grupo entrega uma vez e a nota liberada vale para
todos os integrantes. No modo controlado, os registros de saída de tela continuam por aluno; a ajuda da IA é de
3 orientações por grupo; cada aluno pode executar o código no próprio computador."

## Contexto: o que muda

Hoje todo Trabalho aplicado (012) é individual: cada aluno presente (016) abre a sua tentativa, responde,
entrega uma vez e recebe a própria nota depois da liberação. Esta feature deixa o professor aplicar um Trabalho
**em grupo**: um aluno, o líder, forma o grupo com colegas presentes; o grupo tem uma só tentativa, editada por
um integrante de cada vez, e uma só entrega, cuja nota vale para todos. Quem editou o quê fica registrado para o
professor, como fato, nunca como nota.

| Ponto | Hoje | Depois desta feature |
|-------|------|----------------------|
| Aplicar um Trabalho (012) | Modo, ajuda da IA (015), execução de código (021), chamada (016) | Mais o formato: "Individual" (padrão) ou "Em grupo" com o máximo de integrantes (2 a 5, com o líder) |
| Iniciar um Trabalho em grupo | — | O aluno escolhe os integrantes entre os colegas presentes ou "Continuar sozinho" |
| Tentativa | Uma por aluno | Uma por grupo, compartilhada; o trabalho feito sozinho continua uma por aluno |
| Edição das respostas | O próprio aluno | Um integrante por vez; o líder passa e retoma a edição; os outros leem |
| Entrega e nota (012) | Cada aluno entrega; nota própria | O líder entrega uma vez; a nota liberada vale para cada integrante |
| Correção do professor | Respostas, linha do tempo (015/016), ajudas, execuções (021) | Mais os integrantes, as passagens da edição e quem salvou cada resposta |
| Modo controlado (015), pausas (016) | Por aluno | **Continuam por aluno**, dentro da tentativa do grupo |
| Ajuda da IA (015) | 3 orientações por aluno | 3 orientações **por grupo** |
| Executar (021) | O aluno, na própria tentativa | Cada integrante, do próprio computador, sobre as respostas do grupo |
| Trabalho individual, Exercícios (013) e Provas (018) | — | **Não mudam** |

```text
Professor ── aplica o Trabalho "Em grupo", máximo N ──▶ atividade (formato fixo após o 1º início)
Aluno (líder) ── "Iniciar" → escolhe colegas presentes ──▶ grupo + tentativa do grupo (líder edita)
Integrantes ◀── aviso "Você está no grupo de <líder>" ── leem a tentativa, atualizada a cada poucos segundos
Líder ── "Passar a edição" ──▶ um integrante edita do próprio computador ── líder "Retomar a edição"
Líder ── "Entregar" ──▶ uma entrega do grupo ──▶ correção ──▶ nota liberada para cada integrante
Professor (correção) ◀── integrantes, passagens da edição, quem salvou cada resposta e quando
```

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Professor aplica um Trabalho em grupo (Priority: P1)

Ao aplicar um Trabalho à turma, o professor escolhe o formato: "Individual", como hoje, ou "Em grupo", e então
informa o máximo de integrantes por grupo, de 2 a 5, contando o líder. O formato pode mudar até o primeiro aluno
iniciar; depois fica fixo.

**Why this priority**: sem a escolha do professor não existe trabalho em grupo; é a porta da feature.

**Independent Test**: aplicar um Trabalho "Em grupo" com máximo 3 e ver, na atividade, o formato e o máximo;
aplicar outro sem mexer e ver "Individual".

**Acceptance Scenarios**:

1. **Given** o professor aplicando um Trabalho, **When** ele não mexe no formato, **Then** o trabalho é
   "Individual" e tudo funciona como hoje.
2. **Given** o professor aplicando um Trabalho, **When** escolhe "Em grupo" e o máximo 4, **Then** a atividade
   fica em grupo com até 4 integrantes por grupo, contando o líder.
3. **Given** "Em grupo", **When** o máximo informado está fora de 2 a 5 (ou não é inteiro), **Then** a
   aplicação é recusada com a mensagem do campo e nada é criado.
4. **Given** um Trabalho aplicado em que nenhum aluno iniciou, **When** o professor muda o formato ou o máximo,
   **Then** a mudança vale; **When** algum aluno já iniciou, **Then** a mudança é recusada com a mensagem de que
   o trabalho já começou.
5. **Given** um Exercício ou uma Prova, **When** o professor aplica, **Then** não existe a opção de formato, e
   um pedido que a envie é recusado.
6. **Given** Trabalhos aplicados antes desta feature, **When** alguém os abre, **Then** continuam individuais.

---

### User Story 2 - Aluno inicia o Trabalho em grupo e escolhe os integrantes (Priority: P1)

O aluno toca em "Iniciar" num Trabalho em grupo e vê "Esse trabalho é em grupo, escolha os integrantes do grupo.
Você pode incluir até N" (N = máximo − 1), com a lista dos colegas da turma marcados presentes que ainda não
começaram esse trabalho, nem sozinhos nem em outro grupo. Marca os colegas e confirma: o grupo nasce com ele como
líder, a tentativa do grupo começa e ele é quem edita. Ou escolhe "Continuar sozinho" e faz o trabalho
individualmente, como hoje.

**Why this priority**: é o momento em que o grupo existe; sem ele, o resto não acontece.

**Independent Test**: com três alunos presentes num Trabalho em grupo de máximo 3, o primeiro inicia, marca os
outros dois e confirma; os três passam a ver a mesma tentativa, com o primeiro como líder editando.

**Acceptance Scenarios**:

1. **Given** um Trabalho em grupo de máximo 4, **When** o aluno toca em "Iniciar", **Then** vê a mensagem com
   "Você pode incluir até 3", a lista dos colegas elegíveis em ordem de nome e a opção "Continuar sozinho".
2. **Given** a lista, **When** o aluno marca 2 colegas e confirma, **Then** o grupo é criado com ele como líder e
   os 2 colegas como integrantes, a tentativa do grupo começa e a tela segue para as questões com o líder
   editando.
3. **Given** a lista, **When** o aluno tenta marcar mais colegas que o permitido, **Then** os demais ficam
   indisponíveis e a contagem "n de N" mostra o limite; a confirmação exige ao menos 1 colega marcado.
4. **Given** a lista, **When** o aluno escolhe "Continuar sozinho", **Then** a sua tentativa é individual, como
   num Trabalho individual, e ele deixa de aparecer na lista dos colegas.
5. **Given** a lista aberta, **When** um colega marcado começa o trabalho em outro lugar (sozinho ou em outro
   grupo) antes da confirmação, **Then** a confirmação é recusada sem criar o grupo, a lista é relida e o aluno
   vê qual colega deixou de estar disponível.
6. **Given** a turma, **When** a lista é montada, **Then** ela nunca traz o próprio aluno, colegas não marcados
   presentes, colegas sem matrícula ativa, nem quem já iniciou o trabalho de qualquer forma.

---

### User Story 3 - Integrantes participam do grupo e quem já está num grupo é avisado (Priority: P1)

Os colegas escolhidos entram no grupo sem precisar aceitar. Ao abrirem o portal ou o trabalho, veem o aviso de
que estão no grupo do líder, com os nomes dos integrantes e quem está editando. Quem já participa de um grupo e
tenta abrir ou iniciar o mesmo trabalho vê que já está num grupo que está fazendo o trabalho e é levado à
tentativa do grupo.

**Why this priority**: sem isso, um integrante poderia iniciar o mesmo trabalho sozinho e o grupo perderia o
sentido.

**Independent Test**: depois do US2, um integrante abre o trabalho e vê o aviso com o líder e os integrantes e as
questões só para leitura; não há "Iniciar" para ele.

**Acceptance Scenarios**:

1. **Given** um aluno incluído num grupo, **When** ele abre o trabalho, **Then** vê "Você está no grupo de
   <líder> neste trabalho", os nomes dos integrantes, quem está editando e as respostas do grupo só para
   leitura.
2. **Given** um aluno incluído num grupo, **When** ele tenta iniciar o mesmo trabalho (inclusive por outra aba ou
   dispositivo), **Then** nada novo é criado e ele vê que já participa de um grupo que está fazendo o trabalho.
3. **Given** a lista "Minhas atividades" do integrante, **When** ele a abre, **Then** o trabalho aparece com a
   situação da tentativa do grupo (em andamento, entregue, corrigida) e a indicação "Em grupo".
4. **Given** um integrante lendo, **When** quem edita salva uma resposta, **Then** a resposta nova aparece na tela
   dele em até 10 segundos, sem recarregar a página.

---

### User Story 4 - Um integrante edita por vez e o líder passa a edição (Priority: P1)

Só um integrante edita a tentativa do grupo por vez; no início é o líder. O líder pode passar a edição a qualquer
integrante, que passa a editar do próprio computador, e pode retomá-la a qualquer momento. Quem não está editando
vê as respostas só para leitura, com o nome de quem está editando.

**Why this priority**: é a regra que torna a edição individual e rastreável, como o professor pediu.

**Independent Test**: o líder passa a edição para um integrante; o integrante salva uma resposta e o líder a vê
só para leitura; o líder retoma a edição e o integrante volta a ler.

**Acceptance Scenarios**:

1. **Given** a tentativa do grupo, **When** o líder toca em "Passar a edição" e escolhe um integrante, **Then**
   esse integrante passa a editar, o líder passa a ler e todos veem o novo nome em "Editando agora" em até 10
   segundos.
2. **Given** um integrante editando, **When** o líder toca em "Retomar a edição", **Then** o líder volta a
   editar na hora; o que o integrante já salvou fica, e um salvamento dele que chegue depois é recusado com o
   aviso de que a edição voltou ao líder.
3. **Given** um integrante que não está editando, **When** ele tenta salvar (por outra aba, por um salvamento
   atrasado ou por um pedido direto), **Then** o salvamento é recusado e nada da tentativa muda.
4. **Given** um integrante editando, **When** ele mesmo quer devolver, **Then** toca em "Devolver a edição" e o
   líder volta a editar.
5. **Given** dois pedidos de passagem simultâneos do líder, **When** chegam juntos, **Then** só um vale, e a
   edição fica com um único integrante.
6. **Given** a tentativa entregue, encerrada pelo prazo sem entrega atrasada ou cancelada, **When** alguém tenta
   passar, retomar ou editar, **Then** nada muda.

---

### User Story 5 - Líder inclui mais integrantes e entrega pelo grupo (Priority: P2)

Enquanto o trabalho está em andamento, o líder pode incluir mais colegas elegíveis até o máximo. Só o líder
entrega, uma vez, pelo grupo. Ninguém sai e ninguém é removido nesta etapa.

**Why this priority**: completa o ciclo do grupo; o grupo já funciona sem incluir depois do início.

**Independent Test**: num grupo de 2 com máximo 4, o líder inclui um terceiro colega; o novo integrante vê o
aviso. O líder entrega e os três veem a tentativa como entregue.

**Acceptance Scenarios**:

1. **Given** um grupo em andamento abaixo do máximo, **When** o líder abre "Incluir integrantes", **Then** vê a
   mesma lista de elegíveis do início e pode incluir até completar o máximo.
2. **Given** o grupo no máximo, **When** o líder tenta incluir, **Then** a opção não aparece e um pedido direto é
   recusado.
3. **Given** um integrante que não é o líder, **When** ele procura incluir ou entregar, **Then** não há essas
   opções e um pedido direto é recusado.
4. **Given** o líder segurando a edição, **When** ele entrega, **Then** a tentativa do grupo fica entregue para
   todos os integrantes, com a data e a hora da entrega e a marca de atrasada quando for o caso (012), e ninguém
   mais edita; **When** a edição está com outro integrante, **Then** "Entregar" pede que o líder retome a edição
   antes.
5. **Given** a entrega, **When** o professor corrige e libera a nota, **Then** cada integrante vê a mesma nota e o
   mesmo retorno, só depois da liberação (012).
6. **Given** qualquer integrante, **When** ele procura "Sair do grupo" ou o líder procura "Remover", **Then** essas
   opções não existem nesta etapa.

---

### User Story 6 - Professor vê o grupo, as passagens da edição e quem salvou cada resposta (Priority: P2)

Na correção, o professor vê a tentativa do grupo com o líder, os integrantes e quando cada um entrou, as
passagens da edição (de quem para quem e quando) e, por questão, quem salvou cada resposta e quando. Os registros
do modo controlado, as pausas e as execuções continuam por aluno. Tudo isso é fato para o professor, nunca nota.

**Why this priority**: é o controle que o professor pediu; o grupo já funciona sem ele.

**Independent Test**: depois de um trabalho em grupo com uma passagem de edição, o professor abre a tentativa e vê
os integrantes, a passagem e, na questão editada pelo integrante, o nome dele no salvamento.

**Acceptance Scenarios**:

1. **Given** um trabalho em grupo, **When** o professor abre a lista de entregas da atividade, **Then** vê uma
   linha por grupo (líder e integrantes) e uma por aluno que fez sozinho.
2. **Given** a tentativa do grupo, **When** o professor a abre, **Then** vê o líder, os integrantes com a hora
   em que entraram e quem os incluiu, e a linha do tempo das passagens da edição.
3. **Given** uma questão, **When** o professor olha os salvamentos, **Then** vê quem salvou e quando, por aluno,
   do primeiro ao último; o conteúdo exibido é o da resposta atual do grupo.
4. **Given** o modo controlado ou pausas (015/016), **When** o professor olha a linha do tempo, **Then** as saídas
   de tela, os retornos e as pausas aparecem com o nome do aluno a que pertencem.
5. **Given** os registros de edição, **When** o professor corrige, **Then** nenhum deles calcula, sugere ou muda
   a nota, nem rotula alguém; a nota é uma só para o grupo.

---

### User Story 7 - Modo controlado, pausa, ajuda da IA e execução no grupo (Priority: P2)

As regras de 015, 016 e 021 continuam por aluno dentro do grupo: cada integrante tem os próprios registros do
modo controlado e as próprias pausas; a ajuda da IA tem 3 orientações para o grupo inteiro; cada integrante pode
executar o código das questões de Código do próprio computador.

**Why this priority**: garante que as opções que o professor já usa sigam valendo num trabalho em grupo.

**Independent Test**: num trabalho em grupo CONTROLADO com ajuda da IA e execução, um integrante sai da tela e o
professor vê a saída com o nome dele; o grupo usa 3 orientações e a quarta é recusada; dois integrantes executam
o código, cada um do próprio computador.

**Acceptance Scenarios**:

1. **Given** um trabalho em grupo CONTROLADO, **When** um integrante sai da tela, **Then** o registro é dele, com
   o nome dele na linha do tempo, e não afeta os outros integrantes.
2. **Given** "Sair da sala" ou "Pausar aluno" (016) para um integrante, **When** a pausa está aberta, **Then** só
   esse integrante deixa de ver as questões e de agir; os outros seguem; se ele estava editando, a edição volta
   ao líder.
3. **Given** a ajuda da IA ligada, **When** o grupo recebe a terceira orientação, **Then** não há mais orientações
   para nenhum integrante; só quem está editando pede ajuda, e as orientações entregues aparecem para todos os
   integrantes.
4. **Given** a execução de código ligada (021), **When** qualquer integrante toca em "Executar" numa questão de
   Código, **Then** executa a resposta do grupo como está na tela dele, com o limite por minuto e a execução
   pendente contados para ele, sem salvar nada.
5. **Given** a chamada (016), **When** o líder escolhe integrantes, **Then** só colegas marcados presentes
   aparecem; desmarcar a presença de um integrante depois que o grupo começou é recusado como desmarcar quem já
   iniciou (016).

---

### Edge Cases

- Dois líderes escolhendo o mesmo colega ao mesmo tempo: só uma confirmação o inclui; a outra é recusada inteira
  (nenhum colega daquela escolha entra), a lista é relida e o aluno vê quem deixou de estar disponível.
- Colega incluído enquanto tenta "Iniciar" sozinho na própria máquina: vale o que chegar primeiro; o outro pedido
  é recusado com a mensagem correspondente ("Você já está num grupo" ou "Este colega já iniciou").
- Ninguém elegível na lista (todos já iniciaram ou não estão presentes): a mensagem diz que não há colegas
  disponíveis agora, e só "Continuar sozinho" fica disponível.
- "Continuar sozinho" é definitivo para aquele aluno naquele trabalho: ele não forma grupo depois nem entra em
  outro.
- Integrante editando que fecha o navegador: a edição continua com ele até o líder retomar; o líder vê "Editando
  agora: <nome>" e pode retomar a qualquer momento.
- Líder pausado (016) ou fora da sala: o grupo segue lendo; ninguém passa a edição nem entrega até o professor
  liberar o retorno do líder; o professor vê isso no painel da sala.
- Integrante com a matrícula encerrada ou removido da turma durante o trabalho: perde o acesso, como hoje; se
  estava editando, a edição volta ao líder; ele continua listado na correção como integrante.
- Líder com a matrícula encerrada ou removido da turma: a liderança passa ao integrante ativo que entrou primeiro
  no grupo, e esse fato fica registrado.
- Prazo encerrado sem entrega atrasada: a tentativa do grupo fica sem entrega, como uma tentativa individual
  (012); nada é entregue automaticamente.
- Atividade cancelada ou encerrada pelo professor: vale para o grupo inteiro, como para os individuais.
- "Aceitar como entrega" do professor (012) numa tentativa de grupo não entregue: vale para a tentativa do grupo e
  conta como entregue para todos os integrantes.
- Mudança de formato antes do primeiro início, com alunos com a página aberta: veem o novo formato na próxima
  leitura; um "Iniciar" com o formato antigo é recusado e a página relê a atividade.
- Salvamento automático pendente na tela do integrante quando o líder retoma: é recusado; a tela avisa que a
  edição voltou ao líder e mostra as respostas do grupo; o texto não salvo depois do último salvamento aceito é
  perdido (o salvamento automático da 012 limita essa perda a poucos segundos).
- Nomes de alunos com HTML ou caracteres especiais na lista, no aviso e na correção: aparecem como texto.

## Requirements *(mandatory)*

### Functional Requirements

**Aplicação (professor)**

- **FR-001**: Ao aplicar um Trabalho, o professor DEVE poder escolher o formato "Individual" (padrão) ou "Em
  grupo"; com "Em grupo", DEVE informar o máximo de integrantes por grupo, inteiro de 2 a 5, contando o líder.
- **FR-002**: O formato e o máximo DEVEM poder mudar até o primeiro aluno iniciar e DEVEM ser recusados depois
  disso, com a mesma regra das opções do trabalho (015): "o trabalho já começou".
- **FR-003**: Exercícios e Provas NÃO DEVEM ter formato; um pedido de aplicação ou de mudança que envie formato
  ou máximo para eles DEVE ser recusado. Trabalhos aplicados antes desta feature DEVEM ser individuais.

**Formação do grupo (aluno)**

- **FR-004**: Ao iniciar um Trabalho em grupo, o aluno DEVE ver "Esse trabalho é em grupo, escolha os integrantes
  do grupo. Você pode incluir até N" (N = máximo − 1), a lista dos colegas elegíveis em ordem de nome e a opção
  "Continuar sozinho".
- **FR-005**: São elegíveis os colegas da mesma turma com matrícula ativa, marcados presentes na chamada do
  trabalho (016) e que ainda não iniciaram aquele trabalho, nem sozinhos nem num grupo; o próprio aluno nunca
  aparece. A lista DEVE mostrar só o nome de cada colega.
- **FR-006**: Confirmar a escolha DEVE exigir de 1 a N colegas e DEVE, de uma vez, criar o grupo com o aluno como
  líder, incluir os colegas e iniciar a tentativa do grupo com o líder editando; se algum colega deixou de ser
  elegível, NADA DEVE ser criado e o aluno DEVE ver quem deixou de estar disponível.
- **FR-007**: "Continuar sozinho" DEVE iniciar uma tentativa individual, igual à de um Trabalho individual, e é
  definitivo para aquele aluno naquele trabalho.
- **FR-008**: Um aluno DEVE pertencer a no máximo um grupo por trabalho e NÃO DEVE ter ao mesmo tempo uma
  tentativa individual e um grupo no mesmo trabalho, mesmo com pedidos simultâneos.
- **FR-009**: Os colegas incluídos DEVEM entrar sem precisar aceitar e DEVEM ver, ao abrir o portal ou o
  trabalho, o aviso "Você está no grupo de <líder> neste trabalho", os nomes dos integrantes e quem está
  editando.
- **FR-010**: Quem já participa de um grupo e tenta abrir ou iniciar o mesmo trabalho DEVE ver que já participa de
  um grupo que está fazendo o trabalho e DEVE ser levado à tentativa do grupo; nada novo é criado.

**Tentativa do grupo e edição**

- **FR-011**: O grupo DEVE ter uma única tentativa, com uma única resposta por questão, vista por todos os
  integrantes.
- **FR-012**: Só um integrante DEVE editar a tentativa por vez; no início é o líder. Salvar respostas DEVE ser
  aceito só de quem está editando, enquanto a tentativa aceitaria um salvamento pela regra da 012 (em andamento,
  dentro do prazo ou com entrega atrasada aceita, não pausada para aquele aluno).
- **FR-013**: O líder DEVE poder passar a edição para qualquer integrante ativo e retomá-la a qualquer momento;
  quem está editando, se não for o líder, DEVE poder devolvê-la ao líder. Cada passagem vale na hora; pedidos
  simultâneos DEVEM terminar com um único editor.
- **FR-014**: Quem não está editando DEVE ver as respostas do grupo só para leitura, com "Editando agora:
  <nome>", atualizadas sem recarregar a página em até 10 segundos depois de cada salvamento, por consulta
  periódica (sem conexão permanente).
- **FR-015**: Cada salvamento aceito DEVE ficar registrado com o aluno, a questão e a hora, e cada passagem da
  edição com quem passou, quem recebeu e a hora; esses registros NÃO DEVEM guardar o conteúdo das respostas,
  NÃO DEVEM ser apagados nem alterados e NUNCA DEVEM calcular, sugerir ou mudar a nota.

**Inclusão e entrega**

- **FR-016**: Enquanto a tentativa do grupo estiver em andamento, o líder DEVE poder incluir colegas elegíveis
  (FR-005) até completar o máximo, com as mesmas regras de FR-006 e FR-009.
- **FR-017**: Nesta etapa NÃO DEVE existir saída do grupo, remoção de integrante nem troca de líder pelo aluno;
  a liderança só muda no caso de FR-023.
- **FR-018**: Só o líder DEVE poder entregar, e só segurando a edição (se um integrante está editando, o líder
  retoma a edição antes de entregar, para nada não salvo se perder sem aviso); a entrega DEVE ser única para o
  grupo, seguir as regras de prazo e entrega atrasada da 012 e valer para todos os integrantes. O "Aceitar como
  entrega" do professor (012) vale para a tentativa do grupo e, portanto, para todos os integrantes.
- **FR-019**: A nota e o retorno do professor DEVEM ser os mesmos para todos os integrantes e só DEVEM aparecer a
  cada um depois da liberação, com as regras da 012 (inclusive a permissão de ver as próprias notas).

**Correção (professor)**

- **FR-020**: A lista de entregas da atividade DEVE mostrar uma linha por grupo (líder e integrantes) e uma por
  aluno que fez sozinho; os contadores do professor ("x de y entregaram" e afins) DEVEM contar por aluno: cada
  integrante de um grupo que entregou conta como entregue; a correção do grupo DEVE mostrar o líder, os integrantes com a hora em que entraram e
  quem os incluiu, as passagens da edição e, por questão, quem salvou e quando.
- **FR-021**: Os registros do modo controlado (015), as pausas (016) e as execuções de código (021) DEVEM
  continuar por aluno e aparecer na correção com o nome do aluno.

**Opções que já existem**

- **FR-022**: No grupo, a ajuda da IA (015) DEVE ter 3 orientações para o grupo inteiro; só quem está editando
  DEVE poder pedir, um pedido de cada vez por grupo, e as orientações entregues DEVEM aparecer para todos os
  integrantes; a regra de não revelar o gabarito continua a mesma.
- **FR-023**: Uma pausa (016) DEVE valer só para o aluno pausado: ele não vê as questões nem age; se estava
  editando, a edição volta ao líder. Se o líder perder o acesso à turma, a liderança DEVE passar ao integrante
  ativo que entrou primeiro, e esse fato DEVE ficar registrado.
- **FR-024**: Com a execução de código ligada (021), cada integrante DEVE poder executar, do próprio computador,
  a resposta do grupo de uma questão de Código como está na tela dele, com o limite por minuto e a execução
  pendente contados para ele; executar não salva nem entrega.
- **FR-025**: Desmarcar a presença (016) de um aluno que está num grupo DEVE ser recusado como desmarcar quem já
  iniciou.

**Mensagens e textos**

- **FR-026**: Nenhum texto desta feature DEVE chamar uma edição, uma passagem ou uma saída de "fraude", "cola" ou
  "violação"; nomes e textos dos alunos DEVEM ser exibidos como texto, nunca interpretados.

### Security, Permissions & Audit *(mandatory if feature has protected operations)*

- **Permissions**: o professor escolhe o formato com a permissão de aplicar atividades (`atividades.aplicar`) e
  vê grupos e registros com a de ver as entregas (`entregas.visualizar`); o aluno forma o grupo, inclui, passa,
  retoma e devolve a edição, salva e entrega com a de responder às próprias atividades
  (`atividades.proprias.responder`) e lê com a de ver as próprias atividades (`atividades.proprias.visualizar`).
  Nenhuma permissão nova. Ser líder ou editor é contexto do recurso, não permissão.
- **Resource context**: o aluno, só em trabalhos da sua turma com matrícula ativa e presença marcada, e só na
  tentativa do próprio grupo ou na própria; incluir, passar e entregar só como líder; salvar só como editor. Um
  aluno que não é do grupo recebe o mesmo `404` de uma atividade de outra turma. O professor, só nas atividades
  das próprias turmas. Ação permitida a outro papel do grupo (ex.: integrante tentando entregar) → recusa com
  código de regra, sem efeito.
- **Audit events**: mudança de formato (ids, valores anterior e novo); grupo criado; integrante incluído;
  edição passada, retomada e devolvida; liderança transferida pelo sistema (FR-023); salvamento recusado por não
  ser o editor. Metadados só com ids, enums, contagens e horários: nunca nomes, respostas ou textos.
- **Untrusted input**: o corpo da formação e da inclusão traz só os ids dos colegas; atividade, turma, líder,
  máximo e elegibilidade vêm do servidor. A passagem traz só o id do integrante; o servidor confere que ele é do
  grupo e está ativo. Nenhum corpo traz líder, editor, grupo ou horários.
- **States & transitions**: a tentativa do grupo segue os estados da 012 (em andamento → entregue → corrigida →
  liberada). A edição tem um único dono por vez, trocado só pelas passagens de FR-013 e FR-023; transição
  inválida → `409 INVALID_STATE_TRANSITION`.
- **Idempotency**: formar o grupo, incluir e iniciar sozinho são decididos sob bloqueio da atividade e do aluno,
  de modo que um aluno nunca fique em dois grupos nem num grupo e sozinho; repetir uma passagem para o mesmo
  integrante não cria um segundo registro; a entrega continua única (012).
- **Evidence vs. decisions**: salvamentos, passagens, saídas de tela, pausas e execuções são FACT; a nota é
  HUMAN_DECISION do professor, uma só para o grupo. Nenhum registro vira nota, desconto ou rótulo.
- **Automation risk level**: L1 (regras determinísticas de formação, edição e entrega; a ajuda da IA mantém o
  nível e as salvaguardas da 015).
- **Domain configurability**: o formato e o máximo são do professor por atividade; nada fica fixo por disciplina
  ou turma.
- **Sensitive data & adaptations**: a lista de elegíveis mostra só o nome; nada de e-mail, RA ou situação de
  outros alunos. Os registros de edição não guardam conteúdo.
- **Curricular traceability**: N/A (as questões já trazem os tópicos da 011).

### Key Entities *(include if feature involves data)*

- **Atividade de Trabalho**: ganha o formato (Individual ou Em grupo) e o máximo de integrantes (2 a 5, só em
  grupo), fixos depois do primeiro início.
- **Grupo**: pertence a uma atividade; tem o líder atual, a hora de criação e uma única tentativa.
- **Integrante do grupo**: aluno, grupo, hora de entrada e quem o incluiu; um aluno pertence a no máximo um grupo
  por atividade, e nunca junto com uma tentativa individual na mesma atividade.
- **Tentativa do grupo**: a tentativa da 012, compartilhada pelo grupo, com uma resposta por questão e uma
  entrega.
- **Posse da edição**: quem edita agora a tentativa do grupo; uma por grupo.
- **Registro de passagem da edição**: quem passou, quem recebeu, motivo (passagem, retomada, devolução, pausa,
  perda de acesso) e hora; só acrescentado.
- **Registro de salvamento**: aluno, questão e hora de cada salvamento aceito, sem o conteúdo; só acrescentado.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Um aluno forma um grupo de 3 a partir de "Iniciar" em menos de 1 minuto, e os colegas escolhidos
  veem o aviso do grupo na próxima abertura do portal ou do trabalho.
- **SC-002**: Em 100% dos casos com pedidos simultâneos (dois líderes, ou líder e o próprio colega iniciando),
  nenhum aluno fica em dois grupos nem num grupo e numa tentativa individual do mesmo trabalho.
- **SC-003**: Em 100% dos casos, só o integrante que está editando consegue salvar; qualquer outro salvamento é
  recusado sem mudar a tentativa.
- **SC-004**: Quem lê vê a resposta salva por quem edita em até 10 segundos, sem recarregar a página.
- **SC-005**: Para cada resposta da tentativa do grupo, o professor identifica quem a salvou por último e quando,
  e cada passagem da edição, sem consultar ninguém.
- **SC-006**: Depois da liberação, 100% dos integrantes veem a mesma nota e o mesmo retorno; antes dela, nenhum vê.
- **SC-007**: Trabalhos individuais, Exercícios e Provas se comportam exatamente como antes desta feature (todos
  os testes existentes deles continuam passando sem mudança).
- **SC-008**: Num grupo com a ajuda da IA ligada, a quarta orientação é recusada para qualquer integrante em 100%
  dos casos.

## Assumptions

- O formato padrão é "Individual": aplicar em grupo é uma escolha explícita do professor, e trabalhos antigos não
  mudam.
- Um Trabalho novo já é liberado só para os presentes (016), então a lista de elegíveis sempre parte da chamada;
  um trabalho antigo sem chamada é individual (FR-003) e não precisa dessa regra.
- O mínimo de um grupo é 2 (o líder e mais um colega); um aluno sozinho faz o trabalho individual, nunca um
  "grupo de 1".
- "Continuar sozinho" é definitivo naquele trabalho; o aluno não forma grupo nem entra num depois.
- Os integrantes não aceitam nem recusam: entram direto, como o professor pediu; não há convite pendente.
- Só quem está editando pede ajuda da IA, porque a orientação serve a quem escreve; as orientações entregues
  ficam visíveis ao grupo inteiro, que divide as 3.
- A execução de código usa a resposta como está na tela de quem executa (para quem lê, a última resposta salva);
  o limite por minuto e a execução pendente continuam por aluno (019/021).
- Os registros de edição guardam quem e quando, nunca o conteúdo nem a diferença entre versões; a resposta que o
  professor corrige é a entregue.
- A atualização para quem lê usa consulta periódica de poucos segundos enquanto a página está visível, como a
  chamada e a sala da 016; não há WebSockets (regra do projeto).
- Fora do escopo desta etapa: sair do grupo, remover integrante, trocar de líder por escolha, nota diferente por
  integrante, edição simultânea, grupos formados pelo professor e grupos em Exercícios ou Provas.
