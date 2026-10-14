# Feature Specification: Code Runner nos Exercícios (primeira etapa)

**Feature Branch**: `019-exercise-code-runner`
**Created**: 2026-10-14
**Status**: Draft
**Input**: User description: "Code Runner — primeira etapa: o aluno escreve e executa o código nas
questões de Código dos Exercícios aplicados à turma, num estilo parecido com o LeetCode. Programa
completo com entrada e saída padrão, usando os casos de teste (entrada, saída esperada, público ou
privado) e o código inicial como ponto de partida no editor. Só Java, Python e JavaScript no início.
Botão "Executar" só nos Exercícios (013): roda o código contra os casos públicos e mostra, por caso,
se passou, a saída esperada e a obtida, o erro de compilação ou de execução e o tempo; os casos
privados nunca saem do servidor. A execução é um rascunho do aluno: não muda pontos nem a regra de
conclusão da 013. Princípio IV: o código do aluno é não confiável e roda num Code Runner independente
e isolado, com limites de CPU, memória, tempo, processos e filesystem e com a rede desligada. Sem
Redis, filas ou WebSockets: o pedido fica numa tabela, um worker separado o executa e a tela consulta
o resultado. Comparação de saída com regra fixa e documentada, limite de execuções por aluno por
minuto, auditoria sem conteúdo. Fora do escopo: Trabalhos, Provas, correção automática na entrega,
nota proporcional, moldura escondida estilo função, áreas travadas no editor e as demais linguagens.
A escolha do sandbox e onde ele roda em produção fica para o plano."

## Contexto: o que muda

Hoje um exercício de Código (010) tem instruções, código inicial opcional, solução esperada e
linguagem, e o aluno o responde escrevendo no editor (014) sem poder rodar nada. Na conclusão ele
fica "Aguardando correção" e o professor marca certo ou errado (013). Esta feature acrescenta o
primeiro uso do Code Runner que a constituição reserva para o fim do roadmap (princípio IV):

| Ponto | Hoje | Depois desta feature |
|-------|------|----------------------|
| Casos de teste no exercício de Código do banco | **Não existem** (só trabalhos e provas têm) | O exercício de Código pode ter casos de teste (entrada, saída esperada, Público/Privado), copiados para a atividade ao aplicar |
| Responder um exercício de Código | Escrever no editor | Escrever e tocar em "Executar" para ver o resultado dos casos públicos |
| Onde o código do aluno roda | Em lugar nenhum | Só no Code Runner isolado, nunca na plataforma |
| Pontos, conclusão e correção do professor (013) | Professor marca certo/errado | **Não mudam**: executar não pontua, não conclui e não corrige |
| Trabalhos (011/012) e Provas (018) | Casos de teste guardados, sem execução | **Não mudam** nesta etapa |

```text
Aluno ──"Executar"──▶ pedido de execução (código + casos públicos da questão) ──▶ fila na base
                                                                             │
                     Code Runner isolado (sem rede, sem banco, sem segredos) ◀─ worker separado
                                                                             │
Tela do aluno ◀── consulta periódica ── resultado por caso (passou / saída / erro / tempo)
```

## Clarifications

### Session 2026-10-14

- Q: De onde vêm os casos de teste dos exercícios de Código (o banco da 010 não os tem)? → A: **A** —
  só o professor os cadastra, no formulário (criação manual ou revisão); "Criar com IA" não muda e os
  exercícios gerados chegam sem casos; o sistema não confere a solução esperada contra os casos. A IA
  propor casos e a conferência automática ficam para a próxima etapa (FR-003, US2-5).

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Aluno executa o código contra os casos públicos (Priority: P1)

O aluno abre um Exercício da turma com uma questão de Código numa linguagem com execução, encontra o
código inicial no editor, escreve o programa (que lê da entrada padrão e escreve na saída padrão) e
toca em "Executar". Em poucos segundos vê, para cada caso público, se passou, a entrada, a saída
esperada e a obtida, o tempo, ou o erro de compilação ou de execução. Pode corrigir e executar de
novo quantas vezes quiser, dentro do limite por minuto. Nada disso muda pontos ou a conclusão.

