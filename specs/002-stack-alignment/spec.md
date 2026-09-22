# Feature Specification: 002 — Refatoração de alinhamento de stack da Fase 001

**Feature Branch**: `002-stack-alignment`
**Created**: 2026-09-22
**Status**: Draft
**Input**: User description: "refatoração de alinhamento de stack da Fase 001"

Contexto: a Constituição v2.1.0 criou o Princípio XXVI (Contratos Compartilhados) e
fixou a stack oficial do frontend. A Fase 001 (`specs/001-foundation-identity-access`)
foi entregue antes disso. Esta feature migra o que já existe para as regras novas,
**sem mudar o comportamento** percebido por quem usa o sistema. A Fase 002 do
roadmap (Academic Domain) será especificada depois desta, com o próximo número livre.

## Clarifications

### Session 2026-09-22

- Q: Como as telas devem ficar depois da migração? → A: Manter a paleta e a aparência
  atuais (tema claro e escuro, contrastes AA já verificados), reproduzidas com os
  componentes novos; identidade visual nova fica para uma feature própria.
- Q: A suíte E2E roda só localmente ou esta feature cria integração contínua? → A:
  Criar integração contínua com lint, tipos, build e testes da API e do web; o E2E
  roda localmente com comando documentado e fica fora da CI por enquanto.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Contrato único entre API e web (Priority: P1)

Quem mantém o DevTrack descreve cada requisição e resposta da API **uma única vez**,
no pacote de contratos compartilhados. A API valida as entradas com esse contrato e o
web monta formulários e lê respostas a partir dele. Uma mudança no contrato que não
seja acompanhada pelo outro lado falha antes de chegar a produção.

**Why this priority**: é o objetivo central da emenda. Hoje os tipos do web
(`lib/*-api.ts`) são cópias manuais do que a API aceita e devolve, e podem divergir
sem que nenhum teste perceba. Toda feature nova (Fase 002 em diante) nasce sobre esse
pacote, então ele precisa existir primeiro.

**Independent Test**: alterar um campo de um contrato (ex.: renomear um campo de
resposta) e confirmar que a verificação de tipos ou os testes falham na API e no web;
confirmar por teste de guarda que nenhum tipo equivalente foi redefinido fora do
pacote.

**Acceptance Scenarios**:

1. **Given** qualquer rota da API da Fase 001 que receba corpo, query ou parâmetros,
   **When** uma requisição chega, **Then** a entrada é validada com o schema do
   contrato compartilhado, com o mesmo resultado de hoje (mesmas normalizações,
   limites e rejeição de campos desconhecidos com `400`).
2. **Given** qualquer rota da API da Fase 001 que devolva corpo, **When** os testes de
   integração a exercitam, **Then** a resposta real é conferida contra o schema de
   resposta do contrato e passa.
3. **Given** um contrato alterado (campo renomeado, removido ou com tipo trocado),
   **When** a verificação de tipos roda no monorepo, **Then** ela falha no lado que
   ainda usa a forma antiga.
4. **Given** o código da API e do web, **When** o teste de guarda de duplicação roda,
   **Then** ele não encontra tipos de requisição, resposta, enums públicos ou códigos
   de erro definidos fora do pacote de contratos.
5. **Given** o pacote de contratos, **When** o teste de guarda de fronteira roda,
   **Then** ele não encontra tipos de persistência, repositórios, services, estado de
   interface ou textos exibidos ao usuário.
6. **Given** o workspace, **When** as dependências são resolvidas, **Then** existe uma
   única versão da biblioteca de schemas, compartilhada por API, web e contratos.

---

### User Story 2 - Nenhuma regressão para quem usa o sistema (Priority: P1)

Alunos, professores, gestores e administradores continuam fazendo exatamente o que
faziam na Fase 001, pelas mesmas telas e com as mesmas respostas: cadastro,
verificação de e-mail, login, sessões, bootstrap do ADMIN, convites, aceite com
identidade única, administração de contas e recuperação de senha.

**Why this priority**: uma refatoração que muda comportamento deixa de ser
refatoração. A Fase 001 tem garantias de segurança (anti-enumeração, revogação de
sessão, auditoria, 403 × 404) que não podem enfraquecer durante a migração.

