# Feature Specification: 009 — Política de Modelos de IA: Catálogo, Níveis de Capacidade e Custo

**Feature Branch**: `009-ai-model-policy`
**Created**: 2026-09-26
**Status**: Draft
**Input**: User description: "Implementar uma política centralizada de seleção e governança de modelos de IA sobre o AI Gateway + OpenRouter já existentes (sem recriá-los): allowlist de famílias de modelos (inicialmente JEV, Anthropic e OpenAI), catálogo de modelos aprovados com metadados e ciclo de vida (CANDIDATE, EVALUATING, PRODUCTION, DEPRECATED, DISABLED), níveis de capacidade BASIC/STANDARD/ADVANCED independentes de provedor, política explícita por tarefa (nível mínimo e preferido, provedores permitidos, capacidades exigidas, fallback), seleção determinística e auditável — primeiro qualidade, depois custo —, fallback técnico no mesmo nível distinto de escalonamento de nível só por regra explícita, quality gate ligado às avaliações, troca de versões sem mudar agentes, custo observável por agente, tarefa, nível, provedor e modelo, orçamentos configuráveis e override só administrativo. Reclassificar as tarefas do Agente de Ementa (quase tudo BASIC; avaliação pedagógica STANDARD; comparação complexa ADVANCED) sem mudar sua finalidade. Sem nomes concretos de modelos na spec, sem novo agente, sem catálogo do OpenRouter para usuários."

## Contexto do domínio existente

Esta feature evolui a fundação de IA (006), o Curriculum Agent (007) e o gateway com
OpenRouter (008). Nada disso é recriado:

| Pedido | Situação hoje (006/007/008) | O que esta feature faz |
|--------|-----------------------------|------------------------|
| AI Gateway, provedor OpenRouter, credencial no servidor | Existe (008): único caminho até um modelo; o OpenRouter é o único provedor real e não escolhe modelos por conta própria | Mantém; o gateway passa a receber o modelo escolhido pela política |
| Tarefas | Existe (008): o agente declara a tarefa; a tarefa aponta para uma configuração principal e uma de fallback, cujos modelos vêm de variáveis de ambiente | A tarefa passa a declarar **nível de capacidade**, provedores e capacidades; o modelo concreto sai do **catálogo** |
| Restrição de modelos | Parcial (008): formato `fornecedor/modelo`, sem modelos que escolhem outros modelos; qualquer fornecedor aceito | Allowlist de famílias e catálogo de modelos aprovados; fora dele, recusa |
| Fallback | Existe (008): uma vez, após falha recuperável, nunca de volta ao principal; circuito por configuração | Mantém; o fallback é escolhido no **mesmo nível** e dentro da allowlist |
| Escalonamento de nível | Não existe | Adiciona, só por regra explícita da tarefa |
| Qualidade antes de produção | Parcial (007): a avaliação sob demanda do conjunto de referência é o portão para o administrador habilitar o agente | O portão passa a valer por **modelo × tarefa**, com limiares registrados |
| Custo e uso | Existe (008): tokens, custo (do provedor ou pelo preço), modelo servido e fallback por chamada; métricas por agente e modelo | Acrescenta nível, escalonamento e visões por tarefa, nível e provedor |
| Limites de consumo | Existe: por execução (chamadas, tokens, prazo), por usuário (pedidos por minuto e por hora) e por agente (execuções por hora) | Acrescenta orçamentos em dinheiro configuráveis |
| Override | Existe: o administrador desabilita um agente ou uma configuração de modelo | Acrescenta a escolha administrativa de um modelo aprovado para uma tarefa |

Os nomes comerciais e as versões concretas dos modelos **não** aparecem nesta spec: eles são
dados do catálogo, atualizados pela equipe conforme preço, disponibilidade e resultado das
avaliações.

## Clarifications

### Session 2026-09-26

- Q: Qual família de modelos é "JEV"? → A: O **Jev**, da TypeSafe (`typesafe/jev-1.13` no
  OpenRouter). É um modelo **de decisão**: não escreve texto; recebe um texto e perguntas tipadas e
  responde só em três formas — escolher uma opção de uma lista, dar uma pontuação numa escala ou
  a probabilidade de uma afirmação ser verdadeira —, em geral com o grau de certeza, quase
  instantaneamente e por custo mínimo. No OpenRouter usa uma rota própria de decisões, diferente
  da de geração de texto. Teste real em 2026-09-27: três perguntas sobre um e-mail inventado em
  531 ms por US$ 0,00003. A allowlist fica: TypeSafe (Jev), Anthropic e OpenAI. O Jev é modelo
  **do sistema** (uma entrada do catálogo); não é ferramenta do trabalho de desenvolvimento.
