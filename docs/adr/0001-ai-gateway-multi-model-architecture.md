# ADR-0001 — Arquitetura multimodelo de IA com AI Gateway, OpenRouter e Jev

- **Status**: Aceita
- **Data**: 2026-09-29
- **Decisores**: Equipe de Arquitetura / Desenvolvimento
- **Escopo**: todo uso de modelos de IA pelo DevTrack (API, serviços, agentes e workers)
- **Categoria**: IA / Arquitetura / Segurança / Governança

## Decisões normativas anteriores

Esta ADR registra a arquitetura **já implementada** e não altera nenhuma regra. As fontes
normativas são, em ordem de precedência:

| Fonte | O que decide |
|-------|--------------|
| Constituição v3.1.0 (`.specify/memory/constitution.md`) | XI Supervisão humana em decisões críticas; XII Determinismo antes de IA; XIII Classificação de risco (L1/L2/L3); XIV IA como componente não autoritativo; XV Grounding; XVII Idempotência; XVIII Interrupção segura; XIX Avaliação de componentes de IA |
| [Spec 006 — AI foundation](../../specs/006-ai-foundation/spec.md) | Registro de agentes, prompts, schemas, ferramentas e configs de modelo sincronizado a partir do código; gateway independente de provedor; ferramentas negadas por padrão; saída estruturada validada; propostas L2 revisadas pelo professor; execução assíncrona limitada; uso, custo e auditoria; tela "Operação de IA" |
| [Spec 007 — Curriculum Agent](../../specs/007-curriculum-agent/spec.md) | Primeiro agente de domínio (`curriculum-agent`), L2 e fundamentado no documento; golden set com replay no CI e avaliação sob demanda com o modelo real |
| [Spec 008 — AI gateway com OpenRouter](../../specs/008-ai-gateway-openrouter/spec.md) | OpenRouter como único provedor real; agente declara uma tarefa; fallback único após falha recuperável; circuito por config de modelo; limite por agente |
| [Spec 009 — Política de modelos](../../specs/009-ai-model-policy/spec.md) | Allowlist de famílias; catálogo em código com nível, modo e ciclo de vida; seleção determinística (FR-008); fallback no mesmo nível (FR-012); escalonamento só por regra explícita (FR-013); nenhum modelo escolhe modelo (FR-011); quality gate por evidência (FR-017); override administrativo; orçamentos observáveis; Jev no modo de decisão (FR-001a, FR-001b) |

A emenda de 2026-09-29 à spec 009 (clarificação "Session 2026-09-29") incluiu a DeepSeek na
allowlist. A spec 010 (banco de questões) é consumidora desta arquitetura: o `exercise-generator`
usa o mesmo gateway e a mesma política.

## 1. Contexto

O DevTrack usa IA para tarefas de natureza diferente: extrair e estruturar uma ementa, gerar
rascunhos de exercícios e, no futuro, classificar, pontuar ou validar dentro de workflows. Nenhum
modelo é a melhor escolha para todas elas, em qualidade, custo ou latência, e nenhum fornecedor deve
ficar embutido no domínio.

Ao mesmo tempo, a constituição trata a IA como componente não autoritativo (XIV), exige
determinismo onde ele é possível (XII), classifica o risco das operações (XIII), mantém decisões
críticas com o professor (XI) e exige avaliação antes de produção (XIX). A arquitetura precisa,
portanto, permitir vários modelos sem abrir mão de uma escolha auditável e reproduzível.

O princípio adotado é: **o sistema não depende de um modelo específico; depende de tarefas com
política declarada, atendidas por modelos aprovados por avaliação.**

## 2. Decisão

### 2.1 O `ModelGateway` é o único ponto de acesso aos modelos

```
 Módulos de domínio (curriculum-ai, exercise-ai, …)
        │  pedem uma execução de um agente; nunca um modelo
        ▼
 modules/ai — execução (AiExecutionWorker, runner)
        │  política: selectRoute (pura, determinística) → rota fixada na execução
        ▼
 ModelGateway ── generate / decide ── circuito por config, fallback, uso e custo
        │
        ▼
 gateway/providers/openrouter.provider.ts   (único lugar com host ou SDK de provedor;
        │                                    envia a política de provider, seção 2.5)
        ├── chat completions ──► famílias de geração: OpenAI, Anthropic, DeepSeek
        └── rota de decisões ──► família TypeSafe: Jev (modo DECISION)
```

