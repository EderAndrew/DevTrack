# Feature Specification: 011 — Banco de Trabalhos: criação manual e geração com IA, gabarito protegido e correção por estratégia

**Feature Branch**: `011-work-bank`
**Created**: 2026-09-30
**Status**: Draft
**Input**: User description: "Implementar o Banco de Trabalhos do sistema, separado do Banco de Exercícios (sem `Exercise.type = WORK`), com rotas, regras, serviços, permissões e interface próprios. O professor cria trabalhos sem limite de quantidade, manualmente ou com IA, cada um com 1 a 10 questões (Pergunta e resposta, Múltipla escolha, Código, misturáveis), ligado a um ou mais tópicos da ementa, com nota total definida pelo professor e valor das questões calculado automaticamente, em decimal, com soma sempre exata. A geração com IA exige título, tópicos, dificuldade (Básico, Intermediário, Avançado — sem relação com o nível de modelo), nota, quantidade, tipos e pegadinhas (0 a 3, até o número de Múltipla escolha), passa por um WorkGenerationAgent sobre a infraestrutura de IA existente e nasce em DRAFT para revisão do professor. Toda questão tem gabarito antes da disponibilização; o gabarito nunca é enviado ao aluno. Correção por estratégia: Múltipla escolha determinística, Código por casos de teste (sandbox em spec própria), Pergunta e resposta com sugestão de nota por um WorkEvaluationAgent e nota final do professor; falha técnica nunca vira nota zero. Fora de escopo: prazo, calendário, integração com o Banco de Exercícios, execução de código, IA publicando ou definindo nota."

## Contexto do domínio existente

Um **trabalho** do banco é um **modelo** reutilizável do professor — como o exercício da 010 —,
não ainda a atividade de turma `ASSIGNMENT` da constituição ("trabalho avaliativo com entrega").
Quando o professor aplicar um trabalho a uma turma (fase de atividades), a turma guardará uma
cópia (snapshot) do trabalho (constituição XXIII, `Question ≠ ExamQuestion`), e editar o banco
nunca mudará o que já foi aplicado.

| Pedido | Situação hoje | O que esta feature faz |
|--------|---------------|------------------------|
| Banco de Exercícios (010) | Existe: exercícios avulsos ou em conjuntos de 3 a 10, visão do aluno sem resposta | **Não muda.** O Banco de Trabalhos é uma área nova, com dados, regras, rotas, permissões e telas próprios |
| Disciplina, ementa, tópico | Existe (004): o "tópico da ementa" é um item de uma revisão **confirmada** de ementa de uma disciplina do professor (mesma leitura da 010) | Um trabalho pertence a uma disciplina e se liga a **um ou mais** itens de uma revisão confirmada da ementa dessa disciplina |
| Linguagem da ementa (010) | A revisão da ementa tem uma linguagem opcional, do catálogo de linguagens | Questões de código usam o catálogo; a geração com IA usa a linguagem da revisão |
| IA: gateway, política de modelos, prompts, auditoria, limites, custo, avaliações | Existe (006–009); tarefas sem modelo aprovado ficam indisponíveis | Registra **um novo agente**, o de geração de trabalhos (o de avaliação de respostas abertas fica para a 012, conforme Clarifications); nada da infraestrutura é recriado |
| Geração para o banco (constituição XXIII, v3.2.0) | Permite gerar modelos para os bancos do professor a partir de **um ou mais** conteúdos da mesma revisão confirmada (emenda de 2026-09-30, `constitution-amendment-3.2.0.md`) | A geração de trabalhos usa os tópicos escolhidos pelo professor, verificados no servidor, e vincula cada questão a eles |
| Permissões | Não há permissões de trabalho | Cria `trabalhos.*` e `ia.trabalhos.gerar`, concedidas ao papel TEACHER |
| Entrega e correção | Não há turma aplicando atividades, nem submissões, nem Code Runner | Define o gabarito, a estratégia de correção de cada questão e a regra da nota; a entrega e a correção executada vêm na 012 (Clarifications) |

## Clarifications

### Session 2026-09-30

- Q: O pedido pede ao mesmo tempo "não implementar submissão do aluno nem correção por IA
  nesta feature" e testes de correção (Múltipla escolha corrigida, WorkEvaluationAgent
  sugerindo nota, professor confirmando). Qual é o escopo da correção? → A: **A** — esta
  feature entrega o banco, a geração com IA, o gabarito protegido, a estratégia de correção
  registrada em cada questão (`EXACT_MATCH`, `TEST_CASES`, `AI_REVIEW`) e a regra de cálculo da
  nota do aluno, testada como regra do domínio. A aplicação do trabalho a uma turma, a resposta
  do aluno, a correção executada (com o WorkEvaluationAgent e a revisão do professor) e a
  liberação do gabarito ao aluno vêm na feature seguinte (012), que DEVE usar estas regras. O
  Code Runner tem spec própria.

## User Scenarios & Testing *(mandatory)*

Os perfis são o **professor**, dono do seu banco, e o **aluno**, cuja visão do trabalho é
definida e protegida desde já. O administrador não tem banco (conta ADMIN sem papel de
professor não vê trabalhos).

### User Story 1 - Criar um trabalho manualmente (Priority: P1)

O professor abre o Banco de Trabalhos, escolhe "Criar trabalho manualmente", informa a
disciplina, o título, a descrição (opcional), a nota total, os tópicos da ementa quando quiser
e de 1 a 10 questões de qualquer tipo, cada uma com seu gabarito. A dificuldade é opcional.
Nenhuma IA é usada.

**Why this priority**: é o núcleo do banco e funciona sem IA, sem custo e sem modelo aprovado.

**Independent Test**: criar um trabalho manual com uma questão de cada tipo e conferir que ele
entra no banco com origem MANUAL, com o valor de cada questão calculado, e que nenhuma
execução de IA foi criada.

**Acceptance Scenarios**:

1. **Given** um professor com uma disciplina, **When** salva um trabalho com título, nota total
   e 3 questões válidas, **Then** o trabalho entra no banco com origem MANUAL e a criação é
   auditada.
2. **Given** um trabalho com 0 ou com 11 questões, **When** o professor salva, **Then** a
   criação é recusada e nada é gravado; com 1 e com 10 questões, é aceita (sem o mínimo de 3
   do Banco de Exercícios).
3. **Given** uma Múltipla escolha com 2 ou 6 alternativas, com alternativas repetidas, ou com
   nenhuma ou duas corretas, **When** o professor salva, **Then** o trabalho inteiro é recusado
   com a indicação da questão e da regra; com 3 a 5 alternativas distintas e exatamente uma
   correta, é aceito.
4. **Given** uma Pergunta e resposta sem resposta esperada, ou uma questão de código sem
   solução esperada ou sem linguagem do catálogo, **When** o professor salva, **Then** a
   criação é recusada: toda questão nasce com gabarito.
