# Feature Specification: Prova em Modo Restrito com Avisos e Decisão do Professor

**Feature Branch**: `018-controlled-exams`
**Created**: 2026-10-12
**Status**: Draft
**Input**: User description: "Provas (EXAM) aplicadas à turma. O professor cria a prova manualmente
ou com IA ("Criar prova com IA": a IA gera um rascunho que o professor revisa e aprova; a IA nunca
publica). Duração definida pelo professor, de no máximo 2 horas, contada pelo relógio do servidor.
O aluno vê um cronômetro e recebe um alerta quando faltam 10 minutos, outro quando faltam 5 minutos
e uma contagem regressiva nos últimos 10 segundos. Quando o tempo acaba, a prova se encerra
automaticamente e o aluno não consegue mais responder. A nota é calculada sobre as respostas já
salvas, e as questões sem resposta não pontuam. A prova só é liberada para os alunos que o
professor marcar presentes na chamada da prova (como a 016). Se o aluno precisar sair da sala, o
professor fecha a prova daquele aluno (pausa, como a 016) e só ele libera o retorno quando o aluno
estiver de volta. O tempo continua correndo durante a pausa, e o aluno é avisado disso antes de
começar. A prova roda sempre em modo restrito, como o modo CONTROLLED da 015 (página em foco/tela
cheia), sem ajuda de IA. Sair da tela (perder o foco ou sair da tela cheia), tentar copiar ou colar
texto ou ficar sem interagir além do limite de inatividade é uma ocorrência. O professor configura
esse limite por prova, de 30 a 60 segundos. Cada ocorrência é um fato registrado com o horário do
servidor. As três primeiras ocorrências geram um aviso ao aluno (aviso 1 de 3, 2 de 3, 3 de 3). Na
4ª ocorrência, o sistema encerra a tentativa na hora, como resultado de regra (RULE_RESULT): o
aluno não pode mais responder e vê a mensagem "Prova encerrada por excesso de avisos; o
cancelamento com nota zero será confirmado pelo professor". O sistema não cancela a prova sozinho.
O professor vê as ocorrências registradas e decide: confirma o cancelamento (decisão humana,
auditada), e aí o aluno fica com nota zero, ou devolve a prova para o aluno continuar. Só é
possível devolver enquanto ainda houver tempo de prova. Ao devolver, as ocorrências já registradas
continuam contando, e a próxima encerra a tentativa de novo. Se o tempo acabar antes da decisão, o
professor ainda pode confirmar o cancelamento (nota zero) ou não cancelar, e então vale a nota das
respostas já salvas. Antes de começar, o aluno vê as regras: avisos, encerramento, nota zero no
cancelamento e tempo que corre durante a pausa. Respeita a constituição v3.4.0 (Princípios X e
XI)."

## Contexto: o que já existe e o que muda

A constituição prevê três tipos de atividade: `EXERCISE`, `ASSIGNMENT` e `EXAM` (XXIII). A 012
criou a atividade de turma com Exercício e Trabalho e deixou Prova reservada, recusada em toda
tela, rota e contrato (012 FR-003, FR-036, SC-012). A 015 criou o modo CONTROLADO do Trabalho, em
que saídas da tela e tentativas de copiar e colar são só registradas e **nunca** bloqueiam a
tentativa. A 016 criou a chamada e a pausa, e deixou escrito que a Prova deve adotar as duas
(016 Assumptions). A 005 definiu o contrato visual do Exam Mode (cronômetro, alertas da avaliação,
aviso de perda de foco), cujos componentes ficaram para esta feature.

| Ponto | Hoje (012–017) | Depois desta feature |
|-------|----------------|----------------------|
| Prova | Tipo reservado, recusado | Existe: o professor cria (manual ou com IA), aplica à turma e corrige |
| Tempo | Só prazo de entrega (Trabalho) | Duração de 1 a 120 minutos, cronômetro do servidor, alertas aos 10 e 5 minutos, contagem nos últimos 10 segundos, encerramento automático |
| Quem vê | Trabalho novo: só os presentes (016) | Prova: sempre só os presentes na chamada da prova |
| Modo | Trabalho: NORMAL ou CONTROLADO, à escolha | Prova: **sempre** restrito, sem opção |
| Saída da tela, copiar/colar | Trabalho CONTROLADO: só registro, nunca bloqueia | Prova: cada uma é uma **ocorrência**; 3 avisos e, na 4ª, a tentativa é encerrada |
| Inatividade | Não é observada | Prova: ficar sem interagir além do limite (30 a 60 s, configurado pelo professor) é uma ocorrência |
| Ajuda da IA ao aluno | Trabalho: opcional (015) | Prova: **nunca** |
| Pausa | Trabalho: o aluno declara ou o professor pausa (016) | Prova: o professor pausa; o tempo continua correndo |
| Nota zero | Nunca automática | Só depois que o professor confirma o cancelamento |

```text
Professor ──cria prova (manual | "Criar prova com IA" → rascunho)──▶ Prova APROVADA
     │
     └─ aplica à turma: duração, limite de inatividade, abertura ──▶ Atividade de Prova (snapshot)
            └─ Chamada (016): marca presentes ──▶ cada presente vê as regras e inicia

Aluno ──aceita as regras, tela cheia──▶ Tentativa EM ANDAMENTO (cronômetro do servidor)
   │   ocorrência 1, 2, 3 ──▶ aviso "n de 3" (FACT)
   │   ocorrência 4 ──▶ ENCERRADA POR AVISOS (RULE_RESULT) ──▶ aguarda o professor
   │                         ├─ "Confirmar cancelamento" ──▶ CANCELADA, nota zero (HUMAN_DECISION)
   │                         └─ "Devolver prova" (só com tempo restante) ──▶ EM ANDAMENTO
   │   professor "Pausar aluno" ──▶ PAUSADA (tempo corre) ──"Liberar retorno"──▶ EM ANDAMENTO
   ├─ "Entregar" ──▶ ENTREGUE
   └─ tempo esgotado ──▶ ENCERRADA POR TEMPO (vale o que foi salvo)
```

