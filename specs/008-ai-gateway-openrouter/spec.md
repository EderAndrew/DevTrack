# Feature Specification: 008 — AI Gateway com OpenRouter: Roteamento por Tarefa e Fallback

**Feature Branch**: `008-ai-gateway-openrouter`
**Created**: 2026-09-26
**Status**: Draft
**Input**: User description: "Implementar uma camada centralizada de integração com modelos de IA usando OpenRouter, desacoplando o Agente de Ementa existente de qualquer provedor ou modelo específico: AI Gateway como único ponto de entrada, abstração de provedor, OpenRouter como primeiro provedor (credencial só no servidor), Model Router por tarefa com modelo principal e de fallback, fallback só para falhas recuperáveis e com tentativas limitadas, Prompt Registry versionado, saída estruturada validada por schema, guardrails no backend, auditoria e observabilidade de cada execução (agente, tarefa, provedor, modelo, versão das instruções, tokens, latência, custo, fallback), limites de uso por usuário, rota e agente, resiliência (timeout, retry com backoff, circuit breaker) e o Agente de Ementa refatorado para usar só o gateway, sem mudar suas regras de negócio. Sem novos agentes, sem chatbot para alunos, sem IA em provas, sem escolha de modelo pelo frontend."

## Contexto do domínio existente

Esta feature se apoia na fundação de IA (006) e no Curriculum Agent (007), e não muda as
regras delas. Boa parte do que o pedido descreve já existe e continua valendo:

| Pedido | Situação hoje (006/007) | O que esta feature faz |
|--------|-------------------------|------------------------|
| AI Gateway como único ponto de entrada | Existe: o gateway de modelos é o único caminho até um modelo; agentes nunca chamam provedor | Mantém; passa a receber a **tarefa** em vez de uma configuração de modelo fixa |
| Abstração de provedor | Existe: contrato de provedor independente de fornecedor, com erros normalizados; SDKs e hosts de provedores só dentro da fronteira de provedores (verificada por guarda) | Mantém; OpenRouter implementa o mesmo contrato |
| Provedor real | Anthropic direto, registrado só com a credencial dele | Substitui pelo OpenRouter, que passa a ser o único provedor real (FR-001) |
| Model Router | Parcial: cada agente aponta para **uma** configuração de modelo | Política central por **tarefa**, com modelo principal e de fallback |
| Fallback | Só declarado; a 006 (FR-017) deixou o fallback automático para depois | Implementa fallback controlado |
| Timeout, retry com backoff, limite de tentativas | Existe no gateway (só falhas transitórias; prazo total da execução) | Mantém; o fallback respeita o mesmo prazo |
| Circuit breaker | Não existe | Adiciona |
| Prompt Registry versionado | Existe: instruções e schemas de saída versionados, imutáveis depois de usados, versão registrada em cada execução | Mantém; cada tarefa passa a ter suas instruções |
| Saída estruturada validada | Existe: validada pelo schema do agente; saída inválida termina em erro controlado e nunca vira dado | Mantém, também para a resposta do fallback |
| Registro de execução (`ai_execution`) | Existe: execução e cada chamada ao modelo (provedor, modelo, versão das instruções, situação, tokens, duração, custo estimado, código de erro, usuário, data) | Acrescenta tarefa, fallback usado e o modelo realmente servido |
| Auditoria, logs estruturados, correlação | Existe (auditoria na mesma transação; logs sem conteúdo nem credencial; correlação por pedido) | Acrescenta os eventos de fallback e de circuito |
| Métricas ("Operação de IA") | Existe por agente, modelo e provedor | Acrescenta tarefa, fallbacks e circuito |
| Limites de uso | Existe por usuário (execuções por minuto, decisões por minuto, análises de ementa por hora), por rota e por execução (chamadas, tokens, prazo) | Acrescenta limite global por agente |
| Testes com provedor simulado | Existe: nenhum teste automatizado chama provedor real | Mantém; o simulado passa a imitar as falhas que disparam fallback |

"Tenant" não se aplica: o espaço de trabalho de uma execução é sempre o professor da sessão
(006), que já é a unidade dos limites por usuário.

## Clarifications

### Session 2026-09-26