- Nenhum módulo de negócio chama um provedor ou nomeia um modelo. Um agente declara uma **tarefa**
  (`ai_tasks`, spec 008); a tarefa declara sua **política** (spec 009); o modelo concreto vem do
  catálogo.
- Hosts e SDKs de provedor só existem em `apps/api/src/modules/ai/gateway/providers/**`. Isso é
  garantido pelo ESLint e pelo teste `006-ai-boundary`; `010-no-model-choice` impede que os módulos
  de exercícios citem nível, família ou modelo, e `009-model-id-boundary` impede ids concretos de
  modelo fora de `definitions/model-catalog.ts`.
- Provedor e modelo são conceitos separados: o provedor é o adaptador (hoje só o
  `OpenRouterProvider`, registrado só com `OPENROUTER_API_KEY`); a família é o prefixo do id do
  modelo no OpenRouter (`openai/…`, `anthropic/…`, `deepseek/…`, `typesafe/…`).

### 2.2 O roteamento é determinístico e segue a spec 009

- A escolha do modelo é feita por `policy/select-route.ts`, uma função pura, na ordem da FR-008:
  catálogo → allowlist e famílias permitidas da tarefa → estado PRODUCTION com aprovação válida
  para a tarefa → capacidades exigidas → nível preferido → override administrativo, se houver →
  menor custo estimado → prioridade → identificador. O custo nunca vem antes do quality gate e das
  capacidades (FR-009). A saúde do provedor nunca reordena a escolha.
- A rota escolhida (tarefa, nível, família, modelo, motivo e override) é fixada na execução no
  momento do pedido (FR-010).
- **Nenhum modelo, incluindo o Jev, escolhe ou altera provedor, família, modelo, nível, tarefa,
  orçamento ou permissões** (FR-011). O Provider Routing do OpenRouter acontece depois dessa
  escolha e nunca troca o modelo (seção 2.5). Conteúdo enviado por usuários e saída de modelo são
  dados não confiáveis e nunca mudam a política (suíte de injeção de política da 009).
- O administrador pode fixar um modelo por tarefa (`PUT/DELETE /ai/operations/tasks/:key/override`),
  mas só um modelo que a política da tarefa admite; professores nunca veem nem escolhem modelos
  (FR-025).

### 2.3 O Jev é camada de decisão, não de geração

- O Jev (TypeSafe, `typesafe/jev-1.13`) é uma entrada do catálogo com modo **DECISION**. Ele responde
  apenas dentro de um espaço de saída definido previamente: escolher uma opção de uma lista, dar uma
  pontuação numa escala ou a probabilidade de uma afirmação ser verdadeira, com grau de confiança.
- Uso previsto: decisões estruturadas, classificação, scoring e validações com saída fechada. Um
  modelo de decisão nunca atende uma tarefa que precisa gerar texto, e um modelo de geração não
  atende uma tarefa de decisão sem política explícita da tarefa (FR-001a).
- Uma resposta do Jev é validada como qualquer saída; confiança abaixo do limiar da tarefa é tratada
  como "sem decisão" e segue a regra da tarefa (decidir por outra via ou marcar para revisão), nunca
  como decisão tomada (FR-001b). Limiares vêm de avaliação, não de escolha arbitrária (XIX).
- O Jev **não** participa do Model Routing (2.2) nem do Provider Routing (2.5) e não decide
  operações críticas (XI).
- Integração: a definida na spec 009. As chamadas passam pelo `ModelGateway.decide` e pelo mesmo
  provedor (OpenRouter), na rota de decisões dele (`contracts/decisions-provider.md` da 009). Não há
  integração direta com a TypeSafe.
- Estado atual: a entrada `typesafe-decision-basic` está como CANDIDATE e nenhuma tarefa de produção
  usa o modo de decisão ainda.

### 2.4 Model Fallback e escalonamento seguem FR-012 e FR-013

Esta seção trata da troca de **modelo**. A troca de endpoint do mesmo modelo dentro do OpenRouter
(Provider Fallback) é outra coisa e está na seção 2.5.