**Constituição**: esta spec é a regra de negócio explícita que o Princípio X pede para interpretar
os fatos (`eventos → evidências → análise/regras → professor`). Nenhuma ocorrência é chamada de
fraude ou cola. O encerramento na 4ª ocorrência é um `RULE_RESULT` anunciado ao aluno antes do
início e reversível pelo professor. O cancelamento e a nota zero são decisões do professor
(`HUMAN_DECISION`), nunca do sistema (XI: anulação de avaliação e penalidade). O tempo, o início, o
fim e a contagem de ocorrências são do servidor (III). A regra da 015 de que saídas da tela nunca
bloqueiam continua valendo para o Trabalho; ela não se aplica à Prova, que tem esta regra própria.

## Clarifications

### Session 2026-10-12

- Q: Onde a prova é criada? → A: num **Banco de Provas** próprio do professor, separado dos bancos
  de exercícios (010) e de trabalhos (011), reutilizável entre turmas e semestres. A prova passa por
  rascunho e aprovação e é aplicada à turma como cópia (snapshot), como o trabalho na 011/012.
- Q: Quanto tempo tem o aluno atrasado? → A: cada aluno tem a **duração inteira**, contada a partir
  do seu próprio início, mas só pode iniciar até um **limite para iniciar** que o professor define
  ao aplicar (minutos depois da abertura). Depois desse limite, nenhum aluno inicia, mesmo marcado
  presente.

## User Scenarios & Testing *(mandatory)*

Os perfis envolvidos são:

- o **professor** responsável pela turma, que cria, aplica, acompanha, decide e corrige;
- o **aluno**, com papel STUDENT, matrícula `ACTIVE` na turma e presença marcada na chamada da
  prova;
- o **ADMIN**, que só habilita o agente de IA da geração de provas (006).

MANAGER não tem acesso. Os testes citam os ids dos cenários no formato `018/USn-k`.

### User Story 1 - Professor cria uma prova manualmente (Priority: P1)

No seu Banco de Provas, separado dos bancos de exercícios e de trabalhos, o professor cria uma
prova informando a disciplina, o título, a nota total e de 1 a 20 questões dos tipos que já
existem (Pergunta e resposta, Múltipla escolha e Código), cada uma com o seu gabarito, um ou mais
tópicos da ementa e uma dificuldade (Básico, Intermediário ou Avançado). O valor de cada questão é
calculado como na 011, com soma exata em centésimos. A prova nasce como rascunho e só pode ser
aplicada depois de aprovada pelo professor. Ela é reutilizável entre turmas e semestres. Nenhuma IA
é usada.

**Why this priority**: é o núcleo da prova e funciona sem IA, sem custo e sem modelo aprovado.

**Independent Test**: criar uma prova manual com uma questão de cada tipo, conferir os valores
calculados, aprovar e conferir que ela fica disponível para aplicação e que nenhuma execução de IA
foi criada.

**Acceptance Scenarios**:

1. **Given** o professor com uma disciplina de ementa confirmada, **When** cria uma prova com 3
   questões, nota total 10,00 e gabarito completo, **Then** a prova é salva como rascunho com os
   valores 3,34, 3,33 e 3,33, e a criação é auditada.
2. **Given** uma prova com uma questão sem gabarito, sem tópico ou sem dificuldade, **When** o
   professor tenta aprová-la, **Then** a aprovação é recusada e a interface aponta a questão.
3. **Given** uma prova com 0 ou 21 questões, **When** salva, **Then** é recusada pelo servidor.
4. **Given** uma prova aprovada, **When** o professor a edita, **Then** as mudanças valem para as
   próximas aplicações, e nenhuma prova já aplicada muda.
5. **Given** outro professor, **When** tenta ver, editar ou aprovar a prova, **Then** recebe "não
   encontrado".

---

### User Story 2 - Professor aplica a prova à turma e faz a chamada (Priority: P1)

O professor aplica uma prova aprovada a uma turma da mesma disciplina. Ele define a duração (1 a
120 minutos), o limite de inatividade (30 a 60 segundos), a abertura (agora ou num horário
futuro) e o limite para iniciar (de 0 a 60 minutos depois da abertura). Antes de confirmar, vê a cobertura da prova: quantas questões e quantos pontos por tópico
da ementa e por dificuldade, com os tópicos fora do escopo ensinado da turma sinalizados (012
FR-005a). A turma guarda uma cópia da prova. Depois, como na 016, o professor faz a chamada da
prova e só os alunos marcados presentes a veem.

**Why this priority**: sem aplicar, a prova não chega ao aluno; a cobertura antes da publicação é
exigência da constituição (XXIII).

**Independent Test**: aplicar uma prova com duração de 30 minutos e limite de 45 segundos a uma
turma de 3 alunos, conferir a cobertura antes da confirmação, marcar 2 presentes e conferir que só
esses 2 a veem.

**Acceptance Scenarios**:

1. **Given** uma prova aprovada, **When** o professor abre "Aplicar prova", **Then** vê a
   distribuição de questões e pontos por tópico e por dificuldade antes de confirmar.
2. **Given** uma duração fora de 1 a 120 minutos, um limite de inatividade fora de 30 a 60
   segundos ou um limite para iniciar fora de 0 a 60 minutos, **When** o professor confirma, **Then** a aplicação é recusada pelo servidor.
3. **Given** a prova aplicada, **When** nenhum aluno foi marcado na chamada, **Then** nenhum aluno a
   vê, e a atividade mostra "Aguardando chamada".
4. **Given** a chamada com 2 alunos marcados, **When** um aluno não marcado tenta ver, iniciar ou
   salvar a prova por qualquer via, **Then** recebe "não encontrado", como uma atividade de outra
   turma.