5. **Given** um trabalho sem dificuldade e sem tópicos, **When** o professor salva, **Then** é
   aceito; com tópicos, **When** algum tópico não é de uma revisão confirmada da ementa da
   disciplina do trabalho, ou é de outro professor, **Then** a criação é recusada sem revelar
   se o tópico existe.
6. **Given** qualquer criação manual, **When** termina, **Then** nenhuma execução de IA foi
   criada e nenhum custo de IA foi registrado.

---

### User Story 2 - Nota total e valor das questões com soma exata (Priority: P1)

O professor define só a nota total. O sistema calcula o valor de cada questão, todas com o
mesmo peso, em centésimos, distribuindo o resto da divisão de forma determinística, e mostra
o valor de cada questão. A soma dos valores é sempre igual à nota total.

**Why this priority**: a nota é o que o trabalho vale para o aluno; um centésimo a mais ou a
menos é um erro de avaliação.

**Independent Test**: criar trabalhos com as combinações de nota e quantidade abaixo e
conferir o valor de cada questão e a soma.

**Acceptance Scenarios**:

1. **Given** nota 0,50 e 10 questões, **When** o trabalho é salvo, **Then** cada questão vale
   0,05 e a soma é 0,50.
2. **Given** nota 1,00 e 10 questões, **Then** cada questão vale 0,10 e a soma é 1,00; **Given**
   nota 0,50 e 5 questões, **Then** cada uma vale 0,10 e a soma é 0,50.
3. **Given** nota 0,50 e 3 questões, **When** o trabalho é salvo, **Then** as questões valem
   0,17, 0,17 e 0,16, nessa ordem de posição, e a soma é exatamente 0,50.
4. **Given** um trabalho de 0,50 com 3 questões, **When** o professor acrescenta uma quarta,
   remove uma, reordena as questões ou muda a nota total, **Then** os valores são recalculados
   pela mesma regra e a soma continua igual à nota total.
5. **Given** uma nota total com mais de duas casas decimais, negativa, zero, acima de 100,00,
   ou menor que 0,01 por questão (ex.: 0,05 para 10 questões), **When** enviada, **Then** é
   recusada, sem arredondamento silencioso.
6. **Given** qualquer trabalho salvo, **When** o valor de suas questões é somado, **Then** o
   resultado é igual à nota total em 100% dos casos (sem erro de ponto flutuante).

---

### User Story 3 - Pedir um trabalho à IA a partir de um ou mais tópicos (Priority: P1)

O professor escolhe "Criar trabalho com IA", seleciona a disciplina e um ou mais tópicos de uma
revisão confirmada da ementa, informa título, dificuldade, nota total, quantidade de questões
(1 a 10), tipos e sua distribuição, e as pegadinhas quando houver Múltipla escolha. O pedido
segue para a infraestrutura de IA existente; o resultado validado vira um trabalho em DRAFT.

**Why this priority**: é o ganho principal pedido (preparar trabalhos mais rápido), sempre sob
controle do professor.

**Independent Test**: pedir um trabalho de 10 questões mistas sobre 3 tópicos e conferir que o
trabalho gerado tem exatamente a distribuição pedida, está em DRAFT, com origem AI_GENERATED,
ligado aos 3 tópicos, com a nota e o título informados pelo professor.

**Acceptance Scenarios**:

1. **Given** os tópicos Herança, Polimorfismo e Classes abstratas de uma ementa confirmada cuja
   linguagem é Java, dificuldade Intermediário, nota 2,00, 10 questões com 3 Pergunta e
   resposta, 4 Múltipla escolha e 3 código e 2 pegadinhas, **When** o professor pede, **Then**
   o pedido é registrado, a geração roda em segundo plano e, ao terminar, há um trabalho em
   DRAFT com essa distribuição, origem AI_GENERATED, os 3 tópicos, título e nota do pedido.
2. **Given** um pedido sem dificuldade ou sem nenhum tópico, **When** é enviado, **Then** é
   recusado antes de qualquer chamada a modelo.
3. **Given** um pedido com um tópico inexistente, de outra disciplina que não a do trabalho, de
   uma revisão em rascunho, de revisões diferentes, ou de um professor diferente, **When** é
   enviado, **Then** é recusado antes de qualquer chamada a modelo, sem revelar a existência do
   recurso de outro professor.
4. **Given** um pedido com campos de modelo, provedor, família, nível de capacidade, tarefa ou
   instruções livres para a IA, **When** é enviado, **Then** é recusado.
5. **Given** "Distribuir automaticamente" com 10 questões em 3 tipos, **When** o pedido é
   registrado, **Then** a distribuição é 4, 3 e 3 (diferença máxima 1, sempre a mesma para a
   mesma escolha); na distribuição manual, soma diferente do total, ou um tipo escolhido com 0
   questões, é recusada.
6. **Given** 6 Múltipla escolha e 3 pegadinhas, **When** o professor pede, **Then** é aceito;
   **Given** 2 Múltipla escolha e 3 pegadinhas, 4 pegadinhas, ou pegadinhas sem Múltipla
   escolha, **Then** é recusado.
7. **Given** a dificuldade Avançado, **When** a geração roda, **Then** o modelo usado é o que a
   política de modelos escolhe para a tarefa de geração de trabalhos — a dificuldade
   pedagógica nunca escolhe nível de capacidade, família ou modelo.
8. **Given** a geração indisponível (nenhum modelo aprovado para a tarefa, IA desligada,
   agente desabilitado), **When** o professor abre "Criar trabalho com IA", **Then** vê que a
   geração está indisponível e continua podendo criar manualmente.
9. **Given** tópicos cuja revisão da ementa não tem linguagem, **When** o professor configura a
   geração, **Then** o tipo Código não está disponível e um pedido com código é recusado.

---

### User Story 4 - Resposta da IA inválida nunca vira trabalho (Priority: P1)

Toda resposta da IA passa por validação de estrutura e por validação contra o pedido antes de
virar trabalho. Uma resposta que não cumpre o pedido é recusada por inteiro.

**Why this priority**: o prompt não substitui a validação do servidor; é a garantia de que o
banco só tem trabalhos que respeitam as regras.

**Independent Test**: simular respostas da IA fora do esquema, com quantidade, tipos,
pegadinhas, dificuldade ou linguagem diferentes do pedido, com questões sem gabarito, com
tópicos fora da seleção e com campos que tentam mudar nota, tópicos ou situação; conferir que
nenhuma cria trabalho.

**Acceptance Scenarios**:

1. **Given** uma resposta fora do esquema, **When** chega, **Then** a geração termina como
   falha, nenhum trabalho nem questão é gravado, e o professor vê que a geração falhou e pode
   tentar de novo.
2. **Given** uma resposta com quantidade, distribuição por tipo, dificuldade, número de
   pegadinhas (ou pegadinha fora de Múltipla escolha) ou linguagem diferentes do pedido,
   **When** chega, **Then** é recusada por inteiro.
