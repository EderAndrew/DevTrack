# Feature Specification: Pontuação e Ranking dos Exercícios

**Feature Branch**: `013-exercise-points-ranking`
**Created**: 2026-10-03
**Status**: Draft
**Input**: User description: "Pontuação e ranking dos exercícios (altera a 012). Exercícios não têm
nota nem prazo: notas e tempo são exclusivos de trabalhos e provas. Os exercícios continuam sendo
criados como na 010 (manual, com a resposta informada pelo professor, ou pela IA, que já gera a
resposta), e o professor continua aplicando de 1 a 10 exercícios aprovados a uma turma, agora sem
nota total, sem prazo e sem regra de atraso: o aluno faz no tempo dele. A pontuação é fixa pelo
nível do exercício: Básico 15, Intermediário 30, Avançado 60, tudo ou nada. O gabarito nunca
aparece antes de o aluno concluir; ao concluir, ele vê o gabarito e os pontos. Múltipla escolha
pontua na conclusão; pergunta e resposta e completar o código ficam aguardando correção até o
professor marcar certo ou errado. O aluno pode refazer quantas vezes quiser, mas só a primeira
conclusão de cada exercício conta ponto. Ranking por turma, visível a todos os alunos matriculados:
o painel mostra do 1º ao 5º lugar e um link "Ranking" abre a tela com todas as posições. Os pontos
nunca são nota. Trabalhos continuam como na 012. Problemas de código com execução ficam fora."

## Contexto: o que muda na 012

A 012 tratou a atividade de Exercício como uma avaliação igual ao Trabalho: nota total definida
pelo professor, prazo, regra de atraso, uma tentativa, entrega única, correção em nota e
liberação do resultado (Clarification de 2026-10-01: "Atividades de Exercício têm nota? → sim").
Esta feature **reverte essa decisão**: exercício é prática e engajamento (constituição XXIII:
`EXERCISE` = prática/fixação, múltiplas tentativas, feedback imediato), não avaliação. Notas e
tempo ficam exclusivos de Trabalho (012) e Prova (futura).

| Ponto | 012 hoje (Exercício) | Depois desta feature (Exercício) | Trabalho |
|-------|----------------------|----------------------------------|----------|
| Nota | Nota total 0,01–100,00 dividida em centésimos (FR-001, FR-028, US1-7) | **Não existe.** Pontos fixos pelo nível do exercício | Não muda |
| Prazo e atraso | Prazo obrigatório e regra de atraso (FR-001, FR-024a, US1-8) | **Não existem.** Só a data de publicação | Não muda |
| Tentativas | Uma por aluno (FR-016) | **Ilimitadas**; só a primeira conclusão de cada exercício pontua | Não muda |
| Gabarito ao aluno | Nunca (FR-030) | **Mostrado depois de cada conclusão** | Não muda (nunca) |
| Correção | Nota por questão e liberação do resultado (FR-006, FR-027–029) | Certo/errado por exercício; Múltipla escolha pela regra, as demais pelo professor; **sem liberação** | Não muda |
| Situações | PENDENTE, EM_ANDAMENTO, ATRASADO, ENTREGUE, CORRIGIDO (FR-014) | PENDENTE, EM_ANDAMENTO, CONCLUÍDO | Não muda |
| Ranking | Fora do escopo (FR-036) e o aluno nunca vê a lista da turma (FR-009) | **Ranking da turma** por pontos, visível aos alunos da turma | — |

Os bancos de exercícios (010) e de trabalhos (011) **não mudam**: o exercício já tem nível
(Básico, Intermediário, Avançado) e já guarda a resposta — informada pelo professor no cadastro
manual ou gerada pela IA. Execução de código (problemas de programação com casos de teste, Code
Runner) fica para o fim do roadmap (constituição IV).