5. **Given** a aplicação de uma prova, **When** o professor procura as opções de modo de execução,
   ajuda da IA ou chamada opcional, **Then** elas não existem: a prova é sempre restrita, sem ajuda
   e só para os presentes.
6. **Given** a prova do banco editada depois da aplicação, **When** o aluno a abre, **Then** vê a
   versão aplicada.

---

### User Story 3 - Aluno faz a prova com tempo controlado (Priority: P1)

O aluno presente abre a prova e vê as regras antes de começar: a duração, os três avisos, o
encerramento na 4ª ocorrência, a nota zero se o professor confirmar o cancelamento, que o tempo
continua correndo numa pausa e que não há ajuda da IA. Ele aceita e inicia; a prova abre em tela
cheia, com um cronômetro do servidor. Ele responde com salvamento automático (012). Faltando 10
minutos e faltando 5 minutos, recebe um alerta; nos últimos 10 segundos, vê uma contagem
regressiva. Ele pode entregar antes do fim. Se o tempo acabar, a prova se encerra sozinha, ele não
consegue mais responder e a nota é calculada sobre as respostas já salvas.

**Why this priority**: é a experiência central do aluno e a regra de tempo pedida.

**Independent Test**: iniciar uma prova de 1 minuto, responder 1 de 3 questões, deixar o tempo
acabar e conferir que a tentativa está encerrada, que salvar é recusado e que só a resposta salva
é considerada na correção.

**Acceptance Scenarios**:

1. **Given** a prova liberada ao aluno, **When** ele a abre, **Then** vê as regras e só inicia ao
   aceitá-las por ação explícita; o início é registrado com o horário do servidor.
2. **Given** a tentativa em andamento, **When** o aluno recarrega a página ou troca de dispositivo,
   **Then** o cronômetro mostra o tempo restante calculado pelo servidor, e não o do navegador.
3. **Given** faltam 10 minutos, e depois 5 minutos, **When** o momento chega, **Then** o aluno vê
   um alerta não bloqueante com o tempo restante, anunciado também para leitores de tela.
4. **Given** faltam 10 segundos, **When** o momento chega, **Then** o aluno vê uma contagem
   regressiva até zero.
5. **Given** o tempo esgotado, **When** o aluno tenta salvar ou entregar, **Then** o servidor recusa
   (`409`), a tela mostra "Tempo esgotado. Suas respostas salvas foram registradas." e as questões
   deixam de ser editáveis.
6. **Given** uma prova de 3 questões com 1 respondida e salva, **When** o tempo acaba, **Then** a
   tentativa vale como encerrada por tempo, a questão respondida é corrigida e as 2 sem resposta não
   pontuam.
7. **Given** uma prova de 60 minutos com limite para iniciar de 15 minutos, **When** um aluno
   atrasado é marcado e inicia 12 minutos depois da abertura, **Then** ele tem os 60 minutos
   inteiros, contados do seu início.
8. **Given** o limite para iniciar já passado, **When** um aluno presente que não iniciou abre a
   prova, **Then** vê "O prazo para iniciar esta prova terminou. Fale com o professor." e o
   servidor recusa o início (`409`). O aluno aparece como "Não iniciou".
9. **Given** dois cliques em "Entregar" ou entrega concorrendo com o fim do tempo, **When**
   processados, **Then** há uma única tentativa encerrada, sem duplicata.

---

### User Story 4 - Ocorrências, avisos e encerramento na 4ª (Priority: P1)

Durante a tentativa, sair da tela (perder o foco ou sair da tela cheia), tentar copiar, recortar,
colar ou arrastar texto, ou ficar sem interagir além do limite de inatividade é uma ocorrência.
Cada ocorrência é registrada com o horário do servidor. Nas três primeiras, o aluno vê um aviso
neutro: "Aviso 1 de 3: você saiu da tela da prova. Na 4ª ocorrência a prova será encerrada.". Na
4ª, o servidor encerra a tentativa na hora e o aluno vê "Prova encerrada por excesso de avisos; o
cancelamento com nota zero será confirmado pelo professor". O professor vê o aluno como "Encerrada
por avisos — aguardando decisão".

**Why this priority**: é a regra de integridade pedida e a razão de a prova ser restrita.

**Independent Test**: provocar 3 ocorrências de tipos diferentes e conferir os avisos 1, 2 e 3;
provocar a 4ª e conferir que a tentativa está encerrada, que salvar é recusado em qualquer
dispositivo e que o professor vê o aluno aguardando decisão.

**Acceptance Scenarios**:

1. **Given** a tentativa em andamento, **When** o aluno troca de aba, **Then** a ocorrência é
   registrada com o tipo e o horário do servidor, e ao voltar ele vê "Aviso 1 de 3".
2. **Given** a tentativa em andamento, **When** o aluno tenta colar texto, **Then** o texto não é
   colado, a ocorrência é registrada e ele vê o aviso seguinte.
3. **Given** o limite de inatividade de 30 segundos, **When** o aluno fica 31 segundos sem teclado,
   mouse, toque ou rolagem, **Then** uma ocorrência de inatividade é registrada e ele vê o aviso.
   Um mesmo período sem interação conta uma única vez.
4. **Given** uma única ação que dispara mais de um sinal (sair da tela cheia e perder o foco ao
   mesmo tempo), **When** registrada, **Then** conta como uma só ocorrência.
5. **Given** 3 ocorrências, **When** acontece a 4ª, **Then** o servidor encerra a tentativa, salva o
   que já estava salvo, recusa toda escrita (`409`) e o aluno vê a mensagem de encerramento em
   qualquer dispositivo.
6. **Given** ocorrências que chegam ao mesmo tempo (duas abas, reenvio), **When** processadas,
   **Then** cada uma conta uma vez e o encerramento acontece exatamente uma vez.
7. **Given** o aluno sem conexão, **When** ocorrências acontecem, **Then** elas são guardadas no
   navegador e enviadas na reconexão; o servidor as conta na chegada, guardando o horário do
   navegador só como informação.