**Independent Test**: rodar a suíte automatizada da Fase 001 (API e web) e o roteiro
de `specs/001-foundation-identity-access/quickstart.md` depois da migração; tudo
passa sem alterar o que os testes verificam.

**Acceptance Scenarios**:

1. **Given** a suíte de testes da API da Fase 001, **When** ela roda após a migração,
   **Then** todos os testes passam, e as mudanças nos arquivos de teste se limitam a
   importações e helpers, sem alterar status, códigos, corpos ou efeitos verificados.
2. **Given** as 11 telas da Fase 001, **When** um usuário percorre cada fluxo, **Then**
   rótulos, textos, mensagens de erro, rotas e redirecionamentos são os mesmos de
   antes.
3. **Given** um erro devolvido pela API (ex.: `WEAK_PASSWORD`, `RATE_LIMITED`,
   `TOKEN_INVALID`), **When** o web o exibe, **Then** o texto mostrado é idêntico ao
   de antes da migração, agora vindo do catálogo de mensagens do web associado ao
   código.
4. **Given** o roteiro de quickstart da Fase 001, **When** executado num ambiente
   limpo, **Then** todos os passos funcionam, com os comandos atualizados se algum
   tiver mudado.

---

### User Story 3 - Telas da Fase 001 no sistema de componentes oficial (Priority: P2)

As telas públicas (entrar, cadastro, verificar e-mail, esqueci/redefinir senha,
convite, ativar admin), as telas administrativas (gestores, usuários, professores),
a tela de sessões, a navegação e a página inicial passam a usar a biblioteca de
componentes e o sistema de estilos oficiais, mantendo o nível de acessibilidade
exigido pela Fase 001 (001/FR-075, 001/SC-012).

**Why this priority**: as próximas fases vão construir dezenas de telas; sem migrar
as existentes, o projeto teria dois sistemas visuais em paralelo. Vem depois das P1
porque o risco maior está nos contratos e na ausência de regressão.

**Independent Test**: abrir cada uma das 11 telas nos estados inicial, com erro de
validação e de sucesso, em tema claro e escuro, e rodar a verificação automatizada de
acessibilidade e os testes de teclado existentes.

**Acceptance Scenarios**:

1. **Given** qualquer uma das 11 telas, **When** a verificação automatizada de
   acessibilidade roda nos estados inicial e de erro, **Then** não há violações de
   nível A/AA.
2. **Given** qualquer formulário, **When** o usuário envia dados inválidos usando só o
   teclado, **Then** o foco vai para o resumo de erros, cada erro está vinculado ao
   seu campo e é anunciado a leitores de tela, como na Fase 001.
3. **Given** o sistema operacional em tema escuro, **When** qualquer tela é aberta,
   **Then** ela é exibida em tema escuro com contraste AA, como hoje.
4. **Given** a identidade visual da Fase 001 (paleta, tema claro e escuro, raio de
   borda, foco visível), **When** as telas são migradas, **Then** a aparência é
   preservada, reproduzida com os novos componentes a partir das mesmas cores e com
   os mesmos contrastes verificados.

---

### User Story 4 - Dados do servidor e formulários pelos padrões oficiais (Priority: P2)

As telas que listam ou alteram dados (sessões, gestores, usuários, professores,
convites) obtêm e atualizam os dados pela camada oficial de estado do servidor, e
todos os formulários usam a solução oficial de formulários com o schema do contrato.
Componentes não chamam a API diretamente.

**Why this priority**: fixa o padrão que as fases seguintes vão copiar. Sem ele, cada
tela nova escolhe seu próprio jeito de buscar dados e validar formulários, que é o
problema que a emenda quer evitar.

**Independent Test**: em cada tela de lista, executar uma ação (revogar sessão,
reenviar convite, suspender conta) e confirmar que a lista reflete o novo estado sem
recarregar a página; confirmar por regra de lint que nenhum componente chama a API
diretamente.

**Acceptance Scenarios**:

1. **Given** a lista de sessões, **When** o usuário revoga outra sessão, **Then** a
   lista é atualizada e a sessão revogada deixa de aparecer, sem recarregar a página.