**Why this priority**: é o valor pedido: o aluno pratica com retorno imediato e objetivo, como no
LeetCode, sem depender da correção do professor para saber se o programa funciona.

**Independent Test**: com um exercício de Python com 2 casos públicos e 1 privado aplicado à turma,
o aluno executa um programa certo (2 de 2 passaram), um errado (saída diferente num caso) e um com
erro de sintaxe; em nenhuma resposta aparece o caso privado, e os pontos e a conclusão seguem a 013.

**Acceptance Scenarios**:

1. **Given** uma questão de Código de Python, Java ou JavaScript com casos públicos numa tentativa em
   andamento, **When** o aluno abre a questão, **Then** o editor começa com o código inicial (ou a
   resposta já salva) e há o botão "Executar".
2. **Given** um programa que produz a saída esperada em todos os casos públicos, **When** o aluno
   toca em "Executar", **Then** a tela mostra "Executando" e depois, por caso, "Passou", a entrada,
   a saída esperada, a obtida e o tempo, e o resumo "2 de 2 casos públicos passaram".
3. **Given** um programa cuja saída difere num caso, **When** executado, **Then** esse caso aparece
   como "Saída diferente", com a saída esperada e a obtida lado a lado; os demais mostram o próprio
   resultado.
4. **Given** um programa com erro de compilação (Java) ou de sintaxe, **When** executado, **Then** a
   tela mostra "Erro de compilação" com a mensagem do compilador ou do interpretador, e nenhum caso
   é marcado como passou.
5. **Given** um programa que lança um erro durante a execução de um caso, **When** executado,
   **Then** esse caso aparece como "Erro de execução" com a mensagem de erro, e a saída obtida até
   ali.
6. **Given** um programa em laço infinito ou que passa do limite de memória ou de saída, **When**
   executado, **Then** o caso aparece como "Tempo esgotado", "Memória excedida" ou "Saída grande
   demais", e o aluno pode executar de novo.
7. **Given** uma questão com casos privados, **When** o aluno executa, abre a página ou consulta o
   resultado, **Then** nenhuma resposta ao aluno contém a entrada, a saída esperada ou sequer a
   quantidade de casos privados.
8. **Given** execuções feitas, **When** o aluno conclui a tentativa, **Then** os pontos, o resultado
   ("Aguardando correção" na primeira conclusão) e o gabarito seguem exatamente a 013, como se não
   tivesse executado.
9. **Given** o aluno tocou em "Executar" duas vezes seguidas ou a conexão caiu após o pedido,
   **When** processado, **Then** existe uma só execução em andamento por aluno, e a tela recupera o
   resultado dela ao voltar.
10. **Given** o resultado de uma execução, **When** o aluno altera o código, **Then** a tela indica
    que o resultado é de uma versão anterior do código, até a próxima execução.

---

### User Story 2 - Professor cadastra casos de teste nos exercícios de Código (Priority: P1)

O professor cria ou edita um exercício de Código no Banco de Exercícios e cadastra os casos de
teste: entrada, saída esperada e se o caso é Público (o aluno vê e executa) ou Privado (fica no
servidor, para a correção automática de uma etapa futura). Ao aplicar o exercício a uma turma, os
casos são copiados para a atividade junto com o resto do exercício.

**Why this priority**: sem casos de teste não há o que executar; hoje o exercício de Código do banco
não os tem.

**Independent Test**: criar um exercício de JavaScript com 2 casos públicos e 1 privado, aprová-lo e
aplicá-lo; editar os casos no banco depois e conferir que a atividade já aplicada não muda.

**Acceptance Scenarios**:

1. **Given** um exercício de Código em criação ou edição, **When** o professor adiciona casos de
   teste, **Then** cada caso tem entrada (pode ser vazia), saída esperada e visibilidade Público ou
   Privado, com no máximo 20 casos por exercício.