8. **Given** qualquer aviso ou encerramento, **When** exibido ao aluno ou ao professor, **Then** o
   texto nunca usa "fraude", "cola" ou "violação".

---

### User Story 5 - Professor decide: confirmar o cancelamento ou devolver a prova (Priority: P1)

Na tela de acompanhamento da prova, o professor vê os alunos encerrados por avisos, com a lista
das ocorrências (tipo, horário e duração). Para cada um, ele escolhe "Confirmar cancelamento" (a
prova do aluno é cancelada e a nota é zero) ou "Devolver prova" (o aluno continua de onde parou,
com o tempo que ainda resta). Devolver só é possível enquanto houver tempo. As ocorrências já
registradas continuam contando, e a próxima encerra a tentativa de novo. Se o tempo acabar antes
da decisão, o professor ainda pode confirmar o cancelamento ou "Não cancelar", e então vale a nota
das respostas salvas.

**Why this priority**: sem a decisão do professor, o encerramento seria uma penalidade automática,
o que a constituição proíbe (XI).

**Independent Test**: encerrar duas tentativas por avisos; confirmar o cancelamento de uma e
conferir a nota zero; devolver a outra, conferir que o aluno continua com o tempo restante e que a
ocorrência seguinte encerra de novo.

**Acceptance Scenarios**:

1. **Given** uma tentativa encerrada por avisos, **When** o professor confirma o cancelamento por
   ação explícita, **Then** a tentativa fica cancelada com nota zero, a decisão é auditada com o
   professor e o horário, e o aluno vê "Prova cancelada pelo professor".
2. **Given** uma tentativa encerrada por avisos com tempo restante, **When** o professor devolve a
   prova, **Then** em até 10 segundos o aluno vê "Retomar", volta à tela cheia por ação explícita e
   encontra todas as respostas salvas; o cronômetro mostra o tempo que resta.
3. **Given** uma tentativa devolvida com 4 ocorrências, **When** acontece mais uma, **Then** a
   tentativa é encerrada de novo e volta a aguardar a decisão.
4. **Given** uma tentativa encerrada por avisos cujo tempo acabou, **When** o professor tenta
   devolvê-la, **Then** a operação é recusada (`409`) e a interface oferece só "Confirmar
   cancelamento" e "Não cancelar".
5. **Given** o tempo acabado e o professor escolhendo "Não cancelar", **When** confirmado, **Then**
   a tentativa vale como encerrada com as respostas salvas e segue para a correção normal.
6. **Given** uma tentativa aguardando decisão, **When** o professor tenta liberar o resultado da
   prova, **Then** a liberação é recusada até que todas as decisões pendentes sejam tomadas.
7. **Given** duas abas do professor ou dois cliques, **When** decidem a mesma tentativa, **Then**
   só a primeira decisão vale; a segunda é recusada como transição inválida, sem segundo evento.
8. **Given** um cancelamento confirmado, **When** registrado, **Then** a nota zero é uma decisão do
   professor (`HUMAN_DECISION`), nunca gravada antes dela.

---

### User Story 6 - Professor pausa o aluno que precisa sair da sala (Priority: P2)

O aluno que precisa sair pede ao professor, que usa "Pausar aluno" na tela de acompanhamento,
como na 016. A tela cheia é encerrada sem gerar ocorrência, a prova fica fechada para ele em
qualquer dispositivo e o tempo continua correndo. Quando ele volta, o professor usa "Liberar
retorno" e o aluno continua de onde parou, com o tempo que resta.

**Why this priority**: cobre a saída legítima sem ocorrência; é rara numa prova, mas precisa
existir.

**Independent Test**: pausar um aluno com 20 minutos restantes, esperar 2 minutos, liberar o
retorno e conferir 18 minutos restantes, as respostas intactas e nenhuma ocorrência registrada
durante a pausa.

**Acceptance Scenarios**:

1. **Given** a tentativa em andamento, **When** o professor pausa o aluno, **Then** em até 10
   segundos a tela do aluno mostra "Prova pausada pelo professor. O tempo continua correndo.", sem
   enunciados nem respostas, em qualquer dispositivo.
2. **Given** a tentativa pausada, **When** chegam eventos de foco, de copiar/colar ou de
   inatividade, **Then** nenhum conta como ocorrência.
3. **Given** a tentativa pausada, **When** o tempo acaba, **Then** a tentativa é encerrada por tempo
   com as respostas salvas e a pausa termina com ela.
4. **Given** a pausa, **When** o professor libera o retorno com tempo restante, **Then** o aluno
   retoma como na US5 (cenário 2).
5. **Given** uma prova, **When** o aluno procura "Sair da sala", **Then** a opção não existe: só o
   professor pausa.

---

### User Story 7 - Professor cria uma prova com IA (Priority: P2)

O professor usa "Criar prova com IA", escolhe a disciplina, os tópicos da ementa confirmada, a
dificuldade, a nota total, a quantidade de questões (1 a 20) e os tipos. A IA gera um rascunho, com
cada questão ligada a pelo menos um dos tópicos escolhidos, com gabarito e dificuldade. O professor
revisa, edita e aprova; a IA nunca aprova, aplica nem publica.

**Why this priority**: economiza tempo, mas a prova manual (US1) já entrega o valor central.

**Independent Test**: com o agente habilitado e a resposta fixa do provedor de teste, gerar uma
prova de 5 questões e conferir que ela nasce como rascunho, com origem IA, cada questão ligada aos
tópicos escolhidos, e que a aprovação exige ação do professor.

**Acceptance Scenarios**:

1. **Given** o agente de geração de provas habilitado, **When** o professor pede uma prova de 5
   questões sobre 2 tópicos, **Then** recebe um rascunho com 5 questões, cada uma ligada a um dos 2
   tópicos, com gabarito e dificuldade.