- **Fallback** (FR-012): só após falha técnica recuperável, **uma vez**, para outro modelo aprovado do
  **mesmo nível** e de família permitida, escolhido pela mesma ordem da FR-008 (preferindo outra
  família); nunca para outro nível e nunca de volta ao principal. O circuito por config de modelo
  (spec 008) faz pular um modelo em falha e o leva ao fallback.
- **Escalonamento** (FR-013): só quando a política da tarefa o permite, após falha de qualidade
  detectável (saída que não passa na validação ou em outro verificador declarado pela tarefa),
  **uma vez** por execução, para o nível seguinte até o máximo da tarefa. Rejeição de proposta pelo
  professor não é falha de qualidade. ADVANCED só quando a política o exige ou permite (FR-014).
- **Não existe cadeia fixa entre famílias** (por exemplo Anthropic → OpenAI → DeepSeek). A família de
  cada perna resulta da política e das aprovações, não de uma lista configurada.
- Um modelo só serve de fallback ou destino de escalonamento para uma tarefa se estiver aprovado
  para ela pelo quality gate. Enquanto uma tarefa tiver um único modelo aprovado no seu nível, ela
  não tem fallback.

### 2.5 Model Routing × Provider Routing

São duas decisões diferentes, tomadas em camadas diferentes e nesta ordem:

| | Model Routing | Provider Routing |
|--|---------------|------------------|
| Pergunta | **Qual modelo** atende esta tarefa? | **Qual endpoint** (provider upstream no OpenRouter) serve o modelo já escolhido? |
| Quem decide | O DevTrack: `selectRoute()` na política da 009, fixada na execução e executada pelo `ModelGateway` | O OpenRouter, **dentro da política de provider** que o DevTrack envia em cada chamada |
| Regras | FR-008 a FR-015 da 009; catálogo, aprovações e release gate | Política de provider centralizada na infraestrutura (abaixo); 008 FR-004 |
| O que pode mudar | Modelo, família, nível (só por fallback ou escalonamento de modelo) | Só o endpoint que serve **o mesmo modelo** |

```
 tarefa ─► selectRoute() ─► modelo aprovado (ex.: openai/gpt-6-luna)      ← Model Routing (DevTrack)
                                   │
                                   ▼
          OpenRouter + política de provider ─► endpoint que serve esse modelo  ← Provider Routing
```

**Política de provider**

- É **centralizada na camada de infraestrutura** (`ModelGateway` e o adaptador
  `gateway/providers/openrouter.provider.ts`), versionada e revisada como código. Agentes, tarefas e
  módulos de domínio **não** a configuram nem a veem; nenhuma definição de agente ou tarefa tem campo
  para isso, e conteúdo de usuário ou saída de modelo nunca a altera.
- **Estado atual** (008 research G11, contrato `openrouter-provider.md`): toda chamada de geração
  envia `provider: { data_collection: "deny", zdr: true, require_parameters: true }`, isto é, nenhuma
  coleta de dados para treino, só endpoints com Zero Data Retention e só endpoints que suportam os
  parâmetros pedidos (saída estruturada estrita, ferramentas). `allow_fallbacks` não é enviado, então
  o fallback entre endpoints do mesmo modelo está ligado (G11 rejeitou fixar um único endpoint). A
  rota de decisões do Jev envia só modelo, estado e perguntas, sem opções de provider.
- **Opções que a política pode passar a considerar**, conforme o suporte do OpenRouter:
  - allowlist de providers (`only`);
  - ordem ou preferência (`order`);
  - provider fallback (`allow_fallbacks`);
  - quantizações permitidas (`quantizations`);
  - limite máximo de preço (`max_price`);
  - throughput mínimo preferencial (`preferred_min_throughput`);
  - latência máxima preferencial (`preferred_max_latency`);
  - política de coleta de dados (`data_collection`);
  - Zero Data Retention (`zdr`).

  Os dois últimos já estão em vigor. Adotar qualquer outra opção muda o corpo da requisição fixado no
  contrato da 008 e, portanto, exige emenda da spec correspondente; a política continua uma só para o
  sistema (ou por entrada de catálogo, se a spec assim decidir), nunca por agente ou módulo.