```text
Exercício do banco (nível) ──aplicado──▶ Atividade de Exercício da turma (snapshot, sem prazo)
                                                   │
Aluno ──(matrícula ACTIVE)──▶ Tentativa 1 ──concluir──▶ resultado por exercício: certo / errado / aguardando correção
                              Tentativa 2…  ──concluir──▶ só prática: gabarito, sem pontos
                                                   │
                     Pontos do aluno = soma dos exercícios certos na PRIMEIRA conclusão (15 / 30 / 60)
                                                   │
                                     Ranking da turma (derivado dos pontos)
```

## Clarifications

### Session 2026-10-03

- Q: Exercícios têm nota? → A: não. Exercícios têm pontos; notas e tempo são exclusivos de
  trabalhos e provas. Reverte a Clarification da 012 de 2026-10-01.
- Q: Quanto vale cada exercício? → A: fixo pelo nível: Básico 15, Intermediário 30, Avançado 60;
  o professor não define.
- Q: Como pontuar Pergunta e resposta e Código sem correção automática? → A: o professor marca
  certo ou errado; Múltipla escolha pontua na conclusão pela regra.
- Q: Acerto parcial? → A: não — tudo ou nada por exercício.
- Q: O que é "a primeira vez"? → A: a primeira **conclusão**; abrir e sair sem concluir não conta.
- Q: Quem vê o ranking? → A: todos os alunos matriculados na turma: o painel mostra do 1º ao 5º
  lugar e "Ranking" abre a tela com todas as posições. O ranking mostra só pontuação, não nota.
- Q: O mesmo exercício do banco aplicado de novo à mesma turma pontua de novo? → A: **B** — não:
  pontua uma vez só por aluno na turma; na outra atividade aparece como "já pontuado" (FR-010a).
- Q: Como o nome aparece no ranking? → A: **A** — nome completo, como cadastrado (FR-020).
- Q: E as atividades de Exercício já aplicadas pela 012? → A: **A** — a 012 ainda não está em uso
  com alunos reais; elas são convertidas para pontos sem preservar notas (Assumptions).

## User Scenarios & Testing *(mandatory)*

Os perfis são o **aluno** (papel STUDENT, matrícula `ACTIVE` na turma) e o **professor** da
turma. ADMIN e MANAGER não têm acesso (constituição XXIV). Ids de cenário são citados nos testes
como `013/USn-k`.

### User Story 1 - Professor aplica exercícios sem nota e sem prazo (Priority: P1)

O professor escolhe de 1 a 10 exercícios aprovados do seu banco e os aplica à turma com título,
instruções e data de publicação (imediata ou agendada). Não informa nota total, prazo nem regra
de atraso: cada exercício vale os pontos do seu nível, e a tela mostra o total possível da
atividade. Aplicar um trabalho continua exatamente como na 012.

**Why this priority**: sem aplicar exercícios no formato novo não há o que o aluno pratique nem
pontos para o ranking.

**Independent Test**: aplicar 3 exercícios (um de cada nível) a uma turma e conferir que a
atividade não tem nota, prazo nem regra de atraso, que vale 105 pontos e que os alunos a veem.

**Acceptance Scenarios**:

1. **Given** um exercício Básico, um Intermediário e um Avançado aprovados, **When** o professor
   os aplica a uma turma sua, **Then** a atividade de Exercício existe com valores 15, 30 e 60
   pontos, total de 105 pontos, sem nota total, sem prazo e sem regra de atraso.
2. **Given** um pedido de aplicação de exercícios com nota total, prazo ou regra de atraso,
   **When** enviado, **Then** é recusado (campo não permitido para Exercício).
3. **Given** uma atividade aplicada, **When** o professor muda o nível do exercício no banco,
   **Then** os pontos da atividade não mudam (snapshot).
4. **Given** um trabalho aprovado, **When** o professor o aplica, **Then** nota total, prazo e
   regra de atraso continuam obrigatórios como na 012.
5. **Given** uma atividade de Exercício, **When** o professor a edita, **Then** pode mudar título,
   instruções e a data de publicação ainda não atingida; nunca exercícios nem pontos.

---

### User Story 2 - Aluno pratica, conclui e vê gabarito e pontos (Priority: P1)