2. **Given** uma resposta da IA com questão fora dos tópicos escolhidos, sem gabarito ou com
   quantidade diferente, **When** validada, **Then** é rejeitada no servidor e nada é salvo como
   aprovado.
3. **Given** o agente desabilitado ou sem modelo aprovado, **When** o professor abre a tela, **Then**
   "Criar prova com IA" aparece como indisponível e a criação manual continua funcionando.
4. **Given** o pedido, **When** enviado, **Then** não contém modelo, provedor nem nível de
   capacidade (009); o texto da ementa é tratado como dado não confiável.
5. **Given** a prova gerada, **When** o aluno faz a prova, **Then** nenhuma IA é chamada durante a
   tentativa.

---

### User Story 8 - Professor corrige e libera o resultado vendo as ocorrências (Priority: P2)

Depois da prova, o professor corrige como na 012: Múltiplas escolhas já corrigidas pela regra,
Pergunta e resposta e Código pendentes da nota do professor. Ao abrir cada tentativa, ele vê o
início, o fim (entregue, tempo esgotado, encerrada por avisos, cancelada), as ocorrências, as
pausas e as decisões. Quando todas as decisões pendentes foram tomadas, ele libera o resultado.

**Why this priority**: fecha o ciclo da prova; usa a correção da 012.

**Independent Test**: com quatro tentativas (entregue, tempo esgotado, cancelada, devolvida e
entregue), corrigir, liberar e conferir a nota e o que cada aluno vê.

**Acceptance Scenarios**:

1. **Given** a lista de alunos da prova, **When** o professor a abre, **Then** vê para cada aluno a
   situação (ausente, não iniciou, em andamento, pausado, aguardando decisão, entregue, tempo
   esgotado, cancelada) e o número de ocorrências.
2. **Given** uma tentativa cancelada, **When** o professor libera o resultado, **Then** o aluno vê
   nota zero e "Prova cancelada pelo professor", sem pendência de correção.
3. **Given** uma tentativa encerrada por tempo, **When** corrigida, **Then** as questões sem resposta
   valem zero sem ação do professor, e as respondidas seguem a correção da 012.
4. **Given** o aluno depois da liberação, **When** abre o histórico, **Then** vê a nota, o feedback,
   as próprias ocorrências e pausas, e nunca o gabarito de questões que não sejam da regra da 012
   nem os dados de outro aluno.
5. **Given** um aluno presente que nunca iniciou, **When** a prova fecha, **Then** ele aparece como
   "Não iniciou", sem nota automática.

---

### Edge Cases

- **Atrasado marcado depois da abertura**: recebe a prova quando é marcado e, se ainda estiver
  dentro do limite para iniciar, tem a duração inteira a partir do seu início (US3, cenário 7).
- **Atrasado marcado depois do limite para iniciar**: a marcação é permitida (016), mas ele não
  consegue iniciar (US3, cenário 8). Uma segunda chamada fica fora do escopo.
- **Professor encerra a atividade antes do fim de alguém**: vale a 012; a tentativa termina com as
  respostas salvas, como se o tempo tivesse acabado.
- **Alt+Tab rápido ou notificação do sistema operacional**: qualquer perda de foco conta como
  ocorrência, mesmo curta. As regras mostradas antes do início dizem isso.
- **Dispositivo sem tela cheia (alguns celulares)**: a prova roda em página em foco; perder o foco
  continua sendo ocorrência. O aluno é informado antes de iniciar.
- **Alerta de 10 minutos numa prova de até 10 minutos**: o alerta não aparece se a prova já começa
  com menos tempo que o marco; vale o mesmo para 5 minutos.
- **Resposta digitada nos últimos segundos**: o salvamento é imediato no último minuto. O que chega
  ao servidor depois do fim é recusado; uma tolerância curta de rede pode ser definida no plano,
  nunca pelo relógio do navegador.
- **Conexão perdida no fim**: respostas não enviadas até o fim não contam; o professor vê que a
  tentativa terminou sem conexão e pode, por decisão própria, aceitar respostas que o aluno mostrar
  fora do sistema (fora do escopo do sistema).
- **Ocorrência que chega depois do encerramento por tempo, por entrega ou por avisos**: é guardada
  como fato, mas não conta e não gera aviso.
- **Professor encerra ou cancela a atividade inteira**: vale a 012. Tentativas em andamento são
  encerradas com as respostas salvas; decisões pendentes continuam pendentes.
- **Matrícula removida durante a prova**: o aluno perde o acesso, como na 012.
- **Pausa e 4ª ocorrência ao mesmo tempo**: o que chega antes ao servidor vale; a ocorrência que
  chega depois da pausa não conta.
- **Relógio do navegador errado**: o cronômetro usa o fim calculado pelo servidor; o navegador só
  conta os segundos entre consultas.
- **Inatividade enquanto o aluno lê uma questão longa**: conta como ocorrência; o professor escolhe
  o limite (30 a 60 s) pensando nisso.
- **Copiar dentro do editor de código**: também bloqueado e registrado; o aluno digita.

## Requirements *(mandatory)*

### Functional Requirements

**Criação da prova**

- **FR-001**: O professor DEVE ter um Banco de Provas próprio, separado dos bancos de exercícios
  (010) e de trabalhos (011), com dados, regras, telas e permissões próprios, sem importação entre
  eles. Nele, ele cria provas manualmente, com disciplina, título, nota total (até duas casas) e de
  1 a 20 questões dos tipos da 011 (Pergunta e resposta, Múltipla escolha e Código), com as mesmas
  regras de estrutura e gabarito da 011 (FR-004 a FR-008). Uma prova do banco é reutilizável entre
  turmas e semestres.
- **FR-002**: Toda questão de prova DEVE ter um ou mais tópicos de uma revisão confirmada da ementa
  da disciplina e uma dificuldade (Básico, Intermediário ou Avançado).
- **FR-003**: O valor de cada questão DEVE ser calculado em centésimos com soma exata igual à nota
  total, pela regra da 011.