- **Auditabilidade**: a política é código versionado, e cada chamada registra o modelo pedido e o
  modelo servido (`ai_model_calls.served_model`). O endpoint upstream que atendeu a chamada **ainda
  não** é registrado; registrá-lo faz parte da decisão em aberto 5.4.

**Model Fallback × Provider Fallback**

- **Model Fallback** troca de **modelo**: é o fallback e o escalonamento da seção 2.4, decididos só
  pelo DevTrack e governados por FR-012 e FR-013 (uma vez, mesmo nível, modelo aprovado; escalonamento
  só por regra da tarefa). O OpenRouter nunca faz fallback de modelo: `models`, `route` e ids
  `openrouter/…` (roteadores automáticos) nunca são enviados, e o catálogo os recusa (008 FR-004,
  FR-008).
- **Provider Fallback** troca só de **endpoint** do mesmo modelo, dentro do OpenRouter, após falha de
  um endpoint. Ele **não pode** contornar o modelo selecionado, o catálogo, os evals nem o release
  gate:
  - todo endpoint alternativo está sujeito à mesma política de provider (ZDR, sem coleta de dados,
    parâmetros exigidos);
  - o adaptador recusa uma resposta cujo modelo servido não seja o pedido (sufixo de data permitido),
    tratando-a como falha do provedor, que então segue as regras de Model Fallback da 2.4;
  - a aprovação de um modelo vale para o modelo do catálogo, e a política de provider é o lugar para
    restringir endpoints (por exemplo, por quantização) se diferenças entre eles afetarem a
    qualidade medida pelos evals.
- Quando o OpenRouter esgota os endpoints de um modelo, a falha volta ao `ModelGateway` como falha
  técnica, e só então vale o Model Fallback da 009.

**Jev** não seleciona provider, endpoint, modelo, família, nível nem orçamento, nem participa do
Provider Routing.

### 2.6 Modelos vêm do catálogo versionado, não de variáveis de ambiente

- `apps/api/src/modules/ai/definitions/model-catalog.ts` é o único lugar com ids concretos de modelo,
  com família, nível, modo, ciclo de vida (CANDIDATE → EVALUATING → PRODUCTION → DEPRECATED), preço de
  referência, janela de contexto, capacidades e aprovações. Um modelo novo ou uma versão nova é uma
  mudança revisada nesse arquivo; nada entra por conta própria (FR-004), e o `AiRegistrySync` recusa
  transições de ciclo de vida inválidas.
- Uma **aprovação** para uma tarefa exige um arquivo de evidência commitado em
  `apps/api/test/fixtures/evaluations/<tarefa>/<chave>.json`, produzido pelo release gate com o
  modelo real (modelo servido, versão do golden set, métricas, custo). `009-quality-gate` verifica
  que cada aprovação é igual à sua evidência e atinge os limiares da tarefa.
- As variáveis de ambiente configuram só o **acesso** ao provedor (`OPENROUTER_API_KEY`,
  `OPENROUTER_BASE_URL`, `OPENROUTER_TIMEOUT_MS`, que só reduz o teto de tempo), nunca a escolha do
  modelo. As variáveis `OPENROUTER_*_MODEL` da 008 foram removidas pela 009.

### 2.7 Famílias e estado atual do catálogo

Allowlist de produção (`PRODUCTION_MODEL_FAMILIES`): `openai`, `anthropic`, `deepseek` (geração) e
`typesafe` (decisão). Estado em 2026-09-29:

| Família | Chave | Nível | Modo | Ciclo de vida | Aprovações |
|---------|-------|-------|------|---------------|------------|
| openai | `openai-basic` | BASIC | geração | PRODUCTION | `curriculum-extraction`, `exercise-generation` |
| openai | `openai-standard`, `openai-advanced` | STANDARD, ADVANCED | geração | CANDIDATE | — |
| anthropic | `anthropic-basic` | BASIC | geração | CANDIDATE | — (não avaliado: OpenRouter respondeu 402, sem crédito) |
| anthropic | `anthropic-standard`, `anthropic-advanced` | STANDARD, ADVANCED | geração | CANDIDATE | — |
| deepseek | `deepseek-basic` | BASIC | geração | CANDIDATE | — (**reprovado** em `curriculum-extraction` e `exercise-generation`) |
| deepseek | `deepseek-standard` | STANDARD | geração | CANDIDATE | — (não avaliado) |
| typesafe | `typesafe-decision-basic` (Jev) | BASIC | decisão | CANDIDATE | — |