O aluno abre a atividade de Exercício, responde no tempo dele (com o salvamento automático e o
modo sem conexão da 012) e toca em "Concluir exercícios". Na conclusão vê, por exercício, se
acertou, errou ou se aguarda a correção do professor, o gabarito (alternativa correta, resposta
esperada ou solução) e a explicação, e os pontos ganhos. Pode refazer quantas vezes quiser; só a
primeira conclusão de cada exercício vale pontos.

**Why this priority**: é o ciclo de prática que gera os pontos e o engajamento pedido.

**Independent Test**: concluir uma atividade com uma Múltipla escolha certa (Básico) e uma
Pergunta e resposta, ver 15 pontos e uma questão aguardando correção; refazer acertando tudo e
conferir que os pontos não mudam.

**Acceptance Scenarios**:

1. **Given** uma atividade de Exercício publicada, **When** o aluno a abre antes de concluir,
   **Then** não há prazo, contagem de tempo, nota nem gabarito na tela ou na resposta da API.
2. **Given** uma Múltipla escolha Intermediária respondida certo, **When** o aluno conclui pela
   primeira vez, **Then** ela aparece como "Certo", com 30 pontos, a alternativa correta e a
   explicação.
3. **Given** uma Múltipla escolha errada ou um exercício em branco, **When** o aluno conclui,
   **Then** aparece como "Errado", com 0 ponto e o gabarito; um exercício em branco nunca vai para
   a correção do professor.
4. **Given** uma Pergunta e resposta ou um Código respondidos, **When** o aluno conclui pela
   primeira vez, **Then** aparecem como "Aguardando correção", com a resposta esperada ou a
   solução e a explicação, sem pontos ainda.
5. **Given** uma atividade já concluída, **When** o aluno toca em "Refazer", **Then** começa uma
   nova tentativa em branco; ao concluí-la, vê certo/errado nas Múltiplas escolhas, o gabarito e
   a mensagem de que refazer não vale pontos, e seus pontos continuam os da primeira conclusão.
6. **Given** "Concluir" enviado duas vezes (clique duplo, reenvio após queda de conexão), **When**
   processado, **Then** existe uma só conclusão daquela tentativa e uma só pontuação.
7. **Given** duas abas concluindo tentativas da mesma atividade ao mesmo tempo, **When**
   processadas, **Then** só uma é a primeira conclusão e pontua; a outra é tratada como refazer.
8. **Given** a conclusão com exercícios em branco, **When** o aluno toca em "Concluir
   exercícios", **Then** a confirmação informa quantos estão em branco e que eles valem 0 ponto
   nesta conclusão.
9. **Given** um exercício do banco já pontuado pelo aluno numa atividade da turma e aplicado de
   novo em outra, **When** o aluno conclui a outra pela primeira vez, **Then** esse exercício
   aparece "já pontuado", com resultado e gabarito, vale 0 ponto e não vai para a fila do
   professor; os demais exercícios pontuam normalmente.

---

### User Story 3 - Professor marca certo ou errado (Priority: P1)

O professor vê, por atividade de Exercício, quem concluiu e as respostas de Pergunta e resposta e
de Código das primeiras conclusões que aguardam correção. Marca cada uma como certa ou errada,
com comentário opcional. Os pontos entram no ranking assim que ele marca, sem liberação.

**Why this priority**: sem isso, Pergunta e resposta e Código nunca pontuam.

**Independent Test**: com duas primeiras conclusões aguardando correção, marcar uma certa e uma
errada e conferir os pontos e o ranking dos dois alunos.

**Acceptance Scenarios**:

1. **Given** uma Pergunta e resposta Avançada aguardando correção, **When** o professor a marca
   certa, **Then** o aluno ganha 60 pontos, vê "Certo" e o comentário, e o ranking da turma
   muda imediatamente.
2. **Given** uma resposta marcada, **When** o professor muda a marcação, **Then** os pontos e o
   ranking mudam, e a mudança é auditada.