2. **Given** uma ação administrativa (convidar, reenviar, revogar, suspender,
   reativar, desativar), **When** ela é concluída, **Then** as listas afetadas mostram
   o novo estado.
3. **Given** um formulário, **When** o usuário clica em enviar duas vezes seguidas,
   **Then** só uma requisição é feita, como hoje.
4. **Given** um usuário que sai (logout, "sair de todos") ou cuja sessão é recusada,
   **When** outra pessoa entra no mesmo navegador, **Then** nenhum dado da sessão
   anterior aparece.
5. **Given** o código do web, **When** o lint roda, **Then** ele falha se um
   componente chamar a API diretamente em vez de usar a camada da feature.

---

### User Story 5 - Jornadas críticas testadas de ponta a ponta no navegador (Priority: P3)

Quem mantém o DevTrack tem uma suíte de testes que abre o sistema num navegador real,
contra API, banco e caixa de e-mail de desenvolvimento reais, e percorre as jornadas
críticas da Fase 001 do início ao fim.

**Why this priority**: os testes de componente e de API já cobrem as regras; o E2E
fecha a lacuna entre eles (rewrite `/api/*`, cookies, redirecionamentos, links de
e-mail). Ele será indispensável na Fase 008 (sessão de prova), mas pode entrar por
último nesta feature.

**Independent Test**: com o ambiente de desenvolvimento no ar, rodar o comando da
suíte E2E e ver todas as jornadas passarem.

**Acceptance Scenarios**:

1. **Given** um ambiente limpo, **When** a suíte E2E roda, **Then** cobre e passa nas
   jornadas: cadastro → verificação por e-mail → login; bootstrap do ADMIN → ativação
   → convite de MANAGER → aceite; MANAGER convida aluno existente → aceite com a mesma
   identidade; esqueci a senha → redefinição → login; revogar outra sessão e "sair de
   todos".
2. **Given** a jornada de cadastro, **When** percorrida usando só o teclado, **Then**
   é concluída sem o mouse.
3. **Given** dois usuários no mesmo navegador em sequência, **When** o segundo entra,
   **Then** não vê dados do primeiro.
4. **Given** a suíte E2E, **When** alguém quer executá-la, **Then** ela roda
   localmente com um comando documentado no quickstart; ela não faz parte da
   integração contínua nesta feature.
5. **Given** um push ou pull request para o repositório, **When** a integração
   contínua roda, **Then** ela executa lint, verificação de tipos, build e os testes
   automatizados da API (contra um banco PostgreSQL provisionado na própria
   execução) e do web, e marca a mudança como falha se qualquer um falhar.

---

### Edge Cases

- **Contrato mais permissivo ou mais restrito que a API atual**: o schema
  compartilhado deve reproduzir exatamente a validação de hoje (normalização de
  e-mail, limites de nome, formato de token, rejeição de campos extras como `role`
  no cadastro público). Qualquer diferença é regressão e falha nos testes da Fase
  001.
- **Normalização aplicada nos dois lados**: o web pode aplicar as mesmas
  transformações do contrato (trim, minúsculas) para dar retorno imediato, mas a API
  continua aplicando e validando por conta própria.
- **Política de força de senha**: continua sendo regra do servidor. O cliente não
  replica a política; exibe o erro `WEAK_PASSWORD` devolvido pela API, como hoje.
- **Código de erro desconhecido pelo web** (ex.: API mais nova que o web): o web
  exibe a mensagem genérica de erro inesperado, nunca um texto técnico.
- **Falha de rede e resposta não-JSON**: continuam como códigos do próprio web
  (`NETWORK_ERROR`, `UNEXPECTED_RESPONSE`), fora do contrato, com os textos atuais.
- **`429 RATE_LIMITED` com `Retry-After`**: o tempo de espera continua sendo exibido
  como hoje.
- **Telas protegidas renderizadas no servidor**: a checagem de sessão continua
  acontecendo antes de renderizar; a migração não pode introduzir um "piscar" de
  conteúdo protegido para quem não tem sessão.