- Q: Quais tarefas do Agente de Ementa ganham política agora? → A: As oito políticas são
  registradas; só a análise atual de "Preencher com IA" executa (BASIC). As outras sete ficam
  declaradas no registro, testáveis pela política, e passam a executar quando a spec de cada
  funcionalidade chegar.
- Q: Os orçamentos em dinheiro bloqueiam pedidos ao serem atingidos? → A: Não. Nesta feature
  são configuráveis e observáveis: atingir um orçamento gera aviso e evento de auditoria, sem
  bloquear. Os limites por execução, por usuário e por agente continuam impedindo consumo
  ilimitado.

## User Scenarios & Testing *(mandatory)*

Os atores são o **professor** (usa "Preencher com IA" da 007 sem ver modelos), o
**administrador** (opera a IA em "Operação de IA", pode escolher um modelo aprovado para uma
tarefa e acompanha o custo) e a **equipe de desenvolvimento** (mantém o catálogo e as
políticas, roda as avaliações e promove modelos). Todos os testes automatizados usam o
provedor simulado; modelos reais só são usados na avaliação sob demanda e em produção.

### User Story 1 - Só famílias e modelos aprovados são usados (Priority: P1)

A equipe mantém uma allowlist de famílias de modelos e um catálogo de modelos aprovados. Nenhum
modelo fora do catálogo, nem de família fora da allowlist, é usado — nem como principal, nem
como fallback, nem por configuração de ambiente, nem por escolha do OpenRouter.

**Why this priority**: é a garantia central de governança (critérios 1, 2 e 12 do pedido);
sem ela as demais políticas não têm base.

**Independent Test**: configurar um modelo fora do catálogo ou de família não autorizada e
verificar que ele nunca é chamado e que a tarefa fica indisponível ou usa outro aprovado.

**Acceptance Scenarios**:

1. **Given** um modelo que não está no catálogo, **When** alguém tenta usá-lo por
   configuração, override ou fallback, **Then** ele é recusado, nenhuma chamada é feita a ele
   e o motivo fica registrado sem segredo.
2. **Given** um modelo do catálogo cuja família não está na allowlist, **When** a política
   seleciona modelos, **Then** ele nunca é selecionado.
3. **Given** um modelo novo disponível no OpenRouter, **When** o sistema inicia ou roda,
   **Then** ele não entra no catálogo nem em produção sem ação explícita da equipe.
4. **Given** qualquer chamada ao OpenRouter, **When** ela é montada, **Then** pede exatamente o
   modelo escolhido pela política e proíbe o OpenRouter de trocar por outro modelo.

---

### User Story 2 - Cada tarefa usa o nível de capacidade que precisa, pelo menor custo que atende (Priority: P1)

Cada tarefa declara o nível mínimo e o preferido (BASIC, STANDARD, ADVANCED), os provedores
permitidos e as capacidades exigidas. A política escolhe, de forma determinística, um modelo
aprovado do nível preferido que atende às capacidades e passou pelo portão de qualidade da
tarefa; entre esses, o de menor custo, respeitando prioridades definidas pela equipe.