3. **Given** respostas de tentativas de refazer, **When** o professor abre a atividade, **Then**
   elas não aparecem na fila de correção.
4. **Given** um professor de outra turma ou um aluno, **When** tenta marcar, **Then** recebe "não
   encontrado" ou "sem permissão", conforme o caso.
5. **Given** a tela de correção do professor, **When** inspecionada, **Then** não há campo de
   nota, valor parcial nem "liberar resultado" para Exercício.

---

### User Story 4 - Aluno vê o ranking da turma (Priority: P2)

No painel, o aluno vê, para cada turma em que está matriculado, o 1º ao 5º lugar com nome e
pontos. "Ranking" abre a tela com todas as posições da turma.

**Why this priority**: é o incentivo de engajamento; depende dos pontos das histórias anteriores.

**Independent Test**: com uma turma de 7 alunos e pontos variados (inclusive empate e alunos sem
pontos), conferir o top 5 no painel, a lista completa e a ausência de alunos de outras turmas e
de alunos removidos.

**Acceptance Scenarios**:

1. **Given** uma turma com 7 alunos com pontos, **When** um aluno abre o painel, **Then** vê do 1º
   ao 5º lugar, com nome e pontos, em ordem decrescente de pontos.
2. **Given** dois alunos com os mesmos pontos, **When** o ranking é montado, **Then** dividem a
   mesma posição, a seguinte pula (1º, 2º, 2º, 4º) e, dentro do empate, a ordem é alfabética.
3. **Given** um aluno ainda sem pontos, **When** o ranking é montado, **Then** ele aparece com 0
   ponto, na posição compartilhada pelos alunos com 0 ponto.
4. **Given** "Ranking", **When** o aluno o abre, **Then** vê todas as posições da turma, com a
   sua destacada por texto e não só por cor.
5. **Given** um aluno matriculado em duas turmas, **When** vê o painel, **Then** vê um ranking
   por turma, cada um só com os alunos daquela turma e os pontos ganhos nela.
6. **Given** um aluno removido da turma (003), **When** o ranking é montado, **Then** ele não
   aparece; **Given** um aluno de outra turma, **When** pede o ranking desta, **Then** recebe "não
   encontrado".
7. **Given** a resposta do ranking, **When** inspecionada, **Then** contém só posição, nome e
   pontos de cada aluno — nenhum e-mail, id de usuário, resposta, nota de trabalho ou atividade.

---

### User Story 5 - Professor vê o ranking da turma (Priority: P3)

O professor vê o ranking completo de cada turma sua, com os mesmos dados que os alunos veem.

**Why this priority**: útil para o professor acompanhar o engajamento, mas o ciclo do aluno não
depende disso.

**Independent Test**: abrir o ranking de uma turma do professor e conferir que é igual ao dos
alunos; o de uma turma de outro professor responde "não encontrado".

**Acceptance Scenarios**:

1. **Given** uma turma do professor, **When** ele abre o ranking, **Then** vê todas as posições,
   iguais às que os alunos veem.
2. **Given** uma turma de outro professor, **When** ele pede o ranking, **Then** recebe "não
   encontrado".

---

### Edge Cases

- **Atividade de Exercício cancelada**: some do portal e seus pontos deixam de contar no ranking;
  os registros são preservados e as respostas aguardando correção não podem mais ser marcadas.
- **Atividade encerrada pelo professor**: ninguém inicia nem conclui mais; os pontos já ganhos
  continuam contando, e as correções pendentes ainda podem ser feitas.
- **Aluno removido e depois readmitido na turma** (003): os pontos anteriores voltam a contar.
- **Matrícula removida com tentativa aberta**: o aluno perde o acesso; nada pontua depois.
- **Aluno matriculado depois da publicação**: pode fazer a atividade normalmente (não há prazo).
- **Turma INACTIVE ou ARCHIVED**: atividades e ranking ficam só para consulta.
- **Exercício em branco na primeira conclusão**: vale 0 ponto para sempre, mesmo que o aluno
  acerte ao refazer.