- **Páginas com token na URL** (verificar e-mail, redefinir senha, convite, ativar
  admin): o token não é guardado em cache persistente nem em armazenamento do
  navegador, e a política de `Referrer-Policy: no-referrer` continua valendo.
- **Troca de conta no mesmo navegador**: o cache de dados do servidor é descartado no
  logout, no "sair de todos" e quando a API responde `401`.
- **Build do monorepo**: o pacote de contratos precisa estar compilado antes de API e
  web; um clone limpo seguindo o README/quickstart deve compilar sem passo manual
  extra.

## Requirements *(mandatory)*

### Functional Requirements

**Contratos compartilhados (Princípio XXVI)**

- **FR-001**: Todas as entradas das rotas da API da Fase 001 (corpo, query e
  parâmetros) DEVEM ser descritas por schemas do pacote de contratos compartilhados e
  validadas pela API com esses schemas.
- **FR-002**: Todas as respostas com corpo das rotas da API da Fase 001 DEVEM ter um
  schema de resposta no pacote de contratos, e os testes de integração DEVEM conferir
  as respostas reais contra ele.
- **FR-003**: Os tipos usados pelo web para chamar a API e ler suas respostas DEVEM
  ser derivados dos schemas do pacote; os tipos escritos à mão em `apps/web/lib/*-api.ts`
  DEVEM deixar de existir.
- **FR-004**: Enums públicos (ex.: status de convite, de papel, de professor, modo de
  aceite), o formato de erro `{statusCode, code, message}` e o catálogo de códigos de
  erro da API DEVEM estar no pacote de contratos.
- **FR-005**: O pacote de contratos NÃO DEVE conter tipos de persistência,
  repositórios, services, estado de interface nem textos exibidos ao usuário; um teste
  de guarda DEVE falhar se isso acontecer.
- **FR-006**: Um teste de guarda DEVE falhar se a API ou o web definirem manualmente
  um tipo de requisição, resposta, enum público ou lista de códigos de erro já
  presente no pacote de contratos.
- **FR-007**: O workspace DEVE resolver uma única versão da biblioteca de schemas,
  fixada no catálogo do gerenciador de pacotes.
- **FR-008**: A validação produzida pelos schemas compartilhados DEVE ser equivalente
  à atual: mesmas normalizações, limites, formatos e rejeição de campos
  desconhecidos.

**Sem regressão**

- **FR-010**: Rotas, métodos, status HTTP, códigos de erro, corpos de resposta,
  cookies, cabeçalhos de segurança, eventos de auditoria e e-mails da Fase 001 NÃO
  DEVEM mudar.
- **FR-011**: As garantias da Fase 001 DEVEM continuar valendo e sendo verificadas
  pelos testes existentes, entre elas (critérios da spec 001): anti-enumeração
  (001/SC-006), revogação de sessão (001/SC-007), ausência de segredos em logs
  (001/SC-005), auditoria (001/SC-008), tempo de login (001/SC-009), acessibilidade
  (001/SC-012) e rastreabilidade (001/SC-010).
- **FR-012**: Os textos exibidos nas telas (rótulos, instruções, mensagens de sucesso
  e de erro) DEVEM permanecer idênticos aos atuais.
- **FR-013**: O web DEVE exibir mensagens de erro a partir do seu próprio catálogo de
  textos indexado pelo código de erro do contrato, com os mesmos textos de hoje, e
  uma mensagem genérica para códigos desconhecidos.
- **FR-014**: Esta feature NÃO DEVE criar rotas, alterar o esquema do banco de dados,
  criar migrations nem introduzir entidades do domínio acadêmico.

**Interface e padrões do frontend**

- **FR-020**: As 11 telas da Fase 001, a navegação e a página inicial DEVEM usar a
  biblioteca de componentes, o sistema de estilos e o pacote de ícones oficiais da
  Constituição v2.1.0.
- **FR-029**: A aparência da Fase 001 DEVE ser preservada: as mesmas cores de tema
  claro e escuro, com os contrastes AA já verificados, aplicadas aos novos
  componentes.