3. **Given** uma questão sem gabarito (resposta esperada, alternativa correta ou solução
   esperada), uma Múltipla escolha fora das regras, ou uma questão de código sem caso de
   teste, **When** chega, **Then** a resposta é recusada.
4. **Given** uma questão ligada a um tópico fora da seleção do professor, ou sem nenhum tópico
   da seleção, ou uma resposta em que algum tópico selecionado não aparece em nenhuma questão,
   **When** chega, **Then** é recusada; a IA não escolhe tópicos.
5. **Given** uma resposta que traz nota total, valores de questão, título, tópicos,
   identificadores ou situação, **When** chega, **Then** esses valores são ignorados: título,
   nota, tópicos, dificuldade e situação vêm do pedido registrado; os valores das questões
   são calculados pelo sistema; o trabalho nasce DRAFT.
6. **Given** dois enunciados iguais no mesmo trabalho (ignorando maiúsculas, acentos e espaços
   repetidos), **When** chega, **Then** é recusada.
7. **Given** uma resposta válida, **When** é gravada, **Then** o trabalho, as questões, as
   alternativas, os casos de teste e os tópicos entram juntos ou nada entra.

---

### User Story 5 - Revisar, editar e aprovar o trabalho (Priority: P1)

O professor abre um trabalho em DRAFT, lê as questões, edita título, descrição, enunciados,
alternativas, resposta correta, código, solução, casos de teste e explicações, remove ou
acrescenta questões (até 10), reordena, e aprova quando o trabalho está pronto. Só trabalhos
aprovados ficam disponíveis para uso.

**Why this priority**: a IA é autora da sugestão; o professor é responsável pela aprovação
pedagógica (constituição XIII: IA nunca publica).

**Independent Test**: gerar um trabalho, editar uma questão, remover outra, acrescentar uma e
aprovar; conferir os valores recalculados, quem revisou, quando, o registro de edição por
pessoa, e que a origem continua AI_GENERATED.

**Acceptance Scenarios**:

1. **Given** um trabalho AI_GENERATED em DRAFT, **When** o professor o aprova, **Then** ele
   passa a APPROVED, fica registrado quem revisou e quando, e a aprovação é auditada.
2. **Given** um trabalho AI_GENERATED editado antes da aprovação, **When** é aprovado, **Then**
   fica registrado que foi editado por pessoa e a origem continua AI_GENERATED.
3. **Given** um trabalho com 10 questões, **When** o professor tenta acrescentar uma, **Then** é
   recusado; **Given** um trabalho com 1 questão, **When** tenta remover a última, **Then** é
   recusado.
4. **Given** uma edição que quebra uma regra (ex.: Múltipla escolha com duas corretas, questão
   sem gabarito), **When** o professor salva, **Then** a edição é recusada e o trabalho fica
   como estava.
5. **Given** qualquer execução de IA, **When** ela termina, **Then** nenhum trabalho está
   APPROVED: não existe caminho pelo qual a IA aprove, arquive ou publique um trabalho.
6. **Given** duas abas editando ou aprovando o mesmo trabalho, **When** agem ao mesmo tempo,
   **Then** só uma alteração vale e a outra recebe um aviso de que o trabalho mudou.
7. **Given** um trabalho APPROVED, **When** o professor o edita, **Then** as regras valem de
   novo, a edição é auditada e o trabalho continua APPROVED.

---

### User Story 6 - Visão do aluno sem gabarito (Priority: P1)

Existe uma visão do trabalho própria para o aluno, montada no servidor a partir de uma lista
fechada de campos permitidos, sem resposta esperada, sem alternativa correta, sem solução
esperada, sem casos de teste privados, sem explicação e sem nenhum dado de correção. O aluno,
inspecionando a página, o código da interface ou o tráfego de rede, não encontra o gabarito.

**Why this priority**: esconder na interface não basta; o gabarito não pode sair do servidor
quando quem consulta é aluno.

**Independent Test**: montar a visão de aluno de um trabalho com os três tipos de questão e
conferir, no conteúdo que sai pela rede, que nenhuma informação de gabarito está presente.

**Acceptance Scenarios**:

1. **Given** uma Pergunta e resposta, **When** a visão de aluno é montada, **Then** ela tem o
   enunciado e o valor da questão, e não tem a resposta esperada, a rubrica nem a explicação.
2. **Given** uma Múltipla escolha, **When** a visão de aluno é montada, **Then** ela tem o
   enunciado, o valor e o texto das alternativas na ordem de apresentação, e não tem qual é a
   correta, marcação por alternativa, explicação nem indicação de pegadinha.
3. **Given** uma questão de código, **When** a visão de aluno é montada, **Then** ela tem
   enunciado, instruções, código inicial, linguagem, valor e os casos de teste públicos, e não
   tem a solução esperada, os casos de teste privados nem a explicação.
4. **Given** um aluno, ou qualquer usuário sem as permissões do banco, **When** chama uma rota do
   professor com o identificador de um trabalho, **Then** recebe recusa e nenhum gabarito.
5. **Given** a visão de aluno e a do professor, **When** comparadas, **Then** a do aluno é
   construída por lista fechada: um campo novo do trabalho nunca aparece para o aluno sem
   decisão explícita.

---

### User Story 7 - Consultar e manter o Banco de Trabalhos (Priority: P2)

O professor consulta seus trabalhos com filtros (disciplina, ementa, tópico, origem, situação,
dificuldade, período de criação e título), com paginação. Arquiva o que não quer mais usar e
restaura quando precisar.

**Why this priority**: sem consulta o banco não é reutilizável; vem depois de haver trabalhos.

**Independent Test**: com 60 trabalhos de várias disciplinas, filtrar por tópico e situação,
buscar uma palavra do título e paginar; conferir que só aparecem trabalhos do professor.

**Acceptance Scenarios**:

1. **Given** um banco com trabalhos, **When** o professor filtra e busca, **Then** vê só os seus
   trabalhos que atendem a todos os filtros, em páginas, nunca o banco inteiro de uma vez.
2. **Given** a busca "heranca", **When** executada, **Then** encontra títulos com "Herança" (sem
   diferenciar maiúsculas e acentos).
3. **Given** um trabalho APPROVED ou DRAFT, **When** o professor o arquiva, **Then** ele passa a
   ARCHIVED, sai da consulta padrão (aparece filtrando por arquivados), não pode ser editado nem
   aprovado, e pode ser restaurado para a situação anterior.
4. **Given** o professor B, **When** tenta ver, editar, aprovar ou arquivar um trabalho do
   professor A por qualquer caminho, **Then** recebe "não encontrado".
5. **Given** um professor com 500 trabalhos numa disciplina, **When** cria mais um, **Then** é
   aceito: não há limite por professor, disciplina, turma ou semestre.

---

### User Story 8 - Estratégias de correção e cálculo da nota do aluno (Priority: P2)