- **Professor muda a marcação depois de muito tempo**: os pontos e o ranking mudam na hora; o
  aluno vê a marcação atual.
- **Atividade com um só exercício**: a navegação entre exercícios some; o resto é igual.
- **Turma com um só aluno**: o ranking mostra só ele, em 1º lugar.
- **Conta STUDENT e TEACHER**: em cada turma, cada papel vê o seu lado.
- **Relógio do navegador errado**: a publicação e a ordem das conclusões vêm do servidor.
- **Rate limit**: iniciar, refazer e concluir acima do limite por aluno são recusados com
  mensagem clara, sem perder o que está na tela.

## Requirements *(mandatory)*

### Functional Requirements

**Aplicação (professor)**

- **FR-001**: Uma atividade de Exercício DEVE ser aplicada com 1 a 10 exercícios APPROVED do banco
  do professor (010), título, descrição/instruções e data de publicação, **sem** nota total,
  prazo nem regra de atraso; pedidos com esses campos para Exercício DEVEM ser recusados. Altera
  a 012 FR-001 para Exercício; Trabalho não muda.
- **FR-002**: Cada exercício da atividade DEVE valer pontos fixos pelo nível copiado no snapshot
  da aplicação — Básico 15, Intermediário 30, Avançado 60 —, nunca definidos pelo professor;
  mudanças no banco não alteram atividades aplicadas (012 FR-002).
- **FR-003**: A tela de aplicação e a atividade DEVEM mostrar os pontos de cada exercício e o
  total possível.
- **FR-004**: Uma atividade de Exercício DEVE ter os estados da 012 (ativa, encerrada,
  cancelada; agendada e publicada como fases da ativa), sem prazo; o professor pode editar título,
  instruções e a data de publicação ainda não atingida, nunca exercícios nem pontos.

**Tentativas e conclusão (aluno)**

- **FR-005**: O aluno DEVE poder iniciar a atividade e, depois de concluí-la, refazer quantas
  vezes quiser; cada tentativa começa em branco e só existe uma tentativa aberta por aluno e
  atividade de cada vez (garantido pelo banco de dados). Altera a 012 FR-016 e FR-036
  (múltiplas tentativas) para Exercício.
- **FR-006**: Responder e salvar DEVEM funcionar como na 012 (FR-017 a FR-022: salvamento
  automático, estados de salvamento, modo sem conexão, validação por tipo, limites), sem prazo e
  sem contagem de tempo.
- **FR-007**: "Concluir exercícios" DEVE exigir confirmação, que informa quantos exercícios estão
  em branco (regra de branco da 012 FR-023), e torna a tentativa imutável; é idempotente
  (repetições devolvem a mesma conclusão, sem evento novo).
- **FR-008**: A **primeira conclusão** do aluno na atividade DEVE ser a única que pontua; ela é
  determinada pelo servidor de forma única sob concorrência (duas abas, cliques repetidos).
  Conclusões seguintes são de prática: nunca alteram pontos nem entram na fila do professor.
- **FR-009**: Na conclusão, cada exercício DEVE receber um resultado: Múltipla escolha → "Certo"
  ou "Errado" pela regra EXACT_MATCH da 011, sem IA; exercício em branco → "Errado"; Pergunta e
  resposta e Código respondidos → "Aguardando correção" na primeira conclusão. Nas conclusões de
  prática, Pergunta e resposta e Código ficam sem resultado ("Compare com o gabarito").
- **FR-010**: Os pontos de um exercício DEVEM ser tudo ou nada: o valor do nível se o resultado
  da primeira conclusão for "Certo", 0 em qualquer outro caso; sem pontos parciais, descontos ou
  bônus.
- **FR-010a**: Um mesmo exercício de origem do banco DEVE pontuar no máximo uma vez por aluno e
  turma: vale a primeira conclusão, em qualquer atividade da turma, que o contém. Em outra
  atividade da mesma turma ele é feito normalmente, com resultado e gabarito, marcado "já
  pontuado", vale 0 ponto e não entra na fila do professor. Se a atividade em que pontuou for
  cancelada, os pontos dele saem do ranking e não migram para outra atividade.