- Plan (2026-09-26): a execução fixa a política ao ser pedida (edge case "configuração
  trocada com execuções na fila"); o suporte a saída estruturada e ferramentas é exigido por
  chamada e pela avaliação, não na inicialização (FR-008); o custo informado pelo provedor tem
  precedência sobre o preço de referência (FR-017).

- Q: O que acontece com o provedor Anthropic direto da 007? → A: É removido. O OpenRouter
  passa a ser o único provedor real; saem o cliente da Anthropic, a credencial
  `ANTHROPIC_API_KEY` e o simulador da Anthropic do E2E.
- Q: Quais tarefas são registradas agora? → A: Só a que o Curriculum Agent já executa
  (análise e preenchimento da ementa). As tarefas de geração e de revisão da ementa entram
  com a spec que criar esses fluxos.

## User Scenarios & Testing *(mandatory)*

Os atores são o **professor** (usa "Preencher com IA" da 007), o **administrador** (opera a
IA em "Operação de IA") e quem **desenvolve um novo agente** no futuro (reaproveita a
infraestrutura). Todos os testes automatizados usam o provedor simulado; o OpenRouter real só
é usado na avaliação sob demanda e em produção.

### User Story 1 - "Preencher com IA" continua igual, agora através do OpenRouter (Priority: P1)

O professor pede "Preencher com IA" em uma ementa com texto, como na 007. A análise agora
passa pelo gateway até o OpenRouter, e o professor recebe a mesma proposta L2, com as mesmas
regras de revisão, aplicação, fundamentação e isolamento. Nada muda para ele além do
provedor.

**Why this priority**: é o único agente em produção; qualquer regressão aqui tira do ar a
única capacidade de IA do produto. Todo o resto só tem valor se isso continuar funcionando.

**Independent Test**: rodar a suíte da 007 inteira (API, segurança e E2E) com o agente
roteado por tarefa e o provedor simulado, e o E2E com um simulador do OpenRouter no lugar do
simulador da Anthropic: tudo passa sem mudar asserções de comportamento.

**Acceptance Scenarios**:

1. **Given** o agente habilitado e a tarefa de análise da ementa roteada para um modelo do
   OpenRouter, **When** o professor pede "Preencher com IA", **Then** a execução termina com
   a mesma proposta da 007, e o registro da execução mostra a tarefa, o provedor OpenRouter,
   o modelo servido e a versão das instruções.
2. **Given** a suíte automatizada da 007, **When** ela roda nesta feature, **Then** todos os
   cenários `007/US*` passam com o provedor simulado, sem chamada a provedor real.
3. **Given** o código do Curriculum Agent, **When** ele é inspecionado, **Then** não contém
   nome de provedor, modelo, endereço, credencial nem cliente HTTP: só a tarefa que executa.
4. **Given** o conjunto de referência da 007, **When** a avaliação sob demanda roda contra o
   modelo principal configurado no OpenRouter, **Then** ela atinge os mesmos limiares da 007
   (SC da 007) antes de o administrador habilitar o agente com esse modelo.

---

### User Story 2 - O modelo de cada tarefa é trocado por configuração, sem tocar no agente (Priority: P1)

O agente informa a tarefa ("analisar a ementa"); a política central de roteamento decide
provedor, modelo principal, modelo de fallback, parâmetros de geração, máximo de tokens e
tempo limite. Trocar o modelo de uma tarefa é uma mudança de configuração do servidor.

**Why this priority**: é o desacoplamento que o pedido exige (critérios 6 e 7); sem ele,
trocar de modelo continua exigindo mudar o agente.

**Independent Test**: com dois modelos simulados, mudar a configuração da tarefa do modelo A
para o B e reiniciar: a próxima execução usa B, o agente não muda, e as execuções anteriores
continuam mostrando A.

**Acceptance Scenarios**:

1. **Given** a tarefa de análise da ementa com modelo principal A, **When** a configuração
   passa a indicar o modelo B e a aplicação reinicia, **Then** as novas execuções usam B e
   as anteriores continuam registradas com A.
2. **Given** uma tarefa sem configuração de roteamento válida (modelo ausente ou em formato
   inválido, modelo que escolhe outros modelos por conta própria, provedor não registrado,
   fallback igual ao principal), **When** a aplicação inicia, **Then** ela inicia normalmente, a tarefa fica indisponível
   ("modelo indisponível") e o agente não roda, sem expor o motivo técnico ao professor.
3. **Given** qualquer tela ou rota do frontend, **When** um pedido de análise é enviado com
   um campo de modelo, provedor ou tarefa, **Then** o campo é rejeitado pela validação
   estrita e nada no frontend permite escolher modelo.

---

### User Story 3 - Uma falha recuperável do modelo principal cai no modelo de fallback, com limite (Priority: P1)

Quando o modelo principal fica indisponível, estoura o tempo ou atinge limite de taxa, e as
novas tentativas permitidas se esgotam, o gateway tenta o modelo de fallback da tarefa uma
vez, dentro do mesmo prazo total da execução. Falhas não recuperáveis nunca disparam
fallback.

**Why this priority**: é a principal capacidade nova de resiliência (critérios 8 e 14) e o
item que a 006 deixou declarado e não implementado.

**Independent Test**: com o provedor simulado programado para falhar o modelo principal com
cada categoria de erro, verificar quando o fallback é usado e quando não é, e que o número
total de chamadas nunca passa do limite.

**Acceptance Scenarios**:

1. **Given** o modelo principal respondendo "indisponível" em todas as tentativas e o de
   fallback respondendo uma saída válida, **When** a análise roda, **Then** ela termina com
   sucesso pelo fallback, e o registro mostra as chamadas ao principal, a chamada ao
   fallback e "fallback usado".
2. **Given** o modelo principal com erro de requisição inválida, de autenticação, de
   política ou uma saída que não passa no schema, **When** a análise roda, **Then** o
   fallback NÃO é chamado e a execução falha com o código normalizado da 006.
3. **Given** principal e fallback falhando com erros recuperáveis, **When** a análise roda,
   **Then** ela falha com um erro controlado depois de no máximo o limite de tentativas do
   principal mais o do fallback, sem repetir o principal depois do fallback e sem laço.
4. **Given** o prazo total da execução quase esgotado, **When** o principal falha, **Then**
   o fallback só é chamado se couber no prazo restante; senão a execução termina "tempo
   esgotado".
5. **Given** uma tarefa sem modelo de fallback, **When** o principal falha, **Then** o
   comportamento é o da 006 (novas tentativas e falha controlada).
6. **Given** a execução cancelada durante a chamada ao principal, **When** o cancelamento
   chega, **Then** o fallback não é chamado.

---

### User Story 4 - Credencial e conteúdo protegidos; OpenRouter fora do ar não derruba a API (Priority: P1)

A credencial do OpenRouter fica só no servidor. Sem ela, a API inicia normalmente e a IA fica
indisponível, com o fluxo manual da ementa intacto. Com o OpenRouter fora do ar, só as
análises falham, de forma controlada.

**Why this priority**: segurança e disponibilidade do produto (critérios 1, 13 e 14; princípios
XIV da constituição); o OpenRouter é um intermediário que repassa o conteúdo a outros
provedores, então o que sai do servidor precisa ser controlado.

**Independent Test**: rodar a varredura de segredos com uma credencial marcadora do
OpenRouter em logs, auditoria, respostas (inclusive as operacionais e as de erro) e banco;
iniciar a API sem a credencial; simular o OpenRouter fora do ar durante uma análise.

**Acceptance Scenarios**:

1. **Given** uma credencial marcadora configurada, **When** a jornada completa roda
   (inclusive falhas de autenticação, de rede e de tempo do provedor), **Then** a credencial
   não aparece em nenhum log, evento de auditoria, registro de execução, resposta HTTP,
   mensagem de erro nem no banco.
2. **Given** a API sem a credencial do OpenRouter, **When** ela inicia, **Then** inicia
   normalmente, "Preencher com IA" aparece como indisponível e o preenchimento manual da 004
   funciona.
3. **Given** o OpenRouter sem responder, **When** o professor pede uma análise, **Then** a
   execução termina com erro controlado da 006 e as demais rotas da API continuam
   respondendo normalmente.
4. **Given** qualquer código do frontend ou resposta da API, **When** inspecionado, **Then**
   não há endereço, credencial nem chamada ao OpenRouter: toda comunicação sai do servidor.
5. **Given** uma chamada ao OpenRouter, **When** ela é montada, **Then** pede que o
   conteúdo não seja retido nem usado para treino pelos provedores de destino e proíbe o
   roteamento implícito para outros modelos, de modo que só o gateway decide o fallback.

---

### User Story 5 - O administrador vê tarefa, modelo servido, fallbacks e custo de cada execução (Priority: P2)

Em "Operação de IA", o administrador vê, por agente, tarefa, provedor e modelo: chamadas,
tokens, latência, taxa de erro, fallbacks, custo estimado e o estado do circuito de cada
configuração de modelo. Nunca vê conteúdo pedagógico, credencial nem identificadores de
professores.

**Why this priority**: observabilidade (critérios 11 e 12) é necessária para operar o
fallback e o circuito, mas as histórias P1 já protegem o professor sem ela.

**Independent Test**: produzir execuções com e sem fallback e com falha, e conferir as
métricas e o registro de cada execução, e que a varredura administrativa da 006 continua sem
conteúdo nem identificadores.

**Acceptance Scenarios**:

1. **Given** execuções concluídas, com fallback e com falha, **When** o administrador abre
   "Operação de IA" em um período, **Then** vê por tarefa e por modelo: quantidade de
   chamadas, tokens de entrada e de saída, latência média, taxa de erro, quantidade de
   fallbacks e custo estimado.
2. **Given** uma execução, **When** seu registro é consultado, **Then** mostra agente,
   tarefa, provedor, modelo pedido e modelo servido, versão das instruções, situação, tokens,
   latência, custo estimado, fallback usado, código de erro, usuário e data.
3. **Given** logs de uma execução, **When** inspecionados, **Then** são estruturados, trazem
   o identificador de correlação do pedido e nunca o conteúdo das mensagens, das instruções
   montadas, da saída nem a credencial.

---

### User Story 6 - Consumo protegido: circuito aberto e limite por agente (Priority: P2)

Falhas seguidas de um modelo abrem o circuito dele por um tempo: as execuções seguintes vão
direto ao fallback (ou falham rápido sem ele), sem gastar chamadas no modelo fora do ar. Um
limite global por agente impede que muitos professores juntos consumam tokens sem limite.

**Why this priority**: protege custo e disponibilidade além dos limites por usuário que já
existem; é importante, mas os limites da 006/007 já barram o abuso individual.

**Independent Test**: com o provedor simulado falhando, provocar falhas seguidas até abrir o
circuito, verificar que o modelo não é chamado enquanto aberto e que uma chamada de teste
volta a fechá-lo; esgotar o limite global do agente com vários professores.

**Acceptance Scenarios**:

1. **Given** um modelo com falhas recuperáveis seguidas até o limite configurado, **When**
   uma nova execução usa a tarefa dele, **Then** o modelo não é chamado enquanto o circuito
   estiver aberto; a execução vai ao fallback, ou falha "modelo indisponível" sem fallback.
2. **Given** o circuito aberto e o tempo de espera vencido, **When** chega uma execução,
   **Then** uma única chamada de teste é feita ao modelo; sucesso fecha o circuito, falha o
   reabre.
3. **Given** o limite global de análises por hora do agente atingido (somando todos os
   professores), **When** outro professor pede uma análise, **Then** recebe "limite de
   pedidos" com o tempo de espera, sem execução criada, e o evento é auditado.
4. **Given** pedidos repetidos ou simultâneos do mesmo professor para o mesmo documento,
   **When** chegam, **Then** continuam gerando uma única execução ativa (007) e contam para
   os limites uma vez por execução criada.

---

### User Story 7 - Um novo agente reaproveita o gateway sem implementar infraestrutura (Priority: P3)

Quem cria um novo agente declara a tarefa, as instruções versionadas, o schema de saída e as
ferramentas; o roteamento, a credencial, o cliente do provedor, as novas tentativas, o
fallback, o circuito, o uso, o custo, os logs e a auditoria vêm do gateway.

**Why this priority**: prepara a evolução (critério 16), mas nenhum agente novo entra nesta
feature.

**Independent Test**: registrar nos testes um agente de referência com uma tarefa própria e
roteamento com fallback, e executá-lo com o provedor simulado: ele recebe fallback, circuito,
uso e auditoria sem nenhum código próprio para isso.

**Acceptance Scenarios**:

1. **Given** um agente de referência de teste com tarefa e roteamento próprios, **When** ele
   roda com o principal falhando, **Then** usa o fallback, registra uso e auditoria e respeita
   os limites, sem código de infraestrutura no agente.
2. **Given** os testes de qualquer agente, **When** executados, **Then** usam o provedor
   simulado pelo mesmo contrato e nunca um provedor real.

---

### Edge Cases

- O principal responde com sucesso, mas a saída não passa no schema: é falha de validação
  da 006, sem fallback (a mesma entrada no outro modelo não é tentada automaticamente).
- O fallback também está com o circuito aberto: a execução falha "modelo indisponível" sem
  chamar nenhum modelo.
- O OpenRouter serve um modelo diferente do pedido: a execução registra o modelo servido; se
  a política proíbe outro modelo e o provedor ainda assim troca, a resposta é tratada como
  falha do provedor e não é usada.
- O OpenRouter informa limite de taxa com tempo de espera: conta como falha recuperável; a
  espera nunca passa do prazo total da execução.
- Uso não informado pelo provedor: tokens e custo ficam vazios, como na 006; a execução não
  falha por isso.
- Configuração de modelo trocada com execuções na fila: cada execução guarda, ao ser
  pedida, as configurações principal e de fallback da política vigente, e roda com elas
  (verificando de novo, ao começar, se estão habilitadas, como na 006); cada chamada registra
  o modelo usado, e o fallback é registrado como chamada separada.
- O administrador desabilita a configuração do modelo principal: as novas execuções vão
  direto ao fallback se ele estiver habilitado; se não houver, "modelo indisponível".
- O fallback aponta para o mesmo modelo do principal: configuração inválida (FR-006); a
  tarefa fica indisponível.
- Várias instâncias da API: o estado do circuito é local a cada instância; o limite global
  por agente é compartilhado (vale no banco).
- Credencial inválida ou revogada: erro de autenticação do provedor, sem fallback para o
  mesmo provedor, execução "modelo indisponível", credencial nunca exposta.
- Prompt injection no documento tentando mudar modelo, tarefa, permissões ou limites: o
  conteúdo continua sendo dado não confiável (007); nada que o modelo devolve altera
  roteamento, permissões ou regras.

## Requirements *(mandatory)*

### Functional Requirements

**Provedor OpenRouter**

- **FR-001**: O sistema DEVE oferecer o OpenRouter como provedor real pelo mesmo contrato de
  provedor da 006, dentro da fronteira de provedores, sem SDK do OpenRouter no domínio nem nos
  agentes. O OpenRouter DEVE ser o único provedor real: o provedor Anthropic direto da 007, sua
  dependência, sua credencial e seu simulador de E2E DEVEM ser removidos.
- **FR-002**: A configuração do OpenRouter DEVE vir de variáveis do servidor: credencial,
  endereço base, modelo padrão, modelo de fallback (opcional; sem ele a tarefa não tem
  fallback) e tempo limite das chamadas. O endereço base existe para o simulador do E2E; em
  produção vale o endereço oficial.
- **FR-003**: Sem credencial, o provedor OpenRouter NÃO DEVE ser registrado: a API inicia,
  as tarefas que dependem dele ficam "modelo indisponível" e o fluxo manual segue (007
  FR-040, FR-043).
- **FR-004**: Cada chamada ao OpenRouter DEVE pedir que o conteúdo não seja retido nem usado
  para treino pelos provedores de destino, e DEVE proibir roteamento ou fallback implícitos
  do próprio OpenRouter para outros modelos: só o gateway decide fallback (FR-010). O modelo
  realmente servido DEVE ser lido da resposta e registrado.
- **FR-005**: O provedor DEVE mapear toda falha do OpenRouter para as categorias
  normalizadas da 006 (indisponível, limite de taxa, tempo esgotado, requisição inválida,
  autenticação, desconhecido), sem incluir mensagem do provedor, conteúdo nem credencial.

**Roteamento por tarefa (Model Router)**

- **FR-006**: Cada agente DEVE declarar a tarefa que executa, nunca uma configuração de
  modelo, um provedor ou um modelo. Uma política central de roteamento DEVE associar cada
  tarefa a: configuração de modelo principal, configuração de fallback opcional, parâmetros
  de geração, máximo de tokens de saída e tempo limite. O fallback DEVE ser um modelo
  diferente do principal, com o mesmo suporte a saída estruturada e às ferramentas da tarefa;
  um fallback nunca reduz requisitos de segurança nem muda as ferramentas disponíveis (006
  FR-017).
- **FR-007**: Trocar o modelo de uma tarefa DEVE exigir só mudança de configuração do
  servidor. Cada troca DEVE ficar registrada como nova versão da configuração, e execuções
  antigas mantêm o modelo que usaram (006 FR-010).
- **FR-008**: Uma política de roteamento inválida (modelo ausente, provedor não registrado,
  fallback igual ao principal, modelo que escolhe outros modelos por conta própria) NÃO DEVE
  impedir a API de iniciar: a tarefa fica indisponível, o motivo técnico vai só para os logs
  operacionais sem segredo, e o professor vê "indisponível no momento". O suporte do modelo à
  saída estruturada e às ferramentas é exigido a cada chamada (o provedor recusa o pedido
  quando o modelo não suporta, sem fallback) e verificado pela avaliação antes de o modelo
  ser configurado em produção (FR-022).
- **FR-009**: As tarefas desta feature DEVEM ser só as que o Curriculum Agent já executa hoje;
  cada tarefa tem suas instruções versionadas no registro da 006. Nesta feature há uma única
  tarefa, a análise e preenchimento da ementa, com as instruções atuais da 007; tarefas de
  geração e de revisão da ementa NÃO DEVEM ser registradas sem um fluxo que as use.

**Fallback e resiliência**

- **FR-010**: O gateway DEVE chamar o fallback só depois que o principal falhar com uma falha
  recuperável (indisponível, tempo esgotado da chamada, limite de taxa) e esgotar suas novas
  tentativas, ou quando o circuito do principal estiver aberto (FR-013). Falhas de
  requisição inválida, autenticação, política, autorização, entrada malformada, saída fora do
  schema, cancelamento e prazo total esgotado NUNCA disparam fallback.
- **FR-011**: O fallback DEVE ser tentado no máximo uma vez por chamada lógica ao modelo, com
  suas próprias novas tentativas limitadas, sem voltar ao principal depois e dentro do prazo
  total da execução; o total de chamadas de uma execução continua limitado pelos limites da
  006 (chamadas ao modelo, novas tentativas, prazo).
- **FR-012**: A resposta do fallback DEVE passar pelas mesmas validações da resposta do
  principal (saída estruturada, fundamentação da 007, limites de tamanho) antes de virar
  qualquer dado.
- **FR-013**: O gateway DEVE manter um circuito por configuração de modelo: depois de um
  número configurável de falhas recuperáveis seguidas, o circuito abre por um tempo
  configurável e o modelo não é chamado; vencido o tempo, uma única chamada de teste decide
  se fecha ou reabre. O estado do circuito é por instância da API e não é persistido.
- **FR-014**: Nenhuma falha de IA DEVE derrubar a API ou afetar rotas que não usam IA; toda
  falha termina como um erro controlado da 006 na execução.

**Limites de uso**

- **FR-015**: Os limites existentes DEVEM continuar valendo (por usuário, por rota, por
  execução e uma análise ativa por documento). O sistema DEVE acrescentar um limite global
  configurável de execuções por hora por agente, somando todos os usuários, verificado antes
  de criar a execução, com resposta "limite de pedidos" e tempo de espera, e evento de
  auditoria.

**Registro, auditoria e observabilidade**

- **FR-016**: O registro de cada execução DEVE acrescentar ao que a 006 já guarda: a tarefa,
  se o fallback foi usado, e, por chamada ao modelo, o modelo pedido, o modelo servido e se a
  chamada foi de fallback. Credencial, instruções montadas com conteúdo, mensagens, saída
  bruta do modelo e mensagens de erro do provedor NÃO DEVEM ser gravados.
- **FR-017**: O custo de cada chamada DEVE ser o custo informado pelo provedor na resposta,
  quando houver; senão, o estimado pelo preço de referência da configuração do modelo; sem
  nenhum dos dois, fica vazio (006). O registro guarda a origem do valor.
- **FR-018**: O sistema DEVE registrar em auditoria, na mesma transação, o uso de fallback em
  uma execução e cada abertura e fechamento de circuito, só com identificadores, tarefa,
  configuração de modelo e códigos.
- **FR-019**: Os logs do gateway DEVEM ser estruturados e trazer, quando houver, correlação
  do pedido, execução, agente, tarefa, provedor, modelo pedido e servido, tentativa, fallback,
  duração, tokens e código de erro; nunca conteúdo nem credencial.
- **FR-020**: "Operação de IA" DEVE mostrar, por período, agente, tarefa, provedor e modelo:
  chamadas, tokens de entrada e de saída, latência média, taxa de erro, fallbacks, custo
  estimado e o estado atual do circuito de cada configuração, sem conteúdo nem
  identificadores de professores (006).

**Integração com o Curriculum Agent**

- **FR-021**: O Curriculum Agent DEVE passar a declarar só a sua tarefa; suas regras de
  negócio (pedido, proposta, fundamentação, revisão, aplicação, nova análise, limites e
  auditoria da 007) NÃO DEVEM mudar.
- **FR-022**: A avaliação do conjunto de referência da 007 DEVE rodar pelo gateway com o
  OpenRouter, contra o modelo principal e, quando houver, contra o de fallback; um modelo só
  deve ser configurado para a tarefa em produção depois de atingir os limiares da 007. A
  avaliação no CI continua sobre respostas gravadas.

**Testes e fronteiras**

- **FR-023**: Todos os testes automatizados DEVEM usar o provedor simulado; o simulado DEVE
  permitir programar respostas por modelo, para exercitar principal e fallback. O E2E DEVE
  usar um simulador local da API do OpenRouter.
- **FR-024**: As guardas existentes DEVEM continuar valendo e cobrir o OpenRouter: endereço e
  cliente do provedor só dentro da fronteira de provedores, nenhum provedor real registrado
  nos testes, varredura de segredos com a credencial marcadora do OpenRouter.

### Security, Permissions & Audit *(mandatory if feature has protected operations)*

- **Permissions**: nenhuma permissão nova. As rotas da 006 e da 007 mantêm as suas (`ia.*`,
  `ementas.*`); ver métricas e o estado do circuito continua exigindo a permissão de operação
  de IA do administrador. O modelo nunca concede permissão (006).
- **Resource context**: inalterado: a execução pertence ao professor da sessão e a
  ferramenta só lê o documento da própria execução (007). Roteamento e fallback não mudam o
  contexto nem as ferramentas.
- **Audit events**: novos: uso de fallback em uma execução; abertura e fechamento de
  circuito; limite global do agente atingido. Os eventos da 006/007 continuam, sem
  duplicação.
- **Untrusted input**: o conteúdo do documento e a saída do modelo continuam não confiáveis;
  a resposta de qualquer modelo (principal ou fallback) é validada por schema antes de virar
  dado. As rotas continuam com validação estrita e não aceitam modelo, provedor nem tarefa
  vindos do cliente.
- **States & transitions**: os estados de execução e de proposta da 006 não mudam. O
  circuito tem os estados fechado, aberto e em teste, com transições só pelo gateway.
- **Idempotency**: inalterada: uma análise ativa por documento (007); um fallback nunca cria
  outra execução; a auditoria de circuito não se repete para a mesma transição.
- **Evidence vs. decisions**: inalterado: a saída do modelo é SUGGESTION em proposta L2, e só
  a decisão humana do professor a aplica (007).
- **Automation risk level**: L2 (inalterado: proposta revisada pelo professor).
- **Domain configurability**: tarefas, modelos e preços são configuração, nunca condições no
  código dos agentes; nenhuma disciplina ou tecnologia é fixada.
- **Sensitive data & adaptations**: nenhum dado de aluno é enviado ao modelo; o documento da
  ementa vai ao OpenRouter e ao provedor de destino, com pedido de não retenção nem treino
  (FR-004); a credencial fica só no servidor.
- **Curricular traceability**: inalterada (fundamentação no documento, 007).

### Key Entities *(include if feature involves data)*

- **Tarefa de IA**: o que um agente pede ao gateway (ex.: análise da ementa); tem chave e
  instruções versionadas; não conhece modelo nem provedor.
- **Política de roteamento**: associa uma tarefa a uma configuração de modelo principal e a
  uma de fallback opcional, com parâmetros, máximo de tokens e tempo limite; versionada.
- **Configuração de modelo** (006): provedor, modelo, situação, parâmetros, preço de
  referência. O suporte a saída estruturada e ferramentas não é um campo: é exigido a cada
  chamada e verificado pela avaliação (FR-008).
- **Execução** (006): acrescenta tarefa e "fallback usado".
- **Chamada ao modelo** (006): acrescenta modelo pedido, modelo servido e "chamada de
  fallback".
- **Circuito**: estado em memória por configuração de modelo (fechado, aberto, em teste),
  com contagem de falhas seguidas e fim da espera; não persistido.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% dos cenários automatizados da 007 passam com o Curriculum Agent roteado
  por tarefa, sem mudança nas asserções de comportamento.
- **SC-002**: Trocar o modelo de uma tarefa exige zero mudanças no código do agente e só
  uma mudança de configuração e reinício.
- **SC-003**: Em 100% dos casos de teste, o fallback é usado só para falhas recuperáveis e
  nunca para as não recuperáveis; nenhuma execução passa do limite de chamadas ao modelo nem
  do prazo total.
- **SC-004**: Com o modelo principal fora do ar e o de fallback saudável, pelo menos 95% das
  análises de teste terminam com proposta.
- **SC-005**: A credencial marcadora do OpenRouter aparece zero vezes em logs, auditoria,
  registros de execução, respostas e banco na jornada completa.
- **SC-006**: Com o OpenRouter indisponível, 100% das rotas que não usam IA continuam
  respondendo, e 100% das análises terminam com erro controlado em até o prazo total da
  execução.
- **SC-007**: Com o circuito aberto, o modelo afetado recebe zero chamadas até o fim da
  espera.
- **SC-008**: 100% das execuções mostram agente, tarefa, provedor, modelo servido, versão
  das instruções, tokens (quando informados), latência, custo estimado (quando há preço) e
  fallback usado.
- **SC-009**: O modelo principal configurado atinge, no conjunto de referência pelo
  OpenRouter, os mesmos limiares de qualidade da 007.
- **SC-010**: Um agente de referência com tarefa própria ganha fallback, circuito, uso e
  auditoria com zero linhas de infraestrutura no agente.

## Assumptions

- O OpenRouter é acessado pela sua API HTTP a partir do servidor, sem SDK novo; se o plano
  precisar de dependência, ela é justificada lá (constituição).
- O fallback é entre configurações de modelo, ambas atendidas pelo OpenRouter; o contrato
  permite fallback entre provedores quando houver outro provedor real.
- A remoção do provedor Anthropic direto é a mudança de dependência desta feature: o
  `DEPENDENCIES.md`, o `.env.example`, o README e as guardas de provedor são atualizados.
- Valores padrão: circuito abre depois de 5 falhas recuperáveis seguidas e espera 60
  segundos; limite global de 100 análises por hora por agente. Todos configuráveis.
- "Obrigatórias" para as variáveis do OpenRouter significa obrigatórias para registrar o
  provedor; a ausência não impede a API de iniciar (fail secure, FR-003).
- O estado do circuito por instância é aceitável (sem Redis ou filas, constituição); o
  limite global por agente vale entre instâncias.
- O custo vem do valor que o OpenRouter informa por chamada, com o preço de referência como
  reserva; conciliação com a fatura do OpenRouter fica fora do escopo.
- O E2E da 007 troca o simulador da Anthropic por um simulador local da API do OpenRouter.

### Fora do escopo

- Novos agentes, sistema multiagente, chatbot para alunos, IA durante provas e mudanças nas
  regras de aplicação de provas.
- Recriar ou mudar regras do Curriculum Agent.
- Ações autônomas externas; decisões de RBAC pelo modelo.
- Escolha de modelo, provedor ou tarefa pelo frontend.
- Circuito compartilhado entre instâncias; conciliação de custos com a fatura.
- Streaming de respostas.
- Tarefas de geração e de revisão da ementa (entram com a spec desses fluxos).
- Manter a Anthropic direta como provedor alternativo.

## Rastreabilidade dos critérios de aceite do pedido

| # | Critério | Onde |
|---|----------|------|
| 1 | OpenRouter só no backend | US4-4; FR-001, FR-002, FR-024 |
| 2 | Abstração de provedor | FR-001 (contrato da 006) |
| 3 | Implementação OpenRouter | US1-1; FR-001–FR-005 |
| 4 | AI Gateway centralizado | FR-006, FR-010–FR-014 (gateway da 006) |
| 5 | Agente de Ementa usa o gateway | US1-1; FR-021 |
| 6 | Agente sem dependência do OpenRouter | US1-3; FR-006, FR-021 |
| 7 | Modelos trocados sem mudar o agente | US2-1; FR-007; SC-002 |
| 8 | Principal + fallback | US3; FR-006, FR-010–FR-012 |
| 9 | Prompts centralizados e versionados | FR-009 (registro da 006) |
| 10 | Saída estruturada validada | US3-2; FR-012 |
| 11 | Chamadas auditáveis | US5-2; FR-016, FR-018 |
| 12 | Tokens, latência e modelo observáveis | US5-1; FR-019, FR-020; SC-008 |
| 13 | Credenciais nunca expostas | US4-1; FR-005, FR-016; SC-005 |
| 14 | Falhas tratadas de forma controlada | US3-3, US4-3; FR-014; SC-006 |
| 15 | Testes com provedor simulado | US1-2, US7-2; FR-023 |
| 16 | Reuso por novos agentes | US7-1; SC-010 |