Cada tipo de questão tem uma estratégia de correção fixada pela plataforma: Múltipla escolha
por comparação exata com a alternativa correta, feita no servidor e sem IA; Código por casos
de teste executados em ambiente isolado (Code Runner, spec própria), nunca por comparação
textual com a solução esperada; Pergunta e resposta por avaliação semântica sugerida pela IA
e nota final do professor. A nota do aluno num trabalho é a soma das notas finais das
questões, entre 0 e a nota total. Nesta feature as estratégias e a regra da nota são definidas
e testadas como regras do domínio; quem as executa sobre respostas reais de alunos é a 012
(Clarifications).

**Why this priority**: o gabarito e as regras de correção precisam existir antes da primeira
entrega, para que a correção seja íntegra e para que nenhuma decisão subjetiva fique só com a
máquina (constituição XI e XII).

**Independent Test**: aplicar as regras de correção a respostas simuladas de cada tipo (sem
turma, sem entrega e sem chamada a modelo) e conferir nota por questão, nota do trabalho e o
encaminhamento para o professor quando a correção automática não é possível.

**Acceptance Scenarios**:

1. **Given** uma Múltipla escolha de valor 0,05, **When** a resposta é a alternativa correta,
   **Then** a nota da questão é 0,05; incorreta ou em branco, 0,00; nenhuma IA é chamada.
2. **Given** um trabalho de 0,50 com 10 questões de 0,05, **When** o aluno acerta 9 ou 8
   Múltiplas escolhas, **Then** a nota é 0,45 ou 0,40.
3. **Given** uma questão de código, **When** duas soluções diferentes da solução esperada passam
   em todos os casos de teste, **Then** as duas recebem o valor integral; o código do aluno nunca
   é comparado como texto com a solução esperada.
4. **Given** uma questão de código e o Code Runner indisponível ou com erro de infraestrutura,
   **When** a correção é tentada, **Then** a questão vai para revisão do professor, sem nota
   zero automática.
5. **Given** uma Pergunta e resposta com uma nota sugerida simulada de 0,04 num valor de 0,05,
   **When** a regra é aplicada, **Then** a questão fica com nota sugerida 0,04 e sem nota final;
   **When** o professor decide 0,05, **Then** nota do professor 0,05 e nota final 0,05 — a
   decisão do professor prevalece, e nenhuma nota sugerida vira final sozinha.
6. **Given** uma Pergunta e resposta cuja sugestão falhou (IA indisponível ou resposta
   inválida), **When** a regra é aplicada, **Then** a questão fica pendente de correção do
   professor, sem nota zero automática.
7. **Given** qualquer combinação de notas finais, **When** a nota do trabalho é calculada,
   **Then** 0 ≤ nota do aluno ≤ nota total, cada questão entre 0 e o seu valor (uma nota sugerida
   ou do professor fora disso é recusada), e questões ainda sem nota final não entram na soma e
   deixam a nota do trabalho como parcial.
8. **Given** qualquer rota desta feature, **When** consultada por um aluno, **Then** nenhum
   gabarito é enviado: a liberação do resultado ao aluno depende de um trabalho aplicado e
   encerrado, que só existe a partir da 012.

---

### Edge Cases

- **Nenhum modelo aprovado para a geração de trabalhos**: "Criar trabalho com IA" fica
  indisponível com o motivo só nos logs operacionais; a criação manual segue normal.
- **Tópicos de revisões diferentes da mesma ementa**: recusados; um trabalho usa itens de uma
  única revisão confirmada (a interface oferece a mais recente).
- **Nova revisão da ementa depois de criado o trabalho**: o trabalho continua ligado aos itens
  da revisão em que foi criado; nada muda sozinho.
- **Disciplina arquivada**: seus trabalhos continuam no banco e consultáveis; não se gera com IA
  para disciplina arquivada.
- **Pedido repetido (clique duplo, reenvio)**: o mesmo pedido cria um só trabalho e uma só
  geração.
- **Geração cancelada, expirada ou recusada**: nenhum trabalho é criado; o pedido registra o
  motivo e o professor pode pedir de novo.
- **Mais tópicos do que questões** (ex.: 4 tópicos e 2 questões): permitido na criação manual.
  Na geração com IA, todo tópico selecionado precisa aparecer em ao menos uma questão, e cada
  questão relaciona no máximo 3; por isso o pedido é recusado quando há mais de 3 tópicos por
  questão (ex.: 7 tópicos e 2 questões), FR-021.
- **Nota que não divide em centésimos iguais** (0,50 / 3, 1,00 / 7): o resto vai, um centésimo
  por questão, às primeiras posições; a interface mostra o valor de cada questão.
- **Reordenar questões**: recalcula os valores, porque o resto segue a posição.
- **Pegadinha**: marcada na questão (visível ao professor, nunca ao aluno); o professor pode
  desmarcá-la ou marcá-la na revisão e na criação manual.
- **Tópico ou texto da ementa com instruções dirigidas à IA**: chega à IA só como conteúdo,
  nunca como instrução; não muda quantidade, tipos, dificuldade, nota nem modelo.
- **Linguagem desativada no catálogo no futuro**: questões que a usam continuam válidas.
- **Caso de teste com saída esperada vazia**: permitido (programas que não imprimem nada);
  entrada vazia também.
- **Conta com papéis ADMIN e TEACHER**: vê apenas o próprio banco, como professor.

## Requirements *(mandatory)*

### Functional Requirements

**Separação do Banco de Exercícios**

- **FR-001**: O Banco de Trabalhos DEVE ser uma área própria, com dados, regras, rotas,
  permissões, auditoria e telas próprios. O Banco de Exercícios (010) NÃO DEVE ser alterado
  para representar trabalhos (nenhum tipo, marcação ou categoria de "trabalho" em exercício), e
  um trabalho NÃO é um conjunto de exercícios do banco. Componentes técnicos genéricos (ex.:
  controles de interface, catálogo de linguagens, o cálculo de distribuição por tipo) PODEM ser
  compartilhados quando não ligam um domínio ao outro.

**Trabalho e questões**

- **FR-002**: Todo trabalho DEVE ter professor, disciplina, título, nota total, origem,
  situação, datas de criação e alteração e de 1 a 10 questões; descrição e dificuldade são
  opcionais. Não há limite de trabalhos por professor, disciplina, turma ou semestre.
- **FR-003**: Um trabalho PODE se ligar a zero ou mais itens de conteúdo (tópicos) de uma única
  revisão confirmada da ementa da sua disciplina (máximo 10). O servidor DEVE verificar que cada
  tópico existe, pertence a essa revisão, que a revisão é confirmada e da disciplina do
  trabalho, e que a disciplina é do professor; caso contrário, recusa sem revelar recursos de
  outros professores.
- **FR-004**: As questões DEVEM ser de três tipos, misturáveis num mesmo trabalho: Pergunta e
  resposta (`OPEN_ANSWER`), Múltipla escolha (`MULTIPLE_CHOICE`) e Código (`CODE`). Um tipo
  novo DEVE poder ser acrescentado definindo sua estrutura, seu gabarito, sua estratégia de
  correção e sua visão de aluno, sem reescrever os existentes (constituição VIII, OCP).