**Gabarito e visões do aluno**

- **FR-011**: Antes de concluir, a visão do aluno NÃO DEVE conter alternativa correta, resposta
  esperada, solução, explicação nem resultado (012 FR-030/FR-032 continuam valendo até a
  conclusão).
- **FR-012**: Depois de cada conclusão, a visão daquela tentativa DEVE mostrar, por exercício, a
  resposta do aluno, o resultado, os pontos (na primeira conclusão), a alternativa correta, a
  resposta esperada ou a solução de referência, a explicação e o comentário do professor quando
  houver. Montada no servidor por lista fechada de campos (012 FR-032); altera a 012 FR-030 só
  para Exercício.
- **FR-013**: Uma atividade de Exercício NUNCA DEVE mostrar ao aluno nota, prazo, regra de
  atraso, contagem de tempo ou "liberar resultado"; os pontos nunca são chamados de nota.
- **FR-014**: A situação do aluno numa atividade de Exercício DEVE ser derivada no servidor:
  PENDENTE (sem conclusão e sem tentativa aberta), EM_ANDAMENTO (tentativa aberta e nenhuma
  conclusão), Concluída (`COMPLETED`; ao menos uma conclusão), com a indicação "Pontos aguardando correção"
  enquanto houver exercício da primeira conclusão sem resultado. Exercício nunca fica ATRASADO.
  Altera a 012 FR-014/FR-015 para Exercício.
- **FR-015**: O painel e "Minhas atividades" (012 FR-010 a FR-012) DEVEM incluir as atividades
  de Exercício: nos contadores de pendentes, em andamento e concluídas; nas próximas atividades,
  depois das que têm prazo, das publicadas mais recentemente às mais antigas; com os pontos
  ganhos e possíveis no lugar da nota.

**Correção pelo professor**

- **FR-016**: O professor da turma DEVE ver, por atividade de Exercício, a situação de cada aluno
  matriculado (não iniciou, em andamento, concluiu, pontos aguardando correção) e a fila das
  respostas de Pergunta e resposta e Código das primeiras conclusões, com o gabarito.
- **FR-017**: O professor DEVE poder marcar cada resposta da fila como certa ou errada, com
  comentário opcional, e mudar a marcação depois; cada marcação ou mudança é auditada e vale para
  os pontos e o ranking imediatamente, sem liberação. Não há nota, valor parcial nem liberação de
  resultado para Exercício (altera a 012 FR-006, FR-027 a FR-029 para Exercício). Marcar numa
  atividade cancelada DEVE ser recusado; numa atividade encerrada continua permitido.

**Pontos e ranking**

- **FR-018**: Os pontos de um aluno numa turma DEVEM ser a soma dos pontos das primeiras
  conclusões em atividades de Exercício não canceladas daquela turma (respeitando FR-010a),
  sempre derivados dos resultados registrados, nunca enviados pelo cliente.
- **FR-019**: O ranking de uma turma DEVE listar todos os alunos com matrícula ACTIVE, inclusive
  os sem pontos, em ordem decrescente de pontos; empates dividem a posição, a posição seguinte
  pula (1º, 2º, 2º, 4º), e dentro do empate a ordem é alfabética pelo nome.
- **FR-020**: Cada linha do ranking DEVE conter só posição, nome do aluno e pontos. Altera a 012
  FR-009 apenas nesse ponto: o aluno passa a ver o nome e os pontos dos colegas da turma no
  ranking, e nada mais deles.
- **FR-021**: O painel do aluno DEVE mostrar, para cada turma com matrícula ACTIVE, do 1º ao 5º
  lugar e o acesso "Ranking" para a tela com todas as posições, onde a linha do próprio aluno é
  destacada por texto, não só por cor.