- **FR-004**: A prova DEVE ter os estados rascunho, aprovada e arquivada; só uma prova aprovada pode
  ser aplicada. Aprovar exige gabarito, tópico e dificuldade em toda questão.
- **FR-005**: "Criar prova com IA" DEVE gerar um rascunho por um agente de IA L2 próprio, registrado
  DESABILITADO até o ADMIN habilitá-lo, com modelo escolhido pela política da 009 e evidência de
  release gate. O escopo são só os tópicos escolhidos; toda questão gerada DEVE estar ligada a um
  deles e ter gabarito; saídas inválidas são rejeitadas no servidor.
- **FR-006**: Nenhuma execução de IA DEVE aprovar, aplicar, publicar, encerrar, cancelar ou dar nota
  em uma prova.

**Aplicação e acesso**

- **FR-007**: O professor DEVE poder aplicar uma prova aprovada a uma turma da mesma disciplina,
  definindo a duração (inteiro de 1 a 120 minutos), o limite de inatividade (inteiro de 30 a 60
  segundos, padrão 60), a abertura e o limite para iniciar (inteiro de 0 a 60 minutos depois da
  abertura, padrão 15). O fechamento da atividade é derivado: limite para iniciar + duração. A turma guarda uma cópia da prova; mudar a prova original
  nunca altera a aplicada.
- **FR-008**: Antes de confirmar a aplicação, o professor DEVE ver a distribuição das questões e dos
  pontos por tópico e por dificuldade, com os tópicos fora do escopo ensinado da turma sinalizados;
  aplicar com tópicos fora do escopo exige confirmação explícita, auditada (012 FR-005a).
- **FR-009**: Toda prova aplicada DEVE exigir chamada (016): só os alunos marcados presentes a veem
  e operam sobre ela; os demais recebem `404` em toda via (lista, dashboard, detalhe, início,
  salvamento, entrega, eventos). Não existe prova liberada a todos os matriculados.
- **FR-010**: A prova DEVE rodar sempre em modo restrito e sem ajuda da IA. O pedido de aplicação
  NÃO DEVE aceitar modo de execução, ajuda da IA nem modo de liberação.

**Tempo**

- **FR-011**: O início da tentativa DEVE ser registrado pelo servidor quando o aluno aceita as
  regras, e só DEVE ser aceito entre a abertura e o limite para iniciar; fora disso, o início é
  recusado com `409`. O fim de cada tentativa é o início dela mais a duração inteira, calculado pelo
  servidor, inclusive para o aluno atrasado. O fim nunca muda por pausa, aviso, encerramento por
  avisos ou devolução; só o encerramento da atividade pelo professor (012) o antecipa.
- **FR-012**: O aluno DEVE ver um cronômetro com o tempo restante calculado pelo servidor, um alerta
  quando faltam 10 minutos, outro quando faltam 5 minutos e uma contagem regressiva nos últimos 10
  segundos. Os alertas não bloqueiam a tela e são anunciados a leitores de tela.
- **FR-013**: Esgotado o tempo, o servidor DEVE recusar com `409` salvamentos, entrega e eventos da
  tentativa, e a tentativa vale como encerrada por tempo com as respostas salvas até ali. A situação
  "tempo esgotado" é derivada do horário do servidor na leitura, nunca de um job.
- **FR-014**: A nota de uma tentativa encerrada por tempo DEVE ser calculada só sobre as respostas
  salvas; questões sem resposta valem zero sem ação do professor.

**Ocorrências e avisos**

- **FR-015**: São ocorrências durante a tentativa em andamento: perda de foco da página, saída da
  tela cheia, tentativa de copiar, recortar, colar ou arrastar texto (sempre bloqueada) e ausência de
  interação (teclado, mouse, toque ou rolagem) por mais que o limite de inatividade.
- **FR-016**: Cada ocorrência DEVE ser registrada como fato, com o tipo e o horário do servidor; o
  horário do navegador, quando enviado, fica só como informação. Sinais disparados por uma mesma
  ação num intervalo curto (definido no plano) contam como uma só ocorrência; um período contínuo
  sem interação conta uma só vez.
- **FR-017**: O servidor DEVE contar as ocorrências da tentativa. Na 1ª, 2ª e 3ª, o aluno vê o aviso
  "Aviso n de 3" com o tipo da ocorrência e a regra do encerramento.
- **FR-018**: Na 4ª ocorrência, e em toda ocorrência posterior a uma devolução, o servidor DEVE
  encerrar a tentativa por avisos (`RULE_RESULT`), na mesma operação que registra a ocorrência,
  exatamente uma vez sob concorrência. A partir daí, recusa com `409` salvamentos, entrega e
  eventos, e o aluno vê "Prova encerrada por excesso de avisos; o cancelamento com nota zero será
  confirmado pelo professor".
- **FR-019**: O encerramento por avisos NÃO DEVE cancelar a prova, dar nota nem rotular o aluno. Ele
  é um estado que aguarda a decisão do professor.
- **FR-020**: Ocorrências que chegam com a tentativa pausada, encerrada ou entregue DEVEM ser
  guardadas como fato, sem contar e sem aviso.

**Decisão do professor**

- **FR-021**: O professor da turma DEVE poder, numa tentativa encerrada por avisos, confirmar o
  cancelamento (a tentativa fica cancelada e a nota é zero) ou devolver a prova. A decisão é
  explícita, auditada e registrada como `HUMAN_DECISION`.
- **FR-022**: Devolver DEVE ser permitido só enquanto o fim calculado da tentativa não chegou; a
  tentativa volta a em andamento com as respostas salvas e o tempo restante. Depois do fim, devolver
  é recusado com `409`.
- **FR-023**: Com o tempo esgotado antes da decisão, o professor DEVE poder confirmar o cancelamento
  ou "Não cancelar"; neste caso, a tentativa vale como encerrada com as respostas salvas.