- **FR-005**: Toda questão DEVE ter posição, enunciado, valor (calculado, FR-011) e explicação
  opcional, e DEVE ter o seu **gabarito** desde a criação: resposta esperada (Pergunta e
  resposta, com rubrica opcional); a alternativa correta (Múltipla escolha); solução esperada,
  linguagem e casos de teste (Código).
- **FR-006**: Múltipla escolha DEVE ter de 3 a 5 alternativas, com textos distintos, exatamente
  uma correta, em ordem definida, e a indicação de pegadinha (sim/não, padrão não).
- **FR-007**: Código DEVE ter solução esperada e linguagem (entrada ativa do catálogo de
  linguagens da 010); instruções e código inicial são opcionais. Casos de teste têm entrada,
  saída esperada e visibilidade `PUBLIC` (pode ser mostrada ao aluno) ou `PRIVATE` (usada na
  correção, nunca enviada ao aluno antes da liberação do resultado). A criação manual PODE
  salvar código sem casos de teste; a aprovação de um trabalho com questão de código sem casos
  de teste DEVE avisar o professor de que essa questão será corrigida por ele.
- **FR-008**: Todas as regras de estrutura, de quantidade e de gabarito DEVEM ser verificadas
  no servidor, na criação manual, na edição e na resposta da IA, independentemente do que a
  interface ou a IA garantam. De 0 ou mais de 10 questões → recusa; o mínimo de 3 do Banco de
  Exercícios NÃO se aplica.

**Dificuldade e origem**

- **FR-009**: A dificuldade pedagógica DEVE ter três níveis — Básico (`BASIC`), Intermediário
  (`INTERMEDIATE`) e Avançado (`ADVANCED`) —, obrigatória na geração com IA e opcional no
  trabalho manual. É um conceito distinto do nível de capacidade de modelos (009): nenhum valor
  de um implica valor do outro, e a dificuldade NÃO DEVE influenciar a escolha de modelo.
- **FR-010**: Todo trabalho DEVE ter origem `MANUAL` ou `AI_GENERATED`, definida na criação e
  nunca alterada, mesmo depois de editado.

**Nota e valor das questões**

- **FR-011**: A nota total DEVE ser informada pelo professor, com no máximo duas casas decimais,
  entre 0,01 e 100,00, e com pelo menos 0,01 por questão. O valor das questões DEVE ser
  calculado pelo sistema, com peso igual, em centésimos: valor-base = nota total ÷ quantidade,
  truncado em centésimos; o resto, em centésimos, é somado um centésimo por questão às primeiras
  posições. A soma dos valores DEVE ser exatamente a nota total. Cálculos e armazenamento usam
  aritmética decimal exata, nunca ponto flutuante.
- **FR-012**: Os valores DEVEM ser recalculados e gravados sempre que mudar a nota total, a
  quantidade de questões ou a ordem. O professor NÃO informa o valor de cada questão, e a IA
  NÃO o define.

**Situação e revisão**

- **FR-013**: Todo trabalho DEVE estar em uma situação: `DRAFT` (em elaboração), `APPROVED`
  (revisado pelo professor e disponível para uso) ou `ARCHIVED` (mantido para histórico).
  Transições: DRAFT → APPROVED, DRAFT → ARCHIVED, APPROVED → ARCHIVED, ARCHIVED → situação
  anterior (restaurar); qualquer outra DEVE ser recusada.
- **FR-014**: Trabalhos manuais DEVEM ser salvos como DRAFT ou APPROVED, à escolha do
  professor. Trabalhos `AI_GENERATED` DEVEM nascer em DRAFT e só passam a APPROVED por ação
  explícita de um usuário autorizado. Nenhuma execução de IA pode aprovar, arquivar, publicar ou
  atribuir um trabalho a alunos.
- **FR-015**: Aprovar DEVE exigir que toda questão tenha o gabarito completo (FR-005 a FR-007).
- **FR-016**: Em DRAFT e em APPROVED, o professor DEVE poder editar título, descrição,
  dificuldade, tópicos, nota total, enunciados, alternativas e a correta, pegadinha, resposta
  esperada, rubrica, código inicial, instruções, solução, linguagem, casos de teste e
  explicações, e acrescentar (até 10), remover (até restar 1) e reordenar questões.
  Trabalhos ARCHIVED NÃO PODEM ser editados nem aprovados.
- **FR-017**: Para trabalhos `AI_GENERATED`, o sistema DEVE registrar se foram revisados por
  pessoa, se foram editados por pessoa, quem revisou e quando.

**Geração com IA — pedido**

- **FR-018**: O pedido DEVE informar: disciplina, título, um ou mais tópicos (até 10, FR-003),
  dificuldade, nota total, quantidade de questões (1 a 10), tipos (um, dois ou três) e a
  quantidade por tipo ou "distribuir automaticamente", e o número de pegadinhas quando houver
  Múltipla escolha. A descrição é opcional. A linguagem das questões de código NÃO é informada:
  é a da revisão da ementa dos tópicos; sem linguagem na revisão, um pedido com código DEVE ser
  recusado.
- **FR-019**: Na distribuição manual, a soma das quantidades por tipo DEVE ser igual ao total,
  e cada tipo escolhido DEVE ter ao menos 1 questão. Na automática, o servidor DEVE distribuir o
  total entre os tipos escolhidos com diferença de no máximo 1, de forma determinística (a mesma
  escolha dá sempre a mesma distribuição), exigindo total ≥ número de tipos.
- **FR-020**: O número de pegadinhas DEVE estar entre 0 e 3 e nunca passar do número de
  Múltipla escolha; sem Múltipla escolha, DEVE ser 0.
- **FR-021**: Na geração com IA, o número de tópicos NÃO PODE passar de 3 vezes a quantidade de
  questões (cada questão relaciona no máximo 3 tópicos, e todo tópico selecionado precisa ser
  coberto, FR-027).
- **FR-022**: O pedido NÃO PODE conter modelo, provedor, família, nível de capacidade, tarefa,
  instruções livres para a IA nem texto no lugar dos tópicos; campos desconhecidos DEVEM ser
  recusados.
- **FR-023**: Cada pedido DEVE ser registrado com o professor, a configuração completa, a
  situação da geração, a execução de IA correspondente e, quando termina bem, o trabalho criado.
  Repetir o mesmo pedido (mesma chave de idempotência) DEVE reaproveitar o mesmo registro.

**Geração com IA — execução e validação**

- **FR-024**: A geração DEVE rodar exclusivamente pela infraestrutura de IA existente: um
  agente de geração de trabalhos registrado, uma tarefa com política de modelos (009), o
  gateway, os limites por execução, por usuário e por agente, o custo, a auditoria e os logs já
  existentes. O Banco de Trabalhos NÃO PODE escolher modelo, provedor, nível de capacidade ou
  credencial, nem chamar provedor diretamente, nem criar cliente, chave, roteamento, fallback ou
  auditoria paralelos.