2. **Given** um exercício de Múltipla escolha ou Pergunta e resposta, **When** alguém tenta lhe dar
   casos de teste, **Then** o pedido é recusado.
3. **Given** um exercício com casos aplicado a uma turma, **When** o professor edita os casos no
   banco, **Then** a atividade já aplicada mantém os casos que tinha (snapshot da 012).
4. **Given** um exercício de Código sem caso público, ou numa linguagem sem execução, **When**
   aplicado, **Then** a aplicação é aceita e o aluno o responde como hoje, sem "Executar".
5. **Given** um exercício de Código gerado por "Criar com IA", **When** chega ao banco como
   rascunho, **Then** vem sem casos de teste (a IA não muda) e o professor pode adicioná-los na
   revisão, antes ou depois de aprovar.

---

### User Story 3 - Execução segura, limitada e que pode faltar sem quebrar o exercício (Priority: P2)

O código do aluno é tratado como hostil: roda isolado, sem rede, sem acesso à plataforma, com limites
de tempo, memória, processos, disco e saída. Cada aluno tem um limite de execuções por minuto. Se o
Code Runner estiver desligado ou fora do ar, o aluno vê que a execução está indisponível e continua
respondendo e concluindo o exercício normalmente.

**Why this priority**: é a condição da constituição (IV, XVIII) para que a US1 possa existir; vem
depois só porque não entrega valor visível sozinha.

**Independent Test**: executar a suíte de programas hostis (acesso à rede, leitura de arquivos do
sistema, criação de processos em massa, laço infinito, alocação de memória sem fim, saída gigante,
escrita em disco) e conferir que todos terminam num resultado conhecido, sem efeito fora da
execução; desligar o Code Runner e concluir um exercício normalmente.

**Acceptance Scenarios**:

1. **Given** um programa que tenta abrir uma conexão de rede, **When** executado, **Then** a conexão
   falha dentro da execução e nada sai da área isolada.
2. **Given** um programa que tenta ler arquivos, variáveis de ambiente ou segredos da plataforma,
   **When** executado, **Then** nada da plataforma está visível para ele.
3. **Given** um programa que cria processos sem parar ou enche o disco, **When** executado, **Then**
   ele é interrompido pelos limites e as execuções seguintes, dele ou de outros alunos, não são
   afetadas.
4. **Given** um aluno que já fez o máximo de execuções no minuto, **When** toca em "Executar" de
   novo, **Then** é recusado com a mensagem de quanto tempo esperar, sem execução criada e com a
   recusa auditada; outro aluno segue com o próprio limite.
5. **Given** a execução desligada pela plataforma, **When** o aluno abre a questão, **Then** vê
   "Execução indisponível no momento" no lugar do botão e responde e conclui como na 013.
6. **Given** um pedido aceito que o Code Runner não termina dentro do prazo máximo (worker parado,
   Code Runner fora do ar), **When** o prazo passa, **Then** a execução termina como "Não foi
   possível executar agora", sem resultado de casos, e o aluno pode tentar de novo.
7. **Given** um worker que cai no meio de uma execução, **When** ele volta, **Then** a execução não
   fica presa em andamento: termina num estado conhecido e nunca é executada duas vezes com efeitos
   visíveis duplicados.

---

### User Story 4 - Linguagens com execução vêm do catálogo (Priority: P3)

A plataforma define quais linguagens do catálogo têm execução; nesta etapa, Java, Python e
JavaScript. As demais seguem como hoje (editor com destaque, sem "Executar"). A tela do professor
indica, ao escolher a linguagem de um exercício de Código, se ela tem execução.

**Why this priority**: mantém as linguagens como dados (constituição XXI) e prepara a ampliação, mas
a US1 funciona com as três linguagens configuradas desde o início.

**Independent Test**: um exercício de C++ com casos públicos aplicado à turma não mostra "Executar";
um pedido de execução forjado para ele é recusado.

**Acceptance Scenarios**:

1. **Given** uma questão de Código de uma linguagem sem execução, **When** o aluno a abre, **Then**
   não há "Executar" e um pedido forjado é recusado sem execução criada.
2. **Given** o formulário do exercício de Código, **When** o professor escolhe a linguagem, **Then**
   vê se ela tem execução ("Os alunos poderão executar o código" ou "Sem execução nesta linguagem").

---

### Edge Cases

- Questão com casos públicos e privados: "Executar" roda só os públicos; o resumo fala só de casos
  públicos ("2 de 2 casos públicos passaram"), nunca de um total que revele os privados.
- Questão sem nenhum caso público (só privados, ou nenhum): sem "Executar", com a mensagem "Este
  exercício não tem casos para executar".
- Exercícios aplicados antes desta feature: não têm casos na atividade; seguem sem "Executar". Para
  ter execução, o professor cadastra os casos no banco e aplica de novo.
- Tentativa concluída: a tela de conclusão não executa; "Refazer" abre uma tentativa nova, onde
  "Executar" volta a existir.
- Atividade encerrada ou cancelada, matrícula inativa, aluno de outra turma: a execução é recusada
  da mesma forma que as demais rotas da atividade (sem revelar a existência).
- Código vazio: a execução é permitida (o resultado mostra os casos falhando), mas não gasta tempo
  do Code Runner além do necessário.
- Código acima do tamanho máximo: recusado antes de entrar na fila, com a mensagem do limite.
- Saída esperada e obtida que diferem só em espaços no fim das linhas ou na quebra de linha final:
  o caso passa (regra fixa, FR-012); diferença de maiúsculas, de espaços internos ou de linhas em
  branco no meio: não passa.
- Saída com caracteres especiais ou HTML: aparece como texto, nunca interpretada.
- Programa que escreve na saída de erro mas produz a saída certa: passa; a saída de erro é mostrada
  como informação.
- Programa Java com a classe com nome diferente do esperado: o resultado é "Erro de compilação" com
  uma mensagem que explica o nome exigido (a convenção de nome é documentada na tela da questão).
- Aluno abre a mesma questão em duas abas: as duas mostram a mesma execução em andamento; uma
  segunda execução só começa depois que a primeira termina.
- Code Runner volta depois de fora do ar: pedidos que passaram do prazo máximo não são executados
  tarde; o aluno executa de novo.
- Muitos alunos da turma executando ao mesmo tempo: os pedidos esperam a vez em ordem de chegada; a
  tela mostra "Na fila" enquanto espera.

## Requirements *(mandatory)*

### Functional Requirements

**Casos de teste no exercício de Código**

- **FR-001**: Um exercício de Código do banco DEVE poder ter de 0 a 20 casos de teste, cada um com
  entrada (texto, pode ser vazia), saída esperada (texto) e visibilidade Público ou Privado, em
  ordem definida. Só exercícios de Código têm casos. As regras são verificadas no servidor na
  criação e em cada edição, também com o exercício APPROVED (010).
- **FR-002**: Ao aplicar um exercício a uma turma, os casos DEVEM ser copiados para a atividade com
  o restante do snapshot (012); editar ou arquivar o exercício depois não muda a atividade.
- **FR-003**: Os casos de teste DEVEM ser cadastrados só pelo professor, no formulário do exercício
  (criação manual ou revisão). "Criar com IA" (010) não muda: o agente `exercise-generator` não
  propõe casos e seu release gate não é refeito. O sistema não executa a solução esperada contra os
  casos nesta etapa; o professor é responsável pela coerência entre solução e casos.
- **FR-004**: Antes de concluir, a visão do aluno DEVE conter só os casos Públicos (entrada e saída
  esperada); nenhuma resposta ao aluno contém um caso Privado, a sua quantidade ou a sua existência.
  A solução esperada continua só no gabarito depois da conclusão (013).

**Execução pelo aluno**