- **FR-021**: As telas DEVEM manter WCAG 2.2 AA (001/FR-075): navegação
  completa por teclado com foco visível, rótulos associados, resumo de erros que
  recebe o foco, erros vinculados aos campos e anunciados, contraste AA em tema claro
  e escuro.
- **FR-022**: Todos os formulários DEVEM usar a solução oficial de formulários,
  validando com os schemas do pacote de contratos, e continuar impedindo envio
  duplicado.
- **FR-023**: Dados do servidor exibidos em telas interativas DEVEM ser obtidos e
  atualizados pela camada oficial de estado do servidor; após cada ação, as listas
  afetadas DEVEM refletir o novo estado sem recarregar a página.
- **FR-024**: O cache de dados do servidor DEVE ser descartado no logout, no "sair de
  todos os dispositivos" e ao receber `401`.
- **FR-025**: Chamadas à API DEVEM ficar na camada `api` de cada feature do web
  (`apps/web/features/<feature>/api`); uma regra de lint DEVE impedir que componentes
  chamem a API diretamente.
- **FR-026**: O código do web DEVE ser reorganizado por feature
  (`apps/web/features/<feature>/…`), com `app/` contendo apenas rotas que compõem as
  features.
- **FR-027**: Tokens recebidos por URL NÃO DEVEM ser gravados em cache persistente ou
  armazenamento do navegador.
- **FR-028**: Esta feature NÃO DEVE adotar a biblioteca de estado global de cliente:
  a Fase 001 não tem estado global de cliente que a justifique (Constituição,
  Princípio IX).

**Testes ponta a ponta**

- **FR-030**: DEVE existir uma suíte de testes E2E em navegador real, executada contra
  API, banco e caixa de e-mail de desenvolvimento reais, cobrindo as jornadas do
  cenário US5-1, a jornada de cadastro só com teclado (US5-2) e a troca de usuário no
  mesmo navegador (US5-3).
- **FR-031**: A suíte E2E DEVE usar um banco isolado do banco de desenvolvimento e
  começar de um estado conhecido a cada execução.
- **FR-032**: A suíte E2E DEVE rodar localmente por um comando documentado no
  quickstart desta feature; ela não entra na integração contínua nesta feature.

**Integração contínua**

- **FR-035**: DEVE existir uma pipeline de integração contínua, disparada em push e
  em pull request, que execute lint, verificação de tipos, build e os testes
  automatizados da API e do web, e falhe se qualquer etapa falhar.
- **FR-036**: Os testes da API na integração contínua DEVEM rodar contra um banco
  PostgreSQL provisionado na própria execução, com as mesmas proteções de hoje (só
  rodam em ambiente de teste e em banco cujo nome indique teste).
- **FR-037**: A pipeline NÃO DEVE depender de segredos reais; toda configuração
  necessária aos testes vem de valores de exemplo não sensíveis.

**Limpeza e governança**

- **FR-040**: O pacote de componentes do starter (`packages/ui`) DEVE ser removido, e
  os componentes de formulário próprios da Fase 001 DEVEM ser substituídos pelos
  oficiais; não DEVE restar código morto da estrutura antiga.
- **FR-041**: Cada dependência direta nova DEVE ser registrada no documento de
  dependências com licença, justificativa e resultado da auditoria de
  vulnerabilidades.
- **FR-042**: `README.md`, `CLAUDE.md` e o quickstart DEVEM refletir a nova estrutura
  e os novos comandos.

### Security, Permissions & Audit *(mandatory if feature has protected operations)*

- **Permissions**: nenhuma permissão nova ou alterada; a matriz da Fase 001
  (`specs/001-foundation-identity-access/contracts/permissions.md`) continua valendo e
  continua verificada pelos testes de autorização.
- **Resource context**: inalterado (regras 403 × 404 da Fase 001).
- **Audit events**: nenhum evento novo; os 29 tipos da Fase 001 continuam emitidos
  como hoje.
- **Untrusted input**: toda entrada continua validada na API, agora com os schemas do
  contrato; a validação no web é só UX (Princípio I). Campos desconhecidos continuam
  rejeitados com `400`.
- **States & transitions**: nenhum estado novo; os estados da Fase 001 passam a ter
  seus valores públicos definidos no contrato.