- A DeepSeek é família **suportada** e seus modelos são **candidatos**. O `deepseek-basic` reprovou
  no release gate de 2026-09-29 nas duas tarefas (validade de schema 0 na análise de ementa e 0,17 na
  geração de exercícios; evidências em `test/fixtures/evaluations/*/deepseek-basic.json`) e **não**
  atende essas tarefas. Uma nova avaliação aprovada, commitada com sua evidência, é o único caminho
  para mudar isso.
- As duas tarefas em uso são BASIC, com fallback no mesmo nível e escalonamento para STANDARD após
  saída inválida. Hoje ambas são servidas só pelo `openai-basic`, sem fallback de mesmo nível e sem
  destino de escalonamento aprovado.

### 2.8 Segurança e autorização pertencem ao código

- Prompt não é mecanismo de autorização. A autorização é feita no código: guards globais de sessão e
  permissão, escopo do recurso (404 fora do contexto), re-autorização da execução ao começar, e
  ferramentas negadas por padrão no `AiToolExecutor` (allowlist, ferramenta habilitada, permissão,
  entrada estrita, recurso do próprio workspace, timeout, saída estrita e limite de tamanho) (XIV).
- Resultados de IA são rascunhos: saída L2 vira proposta que o professor aprova, aprova em parte ou
  rejeita, e aprovar nunca grava dados de domínio pelo módulo de IA (XIII). Não há agente L3.
- Documentos e textos de usuários são dados, nunca instruções, e as suítes de injeção de 007, 009 e
  010 cobrem isso.

### 2.9 Operação, observabilidade e interrupção

- Cada execução registra a rota (tarefa, nível, família, modelo, motivo), fallback e escalonamento
  usados, nível de origem e destino; cada perna de chamada fica em `ai_model_calls` com modelo
  servido, tokens, duração e custo informado pelo provedor. Prompts são versionados no registro.
- Conteúdo de professores, instruções, entradas e saídas ficam fora de logs, auditoria e respostas de
  "Operação de IA" (scans de segredo e de admin).
- "Operação de IA" mostra custo por agente, tarefa, nível, família e modelo, o catálogo com qualidade
  ao lado do custo, circuitos e orçamentos. Orçamentos são observáveis e auditados, sem bloquear; os
  limites que impedem consumo ilimitado são por execução, por usuário e por agente.
- Interrupção (XVIII): `AI_EXECUTION_INTERVAL_SECONDS=0` para todo o processamento; desabilitar um
  agente recusa novos pedidos e cancela os que estão na fila; desabilitar uma config de modelo recusa
  novos pedidos e falha os enfileirados sem chamar o modelo. Agentes novos entram desabilitados até o
  administrador habilitá-los.

### 2.10 Avaliação

- Toda tarefa em produção tem golden set versionado com replay no CI sobre respostas gravadas e
  avaliação sob demanda contra o modelo real (`pnpm --filter api eval:curriculum`,
  `eval:exercises`), que serve de release gate (XIX, FR-017).
- Uma tarefa de decisão que venha a usar o Jev deverá ter seu próprio golden set e limiares; as
  métricas adequadas (acurácia, precisão, recall, calibração da confiança) serão definidas na spec
  dessa tarefa.

## 3. Consequências

**Positivas**

- Troca de modelo sem mudar o domínio: basta uma entrada de catálogo aprovada por evidência.
- Escolha reproduzível e auditável, e comparação objetiva entre modelos pelos mesmos golden sets.
- Menor dependência de fornecedor: três famílias de geração na allowlist atrás de um adaptador.
- Custo sob controle: o modelo mais barato que passou no gate do nível da tarefa, com custo
  observável por tarefa, nível e família.
- Base para decisões estruturadas com o Jev sem entregar a ele o roteamento.

**Negativas (aceitas)**

- Todo modelo novo exige avaliação real antes de servir uma tarefa, e a disponibilidade de fallback
  depende de haver um segundo modelo aprovado no mesmo nível (hoje não há).