- **FR-024**: A liberação do resultado da prova DEVE ser recusada enquanto houver tentativa
  aguardando decisão.
- **FR-025**: A tela de acompanhamento da prova DEVE mostrar, para cada aluno, a situação (ausente,
  não iniciou, em andamento, pausado, aguardando decisão, entregue, tempo esgotado, cancelada), o
  tempo restante e o número de ocorrências, e atualizar-se sozinha em até 10 segundos.

**Pausa**

- **FR-026**: O professor DEVE poder pausar a tentativa em andamento de um aluno e liberar o retorno,
  com o efeito da 016 (FR-013, FR-014, FR-016): sem enunciados nem respostas em nenhum dispositivo,
  escritas recusadas com `409`. O aluno NÃO DEVE poder declarar a saída numa prova.
- **FR-027**: O tempo DEVE continuar correndo durante a pausa. A pausa encerra a tela cheia sem
  ocorrência, e nenhum evento recebido durante ela conta. Liberar o retorno depois do fim é recusado;
  a tentativa já está encerrada por tempo.

**Visões, correção e mensagens**

- **FR-028**: Antes de iniciar, o aluno DEVE ver as regras: duração, ocorrências contadas, três
  avisos, encerramento na 4ª, nota zero se o professor confirmar o cancelamento, tempo que corre na
  pausa e ausência de ajuda da IA. O aceite é registrado.
- **FR-029**: Toda visão do aluno DEVE ser montada no servidor por lista fechada de campos (012
  FR-032). Nenhum gabarito chega ao aluno durante a prova; depois da liberação, valem as regras da
  012.
- **FR-030**: A correção e a liberação DEVEM seguir a 012 (Múltipla escolha pela regra, Pergunta e
  resposta e Código pelo professor, nota final do professor). Ocorrências e pausas nunca alteram uma
  nota automaticamente; só o cancelamento confirmado dá zero.
- **FR-031**: Ao abrir uma tentativa, o professor DEVE ver o início, o fim e o motivo do fim, cada
  ocorrência (tipo, horário, duração da inatividade ou da saída), as pausas e as decisões com autor e
  horário. O aluno vê as próprias ocorrências e pausas depois do fim da tentativa.
- **FR-032**: Avisos, encerramentos e telas do professor NUNCA DEVEM usar "fraude", "cola",
  "violação" ou termo equivalente.
- **FR-033**: As telas novas DEVEM seguir o contrato do Exam Mode (005), ter os estados carregando,
  vazio, sucesso, erro e sem conexão, ser operáveis por teclado e usar os tokens e componentes do
  Design System; situações e avisos são mostrados por texto, não só por cor.

**Fora do escopo (garantias)**

- **FR-034**: Esta feature NÃO DEVE:
  - cancelar uma prova ou dar nota zero sem decisão do professor;
  - oferecer ajuda da IA, modo NORMAL ou liberação a todos os matriculados numa prova;
  - executar código do aluno (Código é corrigido pelo professor);
  - usar câmera, microfone, gravação de tela, geolocalização ou bloqueio do sistema operacional;
  - estender o tempo por pausa ou devolução;
  - mudar as regras do Trabalho (015 e 016 continuam como estão);
  - criar mais de uma tentativa por aluno e prova, ou prova para casa;
  - notificar por e-mail.

### Security, Permissions & Audit *(mandatory if feature has protected operations)*

- **Permissions**: os nomes são definidos no plano, e nenhuma checagem usa nome de papel.
  - Professor: permissões novas para criar, editar, aprovar e arquivar provas, gerar prova com IA,
    aplicar prova e decidir encerramentos (confirmar cancelamento, devolver, não cancelar); as da
    016 para chamada, pausa e retorno; as da 012 para ver entregas, corrigir e liberar.
  - Aluno: `atividades.proprias.responder` (012) para iniciar, responder, entregar e enviar
    ocorrências.
  - ADMIN: só habilita o agente (006).
- **Resource context**:
  - Professor: dono da prova; responsável pela turma da atividade de Prova.
  - Aluno: matrícula ACTIVE, presença registrada e tentativa própria.
  - Fora do contexto → `404`.
- **Audit events**:
  - prova criada, editada, aprovada, arquivada e restaurada; geração com IA pedida e concluída;
  - prova aplicada (com a confirmação de tópicos fora do escopo, quando houver);
  - tentativa iniciada (aceite das regras), entregue;
  - tentativa encerrada por avisos;
  - cancelamento confirmado, prova devolvida, "não cancelar";
  - pausa e retorno (016);
  - escrita recusada por tempo esgotado, encerramento por avisos ou pausa;
  - acesso negado por falta de presença (016).

  Os metadados levam só ids, enums, contagens e horários, nunca enunciado, resposta ou texto da
  ocorrência.
- **Untrusted input**: o cliente nunca define início, fim, duração restante, contagem de
  ocorrências, situação da tentativa nem horário oficial de uma ocorrência; esses campos, se
  enviados, são recusados. O tipo da ocorrência vem de lista fechada. Os sinais vêm do navegador e
  podem ser suprimidos por um cliente adulterado: a supervisão em sala é do professor, e o sistema
  registra o que recebe.
- **States & transitions**:
  - Prova: rascunho → aprovada → arquivada (e restaurar).
  - Tentativa: EM ANDAMENTO → ENTREGUE; EM ANDAMENTO → ENCERRADA POR AVISOS → (CANCELADA | EM
    ANDAMENTO, só com tempo | ENCERRADA, "não cancelar" só depois do fim); EM ANDAMENTO ⇄ PAUSADA.
  - Tempo esgotado, PAUSADA e "aguardando decisão" são derivados na leitura; nada é gravado por job.
  - Transição inválida → `409 INVALID_STATE_TRANSITION`.
- **Idempotency**: uma tentativa por aluno e prova, garantida pelo banco; a ocorrência que encerra
  conta uma vez; entrega, encerramento e decisão são seguros sob cliques repetidos, abas e
  reenvios; salvamento, ocorrência, entrega, pausa e decisão da mesma tentativa são serializados.