**Why this priority**: é o princípio central ("o modelo mais barato que atende com
confiabilidade") e o que controla o custo à medida que o sistema cresce.

**Independent Test**: com vários modelos de níveis, provedores, custos e estados diferentes
no catálogo, verificar que a escolha para cada tarefa é sempre a mesma, do nível certo, entre
os aprovados, e a mais barata entre eles.

**Acceptance Scenarios**:

1. **Given** uma tarefa BASIC e modelos BASIC, STANDARD e ADVANCED aprovados, **When** a
   política escolhe, **Then** escolhe um modelo BASIC; nunca um de nível maior sem regra
   explícita.
2. **Given** três modelos BASIC aprovados para a tarefa com custos diferentes, **When** a
   política escolhe, **Then** escolhe o de menor custo; com o mesmo custo, a ordem é definida
   por prioridade e depois por identificador, sempre igual.
3. **Given** um modelo BASIC mais barato que não passou no portão de qualidade da tarefa,
   **When** a política escolhe, **Then** ele é ignorado, por mais barato que seja.
4. **Given** uma tarefa que exige saída estruturada, **When** a política escolhe, **Then** só
   considera modelos que suportam saída estruturada.
5. **Given** nenhum modelo aprovado que atenda à tarefa, **When** um professor pede a análise,
   **Then** a tarefa aparece como indisponível, nada é chamado e o fluxo manual continua
   funcionando.
6. **Given** a mesma entrada de política (catálogo, portões, estados, overrides), **When** a
   escolha é feita várias vezes ou em instâncias diferentes, **Then** o resultado é idêntico e
   registrado na execução.

---

### User Story 3 - O Curriculum Agent roda no nível BASIC sem mudar nada para o professor (Priority: P1)

As tarefas do Agente de Ementa são reclassificadas pela política (quase todas BASIC). A
análise de "Preencher com IA" passa a usar um modelo BASIC aprovado, com as mesmas regras,
proposta, revisão e fundamentação da 007.

**Why this priority**: é o único agente em produção e onde a economia aparece primeiro; não
pode regredir.

**Independent Test**: a suíte automatizada da 007 e da 008 passa com a análise roteada pela
política para um modelo BASIC simulado, sem mudar asserções de comportamento.

**Acceptance Scenarios**:

1. **Given** a tarefa de extração da ementa classificada como BASIC e ao menos um modelo BASIC
   aprovado para ela na avaliação, **When** o professor pede "Preencher com IA", **Then** a
   execução usa um modelo BASIC aprovado e o registro mostra a tarefa, o nível, o provedor e o
   modelo.
2. **Given** a suíte da 007, **When** ela roda, **Then** todos os cenários passam sem mudança
   de comportamento.
3. **Given** o código do agente, **When** inspecionado, **Then** não contém nível, provedor
   nem modelo: só as tarefas que executa.

---

### User Story 4 - Fallback técnico no mesmo nível; escalonamento só por regra explícita (Priority: P1)

Uma falha técnica recuperável leva a outro modelo aprovado **do mesmo nível** (fallback). Uma
falha de qualidade detectável só sobe de nível quando a política da tarefa permite
explicitamente, uma vez, até o nível máximo permitido (escalonamento). Os dois são registrados
separadamente.

**Why this priority**: sem essa separação o custo se multiplica (BASIC → STANDARD →
ADVANCED em toda requisição) ou a confiabilidade cai.

**Independent Test**: com o provedor simulado, provocar falhas técnicas e falhas de qualidade
em tarefas com e sem permissão de escalonamento e conferir o nível usado, o número de
chamadas e o registro.

**Acceptance Scenarios**:

1. **Given** o modelo BASIC escolhido com falha recuperável e outro BASIC aprovado de outra
   família permitida, **When** a análise roda, **Then** o fallback usa esse outro BASIC, o
   nível continua BASIC e o registro marca "fallback usado".
2. **Given** um fallback possível só em outro nível, **When** o principal falha tecnicamente,
   **Then** não há fallback para outro nível: a execução falha de forma controlada.
3. **Given** uma saída que não passa na validação e uma tarefa que permite escalonar BASIC →
   STANDARD, **When** a análise roda, **Then** ela é repetida uma vez com um modelo STANDARD
   aprovado, e o registro mostra "escalonamento usado", nível de origem, nível de destino e
   motivo.
4. **Given** a mesma falha em uma tarefa sem permissão de escalonamento, **When** a análise
   roda, **Then** ela falha como na 006, sem outro nível.
5. **Given** qualquer tarefa, **When** ela roda, **Then** nunca passa de um escalonamento nem
   do nível máximo que a política permite, e ADVANCED só é usado quando a política da tarefa
   o exige ou o permite explicitamente.
6. **Given** a resposta "não agradou" o professor (rejeição da proposta), **When** ele pede
   de novo, **Then** o novo pedido usa o mesmo nível; rejeição não é motivo de escalonamento.

---

### User Story 5 - Modelos novos passam por avaliação antes de produção (Priority: P2)

Cada modelo do catálogo tem um estado (CANDIDATE, EVALUATING, PRODUCTION, DEPRECATED,
DISABLED). Um modelo só atende uma tarefa em produção depois de atingir, na avaliação daquela
tarefa, os limiares definidos para ela. A troca de versão de um modelo é uma entrada nova no
catálogo, sem mudar agentes.

**Why this priority**: permite adotar modelos mais baratos com evidência (critérios 9, 10 e
12), mas as histórias P1 já protegem o sistema com o catálogo atual.

**Independent Test**: cadastrar um modelo como CANDIDATE, rodar a avaliação da tarefa com o
provedor simulado abaixo e acima dos limiares e verificar quando ele pode atender produção.

**Acceptance Scenarios**:

1. **Given** um modelo CANDIDATE ou EVALUATING, **When** a política escolhe o modelo de
   produção de uma tarefa, **Then** ele nunca é escolhido.
2. **Given** um modelo em avaliação para uma tarefa, **When** a avaliação atinge os limiares
   da tarefa (por exemplo, acerto e validade do schema), **Then** o resultado fica registrado
   e a equipe pode promovê-lo a PRODUCTION para essa tarefa; abaixo dos limiares, não pode.
3. **Given** um modelo DISABLED, **When** a política escolhe, **Then** ele nunca é
   selecionado, nem como fallback, nem por override.
4. **Given** um modelo DEPRECATED, **When** a política escolhe, **Then** ele só é usado se não
   houver outro aprovado do mesmo nível, e isso aparece como aviso na operação.
5. **Given** uma nova versão de um modelo, **When** ela é cadastrada e promovida, **Then**
   nenhum agente nem política de tarefa muda, e as execuções antigas continuam registradas com
   a versão que usaram.

---

### User Story 6 - O administrador vê o custo por agente, tarefa, nível, provedor e modelo (Priority: P2)

Em "Operação de IA", o administrador vê em um período o custo e o uso por agente, tarefa,
nível, provedor e modelo, com fallbacks, escalonamentos e a qualidade medida de cada modelo
por tarefa, sem conteúdo pedagógico, credencial nem identificadores de professores.

**Why this priority**: decisões de custo/qualidade baseadas em evidência (critério 11); as
histórias P1 já controlam o custo sem a visão.

**Independent Test**: produzir execuções em vários níveis, com fallback e com escalonamento,
e conferir que cada pergunta do pedido tem resposta nas visões.

**Acceptance Scenarios**:

1. **Given** execuções no período, **When** o administrador consulta, **Then** vê quanto custou
   cada agente, cada tarefa, cada nível (BASIC, STANDARD, ADVANCED), cada provedor e cada
   modelo, com chamadas, tokens de entrada e saída e latência média.
2. **Given** resultados de avaliação por modelo e tarefa, **When** o administrador consulta,
   **Then** vê o custo médio por execução ao lado da qualidade medida, para comparar modelos
   da mesma tarefa.
3. **Given** execuções com fallback e com escalonamento, **When** consultadas, **Then** os dois
   aparecem separados, com nível de origem e de destino do escalonamento.
4. **Given** qualquer resposta dessas visões, **When** inspecionada, **Then** não traz conteúdo,
   credencial nem identificador de professor ou de execução.

---

### User Story 7 - Override só administrativo, dentro do catálogo (Priority: P2)

O administrador pode fixar, para uma tarefa, um modelo específico entre os aprovados em
PRODUCTION para ela, do nível permitido pela política. O professor nunca escolhe modelo e não
vê lista de modelos.

**Why this priority**: dá controle operacional (por exemplo, trocar um modelo com problema)
sem abrir a escolha a quem usa as funcionalidades.

**Independent Test**: fixar um modelo aprovado e verificar que as novas execuções o usam;
tentar fixar um fora da política e verificar a recusa; conferir que o professor não tem essa
opção.

**Acceptance Scenarios**:

1. **Given** um modelo aprovado em PRODUCTION para a tarefa e do nível permitido, **When** o
   administrador o fixa, **Then** as novas execuções o usam e a mudança é auditada.
2. **Given** um modelo fora do catálogo, não aprovado para a tarefa, de outro nível ou de
   família não autorizada, **When** o administrador tenta fixá-lo, **Then** a mudança é recusada.
3. **Given** um professor, **When** usa qualquer funcionalidade de IA, **Then** não tem como
   escolher ou ver modelos, e um pedido com modelo, provedor, nível ou tarefa no corpo é recusado.
4. **Given** um override ativo e o modelo fixado desabilitado depois, **When** chega uma
   execução, **Then** a política volta à escolha normal (ou indisponível) e registra o motivo.

---

### User Story 8 - Orçamentos de IA configuráveis e visíveis (Priority: P3)

A equipe configura orçamentos em dinheiro (diário e mensal do sistema, por usuário e por
agente). O consumo em relação a cada orçamento aparece em "Operação de IA", e nenhuma execução
consome sem limite.

**Why this priority**: prepara o controle financeiro; os limites por execução, por usuário e
por agente das features anteriores já impedem consumo ilimitado.

**Independent Test**: configurar orçamentos baixos, produzir consumo e conferir o que é
mostrado e o que acontece ao atingi-los.

**Acceptance Scenarios**:

1. **Given** orçamentos configurados, **When** o administrador consulta, **Then** vê o consumo
   do dia, do mês, por agente e por usuário (agregado, sem identificar o professor na visão)
   em relação a cada limite.
2. **Given** um orçamento atingido, **When** chega um novo pedido, **Then** o pedido segue
   normalmente, o aviso aparece em "Operação de IA" e o evento é auditado uma vez no período.
3. **Given** qualquer execução, **When** ela roda, **Then** seus limites de chamadas, tokens e
   prazo continuam valendo, de modo que um laço de agente não consome sem limite.

---

### Edge Cases

- **Catálogo sem modelo aprovado para o nível da tarefa**: a tarefa fica indisponível, o
  motivo vai só para os logs operacionais, o professor vê "indisponível no momento" e o fluxo
  manual funciona; nunca sobe de nível para compensar.
- **Todos os modelos do nível com circuito aberto ou desabilitados**: igual ao anterior para
  as execuções novas; nenhuma chamada a modelo fora da política.
- **Fallback de outra família**: permitido se a família estiver na allowlist e nos provedores
  permitidos da tarefa; nunca para família não autorizada.
- **Modelo servido diferente do pedido**: tratado como falha, como na 008; nunca aceito como
  resposta.
- **Custo desconhecido de um modelo**: sem preço de referência, ele não participa da
  ordenação por custo à frente dos que têm preço, e fica visível como "custo desconhecido".
- **Escalonamento que também falha**: a execução termina em falha controlada; não há segundo
  escalonamento nem volta ao nível anterior.
- **Política trocada com execuções na fila**: cada execução mantém a escolha feita no pedido
  (como na 008); a nova política vale para os pedidos seguintes.
- **Documento com instruções para usar outro modelo ou nível**: é dado não confiável; a
  política não é alterada pelo conteúdo nem pela saída do modelo.
- **Mesmo modelo em dois níveis**: não permitido; cada entrada do catálogo tem um nível só.
- **Configuração inválida da política** (tarefa sem nível, nível mínimo acima do preferido,
  provedor fora da allowlist, override inválido): a API inicia, a tarefa fica indisponível e o
  motivo aparece nos logs e em "Operação de IA", sem derrubar o resto do sistema.

## Requirements *(mandatory)*

### Functional Requirements

**Allowlist e catálogo**

- **FR-001**: O sistema DEVE manter uma allowlist explícita de famílias de modelos,
  inicialmente três (TypeSafe/Jev, Anthropic e OpenAI), ampliável só por decisão explícita da
  equipe.
- **FR-001a**: O catálogo DEVE distinguir o **modo** de cada modelo: **geração** (escreve texto e
  saída estruturada, como os modelos da Anthropic e da OpenAI) ou **decisão** (só responde
  escolha, pontuação ou probabilidade, como o Jev). Um modelo de decisão NUNCA PODE atender uma
  tarefa que precisa gerar texto, e um modelo de geração não é escolhido para uma tarefa
  declarada como de decisão, salvo política explícita da tarefa. As chamadas a modelos de decisão
  passam pelo mesmo gateway e pelo mesmo provedor (OpenRouter), na rota de decisões dele.
- **FR-001b**: A resposta de um modelo de decisão DEVE ser validada como qualquer saída (formas
  e opções pedidas); uma resposta com certeza abaixo do limiar definido pela tarefa é tratada
  como "sem decisão" e segue a regra da tarefa (decidir por outra via ou marcar para revisão),
  nunca como decisão tomada.
- **FR-002**: O sistema DEVE manter um catálogo de modelos aprovados, em configuração revisada e
  versionada pela equipe, com, para cada modelo: família, identificador do modelo, nível,
  estado do ciclo de vida, preço de referência de entrada e saída, janela de contexto, suporte a
  saída estruturada, ferramentas, visão e raciocínio, e prioridade.
- **FR-003**: Nenhum modelo fora do catálogo, nem de família fora da allowlist, PODE ser chamado —
  por política, fallback, escalonamento, override ou configuração de ambiente.
- **FR-004**: Modelos que o OpenRouter disponibilize NÃO DEVEM entrar no catálogo nem em
  produção automaticamente; o OpenRouter continua proibido de trocar o modelo pedido.

**Níveis e políticas de tarefa**

- **FR-005**: O sistema DEVE ter os níveis de capacidade BASIC, STANDARD e ADVANCED,
  ordenados, independentes de família e de nome comercial.
- **FR-006**: Toda tarefa DEVE ter uma política explícita com: nível mínimo, nível preferido,
  nível máximo permitido por escalonamento (padrão: o preferido, isto é, sem escalonamento),
  famílias permitidas (subconjunto da allowlist), capacidades exigidas e política de fallback.
  Uma tarefa sem política completa fica indisponível.
- **FR-007**: Os agentes DEVEM declarar só as tarefas que executam; nível, família e modelo
  NÃO PODEM aparecer no código do agente.

**Seleção**

- **FR-008**: A política DEVE escolher o modelo de uma tarefa de forma determinística, nesta
  ordem: catálogo → allowlist e famílias permitidas da tarefa → estado PRODUCTION para a tarefa
  (aprovado no portão de qualidade) → capacidades exigidas → nível preferido → override
  administrativo, se houver → menor custo estimado → prioridade → identificador.
- **FR-009**: O custo NÃO PODE ser critério antes do portão de qualidade e das capacidades; o
  sistema NÃO PODE escolher "o mais barato entre todos os modelos" nem "o mais poderoso".
- **FR-010**: A escolha (tarefa, nível, família, modelo, motivo da escolha e override usado)
  DEVE ser registrada na execução no momento do pedido e mantida até o fim dela.
- **FR-011**: Nenhum LLM PODE escolher ou alterar tarefa, nível, família, modelo, orçamento ou
  permissões; conteúdo enviado pelo usuário e saída do modelo são dados não confiáveis.

**Fallback e escalonamento**

- **FR-012**: O fallback DEVE acontecer só após falha técnica recuperável (como na 008), uma
  vez, para outro modelo aprovado do **mesmo nível** e de família permitida, escolhido pela
  mesma ordem de FR-008; nunca para outro nível.
- **FR-013**: O escalonamento DEVE acontecer só quando a política da tarefa o permitir, após
  falha de qualidade detectável (saída que não passa na validação ou outro verificador
  declarado pela tarefa), uma vez por execução, para o nível seguinte até o máximo permitido;
  rejeição de proposta pelo professor NÃO é falha de qualidade.
- **FR-014**: ADVANCED só PODE ser usado quando a política da tarefa o exigir ou o permitir
  explicitamente como destino de escalonamento.
- **FR-015**: O registro de cada execução DEVE indicar separadamente fallback usado,
  escalonamento usado, nível de origem, nível de destino e motivo.

**Qualidade e ciclo de vida**

- **FR-016**: Cada modelo do catálogo DEVE ter um estado: CANDIDATE, EVALUATING, PRODUCTION,
  DEPRECATED ou DISABLED; só PRODUCTION (e DEPRECATED, na falta de outro) atende produção.
- **FR-017**: A aprovação para produção DEVE ser por **modelo × tarefa**: exige resultado de
  avaliação registrado que atinja os limiares definidos para a tarefa (por exemplo, acerto e
  validade do schema). Sem resultado ou abaixo dos limiares, o modelo não atende a tarefa.
- **FR-018**: Nenhuma transição do ciclo de vida PODE ser automática: promoção e depreciação são
  decisões explícitas da equipe, feitas no catálogo revisado e auditadas na sincronização; a
  desativação (e a reativação) é decisão explícita do administrador, auditada.
- **FR-019**: Trocar ou atualizar a versão de um modelo DEVE ser feito só no catálogo, sem
  mudar agentes nem políticas de tarefa, e as execuções antigas mantêm a versão que usaram.

**Custo, observabilidade e orçamento**

- **FR-020**: O sistema DEVE permitir analisar, em um período, custo, chamadas, tokens de
  entrada e saída, latência, fallbacks e escalonamentos por agente, tarefa, nível, família e
  modelo (com versão).
- **FR-021**: O sistema DEVE mostrar, por tarefa, o custo médio por execução de cada modelo ao
  lado da qualidade medida na avaliação.
- **FR-022**: O sistema DEVE aceitar orçamentos configuráveis (diário e mensal do sistema, por
  usuário e por agente) e mostrar o consumo em relação a cada um. Atingir um orçamento gera aviso
  em "Operação de IA" e um evento de auditoria, uma vez por orçamento e período, sem bloquear
  pedidos nesta feature.
- **FR-023**: Os limites por execução, por usuário e por agente das features anteriores DEVEM
  continuar valendo, de modo que nenhuma execução consuma sem limite.

**Override e reclassificação**

- **FR-024**: O administrador DEVE poder fixar, para uma tarefa, um modelo aprovado em
  PRODUCTION para ela, do nível preferido da tarefa; qualquer outro valor é recusado. O
  override é auditado e pode ser removido.
- **FR-025**: Professores NÃO PODEM escolher nem ver modelos; pedidos com modelo, família,
  nível ou tarefa no corpo DEVEM ser recusados (como na 008).
- **FR-026**: As tarefas do Agente de Ementa DEVEM ser reclassificadas sem mudar a finalidade
  do agente: leitura do documento, extração de campos, organização/preenchimento, sugestões
  simples e resumo em BASIC; revisão pedagógica e reestruturação em STANDARD; comparação
  complexa de várias fontes em ADVANCED; a análise atual de "Preencher com IA" em BASIC. As oito
  políticas são registradas agora; só a análise atual executa, e as demais são usadas quando a
  funcionalidade de cada uma for especificada. Todas são tarefas de geração (FR-001a).
- **FR-027**: Uma política inválida (FR-006, FR-024, catálogo inconsistente) NÃO PODE impedir
  a API de iniciar: a tarefa afetada fica indisponível e o motivo vai para os logs e para
  "Operação de IA", sem segredo.

### Security, Permissions & Audit *(mandatory if feature has protected operations)*

- **Permissions**: consultar custos, catálogo, políticas e orçamentos usa
  `ia.operacao.visualizar`; fixar ou remover override de modelo e desabilitar/reabilitar um
  modelo usam `ia.agentes.gerenciar` (mesma capacidade que hoje habilita agentes e
  configurações). Promover ou depreciar um modelo não tem rota: é mudança revisada do catálogo.
  Nenhuma permissão para professores.
- **Resource context**: o catálogo e as políticas são globais do sistema (sem dono); as visões
  de custo não expõem professor, recurso nem execução. As execuções continuam no espaço de
  trabalho do professor da sessão (006).
- **Audit events**: escolha de modelo registrada na execução e no evento de pedido; escalonamento
  usado; mudança de modelo ou de ciclo de vida de uma entrada do catálogo (na sincronização);
  override fixado e removido; orçamento atingido. Tipos e metadados em
  `contracts/audit-events.md`.
- **Untrusted input**: documentos do professor e saídas dos modelos nunca alteram a política;
  pedidos HTTP com campos de modelo, família, nível ou tarefa são recusados; o override só
  aceita modelos do catálogo aprovados para a tarefa.
- **States & transitions**: ciclo de vida do modelo (CANDIDATE → EVALUATING → PRODUCTION →
  DEPRECATED; qualquer um → DISABLED; DISABLED → estado anterior por decisão explícita);
  transição inválida → recusa.
- **Idempotency**: repetir o mesmo override ou a mesma mudança de estado não muda nada nem gera
  novo evento; a escolha de modelo é fixada no pedido, e a repetição de um pedido (idempotência
  da 006/007) reaproveita a mesma execução.
- **Evidence vs. decisions**: resultados de avaliação são FACT; aprovação de modelo para
  produção e override são HUMAN_DECISION; a escolha do modelo é RULE_RESULT.
- **Automation risk level**: inalterado; o Curriculum Agent continua L2 (proposta revisada pelo
  professor).
- **Domain configurability**: nenhuma disciplina, linguagem ou tecnologia é codificada; níveis,
  famílias e modelos são dados de configuração.
- **Sensitive data & adaptations**: nenhum dado novo vai para os modelos; as visões de custo não
  identificam professores.
- **Curricular traceability**: N/A (a fundamentação da 007 continua valendo).

### Key Entities *(include if feature involves data)*

- **Família de modelos (allowlist)**: fornecedor autorizado (inicialmente TypeSafe, Anthropic e
  OpenAI).
- **Modelo do catálogo**: família, identificador e versão, modo (geração ou decisão), nível,
  estado, preço de referência, janela de contexto, capacidades, prioridade.
- **Política de tarefa**: tarefa, nível mínimo, preferido e máximo, famílias permitidas,
  capacidades exigidas, política de fallback, limiares de qualidade.
- **Aprovação de modelo para tarefa**: modelo × tarefa, resultado da avaliação (métricas e
  limiares), estado de aprovação, quem decidiu e quando.
- **Override administrativo**: tarefa → modelo fixado, quem fixou e quando.
- **Escolha registrada na execução**: tarefa, nível, família, modelo, motivo, fallback e
  escalonamento (nível de origem, destino e motivo).
- **Orçamento**: escopo (sistema diário, mensal, por usuário, por agente), valor e consumo.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% das chamadas a modelos nos testes automatizados vão para modelos do catálogo
  de famílias autorizadas; nenhuma tentativa com modelo fora deles chega ao provedor.
- **SC-002**: Para a mesma configuração, 100% das escolhas de modelo repetidas dão o mesmo
  resultado, e cada execução registra tarefa, nível, família, modelo e motivo.
- **SC-003**: 100% das tarefas BASIC usam um modelo BASIC, e nenhuma tarefa usa ADVANCED sem
  política que o exija ou permita.
- **SC-004**: Entre modelos aprovados do mesmo nível para uma tarefa, o escolhido é sempre o de
  menor custo estimado; modelos reprovados, CANDIDATE, EVALUATING ou DISABLED nunca são
  escolhidos.
- **SC-005**: 100% dos cenários automatizados da 007 e da 008 passam com o Curriculum Agent
  roteado pela política, sem mudança nas asserções de comportamento.
- **SC-006**: Fallback preserva o nível em 100% dos casos; escalonamento ocorre no máximo uma
  vez por execução e só em tarefas que o permitem.
- **SC-007**: Trocar o modelo de uma tarefa (nova versão ou outro modelo aprovado) exige zero
  mudanças no código dos agentes e nas políticas de tarefa.
- **SC-008**: O administrador responde, só com "Operação de IA", às perguntas: custo do agente,
  de cada tarefa, de cada nível, de cada família e de cada modelo no período, e custo por
  execução ao lado da qualidade medida por modelo e tarefa.
- **SC-009**: Nenhuma resposta das visões de operação e nenhum log contém conteúdo pedagógico,
  credencial ou identificador de professor.
- **SC-010**: Uma política ou catálogo inválido nunca impede a API de iniciar; a tarefa afetada
  aparece como indisponível em até uma inicialização.

## Assumptions

- O catálogo, a allowlist e as políticas de tarefa são configuração versionada no repositório
  (revisada como código), não tela de edição livre; o administrador só desabilita/reabilita
  modelos, fixa override e acompanha custo. As variáveis de modelo da 008 deixam de escolher
  modelos diretamente.
- "Custo estimado" para ordenar modelos usa o preço de referência do catálogo aplicado a um
  consumo típico da tarefa; o custo real de cada chamada continua sendo o informado pelo
  provedor (008).
- A falha de qualidade detectável em tempo de execução é, inicialmente, a saída que não passa
  na validação de schema; outros verificadores podem ser declarados por tarefa depois.
- O portão de qualidade usa a avaliação sob demanda existente (conjunto de referência e
  avaliador da 007) como fonte dos resultados por modelo × tarefa. Nenhuma aprovação é aceita
  sem uma execução real dessa avaliação registrada; resultados antigos sem o modelo que
  respondeu não servem de evidência.
- **Etapa de liberação**: antes de esta feature ir para produção, a avaliação roda contra os
  candidatos BASIC da análise da ementa (custo de centavos, conjunto de referência fictício) e
  ao menos um é aprovado. Até lá, em desenvolvimento, a análise fica indisponível fora dos
  testes automatizados, que usam modelos simulados.
- O nível inicial BASIC da análise só muda com evidência: se nenhum candidato BASIC atingir os
  limiares, a política da tarefa passa a STANDARD, registrando a avaliação reprovada como
  justificativa (é o caso "tarefas nas quais BASIC falhou nos evals" do pedido); nunca por
  escalonamento silencioso.
- O fallback e o circuito da 008 continuam valendo; o que muda é como o modelo de fallback é
  escolhido.
- O Jev entra no catálogo como CANDIDATE, no nível BASIC e em modo decisão; nenhuma tarefa do
  Curriculum Agent pode usá-lo, porque todas geram texto. Ele fica pronto para tarefas de
  classificação e para verificadores de qualidade de specs futuras, sempre com o limiar de
  certeza da tarefa e com o português testado antes (o inglês é o idioma principal do modelo).
- A matriz completa "tarefa × nível" de todos os recursos de IA será mantida conforme novos
  agentes surgirem, em specs próprias.