- **FR-025**: A IA DEVE receber somente o contexto autorizado: o texto de cada tópico
  selecionado, o título do grupo de cada um, o título, a competência e a linguagem da revisão da
  ementa e a configuração do pedido (dificuldade, quantidade, tipos e distribuição, pegadinhas,
  linguagem e as regras de estrutura, incluindo o que torna uma pegadinha aceitável — erros
  comuns, diferenças sutis, comportamento inesperado de código, conceitos parecidos,
  alternativas plausíveis — ou proibida — duas corretas, ambiguidade proposital, informação
  inexistente, jogo de palavras sem valor pedagógico). Nenhum dado de aluno, de turma, de outro
  professor ou de outras ementas; a nota total e o título não são necessários à IA e NÃO DEVEM
  ser enviados como algo que ela decide.
- **FR-026**: O conteúdo da ementa DEVE chegar à IA como conteúdo não confiável, separado das
  instruções; instruções embutidas nele NÃO PODEM mudar o pedido, o modelo nem as regras.
- **FR-027**: A resposta da IA DEVE ser saída estruturada validada contra o esquema da tarefa
  e, depois, contra o pedido registrado: quantidade total, tipos e quantidade por tipo,
  dificuldade, número de pegadinhas (só em Múltipla escolha), linguagem, gabarito completo de
  cada questão (incluindo ao menos um caso de teste por questão de código), regras de Múltipla
  escolha, enunciados repetidos (após normalizar maiúsculas, acentos e espaços), e tópicos: cada
  questão referencia de 1 a 3 tópicos da seleção, nenhum fora dela, e todo tópico selecionado
  aparece em ao menos uma questão. Qualquer violação recusa a resposta inteira; texto livre nunca
  é gravado.
- **FR-028**: Título, descrição, nota total, tópicos do trabalho, dificuldade, situação, valores
  das questões e todos os identificadores DEVEM vir do pedido registrado ou ser calculados pelo
  sistema; valores desses campos na resposta da IA são ignorados.
- **FR-029**: Uma resposta válida DEVE gravar o trabalho, as questões, as alternativas, os
  casos de teste e os tópicos numa única operação; uma recusada NÃO PODE gravar nada e registra
  o motivo (sem conteúdo da resposta).
- **FR-030**: O agente de geração de trabalhos DEVE ser L2 (sugestão), registrado desabilitado,
  só lê os tópicos do próprio pedido, e DEVE ter conjunto de referência e avaliação sob demanda
  que aprovem um modelo antes de ser habilitado (constituição XIII, XIX; portão de qualidade da
  009), cobrindo estrutura válida, aderência aos tópicos e a estrutura das pegadinhas
  (exatamente uma correta, alternativas distintas, número pedido); a qualidade pedagógica das
  pegadinhas é lida por pessoa na evidência e registrada na aprovação do modelo.

**Banco de Trabalhos (consulta)**

- **FR-031**: O professor DEVE consultar só os próprios trabalhos, com filtros combináveis por
  disciplina, ementa, tópico, origem, situação, dificuldade e período de criação, busca por
  título sem diferenciar maiúsculas e acentos, e paginação com tamanho de página limitado.
  Arquivados só aparecem quando filtrados.
- **FR-032**: O professor DEVE ver os pedidos de geração com sua configuração, situação e o
  trabalho criado, e pedir de novo com a mesma configuração.

**Visões professor × aluno e gabarito protegido**

- **FR-033**: O sistema DEVE ter duas visões do trabalho com contratos distintos: a do professor
  (completa, com gabarito) e a do aluno, montada no servidor a partir de uma lista fechada de
  campos permitidos: título, descrição, nota total e, por questão, posição, tipo, enunciado,
  valor, instruções, código inicial, linguagem, casos de teste `PUBLIC` e o texto das
  alternativas na ordem de apresentação.
- **FR-034**: Enquanto o resultado não for liberado, a visão do aluno NÃO PODE conter resposta
  esperada, rubrica, alternativa correta ou marcação de correta, solução esperada, casos de teste
  `PRIVATE`, explicação, pegadinha, origem, dados de revisão nem qualquer dado de correção.
  Rotas do professor DEVEM recusar quem não tem as permissões do banco.
- **FR-035**: A liberação do gabarito ao aluno (resposta esperada, solução de referência,
  feedback e nota ao lado da resposta dele) DEVE ser decidida no servidor pela situação do
  trabalho aplicado, nunca pela interface. Nesta feature não existe trabalho aplicado, e
  nenhuma rota libera gabarito a aluno; a liberação é implementada na 012.

**Correção por estratégia**

- **FR-036**: Cada tipo de questão DEVE ter uma estratégia de correção fixada pela plataforma e
  registrada na questão: Múltipla escolha → `EXACT_MATCH`; Código → `TEST_CASES`; Pergunta e
  resposta → `AI_REVIEW`. A correção DEVE ser despachada pela estratégia, não por condicionais
  de tipo espalhadas; uma estratégia nova entra sem reescrever as existentes.
- **FR-037**: `EXACT_MATCH` DEVE comparar no servidor a alternativa escolhida com a correta:
  igual → valor integral; diferente ou em branco → 0. Nenhuma IA é chamada. O resultado é
  `RULE_RESULT` e é a nota final.
- **FR-038**: `TEST_CASES` DEVE decidir pela execução dos casos de teste num Code Runner isolado
  (spec própria): todos os casos passam → valor integral; algum falha → 0. O código do aluno
  NUNCA é comparado como texto com a solução esperada, nem executado no processo da API, no
  servidor principal, por avaliação dinâmica ou por shell sem isolamento. Enquanto não houver
  Code Runner, ou se ele estiver indisponível ou falhar por infraestrutura, ou se a questão não
  tiver casos de teste, a questão DEVE ir para correção do professor.
- **FR-039**: `AI_REVIEW` DEVE produzir uma nota sugerida (0 a valor da questão, em centésimos),
  que é `SUGGESTION`; a nota final DEVE ser a do professor (`HUMAN_DECISION`), que confirma ou
  altera, e prevalece. A regra registra nota sugerida, nota do professor e nota final.
  Múltipla escolha e Código nunca vão para avaliação por IA. O agente que produz a sugestão (o
  WorkEvaluationAgent, que recebe só enunciado, resposta esperada, rubrica, resposta do aluno,
  tópicos e valor máximo, e devolve nota sugerida, justificativa, feedback e confiança) é da 012.
- **FR-040**: Falha técnica (IA indisponível, resposta da IA inválida, Code Runner
  indisponível) NUNCA DEVE produzir nota zero: a questão fica pendente de correção do professor.
- **FR-041**: A nota do aluno no trabalho DEVE ser a soma das notas finais das questões, com
  cada questão entre 0 e o seu valor e o total entre 0 e a nota total do trabalho; questões sem
  nota final deixam a nota como parcial e não entram como zero.
