# Feature Specification: Code Runner nos Trabalhos

**Feature Branch**: `021-work-code-runner`
**Created**: 2026-10-27
**Status**: Draft
**Input**: User description: "Code Runner nos Trabalhos (segunda etapa da 019). Hoje o "Executar" da 019
só existe nas questões de Código dos Exercícios; os Trabalhos (011/012) já têm casos de teste Públicos e
Privados copiados para a atividade, mas não executam. Esta feature leva o "Executar" às questões de
Código de um Trabalho aplicado: o aluno roda o próprio programa (Java, Python ou JavaScript, entrada e
saída padrão) contra os casos PÚBLICOS da questão e vê o veredito de cada caso, exatamente como na 019
(mesmo worker separado, um contêiner isolado por etapa, sem rede, gVisor em produção, comparação de
saída fixa, até 10 execuções por minuto, código e saídas apagados em 24 h, kill switch, "Execução
indisponível no momento" sem o worker). Os casos privados nunca chegam ao aluno, nem a contagem. Quem
decide é o professor: ao aplicar o Trabalho há a opção "Permitir executar o código" (desligada por
padrão), fixa depois que um aluno inicia (como a ajuda da IA da 015, 409 ACTIVITY_ALREADY_STARTED); só
aparece quando o trabalho tem questão de Código com caso público numa linguagem com execução; trabalhos
aplicados antes desta feature seguem sem execução. Vale também no modo controlado (015): o "Executar"
fica na tela de foco, sem área de transferência. Só durante a tentativa em andamento do próprio aluno:
pausada pela "Sair da sala" (016) → 409 ATTEMPT_PAUSED; depois da entrega, do prazo sem entrega
atrasada ou do encerramento, nada executa. Executar nunca salva nem entrega a resposta e nunca vale
nota, desconto ou correção automática. Na correção, o professor vê por questão de Código um resumo das
execuções do aluno: quantas vezes executou e o resultado da última execução nos casos públicos (quantos
passaram e o veredito de cada um), como um fato, nunca nota; o resumo continua depois que o conteúdo é
apagado em 24 h. O aluno vê as próprias execuções só durante a tentativa. Fora do escopo: Provas (018),
rodar os casos privados na entrega, nota sugerida ou correção pelo Code Runner ou pela IA, novas
linguagens."

## Contexto: o que muda

A 019 criou o Code Runner e o ligou só às questões de Código dos Exercícios. Um Trabalho (011) já nasce
com casos de teste Públicos e Privados em cada questão de Código, copiados para a atividade ao aplicar
(012), e o aluno já vê os casos Públicos no enunciado; só não pode rodar o programa. Esta feature
reaproveita o mesmo Code Runner, sem mudar como ele executa, e acrescenta a decisão do professor e o
que ele vê na correção.

| Ponto | Hoje | Depois desta feature |
|-------|------|----------------------|
| Aplicar um Trabalho | Modo (NORMAL/CONTROLADO) e ajuda da IA (015); chamada (016) | Mais a opção "Permitir executar o código", desligada por padrão |
| Questão de Código de um Trabalho, no aluno | Escrever no editor; casos Públicos no enunciado | Com a opção ligada: "Executar" contra os casos Públicos, como no Exercício (019) |
| Modo controlado (015) | Tela de foco, área de transferência bloqueada | O "Executar" fica na tela de foco; nada muda nos registros do modo |
| Correção do professor (012) | Resposta, gabarito, ajudas e linha do tempo (015/016) | Mais o resumo das execuções por questão de Código |
| Nota, entrega e prazo (012) | Professor corrige; entrega única | **Não mudam**: executar não salva, não entrega e não vale nota |
| Exercícios (019) e Provas (018) | Exercício executa; Prova não | **Não mudam** |

```text
Professor ── aplica o Trabalho com "Permitir executar o código" ──▶ atividade (opção fixa após o 1º início)
Aluno (tela normal ou de foco) ──"Executar"──▶ mesma fila e mesmo worker da 019 ──▶ veredito por caso público
Professor (correção) ◀── resumo por questão: quantas execuções e o veredito da última (sem código nem saídas)
```

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Aluno executa o código numa questão de Código do Trabalho (Priority: P1)

O aluno abre um Trabalho da turma em que o professor permitiu a execução, escreve o programa numa
questão de Código (que lê da entrada padrão e escreve na saída padrão) e toca em "Executar". Vê, para
cada caso público, se passou, a entrada, a saída esperada e a obtida, o tempo, ou o erro de compilação
ou de execução, exatamente como no Exercício (019). Pode corrigir e executar de novo dentro do limite
por minuto. Nada disso salva, entrega ou muda a nota.

**Why this priority**: é o valor pedido: num trabalho de programação o aluno confere o próprio programa
contra os exemplos do enunciado antes de entregar, em vez de descobrir o erro só na correção.

**Independent Test**: com um Trabalho de Python com uma questão de Código com 2 casos públicos e 1
privado, aplicado com a opção ligada, o aluno executa um programa certo (2 de 2), um errado e um com
erro de sintaxe; nenhuma resposta traz o caso privado; a resposta salva e a entrega seguem a 012.

**Acceptance Scenarios**:

1. **Given** um Trabalho aplicado com "Permitir executar o código" e uma questão de Código de Python,
   Java ou JavaScript com casos públicos, **When** o aluno abre a questão na tentativa em andamento,
   **Then** há o botão "Executar", com a versão da linguagem, a convenção do programa e os limites,
   como na 019.
2. **Given** essa questão, **When** o aluno executa um programa certo, um com saída diferente, um com
   erro de compilação e um com laço infinito, **Then** vê os mesmos resultados e textos da 019
   ("Passou", "Saída diferente", "Erro de compilação", "Tempo esgotado"…) e o resumo "n de m casos
   públicos passaram".
3. **Given** uma questão com casos privados, **When** o aluno executa, abre a questão ou consulta o
   resultado, **Then** nenhuma resposta a ele contém a entrada, a saída esperada ou a quantidade de
   casos privados.
4. **Given** execuções feitas, **When** o aluno entrega o trabalho, **Then** a resposta entregue é a
   resposta salva pelas regras da 012 (não o código de uma execução), e a correção, a nota e a
   liberação seguem a 012.
5. **Given** um Trabalho aplicado sem a opção, ou antes desta feature, **When** o aluno abre uma
   questão de Código, **Then** não há "Executar" nem aviso sobre execução, e um pedido de execução
   forjado é recusado sem execução criada.
6. **Given** um Trabalho em modo CONTROLADO com a opção ligada, **When** o aluno executa na tela de
   foco, **Then** o resultado aparece na própria tela de foco, nenhuma saída da tela é provocada pela
   execução, e copiar, recortar e colar continuam bloqueados também no resultado.
7. **Given** o resultado de uma execução, **When** o aluno altera o código, **Then** a tela indica que
   o resultado é de uma versão anterior, como na 019.

---

### User Story 2 - Professor decide se o Trabalho permite executar (Priority: P1)

Ao aplicar um Trabalho com questão de Código, o professor encontra a opção "Permitir executar o
código", desligada. Liga-a quando quer que os alunos confiram o programa nos casos públicos; deixa-a
desligada quando quer avaliar sem esse apoio. Pode mudar de ideia até o primeiro aluno iniciar.

**Why this priority**: sem a decisão do professor a execução não chega ao aluno; a escolha muda o que
o trabalho avalia, então é dele.

**Independent Test**: aplicar o mesmo Trabalho duas vezes, uma com a opção e outra sem; conferir que só
a primeira tem "Executar"; tentar mudar a opção depois que um aluno iniciou e ver a recusa.

**Acceptance Scenarios**:

1. **Given** um Trabalho aprovado com ao menos uma questão de Código com caso público numa linguagem
   com execução, **When** o professor o aplica, **Then** a opção "Permitir executar o código" aparece
   desligada, com o texto do que ela faz ("Os alunos poderão rodar o programa nos casos públicos das
   questões de Código. Os casos privados nunca são executados nem mostrados.").
2. **Given** um Trabalho sem questão de Código elegível (sem Código, sem caso público ou só em
   linguagens sem execução), **When** o professor o aplica, **Then** a opção não aparece, e um pedido
   que a ligue mesmo assim é recusado.
3. **Given** a aplicação com a opção ligada, **When** concluída, **Then** a atividade registra a opção,
   e a lista e o detalhe da atividade mostram "Execução de código: permitida".
4. **Given** uma atividade em que nenhum aluno iniciou, **When** o professor liga ou desliga a opção,
   **Then** a mudança é aceita e auditada; **Given** que algum aluno já iniciou, **When** ele tenta
   mudá-la, **Then** é recusado com `409 ACTIVITY_ALREADY_STARTED`, como o modo e a ajuda da 015.
5. **Given** um pedido de aplicar Exercícios ou uma Prova com essa opção, **When** enviado, **Then** é
   recusado: a opção existe só para Trabalho (o Exercício sempre executa pela 019; a Prova nunca).
6. **Given** o Code Runner desligado ou fora do ar no momento da aplicação, **When** o professor aplica,
   **Then** a opção continua disponível, com o aviso "A execução está indisponível agora; os alunos
   verão o botão quando ela voltar".

---

### User Story 3 - Professor vê o resumo das execuções na correção (Priority: P2)

Ao abrir a tentativa de um aluno num Trabalho com execução permitida, o professor vê, em cada questão
de Código, quantas vezes o aluno executou e o resultado da última execução terminada: quantos casos
públicos passaram e o veredito de cada um, com a data e a hora do servidor. É um fato para ele
interpretar, nunca uma nota, um desconto ou uma correção.

**Why this priority**: ajuda o professor a entender o processo do aluno, mas a correção funciona sem
isso; vem depois da execução em si.

**Independent Test**: um aluno executa 3 vezes (a última com 1 de 2 casos passando) e entrega; o
professor abre a tentativa e vê "3 execuções; última: 1 de 2 casos públicos passaram" com o veredito
de cada caso; 25 horas depois, o mesmo resumo continua lá, sem código nem saídas.

**Acceptance Scenarios**:

1. **Given** um aluno que executou numa questão de Código, **When** o professor abre a tentativa dele,
   **Then** vê na questão o número de execuções e, da última terminada, o resumo "n de m casos públicos
   passaram", o veredito de cada caso público em palavras (com o caso pela posição) e o momento.
2. **Given** a última execução com erro de compilação ou "Não foi possível executar agora", **When** o
   professor vê o resumo, **Then** ele mostra essa situação em palavras, sem a mensagem do compilador.
3. **Given** um aluno que não executou nenhuma vez, **When** o professor abre a tentativa, **Then** a
   questão mostra "Nenhuma execução".
4. **Given** o conteúdo das execuções apagado depois de 24 horas, **When** o professor abre a
   tentativa, **Then** o número de execuções e os vereditos da última continuam iguais; em nenhum
   momento o resumo mostra o código, a entrada, a saída ou a saída de erro.
5. **Given** um Trabalho sem execução permitida, **When** o professor abre a tentativa, **Then** não há
   resumo de execuções.
6. **Given** a nota da questão, **When** o professor corrige, **Then** nenhum valor é sugerido ou
   preenchido a partir das execuções.

---

### User Story 4 - A execução respeita a tentativa, a pausa e o prazo (Priority: P2)

A execução só existe enquanto a tentativa do próprio aluno está em andamento e ele ainda poderia salvar
a resposta. Pausada pela "Sair da sala", entregue, depois do prazo de um trabalho que não aceita
atraso, ou com a atividade encerrada ou cancelada, nada executa. O limite por minuto, a execução
pendente única, o kill switch e a falta do worker funcionam como na 019, e o trabalho segue sem
execução quando ela falta.

**Why this priority**: são as regras que impedem a execução de contornar a 012, a 015 e a 016; vêm
depois porque não entregam valor visível sozinhas.

**Independent Test**: pausar a tentativa pela "Sair da sala" e executar (recusado); liberar o retorno e
executar (aceito); entregar e executar (recusado); desligar a execução e entregar normalmente.

**Acceptance Scenarios**:

1. **Given** uma tentativa pausada pela "Sair da sala" (016), **When** o aluno tenta executar, **Then**
   é recusado com `409 ATTEMPT_PAUSED`, sem execução criada, como os demais pedidos de escrita.
2. **Given** a tentativa entregue, ou ainda não iniciada, **When** o aluno tenta executar, **Then** é
   recusado com `409 ATTEMPT_NOT_IN_PROGRESS`, sem execução criada.
3. **Given** o prazo passado num trabalho que não aceita entrega atrasada, **When** o aluno tenta
   executar, **Then** é recusado pelo mesmo motivo que recusa o salvamento; **Given** um trabalho que
   aceita entrega atrasada, **When** o prazo passa com a tentativa em andamento, **Then** a execução
   continua permitida enquanto o salvamento for.
4. **Given** a atividade encerrada ou cancelada, ou um aluno não marcado presente num trabalho com
   chamada (016), **When** pede uma execução, **Then** recebe a mesma resposta das demais rotas da
   atividade (sem revelar a existência).
5. **Given** um aluno com uma execução pendente num Exercício, **When** pede uma num Trabalho, **Then**
   recebe a pendente, como na 019 (uma execução pendente por aluno, em todas as atividades), e o
   limite de 10 por minuto é um só para as duas.
6. **Given** a execução desligada ou o worker fora do ar, **When** o aluno abre a questão, **Then** vê
   "Execução indisponível no momento" e responde, salva, pede ajuda e entrega como na 012 e na 015.
7. **Given** uma execução pendente quando a tentativa é pausada, entregue ou a atividade é encerrada,
   **When** o worker a processa, **Then** ela termina num estado final conhecido e nunca muda a
   tentativa, a resposta ou a pausa.

---

### Edge Cases

- Trabalho com várias questões de Código, só algumas com caso público ou em linguagem com execução:
  "Executar" aparece só nas elegíveis; as demais mostram "Esta questão não tem casos para executar" ou
  nada (linguagem sem execução), como na 019.
- Trabalho sem nenhuma questão de Código elegível: a opção não aparece na aplicação (US2-2).
- Mudança da opção antes do primeiro início (ligar e depois desligar): vale a última; os alunos que
  abriram a página antes veem o botão sumir ou aparecer na próxima leitura.
- Aluno que deixa a tela de foco para esperar o resultado: é uma saída como qualquer outra (015); a
  execução em si não gera evento do modo controlado.
- Execução pendente enquanto o professor pausa o aluno: ela termina normalmente; a tela pausada não
  mostra o resultado, e ao retomar a questão mostra a última execução, se o resultado ainda existir.
- Ajuda da IA (015): o `work-helper` continua vendo só a visão do aluno da questão, sem os resultados
  das execuções.
- Exercício e Trabalho abertos em abas diferentes: a execução pendente é uma só; a aba da outra questão
  mostra "Há uma execução em andamento em outra questão", como na 019.
- Resumo do professor quando a última execução ainda está pendente: mostra a última terminada e "Uma
  execução em andamento".
- Professor sem a permissão de ver as entregas: não vê o resumo (mesma regra da tentativa na correção da
  012).
- Saída do programa com HTML ou caracteres especiais: texto, nunca interpretado (019).

## Requirements *(mandatory)*

### Functional Requirements

**Decisão do professor**

- **FR-001**: Ao aplicar um Trabalho, o professor DEVE poder ligar a opção "Permitir executar o código",
  desligada por padrão. A opção só é aceita quando o snapshot do trabalho tem ao menos uma questão de
  Código com caso Público numa linguagem com execução; caso contrário o servidor a recusa.
- **FR-002**: A opção DEVE poder ser mudada enquanto nenhum aluno iniciou a atividade; depois disso,
  `409 ACTIVITY_ALREADY_STARTED`, como o modo e a ajuda da 015. Cada mudança é auditada.
- **FR-003**: A opção DEVE existir só para atividades de Trabalho; um pedido de Exercício ou de Prova
  com ela é recusado. Atividades aplicadas antes desta feature ficam com a opção desligada; enquanto
  nenhum aluno iniciou, o professor pode ligá-la pelas regras do FR-002.
- **FR-004**: A opção DEVE aparecer na lista e no detalhe da atividade do professor ("Execução de
  código: permitida") e é independente do modo (NORMAL ou CONTROLADO), da ajuda da IA e da chamada.

**Execução pelo aluno**

- **FR-005**: Numa atividade de Trabalho com a opção ligada, cada questão de Código numa linguagem com
  execução e com ao menos um caso Público DEVE ter "Executar", com o mesmo comportamento da 019:
  código do editor (até 64 KB), só os casos Públicos, um processo por caso, mesmos resultados, textos,
  limites, regra fixa de comparação de saída, consulta periódica e aviso de resultado desatualizado.
- **FR-006**: A execução DEVE ser aceita só quando a tentativa do próprio aluno está em andamento e uma
  gravação da resposta seria aceita naquele momento pelas regras da 012 (prazo e regra de atraso,
  atividade ativa) e da 016 (presença marcada, tentativa não pausada); pausada → `409 ATTEMPT_PAUSED`;
  sem tentativa em andamento → `409 ATTEMPT_NOT_IN_PROGRESS`; fora do contexto do aluno → o mesmo `404`
  das demais rotas da atividade.
- **FR-007**: Numa atividade de Trabalho sem a opção, numa Prova, ou numa questão não elegível, o
  servidor DEVE recusar o pedido sem criar execução, e a visão do aluno não traz o "Executar".
- **FR-008**: A execução NÃO DEVE alterar a resposta salva, a tentativa, a entrega, a pausa, a nota, a
  correção, a liberação, os eventos do modo controlado (015) ou as ajudas da IA. A resposta entregue é
  sempre a resposta salva pela 012.
- **FR-009**: No modo CONTROLADO, "Executar" e o resultado DEVEM ficar na tela de foco, sem nova
  janela ou aba; o bloqueio de copiar, recortar, colar e arrastar continua valendo sobre o resultado,
  e a execução não é registrada como evento do modo controlado.
- **FR-010**: O limite de execuções por minuto e a regra de uma execução pendente por aluno DEVEM ser
  os da 019, contados juntos para Exercícios e Trabalhos.
- **FR-011**: O aluno DEVE ver as próprias execuções só durante a tentativa em andamento; depois da
  entrega, o histórico e o resultado do trabalho não mostram execuções.

**O que o professor vê**

- **FR-012**: Na tentativa de um aluno de um Trabalho com a opção ligada, cada questão de Código
  elegível DEVE mostrar ao professor que vê as entregas da atividade: o número de execuções aceitas do aluno
  naquela questão; da última execução terminada, a situação (Concluída, Erro de compilação, Não foi
  possível executar agora), o resumo "n de m casos públicos passaram", o veredito de cada caso público
  em palavras e o momento pelo relógio do servidor; ou "Nenhuma execução".
- **FR-013**: O resumo NÃO DEVE mostrar código, entradas, saídas, saída de erro ou mensagem do
  compilador, nem sugerir ou preencher nota; e DEVE continuar igual depois que o conteúdo das execuções
  é apagado (24 h, 019).
- **FR-014**: O resumo DEVE ser lido a cada abertura da tentativa, nunca guardado à parte; os vereditos
  e as contagens que ele usa são os mesmos fatos que a 019 já guarda sem conteúdo.

**O que não muda**

- **FR-015**: O isolamento, os limites, o worker, a fila, o prazo máximo, o kill switch, a retenção de
  24 h e as linguagens com execução DEVEM ser os da 019, sem nova configuração; os casos Privados nunca
  são executados nem enviados ao aluno (nem a quantidade).
- **FR-016**: Provas (018) NÃO DEVEM executar código; os Exercícios continuam como na 019.

### Security, Permissions & Audit *(mandatory if feature has protected operations)*

- **Permissions**: o aluno executa com a permissão da 019 (`atividades.proprias.executar`); o professor
  liga a opção com a permissão de aplicar e editar atividades da 012 e lê o resumo com a de ver as
  entregas da atividade (`entregas.visualizar`, a mesma da linha do tempo da 015). Nenhuma permissão nova.
- **Resource context**: o aluno, só na própria tentativa, em atividade da sua turma com matrícula ACTIVE
  (e presença marcada, quando há chamada); o professor, só em atividades das próprias turmas. Fora do
  contexto: `404`, sem revelar a existência.
- **Audit events**: mudança da opção (ids, valor anterior e novo); os eventos de execução da 019
  (aceita, terminada, recusada pelo limite) passam a valer também para Trabalhos. Metadados só com ids,
  enums, contagens e tempos: nunca código, entrada, saída ou mensagem de erro.
- **Untrusted input**: o código do aluno é hostil (019); o corpo do pedido de execução continua só com
  o código; atividade, questão, tentativa, linguagem e casos vêm do servidor. A opção chega no corpo da
  aplicação do professor e é validada contra o snapshot no servidor.
- **States & transitions**: os da execução da 019, sem mudança. A opção é um valor da atividade,
  fixo depois do primeiro início.
- **Idempotency**: uma execução pendente por aluno (019); a mudança da opção sob concorrência com o
  primeiro início é decidida pelo servidor (ou a mudança entra antes do início, ou é recusada).
- **Evidence vs. decisions**: o veredito de cada caso é FACT (determinístico); a nota continua
  HUMAN_DECISION do professor. Nenhuma execução vira nota, desconto ou indício de comportamento.
- **Automation risk level**: L1 (execução e comparação determinísticas, sem IA, sem efeito em notas).
- **Domain configurability**: as linguagens com execução continuam dados do catálogo; os casos são
  dados do trabalho; a opção é do professor por atividade.
- **Sensitive data & adaptations**: o código do aluno não vai a nenhuma IA nem a terceiros fora do Code
  Runner, e seu conteúdo é apagado em até 24 horas (019).
- **Curricular traceability**: N/A (as questões já trazem os tópicos da 011).

### Key Entities *(include if feature involves data)*

- **Atividade de Trabalho**: ganha a opção "execução de código permitida" (sim/não), fixa depois do
  primeiro início.
- **Execução de código** (019): passa a existir também para questões de Código de Trabalhos; o mesmo
  registro, com o conteúdo apagado em 24 horas e os fatos sem conteúdo guardados.
- **Resumo de execuções da questão**: derivado na leitura, por aluno e questão: número de execuções e
  vereditos da última terminada; nunca guardado.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Um programa simples com até 5 casos públicos numa questão de Trabalho mostra o resultado
  nos mesmos tempos da 019 (até 5 s em Python/JavaScript e 10 s em Java em 95% das execuções, sem
  fila; com 40 alunos executando no mesmo minuto, 95% em até 30 s).
- **SC-002**: Em 100% das respostas ao aluno (abrir a questão, executar, consultar), não há entrada,
  saída esperada, contagem ou sinal da existência de casos privados (verificação automatizada).
- **SC-003**: A resposta entregue, a nota, a correção e a liberação são idênticas para um aluno que
  executou 0 ou 50 vezes antes de entregar (diferença zero).
- **SC-004**: 100% dos pedidos de execução numa atividade sem a opção, numa Prova, numa tentativa
  pausada, entregue, fora do prazo sem atraso aceito ou numa atividade encerrada são recusados sem
  execução criada.
- **SC-005**: Em 100% das tentativas, o resumo do professor tem o mesmo número de execuções e os mesmos
  vereditos que o aluno viu, antes e depois da limpeza de 24 horas, e zero conteúdo de execução.
- **SC-006**: O professor liga a opção na aplicação com uma interação a mais (marcar a opção) e vê o
  resumo da questão sem sair da tela de correção.
- **SC-007**: Com a execução desligada ou o worker fora do ar, 100% dos fluxos do trabalho (responder,
  salvar, modo controlado, ajuda da IA, chamada e pausa, entregar, corrigir, liberar) continuam
  funcionando.
- **SC-008**: O aluno executa e lê o resultado de cada caso só com o teclado e com leitor de tela,
  também na tela de foco; vereditos sempre em palavras, nunca só por cor.
- **SC-009**: Zero ocorrências de código, entrada, saída ou mensagem de erro nos registros de auditoria
  e nos logs desta feature (varredura automatizada).

## Assumptions

- O Code Runner da 019 (worker, imagens, limites, retenção, kill switch e guia de implantação) é usado
  sem mudança; esta feature não muda como um programa é executado.
- A opção vem desligada por padrão: ligar a execução muda o que o trabalho avalia, então é uma escolha
  explícita do professor; trabalhos aplicados antes ficam sem execução e não ganham a opção
  retroativamente depois que algum aluno iniciou.
- O professor não vê o código, as entradas ou as saídas das execuções, nem durante as 24 horas: só os
  fatos do resumo. A resposta que ele corrige é a entregue.
- Os casos Privados continuam guardados para uma correção automática futura; nada os executa nesta
  etapa.
- A "entrada personalizada", a correção automática na entrega, a nota sugerida e novas linguagens
  ficam para etapas futuras; Provas (018) continuam sem execução.