- **FR-005**: "Executar" DEVE existir só numa questão de Código de uma atividade de Exercício, numa
  tentativa em andamento do próprio aluno, quando a linguagem tem execução e a questão tem ao menos
  um caso Público. Trabalhos e Provas não executam nesta etapa, e o servidor recusa um pedido para
  eles.
- **FR-006**: Executar DEVE rodar o código que está no editor no momento do toque (até 64 KB) contra
  todos os casos Públicos da questão, cada caso numa execução separada do programa, recebendo a
  entrada do caso pela entrada padrão e lendo a saída padrão.
- **FR-007**: O resultado de uma execução DEVE trazer: a situação geral (Na fila, Executando,
  Concluída, Não foi possível executar agora), o erro de compilação quando houver e, por caso
  público: o resultado (Passou, Saída diferente, Erro de execução, Tempo esgotado, Memória excedida,
  Saída grande demais), a entrada, a saída esperada, a saída obtida, a saída de erro e o tempo de
  execução; mais o resumo "n de m casos públicos passaram".
- **FR-008**: A execução NÃO DEVE alterar a resposta salva, a tentativa, a conclusão, os pontos, o
  resultado por exercício, a fila de correção do professor ou o ranking (013). Ela não substitui o
  salvamento automático; o código continua salvo pelas regras da 012.
- **FR-009**: Cada aluno DEVE ter no máximo uma execução pendente (na fila ou executando) por vez;
  um novo pedido enquanto há uma pendente devolve a pendente, sem criar outra (clique duplo,
  reenvio após queda de conexão, duas abas).
- **FR-010**: A tela DEVE acompanhar a execução pendente por consulta periódica, só enquanto a
  página estiver visível e até a situação final, sem conexão permanente com o servidor; ao reabrir a
  questão, ela mostra a última execução do aluno naquela questão enquanto o resultado existir
  (FR-019).
- **FR-011**: Quando o código no editor difere do código da execução mostrada, a tela DEVE indicar
  que o resultado é de uma versão anterior.

**Comparação de saída (regra fixa)**

- **FR-012**: Um caso DEVE passar se, e somente se, o programa terminou normalmente dentro dos
  limites e a saída obtida é igual à esperada depois da mesma normalização nas duas: (1) quebras de
  linha `\r\n` e `\r` viram `\n`; (2) espaços e tabulações no fim de cada linha são removidos; (3)
  linhas vazias no fim do texto são removidas. Todo o resto é comparado exatamente: maiúsculas,
  acentos, espaços internos e linhas em branco no meio. A saída de erro não entra na comparação. A
  regra é a mesma para as três linguagens, documentada na tela da questão e nunca decidida por IA
  (constituição XII).

**Isolamento e limites (constituição IV e XVIII)**

- **FR-013**: O código do aluno NUNCA DEVE rodar no processo da API ou do servidor principal, nem
  com acesso ao banco, aos segredos ou à rede interna. Ele roda só no Code Runner, um componente
  independente e isolado, sem rede, com sistema de arquivos descartável e só leitura fora da área
  temporária, e com limites de CPU, memória, tempo, número de processos e tamanho da saída.
- **FR-014**: Os limites padrão DEVEM ser: tempo por caso de 2 s (mais até 10 s de compilação),
  memória de 256 MB, saída de 64 KB por caso, e prazo máximo de 60 s entre o pedido e o início da
  execução. Os limites são configuração da plataforma, iguais para todos os alunos, e a tela os
  informa.
- **FR-015**: Um aluno DEVE poder fazer no máximo 10 execuções por minuto (configurável); acima disso
  o pedido é recusado com o tempo de espera, sem execução criada, e a recusa é auditada.
- **FR-016**: A execução DEVE poder ser desligada pela plataforma sem nova versão do sistema (kill
  switch); desligada, ou com o Code Runner fora do ar, a questão mostra "Execução indisponível no
  momento" e todo o resto do exercício funciona como na 013. Execuções pendentes no desligamento
  terminam como "Não foi possível executar agora".