- **Evidence vs. decisions**:
  - FACT: ocorrências, início, horários, pausas, respostas salvas.
  - RULE_RESULT: aviso n de 3, encerramento por avisos, encerramento por tempo, correção de Múltipla
    escolha, recusa de escritas.
  - SUGGESTION: rascunho da prova gerado pela IA.
  - HUMAN_DECISION: aprovação e aplicação da prova, presença, pausa, retorno, cancelamento (nota
    zero), devolução, "não cancelar", notas do professor e liberação.
- **Automation risk level**: geração de prova é L2 (rascunho revisado pelo professor). Não há IA
  durante a tentativa nem na decisão.
- **Domain configurability**: tópicos, linguagens e dificuldades vêm de dados (004, 010, 011); a
  lista de tipos de ocorrência é da plataforma.
- **Sensitive data & adaptations**: ocorrências e decisões são dados acadêmicos do aluno; só ele (as
  dele, depois do fim) e o professor da turma os veem. Adaptações de tempo para alunos com
  necessidades específicas (XXII) ficam para uma feature própria (ver Assumptions).
- **Curricular traceability**: toda questão de prova é ligada a tópicos da ementa; a cobertura é
  mostrada antes da aplicação.

### Key Entities *(include if feature involves data)*

- **Prova do Banco de Provas (modelo)**: professor, disciplina, título, nota total, situação,
  origem (manual ou IA) e questões (tipo, enunciado, gabarito, valor, tópicos, dificuldade).
  Separada dos exercícios (010) e dos trabalhos (011).
- **Atividade de Prova**: cópia da prova aplicada a uma turma, com duração, limite de inatividade,
  abertura e limite para iniciar; o fechamento é derivado. Sempre restrita, sem ajuda e com chamada.
- **Tentativa de prova**: aluno, atividade, início (aceite das regras), fim calculado, situação e
  respostas (012).
- **Ocorrência**: tentativa, tipo (perda de foco, saída da tela cheia, copiar, recortar, colar,
  arrastar, inatividade), horário do servidor, horário do navegador opcional, duração quando houver
  e se contou.
- **Decisão do encerramento**: tentativa, decisão (cancelamento confirmado, devolução, não
  cancelar), professor e horário.
- **Presença e pausa (016)**: reaproveitadas para a Prova.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Em 100% dos testes de acesso, um aluno não marcado presente não recebe nenhum dado da
  prova em nenhuma via.
- **SC-002**: Em 100% dos testes, nenhum salvamento, entrega ou ocorrência é aceito depois do fim
  calculado pelo servidor, e o tempo restante mostrado ao aluno difere do servidor em no máximo 2
  segundos após uma recarga.
- **SC-003**: Os alertas de 10 e 5 minutos e a contagem dos 10 segundos aparecem em 100% das
  tentativas que atravessam esses marcos.
- **SC-004**: Em 100% dos testes, as 3 primeiras ocorrências geram os avisos 1, 2 e 3, e a 4ª
  encerra a tentativa exatamente uma vez, mesmo com 10 ocorrências simultâneas.
- **SC-005**: 0 provas canceladas ou notas zero sem uma decisão registrada do professor.
- **SC-006**: Uma prova devolvida retoma com 100% das respostas salvas e com o tempo restante igual
  ao fim original menos o horário atual; devolver depois do fim é recusado em 100% dos casos.
- **SC-007**: O professor vê um aluno encerrado por avisos em até 10 segundos e decide com uma ação.
- **SC-008**: Uma tentativa encerrada por tempo com k de n questões respondidas é corrigida só
  sobre as k, sem ação do professor nas n − k.
- **SC-009**: 100% das gerações com IA nascem como rascunho com todas as questões ligadas aos tópicos
  escolhidos; 0 chamadas de IA durante tentativas.
- **SC-010**: 100% dos encerramentos por avisos, cancelamentos, devoluções e "não cancelar" geram
  exatamente um evento de auditoria, sem enunciado nem resposta nos metadados.
- **SC-011**: O aluno faz a prova (aceitar as regras, responder, entregar) e o professor aplica,
  acompanha e decide só com o teclado, em desktop e celular.
- **SC-012**: Trabalhos e Exercícios continuam como antes (testes da 012 a 016 inalterados, exceto
  os que reservavam a Prova).

## Assumptions

- **Tipos de questão e limite**: as provas usam os três tipos da 011, com 1 a 20 questões (o dobro
  do trabalho). Código é corrigido pelo professor até existir o executor de código.
- **Dificuldade por questão**: diferente do trabalho (dificuldade do trabalho inteiro), cada questão
  de prova tem dificuldade, para a cobertura exigida pela constituição (XXIII). Objetivos de
  aprendizagem ainda não existem na ementa (004); a cobertura mostra tópico e dificuldade.
- **Uma tentativa**: cada aluno tem uma única tentativa por prova; não há segunda chamada nesta
  feature.
- **Pausa só pelo professor**: na prova, o aluno pede ao professor para sair; não existe "Sair da
  sala" do aluno, para que a saída passe sempre pela supervisão.
- **Atualização por consulta periódica**: sem WebSockets; a tela de acompanhamento e a tela do aluno
  consultam o servidor (5 s, como a 016); 10 segundos é o atraso máximo aceito.
- **Sinais do navegador**: perda de foco, tela cheia, copiar/colar e inatividade são detectados pelo
  navegador. A prova não tenta impedir capturas de tela, segundo dispositivo nem extensões; a
  supervisão em sala e a chamada são do professor.
- **Adaptações de tempo** (XXII): tempo extra para um aluno fica para uma feature própria; nesta, a
  duração é a mesma para todos.
- **Limites**: o intervalo que agrupa sinais da mesma ação, a tolerância de rede no fim e os limites
  de requisição são definidos no plano, no padrão das features anteriores.