- A manutenção do catálogo (ids, preços, ciclo de vida) é trabalho manual e revisado.
- Um único provedor real (OpenRouter) concentra a disponibilidade de todas as famílias.
- Mais configuração e mais testes de guarda (fronteiras, quality gate, injeção de política).

## 4. Alternativas rejeitadas

- **Um único modelo para todo o sistema**: aumenta a dependência de fornecedor e ignora diferenças de
  custo, capacidade e latência.
- **Chamadas diretas a provedores nos serviços**: espalham dependências externas pelo domínio e
  escapam das guardas de fronteira.
- **Modelos escolhidos por variável de ambiente** (o modelo da 008): um modelo trocado por ambiente
  escapa do release gate; removido pela 009.
- **Cadeia fixa de fallback entre famílias**: contradiz FR-012 (uma vez, mesmo nível, modelo
  aprovado) e pode levar uma tarefa a um modelo não avaliado para ela.
- **Um modelo (LLM ou Jev) escolhendo o modelo**: contradiz FR-008 e FR-011 e torna a escolha
  probabilística e não reproduzível.
- **Deixar o OpenRouter escolher ou trocar o modelo** (`models`, `route`, roteadores automáticos
  `openrouter/…`): transfere o Model Routing para fora do DevTrack e contorna catálogo, evals e
  release gate (008 FR-004).
- **Política de provider definida por agente ou módulo de domínio**: espalha decisões de
  infraestrutura pelo domínio e as torna difíceis de auditar; a política fica na infraestrutura.
- **Jev como substituto geral dos LLMs**: ele responde em espaço de saída fechado e não gera texto.
- **Deixar o modelo decidir e executar livremente**: autorização, estado e efeitos ficam no
  software (XI, XIII, XIV).

## 5. Decisões em aberto

As mudanças abaixo são arquiteturais e futuras. Nenhuma vale por esta ADR: cada uma exige **nova
spec** (`/speckit-specify`) e, quando aplicável, **emenda à constituição**
(`/speckit-constitution`), e esta ADR será substituída ou atualizada depois.

1. **Integração direta com a TypeSafe/Jev**, fora do OpenRouter: seria um provedor novo em
   `gateway/providers/**`, com sua credencial, fronteira, contrato e testes.
2. **Mudança da política determinística de roteamento**, incluindo qualquer participação de um
   modelo (Jev ou LLM) na escolha de provedor, família, modelo ou nível: exige rever FR-008, FR-011 e
   a spec 009, e avaliar à luz dos princípios XII e XIV.
3. **Outro provedor real além do OpenRouter** (acesso direto a um fornecedor ou modelos locais).
4. **Ampliar a política de provider** além de `data_collection`, `zdr` e `require_parameters`
   (`only`, `order`, `allow_fallbacks`, `quantizations`, `max_price`, `preferred_min_throughput`,
   `preferred_max_latency`) e **registrar o endpoint upstream** que serviu cada chamada: muda o
   contrato do adaptador da 008 e o registro de `ai_model_calls`, e exige emenda da spec. Os limites
   da seção 2.5 continuam valendo: política centralizada, auditável e incapaz de trocar o modelo.

Adicionar uma família à allowlist ou uma entrada ao catálogo **não** é decisão em aberto: é o
procedimento normal da spec 009 (decisão explícita da equipe registrada na spec, entrada CANDIDATE,
release gate).

## 6. Referências

- Constituição: `.specify/memory/constitution.md` (v3.1.0), princípios XI–XV, XVII–XIX.
- `specs/006-ai-foundation/` (research A1–A22), `specs/007-curriculum-agent/` (C1–C20),
  `specs/008-ai-gateway-openrouter/` (G1–G20; G11 e contrato `openrouter-provider.md` para a
  política de provider), `specs/009-ai-model-policy/` (H1–H16; contratos
  `catalog-and-quality-gate.md` e `decisions-provider.md`).
- Código: `apps/api/src/modules/ai/` (`definitions/model-families.ts`, `definitions/model-catalog.ts`,
  `policy/select-route.ts`, `gateway/`, `tools/`, `execution/`, `proposals/`, `operations/`).
- Evidências de avaliação: `apps/api/test/fixtures/evaluations/`.