- **FR-017**: Toda execução DEVE terminar num estado final conhecido: um pedido que passa do prazo
  máximo, um worker que cai ou um Code Runner que não responde levam a "Não foi possível executar
  agora". Um pedido nunca é executado tarde depois do prazo, e o resultado gravado é o de uma só
  execução.
- **FR-018**: A execução DEVE usar uma tabela de pedidos na base e um worker separado do processo
  da API, sem filas, cache externo ou conexões permanentes (constituição IX); a escolha do sandbox e
  de onde ele roda em produção é decisão do plano.

**Dados, retenção e linguagens**

- **FR-019**: O código, as entradas e as saídas de uma execução DEVEM ser guardados só pelo tempo
  necessário para mostrar o resultado: no máximo 24 horas, depois apagados por uma rotina de
  manutenção; ficam só os dados sem conteúdo (quem, quando, qual questão, linguagem, situação,
  contagens e tempos).
- **FR-020**: Quais linguagens têm execução DEVE ser um dado do catálogo de linguagens, mantido pela
  plataforma; nesta etapa, Java, Python e JavaScript. Nenhuma linguagem é fixa em regra de negócio
  (constituição XXI). A versão de cada linguagem e a convenção do programa (por exemplo, o nome da
  classe em Java) são documentadas e mostradas na tela da questão.
- **FR-021**: Textos do aluno e do Code Runner (código, entradas, saídas, mensagens de erro) DEVEM
  ser mostrados sempre como texto, nunca interpretados como HTML.

### Security, Permissions & Audit *(mandatory if feature has protected operations)*

- **Permissions**: uma nova permissão para executar o próprio código numa atividade (nome no plano,
  por exemplo `codigo.executar`), dada ao papel STUDENT; a leitura das próprias execuções usa a
  mesma permissão. Cadastrar casos de teste usa as permissões do banco de exercícios da 010.
- **Resource context**: o aluno com matrícula ACTIVE na turma, numa atividade de Exercício publicada
  e ativa da turma, na sua própria tentativa em andamento, numa questão de Código da atividade; fora
  disso, o mesmo `404` das demais rotas da atividade. Um aluno nunca lê a execução de outro. O
  professor só gerencia casos de exercícios do próprio banco (010).
- **Audit events**: pedido de execução aceito, execução terminada (situação, contagens, tempos) e
  pedido recusado pelo limite; mudança dos casos de um exercício entra na auditoria de edição da 010.
  Os metadados levam só ids, enums, contagens e tempos: nunca código, entrada, saída esperada ou
  obtida, saída de erro ou mensagem do compilador.
- **Untrusted input**: o código do aluno é hostil (FR-013); tamanho máximo do código, da entrada e da
  saída esperada; a questão, a tentativa e a atividade vêm do servidor, nunca do corpo do pedido; a
  saída do programa é tratada como texto não confiável na tela.
- **States & transitions**: execução `QUEUED → RUNNING → COMPLETED`, `QUEUED → FAILED` (prazo
  passado, execução desligada) e `RUNNING → FAILED` (worker caído, Code Runner sem resposta);
  estados finais imutáveis.
- **Idempotency**: uma execução pendente por aluno, garantida pelo servidor sob concorrência
  (FR-009); um pedido de execução é retirado da fila por um só worker; um resultado é gravado uma só
  vez.
- **Evidence vs. decisions**: o resultado de cada caso é FACT (objetivo, determinístico, FR-012); o
  "certo/errado" do exercício continua HUMAN_DECISION do professor (013). Nenhuma execução vira nota,
  ponto ou indício de comportamento.
- **Automation risk level**: L1 (execução e comparação determinísticas, sem IA, sem efeito em pontos
  ou notas).
- **Domain configurability**: as linguagens com execução são dados do catálogo; os casos de teste
  são dados do professor; os limites são configuração.
- **Sensitive data & adaptations**: nenhuma; o código do aluno não vai a nenhuma IA nem a terceiros
  fora do Code Runner, e seu conteúdo é apagado em até 24 horas (FR-019).