- **FR-042**: Esta feature DEVE entregar a estratégia registrada em cada questão e as regras de
  FR-036 a FR-041 como regras do domínio, testadas com respostas simuladas, sem turma, sem
  resposta de aluno gravada e sem chamada a modelo. A aplicação do trabalho a uma turma, a
  resposta do aluno, a execução da correção, o agente de avaliação e a liberação do resultado
  são da 012 (Clarifications), que DEVE usar estas regras sem redefini-las.

### Security, Permissions & Audit *(mandatory if feature has protected operations)*

- **Permissions**: `trabalhos.visualizar` (consultar o banco, os trabalhos com gabarito e os
  pedidos de geração), `trabalhos.criar` (criação manual), `trabalhos.editar` (editar e
  reordenar), `trabalhos.arquivar` (arquivar e restaurar), `trabalhos.aprovar` (aprovar) e
  `ia.trabalhos.gerar` (pedir geração com IA; exige também `ia.execucoes.visualizar`, como na
  007 e na 010). Todas concedidas ao papel TEACHER; nenhuma a ADMIN, MANAGER ou STUDENT. Nenhuma
  checagem por nome de papel.
- **Resource context**: o banco é privado de cada professor; toda consulta e alteração é
  filtrada pelo professor da sessão, e recurso de outro professor responde "não encontrado". A
  disciplina e os tópicos de um trabalho são verificados contra as disciplinas e ementas do
  professor (004).
- **Audit events**: trabalho criado manualmente (`WORK_CREATED_MANUALLY`), geração pedida
  (`WORK_AI_GENERATION_REQUESTED`), trabalho gerado (`WORK_AI_GENERATED`) ou geração falha,
  trabalho editado (`WORK_EDITED`, com os nomes dos campos e se a quantidade mudou), aprovado
  (`WORK_APPROVED`, com a revisão por pessoa e se houve edição), arquivado (`WORK_ARCHIVED`) e
  restaurado — com ator, trabalho, data, identificador de correlação e, quando houver, a
  execução de IA. Metadados só com ids, contagens, tipos, enums e códigos, nunca enunciado,
  gabarito, solução, caso de teste, nota em texto livre ou texto da ementa.
- **Untrusted input**: pedidos HTTP com campos desconhecidos, texto no lugar de tópico, campos
  de modelo ou notas com mais de duas casas são recusados; o texto da ementa é conteúdo não
  confiável para a IA; a resposta da IA é validada contra esquema e contra o pedido antes de
  qualquer gravação; código de aluno é dado não confiável e nunca é executado fora do Code
  Runner isolado.
- **States & transitions**: trabalho (DRAFT → APPROVED → ARCHIVED, DRAFT → ARCHIVED, restaurar
  de ARCHIVED); transição inválida → `409 INVALID_STATE_TRANSITION`. A situação do pedido de
  geração (PENDING, GENERATED, FAILED, CANCELLED) é derivada da sua execução de IA e da criação
  do trabalho, nunca gravada em duplicidade. Correção de questão: pendente → corrigida
  (automática) ou pendente → sugerida pela IA → decidida pelo professor.
- **Idempotency**: o pedido de geração usa chave de idempotência (mesma chave → mesmo pedido e
  mesmo trabalho); aprovar ou arquivar algo já nesse estado não muda nada nem gera evento;
  edições usam controle de concorrência (edição sobre versão antiga é recusada).
- **Evidence vs. decisions**: a resposta da IA na geração e a nota sugerida na correção são
  SUGGESTION; a validação estrutural, o cálculo dos valores, a correção de Múltipla escolha e o
  resultado dos casos de teste são RULE_RESULT; aprovar, editar, arquivar e a nota final de
  Pergunta e resposta são HUMAN_DECISION.
- **Automation risk level**: L2 — geração de trabalhos (rascunho revisado). A sugestão de nota
  de respostas abertas, também L2 (nota final do professor), é executada na 012. Nenhuma
  operação L3.
- **Domain configurability**: nenhuma linguagem, disciplina ou tecnologia é codificada — as
  linguagens vêm do catálogo da 010; tipos de questão, dificuldades e estratégias de correção
  são conceitos da plataforma.
- **Sensitive data & adaptations**: nenhum dado de aluno é tocado nem enviado à IA nesta
  feature. Regra para a 012: na correção de Pergunta e resposta, só a resposta do aluno vai à
  IA, sem nome, e-mail, matrícula nem dado de adaptação. Gabaritos, rubricas e casos de teste privados são dados sensíveis de avaliação
  e só saem na visão do professor.
- **Curricular traceability**: todo trabalho gerado se liga aos tópicos escolhidos, e toda
  questão gerada a 1–3 deles, verificados deterministicamente; trabalhos manuais podem se ligar
  a tópicos. A geração para o banco a partir de vários conteúdos da mesma revisão confirmada
  segue a constituição XXIII v3.2.0 (Assumptions). Ao entrar numa atividade de turma (fase
  futura), vale o escopo ensinado daquela turma.

### Risk assessment (L2 — geração de trabalhos; a sugestão de nota é executada na 012)

| Risco | Efeito | Mitigação |
|-------|--------|-----------|
| Gabarito errado (alternativa, solução, caso de teste) | Aluno avaliado com gabarito errado | Nasce DRAFT; aprovação explícita com revisor e data (FR-014, FR-017); conjunto de referência com gabaritos revisados por pessoa (FR-030) |
| Pegadinha ambígua ou com duas corretas | Questão injusta | Regras de pegadinha no prompt; exatamente uma correta validada (FR-027); selo "Pegadinha" na revisão |
| Conteúdo fora dos tópicos | Trabalho que não avalia o conteúdo | Contexto só dos tópicos escolhidos (FR-025); vínculo de cada questão validado (FR-027) |
| Injeção pelo texto da ementa | Mudança de quantidade, nota, modelo ou aprovação | Texto como bloco não confiável (FR-026); configuração do pedido, não da IA (FR-028) |
| Nota sugerida pela IA aceita sem revisão | Nota subjetiva decidida por máquina | Nota final só por decisão do professor (FR-039); falha técnica nunca vira zero (FR-040) |
| Vazamento de gabarito ao aluno | Integridade da avaliação | Visão do aluno por lista fechada, montada no servidor (FR-033, FR-034) |
| Execução de código do aluno | Comprometimento do servidor | Execução só no Code Runner isolado, em spec própria (FR-038) |
| Custo descontrolado | Gasto de IA | Limites por execução, por professor e por agente; orçamentos da 009 |

### Key Entities *(include if feature involves data)*

- **Trabalho**: modelo reutilizável do professor — disciplina, título, descrição, dificuldade
  (opcional), nota total, quantidade de questões, origem, situação, situação anterior (para
  restaurar), dados de revisão (revisado, editado, por quem, quando), pedido de geração de
  origem (gerados) e versão para controle de concorrência.