- **FR-022**: O professor DEVE ver o ranking completo de cada turma sua, igual ao dos alunos.
- **FR-023**: O ranking DEVE refletir uma conclusão ou marcação assim que a operação é confirmada.

**Visões e mensagens**

- **FR-024**: Toda tela nova DEVE ter os estados carregando, vazio ("Esta turma ainda não tem
  alunos." — sem matrícula ativa; quando todos têm 0 ponto, a lista completa com o aviso "Ainda
  não há pontos nesta turma."), sucesso, erro e sem conexão; ser responsiva, operável por teclado e feita com os
  tokens e componentes do Design System (005); conteúdo de aluno e professor é exibido como texto.

**Fora do escopo (garantias)**

- **FR-025**: Esta feature NÃO DEVE: mudar Trabalho; criar Prova, modo controlado, cronômetro ou
  prazo para Exercício; executar código; corrigir com IA; dar pontos por Trabalho; criar
  conquistas, medalhas, níveis de aluno, ranking entre turmas ou geral, ranking por período,
  notificações ou comunicação entre alunos; converter pontos em nota.

### Security, Permissions & Audit *(mandatory if feature has protected operations)*

- **Permissions**: aluno — `atividades.proprias.visualizar` e `atividades.proprias.responder`
  (012) para praticar e concluir; uma permissão nova para ver o ranking da própria turma, concedida
  a STUDENT. Professor — `atividades.aplicar` e `atividades.visualizar` (012); uma permissão nova
  para marcar certo/errado em exercícios e uma para ver o ranking das suas turmas, concedidas a
  TEACHER. Pontos de exercício NUNCA passam por `notas.lancar`, `notas.liberar` nem
  `notas.proprias.visualizar`. Nenhuma a ADMIN ou MANAGER; nenhuma checagem por nome de papel. Os
  nomes são definidos no plano.
- **Resource context**: aluno — matrícula ACTIVE na turma da atividade ou do ranking, tentativa
  do próprio aluno; professor — professor responsável pela turma. Fora do contexto → `404`.
- **Audit events**: conclusão de tentativa (com primeira ou prática, quantidade em branco e pontos
  ganhos na regra); marcação certa/errada e mudança de marcação pelo professor; os eventos da 012
  para aplicar, encerrar e cancelar; acesso negado (`STUDENT_ACCESS_DENIED`). Ver o ranking não é
  auditado (não expõe dado de avaliação). Metadados só com ids, contagens, enums e códigos —
  nunca resposta, gabarito ou comentário.
- **Untrusted input**: campos de nota, prazo, regra de atraso, pontos, resultado ou "primeira
  conclusão" enviados pelo cliente são recusados (mass assignment); identificadores do cliente
  nunca autorizam; marcação só aceita certo ou errado.
- **States & transitions**: atividade (012); tentativa (aberta → concluída, imutável depois);
  resultado do exercício na primeira conclusão (aguardando correção → certo/errado, e entre
  certo e errado pelo professor). Situação do aluno e ranking são derivados. Transição inválida →
  `409 INVALID_STATE_TRANSITION`.
- **Idempotency**: uma tentativa aberta por aluno e atividade (restrição única); conclusão
  idempotente por tentativa; uma única primeira conclusão por aluno e atividade (restrição única);
  marcar com o mesmo valor não muda nada nem gera evento.
- **Evidence vs. decisions**: respostas e horários de conclusão são FACT; resultado de Múltipla
  escolha, pontos, situação e ranking são RULE_RESULT; marcação de Pergunta e resposta e Código é
  HUMAN_DECISION.
- **Automation risk level**: N/A — nenhuma operação de IA nesta feature.
- **Domain configurability**: os valores 15/30/60 são da plataforma e ligados ao nível do
  exercício, não a disciplina, linguagem ou tecnologia.
- **Sensitive data & adaptations**: respostas e marcações são vistas só pelo próprio aluno e pelo
  professor da turma. O ranking expõe aos colegas só nome e pontos de exercício, que não são nota
  nem avaliação (constituição XXIV: "um aluno vê somente as próprias notas e respostas"). Sem
  adaptações por aluno; nada é enviado à IA.
- **Curricular traceability**: a atividade de Exercício herda os tópicos dos exercícios do banco
  e mantém a sinalização do escopo ensinado da 012 FR-005a.

### Key Entities *(include if feature involves data)*

- **Atividade de Exercício**: atividade da turma do tipo Exercício (012), sem nota total, prazo
  nem regra de atraso; total de pontos possíveis.
- **Exercício da atividade**: cópia do exercício do banco (012), agora com o nível e os pontos
  fixados na aplicação.
- **Tentativa**: do aluno numa atividade; várias por aluno, no máximo uma aberta; início,
  conclusão, e se é a primeira conclusão.
- **Resultado do exercício**: por exercício de uma tentativa concluída — certo, errado ou
  aguardando correção (só na primeira conclusão), pontos, comentário, autor e data da marcação.
- **Ranking da turma**: visão derivada, não gravada — posição, nome e pontos de cada aluno com
  matrícula ACTIVE.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Em 100% das atividades de Exercício, nenhuma tela ou resposta da API mostra ou
  aceita nota, prazo, regra de atraso ou contagem de tempo; Trabalhos continuam passando em todos
  os cenários da 012.
- **SC-002**: Em 100% dos casos de teste, os pontos de cada exercício são exatamente 15, 30 ou 60
  pelo nível quando certo na primeira conclusão, e 0 em qualquer outro caso.
- **SC-003**: 0 pontos ganhos por refazer, em qualquer quantidade de refações, e exatamente uma
  primeira conclusão sob 10 pedidos simultâneos de concluir a mesma atividade.
- **SC-004**: Em 100% das respostas ao aluno anteriores à conclusão, não há gabarito, solução,
  explicação nem resultado; depois da conclusão, o gabarito aparece em 100% dos exercícios
  daquela tentativa.
- **SC-005**: Uma conclusão ou marcação do professor aparece no ranking da turma na consulta
  seguinte.
- **SC-006**: Em 100% dos testes de acesso cruzado, nenhum aluno ou professor vê o ranking, as
  tentativas ou as marcações de uma turma em que não está; todos respondem "não encontrado".
- **SC-007**: Em 100% das respostas de ranking, cada linha contém só posição, nome e pontos.
- **SC-008**: Um aluno encontra a própria posição no ranking em até 10 segundos a partir do
  painel, em celular e desktop, e conclui praticar → concluir → ver gabarito → refazer só com o
  teclado.
- **SC-009**: 100% das conclusões e marcações geram exatamente um evento de auditoria, sem
  resposta, gabarito ou comentário nos metadados.

## Assumptions

- **Exercício repetido**: o mesmo exercício do banco pontua uma vez só por aluno e turma
  (FR-010a); a identidade é o exercício de origem no banco, mesmo que ele tenha sido editado entre
  as aplicações.
- **Nome no ranking**: o nome completo do aluno, como cadastrado (FR-020).
- **Atividades de Exercício já aplicadas pela 012**: a 012 ainda não está em uso com alunos
  reais; a migração converte as atividades de Exercício existentes para o formato novo sem
  preservar nota total, valores, prazo, regra de atraso, correções em nota nem liberação.
- **Período do ranking**: acumulado da turma inteira (a turma é a oferta de um período letivo);
  sem ranking semanal, mensal ou geral.
- **Fila do professor**: só respostas da primeira conclusão; refazer é autoavaliação pelo
  gabarito.
- **Sem notificações**: nem ao aluno quando o professor marca, nem ao professor quando há fila.
- **Pontos de exercício só**: Trabalhos não dão pontos de ranking nesta feature.
- **Bancos inalterados**: 010 já exige nível e resposta (alternativa correta, resposta esperada
  ou solução) e explicação em todo exercício, manual ou por IA.
- **Limites**: limites por aluno para iniciar, refazer e concluir e por professor para marcar são
  definidos no plano, no padrão das features anteriores.