- **Curricular traceability**: N/A (os exercícios já trazem o tópico da 010).

### Key Entities *(include if feature involves data)*

- **Caso de teste do exercício**: entrada, saída esperada, visibilidade e posição, pertencente a um
  exercício de Código do banco (0–20).
- **Caso de teste da atividade**: a cópia imutável do caso no snapshot da atividade (já existe para
  trabalhos aplicados; passa a ser preenchido também pelos exercícios).
- **Execução de código**: um pedido do aluno numa questão de Código da sua tentativa: linguagem,
  código, situação, momento do pedido, do início e do fim, erro de compilação; o conteúdo é apagado
  em até 24 horas.
- **Resultado do caso**: para cada caso público da execução: resultado, saída obtida, saída de erro e
  tempo.
- **Linguagem do catálogo**: ganha a indicação de execução (com a versão usada), mantida pela
  plataforma.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Um programa simples com até 5 casos públicos mostra o resultado em até 5 s
  (Python/JavaScript) e 10 s (Java) em 95% das execuções, sem fila; com 40 alunos de uma turma
  pedindo execuções no mesmo minuto, 95% terminam em até 30 s.
- **SC-002**: Em 100% das respostas ao aluno (abrir a questão, executar, consultar o resultado), não
  há entrada, saída esperada, contagem ou sinal da existência de casos privados (verificação
  automatizada).
- **SC-003**: 100% dos programas da suíte hostil (rede, arquivos e variáveis do sistema, processos em
  massa, laço infinito, memória sem fim, saída gigante, disco cheio) terminam num resultado conhecido
  dentro dos limites, sem acesso à rede, ao banco ou a segredos, e sem afetar a execução seguinte.
- **SC-004**: Pontos, conclusões, resultados por exercício e ranking são idênticos para um aluno que
  executou 0 ou 50 vezes antes de concluir (diferença zero).
- **SC-005**: A 11ª execução de um aluno no mesmo minuto é recusada em 100% dos casos, sem execução
  criada; o limite de um aluno nunca afeta outro.
- **SC-006**: Zero ocorrências de código, entrada, saída ou mensagem de erro nos registros de
  auditoria e nos logs (varredura automatizada); zero conteúdo de execução com mais de 24 horas
  depois da rotina de manutenção.
- **SC-007**: Com a execução desligada ou o Code Runner fora do ar, 100% dos fluxos de exercício da
  013 (responder, salvar, concluir, refazer, correção do professor, ranking) continuam funcionando, e
  nenhuma execução fica pendente além do prazo máximo.
- **SC-008**: O aluno executa e lê o resultado de cada caso só com o teclado e com leitor de tela; o
  resultado de cada caso é dito em palavras, nunca só por cor.

## Assumptions

- O programa é completo (lê a entrada padrão, escreve a saída padrão); não há moldura escondida
  estilo função nem áreas travadas no editor nesta etapa.
- Não há "entrada personalizada" (o aluno rodar com uma entrada própria) nesta etapa; só os casos
  públicos da questão.
- O professor não vê as execuções dos alunos nesta etapa; a correção dele (certo/errado) continua
  pela resposta salva, como na 013.
- Casos Privados ficam guardados para a correção automática de uma etapa futura; nesta etapa nada os
  executa.
- Exercícios aplicados antes desta feature não ganham casos retroativamente.
- Os limites de FR-014 e FR-015 são padrões razoáveis para exercícios introdutórios; podem mudar
  por configuração sem mudar a spec.
- A escolha do sandbox (Judge0, Piston ou runner próprio com nsjail/gVisor), a imagem de cada
  linguagem e onde o Code Runner roda em produção são decisões do plano, que registra também a
  emenda de infraestrutura exigida pela constituição (sandbox de execução só com spec aprovada: esta).
- Trabalhos (011/012), Provas (018), correção automática na entrega, nota proporcional e as demais
  linguagens ficam para as próximas etapas.