- **Tópico do trabalho**: ligação N:N entre trabalho e item de uma revisão confirmada da ementa.
- **Questão do trabalho**: tipo, posição, enunciado, valor calculado, estratégia de correção,
  explicação, pegadinha, tópicos (gerados: 1–3 do trabalho) e o gabarito do tipo.
- **Alternativa**: opção de uma Múltipla escolha — texto, se é a correta, posição.
- **Gabarito por tipo**: resposta esperada e rubrica (Pergunta e resposta); instruções, código
  inicial, solução esperada e linguagem (Código).
- **Caso de teste**: de uma questão de código — entrada, saída esperada, visibilidade
  (`PUBLIC`/`PRIVATE`), posição.
- **Pedido de geração de trabalho**: professor, disciplina, tópicos, título, descrição,
  dificuldade, nota total, quantidade, quantidade por tipo, pegadinhas, linguagem, execução de
  IA, situação e trabalho criado.
- **Resultado de correção** (conceito de regra, sem persistência nesta feature): por questão,
  estratégia, nota sugerida, nota do professor, nota final e pendência de correção; por
  trabalho, nota do aluno e se é parcial. A 012 persiste esse resultado com a resposta do aluno.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Um professor cria um trabalho manual com 3 questões (uma de cada tipo) em menos de
  5 minutos, sem nenhuma chamada a modelo de IA.
- **SC-002**: Um professor pede um trabalho de 10 questões com IA e tem o rascunho para revisar
  em menos de 2 minutos em 95% dos pedidos, com exatamente a distribuição pedida (latência
  medida pela avaliação sob demanda com o modelo real; no CI, só a distribuição).
- **SC-003**: 100% dos casos de fronteira têm o resultado esperado na criação manual, na edição
  e na resposta da IA: 0/1/10/11 questões; 2/3/5/6 alternativas; 0/1/2 corretas; 0/3/4
  pegadinhas e pegadinhas acima da Múltipla escolha; tópico inexistente, de outra disciplina ou
  de outro professor.
- **SC-004**: Para 0,50/10, 1,00/10, 0,50/5 e 0,50/3 — e para todas as combinações de nota de
  0,01 a 10,00 (em centésimos) com 1 a 10 questões — a soma dos valores das questões é igual à
  nota total em 100% dos casos, e recalcula corretamente após acrescentar, remover ou reordenar.
- **SC-005**: 0 trabalhos gravados a partir de respostas da IA inválidas nos testes (esquema,
  quantidade, tipo, distribuição, pegadinhas, dificuldade, linguagem, gabarito, tópicos ou
  duplicados), e 0 trabalhos cuja nota, tópicos ou situação vêm da IA.
- **SC-006**: 0 trabalhos AI_GENERATED chegam a APPROVED sem uma ação de professor registrada
  com autor e data.
- **SC-007**: Em 100% das visões de aluno montadas nos testes, para os três tipos, não há
  resposta esperada, rubrica, alternativa correta, marcação de correta, solução, caso de teste
  privado nem explicação.
- **SC-008**: Nenhum professor, aluno, administrador ou gestor consegue ver ou alterar trabalho,
  gabarito ou pedido de outro professor por nenhuma rota (matriz de autorização completa).
- **SC-009**: A consulta ao banco com 1.000 trabalhos de um professor devolve a primeira página
  filtrada em menos de 1 segundo, e nenhuma resposta traz mais que uma página.
- **SC-010**: A escolha de modelo da geração é idêntica para as três dificuldades pedagógicas,
  com o mesmo catálogo e a mesma política.
- **SC-011**: Nas regras de correção, 100% dos casos testados respeitam: Múltipla escolha sem IA
  e com nota integral ou zero; código nunca comparado como texto; nota do aluno entre 0 e a nota
  total; nenhuma falha técnica resultando em zero; nenhuma nota final de Pergunta e resposta sem
  decisão do professor.
- **SC-012**: O conjunto de referência da geração de trabalhos atinge os limiares de qualidade
  definidos no plano (estrutura válida, aderência aos tópicos, estrutura das pegadinhas) no
  modelo aprovado, com as pegadinhas listadas na evidência para leitura humana, e roda no CI com
  respostas gravadas.
- **SC-013**: Nenhuma tabela, rota, tela ou regra do Banco de Exercícios (010) muda com esta
  feature; os testes da 010 continuam passando sem alteração.

## Assumptions

- **Emenda da constituição (XXIII)**: a v3.1.0 só permitia gerar modelos para o banco a partir
  de **um único** conteúdo da ementa. A emenda MINOR v3.2.0 (2026-09-30,
  `constitution-amendment-3.2.0.md`) estende "Geração para os bancos do professor" a 1 a N
  conteúdos de uma mesma revisão confirmada, com as mesmas garantias (escolha do professor
  verificada no servidor, a IA não acrescenta nem troca conteúdos, vínculo determinístico de
  cada questão a conteúdos da seleção, saída validada, rascunho revisado).
- **Trabalho do banco ≠ atividade `ASSIGNMENT`**: o banco guarda modelos; aplicar a uma turma,
  prazo, entrega individual ou em grupo e calendário são da fase de atividades.
- **Tópico = item de conteúdo** de uma revisão confirmada da ementa (como na 010), não o
  tópico do planejamento de uma turma. Todos os tópicos de um trabalho vêm de uma única
  revisão, o que também define a linguagem das questões de código geradas.
- **Política de precisão**: centésimos (duas casas), porque notas são lançadas assim no Brasil
  e os exemplos do pedido usam duas casas; resto distribuído pela posição. Nota total máxima
  100,00 para cobrir escalas de 0 a 100.
- **Máximo de 10 tópicos por trabalho**: suficiente para trabalhos de até 10 questões e mantém
  o contexto da IA pequeno.
- **Uma tarefa de IA de geração**: a dificuldade é parâmetro do pedido; a política de modelos
  (009) decide o nível pelas avaliações.
- **O agente de avaliação de respostas abertas** (WorkEvaluationAgent, `AI_REVIEW`) é da 012:
  separado do de geração, L2, avaliando só Pergunta e resposta, com o seu próprio conjunto de
  referência e avaliação antes de ser habilitado. Esta feature registra só um agente novo, o de
  geração.
- **Code Runner em spec própria** (constituição, Fase 009 do roadmap): isolamento, limites de
  CPU, memória e tempo e testes próprios. Esta feature só modela os casos de teste e o
  encaminhamento ao professor.
- **Casos de teste gerados pela IA não são verificados** contra a solução esperada até existir o
  Code Runner; o professor os revisa na aprovação.
- **Correlação na auditoria**: o "identificador de correlação" pedido é o `requestId` já gravado
  em cada evento de auditoria; nos eventos de geração, a execução de IA (com a sua própria
  correlação) entra pelo `executionId`.
- **Sem compartilhamento**: o banco é privado; compartilhar entre professores exige spec.
- **Limites e custo**: a geração conta nos limites existentes por usuário e por agente e no custo
  e orçamentos da 009; um limite próprio por professor por hora é definido no plano.