- **Idempotency**: envio duplicado de formulário continua bloqueado no web; as
  garantias de idempotência da API não mudam.
- **Evidence vs. decisions**: N/A.
- **Automation risk level**: N/A (sem automação nem IA).
- **Domain configurability**: N/A (sem domínio acadêmico).
- **Sensitive data & adaptations**: cache de dados do servidor descartado ao sair ou
  receber `401`; tokens de URL nunca persistidos no navegador.
- **Curricular traceability**: N/A.

### Key Entities *(include if feature involves data)*

- **Contrato**: descrição única de uma entrada ou saída da API (forma, tipos, limites,
  normalização), usada pela API para validar e pelo web para tipar e validar
  formulários.
- **Catálogo de códigos de erro**: lista pública dos códigos que a API pode devolver,
  parte do contrato.
- **Catálogo de mensagens do web**: textos em português associados a cada código de
  erro e a cada estado de tela; pertence ao web, não ao contrato.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% dos testes automatizados da Fase 001 passam após a migração, sem
  mudança no que verificam (status, códigos, corpos, efeitos, auditoria).
- **SC-002**: 100% das rotas da API da Fase 001 têm entradas e respostas descritas uma
  única vez no pacote de contratos, e 0 definições equivalentes fora dele, verificado
  por teste de guarda.
- **SC-003**: Nos 6 casos do roteiro (renomear, remover e trocar o tipo de um campo,
  num contrato de requisição e num de resposta), a verificação de tipos do monorepo
  falha no lado que ainda usa a forma antiga; 6 de 6 casos falham como esperado.
- **SC-004**: 0 diferenças nos textos exibidos nas 11 telas em relação à Fase 001,
  medidas por três verificações: os testes de tela da Fase 001 passam sem mudar os
  textos que consultam (rótulos, títulos, mensagens); a tabela de mensagens de erro do
  web confere os textos de todos os códigos; e o roteiro manual do quickstart percorre
  as 11 telas.
- **SC-005**: 0 violações de acessibilidade de nível A/AA nas 11 telas, nos estados
  inicial e de erro, e 100% dos fluxos concluíveis apenas com teclado.
- **SC-006**: A suíte E2E cobre as 5 jornadas críticas de US5-1 e passa num ambiente
  limpo seguindo apenas o quickstart, em até 10 minutos.
- **SC-007**: Após logout ou troca de usuário no mesmo navegador, 0 dados do usuário
  anterior visíveis.
- **SC-008**: 0 vulnerabilidades conhecidas de severidade alta ou crítica nas
  dependências de produção, e 100% das dependências diretas novas registradas com
  licença e justificativa.
- **SC-009**: 100% dos pushes e pull requests passam pela integração contínua, e uma
  mudança que quebre lint, tipos, build ou qualquer teste é marcada como falha.

## Assumptions

- A migração não muda comportamento. Qualquer divergência encontrada entre o que a
  API faz e o que a spec da Fase 001 diz é tratada como defeito da Fase 001 e
  corrigida na spec dela primeiro, fora do escopo desta refatoração.
- O número `002` desta spec segue a numeração sequencial de `specs/`; a "Fase 002 —
  Academic Domain" do roadmap terá o próximo número livre.
- Os testes de guarda da Fase 001 (rastreabilidade, cobertura de auditoria, escopo
  do schema) continuam apontando para `specs/001-foundation-identity-access` e
  seguem valendo.
- A biblioteca de estado global de cliente fica fora desta feature (FR-028) e entra
  na primeira spec que precisar dela.
- Os componentes da biblioteca oficial são copiados para o repositório e passam a
  ser código do projeto; as bibliotecas de base que eles usam contam como
  dependências e passam pela auditoria de FR-041.
- A suíte E2E usa a infraestrutura de desenvolvimento já existente (contêineres de
  banco e caixa de e-mail), com um banco próprio.
- A integração contínua roda no serviço do próprio host do repositório (GitHub), que
  já hospeda o código e os pull requests.
- A API continua devolvendo o campo `message` no corpo de erro (formato inalterado);
  o web apenas deixa de depender dele para o texto exibido.
