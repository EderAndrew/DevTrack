# Feature Specification: E-mail Real em Produção

**Feature Branch**: `017-production-email`
**Created**: 2026-10-11
**Status**: Draft
**Input**: User description: "E-mail real em produção (017). Hoje a API envia por SMTP e localmente
usa o Mailpit; em produção o envio passa a ser pelo Resend via SMTP, e mais tarde migramos para o
AWS SES (sa-east-1) só trocando a configuração e o DNS, sem SDK de provedor e sem dependência nova.
Escopo: (1) todos os e-mails — convites de professor e gestor, confirmação de e-mail, redefinição de
senha, ativação do admin e convite de turma — passam por uma fila com novas tentativas, como o envio
do convite de turma da 003; (2) aviso de não entregue: o provedor avisa a API, de forma autenticada,
quando um e-mail volta ou é marcado como spam; o envio fica 'não entregue' e quem convidou vê isso e
pode corrigir e reenviar; um adaptador por provedor (Resend agora, SES depois); (3) todos os modelos
com HTML e texto, com a identidade do DevTrack, sem imagens externas nem rastreamento; (4) documento
de implantação com o Resend, domínio configurável (ainda não temos domínio), SPF, DKIM, DMARC,
variáveis e a migração para o SES. Credenciais nunca em logs, auditoria ou respostas; LGPD: o
provedor é operador dos e-mails dos alunos."

## Contexto: o que já existe e o que muda

O DevTrack já envia e-mails reais por um servidor de envio configurável; no desenvolvimento e nos
testes esse servidor é um capturador local, que não entrega nada a ninguém. Seis e-mails existem:

| E-mail | Quem dispara | Hoje |
|---|---|---|
| Confirmação de e-mail | a própria pessoa (001) | um envio, sem nova tentativa |
| Redefinição de senha | a própria pessoa (001) | um envio, sem nova tentativa |
| Convite de professor | ADMIN ou gestor de cadastros (001) | um envio, sem nova tentativa |
| Convite de gestor de cadastros | ADMIN (001) | um envio, sem nova tentativa |
| Ativação do administrador | operador, pela linha de comando (001) | um envio, sem nova tentativa |
| Convite de turma | professor (003) | fila com novas tentativas e situação visível ao professor |

Só o convite de turma sobrevive a uma falha do servidor de envio: os outros cinco se perdem e deixam
apenas um aviso no log. Nenhum e-mail sabe se chegou: um endereço inexistente ou uma caixa que
marca o DevTrack como spam aparecem como "enviado". Só o convite de turma tem versão visual; os
outros são texto puro.

Esta feature muda isso para a primeira implantação em produção:

- todos os seis e-mails passam pela mesma fila de envio, com novas tentativas e situação registrada;
- o provedor de envio avisa o DevTrack quando um e-mail volta (endereço inexistente ou caixa que
  recusa) ou é marcado como spam, e o envio fica "não entregue";
- quem convidou vê "não entregue" no convite e pode convidar o endereço certo;
- os seis e-mails ganham versão visual com a identidade do DevTrack, mantendo a versão em texto;
- a implantação tem um guia: o provedor inicial (Resend), o domínio de envio, os registros de
  autenticação do domínio, as variáveis e a troca futura para o AWS SES.

O fluxo dos convites (quem convida quem, o que o aceite concede, validade, revogação, contas e
papéis) não muda.

## User Scenarios & Testing *(mandatory)*

Atores: **professor** (convida alunos para a turma), **ADMIN** e **gestor de cadastros** (convidam
professores e gestores), **pessoa** (recebe um e-mail de conta: confirmação, senha, ativação),
**operador** (implanta e configura o sistema) e o **provedor de envio** (sistema externo que entrega
os e-mails e avisa o que aconteceu com eles).

### User Story 1 - Todo e-mail sobrevive a uma falha de envio (Priority: P1)

Quando o servidor de envio está fora do ar ou recusa temporariamente uma mensagem, o DevTrack guarda
o e-mail e tenta de novo, com esperas crescentes, até conseguir ou até desistir. Isso vale para os
seis e-mails, não só para o convite de turma. A pessoa que pediu o e-mail nunca espera pelo envio e
nunca descobre, pela resposta, se o endereço existe.

**Why this priority**: em produção um e-mail perdido é um professor que não consegue entrar ou um
aluno que não recebe a senha. Sem isso, nada mais desta feature importa.

**Independent Test**: com o servidor de envio falhando, pedir uma redefinição de senha e convidar um
professor; conferir que a resposta é a de sempre, que os e-mails ficam pendentes e que saem quando o
servidor volta.

**Acceptance Scenarios**:

1. **Given** o servidor de envio fora do ar, **When** uma pessoa pede a redefinição de senha,
   **Then** a resposta é a mesma de sempre, no mesmo tempo, e o e-mail fica pendente para nova
   tentativa.
2. **Given** um e-mail pendente, **When** o servidor de envio volta, **Then** o e-mail sai na
   próxima tentativa e fica "enviado", uma única vez.
3. **Given** um e-mail que falha em todas as tentativas, **When** a última falha, **Then** o envio
   fica "falhou", ninguém mais tenta, e a falha é registrada sem o conteúdo do e-mail.
4. **Given** o mesmo pedido feito duas vezes seguidas (duplo clique, reenvio da página), **When** os
   envios são processados, **Then** cada pedido gera um envio próprio e nenhum envio sai duas vezes.
5. **Given** um link de uso único (convite, senha, ativação) cujo envio ainda está pendente,
   **When** um novo pedido do mesmo tipo substitui o anterior, **Then** o envio antigo não sai mais
   e só o link novo chega.
6. **Given** um envio pendente de um link que expirou ou foi revogado antes de sair, **When** chega a
   vez dele, **Then** ele não é enviado e fica registrado como descartado.
7. **Given** o convite de turma (003), **When** ele é enviado pela fila desta feature, **Then** o
   professor continua vendo a mesma situação de envio e as mesmas regras de reenvio da 003.

---

### User Story 2 - Quem convidou vê que o convite não foi entregue (Priority: P1)

O provedor avisa o DevTrack quando um e-mail volta ou é marcado como spam. O convite fica "Não
entregue", com o motivo em palavras, para quem convidou: o professor no convite de turma, o ADMIN ou
o gestor nos convites de professor e de gestor. Com isso, quem convidou cancela e convida o endereço
certo, em vez de esperar um aceite que nunca vai acontecer.

**Why this priority**: em produção o erro mais comum de um convite é o e-mail digitado errado;
hoje ele aparece como enviado e o aluno simplesmente nunca entra na turma.

**Independent Test**: convidar um endereço inexistente, simular o aviso do provedor de que o e-mail
voltou e conferir que o convite aparece "Não entregue" para quem convidou, que pode cancelá-lo e
convidar outro endereço.

**Acceptance Scenarios**:

1. **Given** um convite de turma enviado, **When** o provedor avisa que o endereço não existe,
   **Then** o professor vê o convite como "Não entregue — o endereço não existe ou recusou a
   mensagem".
2. **Given** um convite enviado, **When** o provedor avisa que o destinatário marcou o e-mail como
   spam, **Then** quem convidou vê "Não entregue — marcado como spam pelo destinatário".
3. **Given** um convite "Não entregue", **When** quem convidou o cancela e convida outro endereço,
   **Then** o novo convite segue o fluxo normal.
4. **Given** um convite "Não entregue", **When** quem convidou pede "Reenviar" para o mesmo
   endereço, **Then** a interface avisa que o endereço já recusou a mensagem antes de confirmar.
5. **Given** um aviso do provedor sem autenticação válida, **When** ele chega, **Then** é recusado
   e nada muda.
6. **Given** o mesmo aviso do provedor entregue duas vezes, **When** ele chega de novo, **Then** o
   efeito é o da primeira vez e nada é duplicado.
7. **Given** um aviso sobre um e-mail que o DevTrack não reconhece, **When** ele chega, **Then** é
   aceito sem efeito e registrado só como contagem.
8. **Given** um aviso de que um e-mail de conta (confirmação, senha, ativação) voltou, **When** ele
   chega, **Then** o envio fica "não entregue" no registro, mas nada disso aparece para quem pediu
   o e-mail nem muda a resposta dos fluxos públicos (anti-enumeração).
9. **Given** um convite aceito, **When** um aviso atrasado de spam chega depois do aceite, **Then**
   o convite continua aceito; o aviso fica só no registro do envio.

---

### User Story 3 - E-mails com a cara do DevTrack (Priority: P2)

Os seis e-mails chegam com uma versão visual (nome do DevTrack, título, texto, um botão com a ação e
o link escrito por extenso) e com a versão em texto, para quem lê em texto puro. Nenhum e-mail
carrega imagens de fora, rastreamento de abertura ou de clique.

**Why this priority**: e-mail em texto puro de um remetente novo parece golpe, principalmente para
alunos que nunca ouviram falar do DevTrack; melhora a taxa de aceite, mas o sistema funciona sem.

**Independent Test**: disparar cada um dos seis e-mails e conferir que todos têm as duas versões, o
mesmo conteúdo nas duas, o link funcionando nas duas e nenhum recurso externo.

**Acceptance Scenarios**:

1. **Given** qualquer um dos seis e-mails, **When** ele é gerado, **Then** tem a versão visual e a
   versão em texto, com o mesmo assunto, texto, prazo e link.
2. **Given** um nome de turma ou de pessoa com marcação de página (`<script>`, `<img>`), **When** o
   e-mail é gerado, **Then** esse texto aparece como texto, nunca como marcação.
3. **Given** a versão visual, **When** ela é aberta, **Then** não busca nada fora da própria
   mensagem: sem imagens remotas, fontes, folhas de estilo externas ou pixels de rastreamento, e os
   links levam direto ao DevTrack, sem passar por redirecionamento de rastreio.
4. **Given** um leitor de tela ou um cliente de e-mail sem imagens, **When** a versão visual é lida,
   **Then** todo o conteúdo e a ação estão em texto, com o link escrito por extenso.

---

### User Story 4 - Operador coloca o envio em produção e troca de provedor só pela configuração (Priority: P2)

O operador segue um guia para criar a conta no provedor inicial (Resend), autenticar o domínio de
envio, definir o remetente e as credenciais e verificar o primeiro envio. Mais tarde, a troca para o
AWS SES é feita só mudando a configuração e o domínio, sem nova versão do sistema. Em produção, o
sistema recusa iniciar com uma configuração de envio de desenvolvimento.

**Why this priority**: é o que permite a primeira implantação, mas é configuração e documentação; o
comportamento do sistema já é coberto pelas histórias 1 a 3.

**Independent Test**: seguir o guia num ambiente de homologação com o Resend, confirmar a entrega e
a autenticação do domínio num e-mail real, e trocar a configuração para outro provedor compatível
sem alterar o sistema.

**Acceptance Scenarios**:

1. **Given** o guia de implantação, **When** o operador o segue, **Then** sabe quais registros
   publicar no domínio (autenticação do remetente, assinatura e política de rejeição), quais
   variáveis definir e como confirmar que um e-mail chega autenticado.
2. **Given** o ambiente de produção, **When** a configuração de envio aponta para um servidor local,
   sem conexão segura ou sem remetente, **Then** o sistema recusa iniciar com uma mensagem clara.
3. **Given** o sistema enviando pelo Resend, **When** o operador troca a configuração para o AWS SES
   e publica os registros do novo domínio, **Then** os e-mails passam a sair pelo SES sem nova
   versão do sistema, e os pendentes saem pelo novo provedor.
4. **Given** os avisos de não entregue, **When** o provedor muda, **Then** o operador configura o
   aviso do novo provedor seguindo o guia, e as situações dos envios antigos se mantêm.
5. **Given** as credenciais do provedor e do aviso, **When** o sistema registra logs, auditoria ou
   responde a qualquer pedido, **Then** nenhuma credencial aparece.

---

### Edge Cases

- **Provedor lento**: um envio que demora não segura a resposta nem a fila; passado o tempo-limite,
  conta como falha temporária e vai para nova tentativa.
- **Recusa permanente na hora do envio** (endereço malformado aceito antes, domínio inexistente): o
  envio fica "não entregue" sem gastar as novas tentativas.
- **Aviso fora de ordem**: um aviso de "não entregue" que chega antes do registro de "enviado" não
  é perdido nem desfeito pelo "enviado" que chega depois.
- **Aviso de entrega com atraso de dias**: aceito e aplicado ao envio, enquanto ele existir no
  registro.
- **Vários avisos para o mesmo envio** (voltou e depois foi marcado como spam): vale o mais grave, e
  todos ficam no registro do envio.
- **Envio substituído** (convite reenviado): um aviso sobre o envio antigo não muda a situação do
  convite, que segue a do envio mais recente.
- **Fila acumulada depois de uma queda longa**: os envios saem em ordem de criação, respeitando o
  limite de envios por minuto do provedor, e os links já expirados são descartados.
- **Reinício do sistema durante um envio**: um envio interrompido não é perdido e não sai em
  duplicidade por causa do reinício.
- **Ambiente sem provedor de aviso configurado**: os envios funcionam; nada fica "não entregue"
  porque ninguém avisa, e o guia registra isso como configuração incompleta.
- **Endereço com letras maiúsculas ou espaços**: o aviso do provedor é associado ao envio pelo
  identificador da mensagem, não pela comparação do endereço.

## Requirements *(mandatory)*

### Functional Requirements

**Fila de envio (US1)**

- **FR-001**: O sistema DEVE registrar todo e-mail dos seis tipos como um envio na mesma transação
  da operação que o originou; se a operação é desfeita, nenhum envio existe.
- **FR-002**: O envio NUNCA DEVE acontecer no caminho da resposta: a resposta não espera o provedor,
  não muda de conteúdo nem de tempo conforme o envio, e continua idêntica para e-mails existentes e
  inexistentes nos fluxos públicos (001, anti-enumeração).
- **FR-003**: Uma falha temporária DEVE levar a novas tentativas com esperas crescentes, de 1 minuto
  a 6 horas, até 7 tentativas no total (as regras da 003); esgotadas, o envio fica "falhou".
- **FR-004**: Uma recusa permanente na hora do envio DEVE levar o envio a "não entregue" sem novas
  tentativas.
- **FR-005**: Cada envio DEVE sair no máximo uma vez, mesmo com duas instâncias do sistema
  processando a fila, reinícios ou pedidos repetidos.
- **FR-006**: Um envio pendente cujo link expirou, foi revogado ou foi substituído por um novo pedido
  do mesmo tipo e destinatário DEVE ser descartado antes de sair.
- **FR-007**: O convite de turma (003) DEVE passar a usar esta fila mantendo o seu comportamento:
  situação visível ao professor, novo link a cada nova tentativa e substituição do link anterior.
- **FR-008**: A fila DEVE respeitar um limite configurável de envios por minuto e DEVE poder ser
  desligada por configuração (os envios ficam pendentes, nada se perde).
- **FR-009**: O conteúdo do e-mail (com o link de uso único) NÃO DEVE ser guardado na fila: o envio
  guarda o tipo, o destinatário e a referência do que deve ser enviado, e o e-mail é montado na
  hora de sair.

**Aviso de não entregue (US2)**

- **FR-010**: O sistema DEVE receber avisos do provedor sobre cada envio: entregue, voltou
  (permanente), voltou (temporário) e marcado como spam.
- **FR-011**: Todo aviso DEVE ser autenticado com um segredo compartilhado com o provedor; um aviso
  sem autenticação válida, adulterado ou antigo demais DEVE ser recusado sem efeito.
- **FR-012**: Os avisos DEVEM ser idempotentes pelo identificador do aviso do provedor: repetidos,
  produzem o efeito da primeira vez.
- **FR-013**: Um aviso de "voltou (permanente)" ou "marcado como spam" DEVE levar o envio a "não
  entregue" com o motivo; "voltou (temporário)" fica só no registro; "entregue" DEVE levar o envio a
  "entregue".
- **FR-014**: O sistema DEVE aceitar os avisos de mais de um provedor por adaptadores próprios, todos
  convertidos para os mesmos quatro avisos internos; o provedor inicial é o Resend e o seguinte o
  AWS SES.
- **FR-015**: A situação "Não entregue" e o motivo DEVEM aparecer para quem gerencia o convite (o
  professor no convite de turma; ADMIN e gestor nos convites de professor e de gestor), sempre em
  palavras, nunca só por cor.
- **FR-016**: "Reenviar" um convite "Não entregue" para o mesmo endereço DEVE exigir uma confirmação
  que diz que o endereço já recusou a mensagem.
- **FR-017**: Um aviso NUNCA DEVE mudar o estado do convite ou da conta (pendente, aceito, expirado,
  revogado), só a situação do envio.
- **FR-018**: A situação dos envios de e-mails de conta (confirmação, senha, ativação) NÃO DEVE
  aparecer em nenhuma resposta pública nem para a pessoa que pediu o e-mail.

**Modelos dos e-mails (US3)**

- **FR-019**: Os seis e-mails DEVEM ter versão visual e versão em texto, com o mesmo assunto, texto,
  prazo e link.
- **FR-020**: Todo valor variável (nome, turma, código) DEVE ser escapado na versão visual.
- **FR-021**: A versão visual NÃO DEVE carregar nada de fora da mensagem nem conter rastreamento de
  abertura ou de clique; o rastreamento do provedor, quando existir, DEVE estar desligado.
- **FR-022**: Os e-mails DEVEM ser legíveis em leitores de tela, em clientes sem imagens e em
  celular, com o link escrito por extenso e contraste dos tokens do Design System (005).
- **FR-023**: O remetente e o endereço de resposta DEVEM vir da configuração; o nome exibido é
  "DevTrack".

**Implantação e configuração (US4)**

- **FR-024**: O envio DEVE usar o protocolo padrão de envio com conexão segura, configurado só por
  variáveis de ambiente, sem biblioteca de um provedor específico, de modo que trocar de provedor
  seja só trocar a configuração.
- **FR-025**: Em produção, o sistema DEVE recusar iniciar sem conexão segura com o servidor de
  envio, com um servidor local, sem remetente ou sem o segredo dos avisos.
- **FR-026**: Credenciais de envio e de aviso NUNCA DEVEM aparecer em logs, auditoria, respostas ou
  mensagens de erro.
- **FR-027**: O repositório DEVE ter um guia de implantação de e-mail: conta e domínio no Resend,
  registros de autenticação do domínio (SPF, DKIM e DMARC), variáveis, configuração do aviso,
  verificação do primeiro envio, limites do provedor, e a troca para o AWS SES (registros, aviso
  por notificação do SES, saída do modo de testes do SES).
- **FR-028**: O guia DEVE registrar que o provedor é operador dos dados pessoais (endereços e nomes)
  para a LGPD e o que precisa ser formalizado com ele.
- **FR-029**: Desenvolvimento, testes e E2E DEVEM continuar usando o capturador local, sem nenhum
  envio real.

**Fora do escopo (garantias)**

- **FR-030**: Esta feature NÃO DEVE:
  - mudar o fluxo dos convites (quem convida, o que o aceite concede, validade, revogação);
  - enviar e-mails novos (lembretes, notificações de atividades, resumos);
  - enviar e-mail em massa ou importar convites por planilha;
  - receber e-mails (respostas dos destinatários);
  - guardar o conteúdo dos e-mails enviados;
  - bloquear permanentemente um endereço por conta própria (a lista de supressão é a do provedor);
  - usar biblioteca de um provedor específico.

### Security, Permissions & Audit *(mandatory if feature has protected operations)*

- **Permissions**: nenhuma permissão nova. A situação de envio de cada convite aparece para quem já
  pode ver aquele convite: o professor com a permissão de convites da turma (003); ADMIN e gestor
  com as permissões de convites de professor e de gestor (001). O recebimento dos avisos do provedor
  é uma rota pública, autenticada pela assinatura do provedor, não por sessão.
- **Resource context**: o professor só vê a situação dos convites das próprias turmas; um envio de
  e-mail de conta não pertence a nenhum contexto visível.
- **Audit events**: fim definitivo de um envio ("falhou", "não entregue", "descartado"), com o tipo
  do e-mail, o motivo e ids. Nunca o endereço, o nome, o link ou o conteúdo na metadata. Um aviso
  recusado por autenticação vai para o log estruturado e para uma contagem, não para a auditoria
  (research N12: quem forja avisos não pode encher a trilha).
- **Untrusted input**: os avisos do provedor são entrada externa: corpo estrito e de tamanho
  limitado, assinatura verificada antes de qualquer leitura de banco, horário do aviso dentro de uma
  janela, e só os campos conhecidos são usados. Nomes e turmas interpolados nos e-mails são
  escapados.
- **States & transitions**: envio `PENDENTE → ENVIADO → (ENTREGUE | NÃO ENTREGUE)`,
  `PENDENTE → (FALHOU | NÃO ENTREGUE | DESCARTADO | SUBSTITUÍDO)`; `ENTREGUE → NÃO ENTREGUE` só por
  spam. Transições inválidas são recusadas.
- **Idempotency**: cada envio sai no máximo uma vez (reserva do envio pela fila); cada aviso do
  provedor tem efeito uma vez (identificador do aviso).
- **Evidence vs. decisions**: a situação do envio é um FATO informado pelo provedor; quem decide
  cancelar ou reenviar um convite é a pessoa (HUMAN_DECISION). Nenhuma decisão automática muda um
  convite.
- **Automation risk level**: N/A (sem IA).
- **Domain configurability**: provedor, remetente, domínio, limites e tempos são configuração; nada
  de provedor no código das regras.
- **Sensitive data & adaptations**: endereços e nomes são dados pessoais tratados pelo provedor
  (operador, LGPD); nenhum dado de necessidades individuais vai em e-mail.
- **Curricular traceability**: N/A.

### Key Entities *(include if feature involves data)*

- **Envio de e-mail**: um e-mail a sair ou que saiu; tipo (um dos seis), destinatário, referência
  do que é enviado (convite, pedido de senha, confirmação, ativação), situação, tentativas, próxima
  tentativa, último código de erro, identificador da mensagem no provedor, datas de envio e de
  entrega, motivo de não entrega. Substitui, para o convite de turma, o envio próprio da 003.
- **Aviso do provedor**: um aviso recebido; identificador do aviso, provedor, tipo interno
  (entregue, voltou permanente, voltou temporário, spam), envio a que se refere, data do aviso e data
  do recebimento. Nunca o corpo bruto do aviso.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Com o servidor de envio fora do ar por até 6 horas, 100% dos e-mails pedidos nesse
  período chegam depois que ele volta, e nenhum sai duas vezes.
- **SC-002**: Em 100% dos testes, a resposta de um fluxo público (confirmação, senha) é idêntica, em
  conteúdo e em tempo, com o servidor de envio no ar, fora do ar ou lento, e para endereços
  existentes ou não.
- **SC-003**: Quem convidou vê um convite "Não entregue" em até 1 minuto depois do aviso do
  provedor.
- **SC-004**: 100% dos avisos sem autenticação válida são recusados sem efeito, e 100% dos avisos
  repetidos produzem um único efeito.
- **SC-005**: Os seis e-mails passam numa verificação automática: versão visual e em texto com o
  mesmo conteúdo, zero recursos externos, zero rastreamento, valores escapados.
- **SC-006**: A troca do Resend para o AWS SES num ambiente de homologação é feita só com
  configuração e registros de domínio, sem nova versão do sistema, seguindo o guia.
- **SC-007**: 0 credenciais e 0 conteúdos de e-mail (links, nomes, endereços) em logs, auditoria ou
  respostas, verificados pela varredura automática de vazamentos.
- **SC-008**: Os e-mails enviados em homologação chegam autenticados (remetente e assinatura
  válidos e política do domínio aplicada) e não caem no spam das caixas de teste dos principais
  provedores de e-mail.

## Assumptions

- O provedor inicial é o Resend e o seguinte o AWS SES (região de São Paulo); ambos aceitam o
  protocolo padrão de envio, e os dois avisam o que aconteceu com cada mensagem de forma
  autenticada (o Resend por chamadas assinadas, o SES por notificações assinadas).
- Ainda não há domínio do DevTrack: domínio, remetente e endereço de resposta são configuração, e o
  guia lista os registros a publicar quando o domínio existir.
- O volume esperado na primeira implantação é baixo (centenas de e-mails por dia, picos no início do
  semestre com convites de turmas inteiras), dentro do plano inicial do provedor.
- A lista de supressão (endereços que voltaram ou reclamaram) é mantida pelo provedor; o DevTrack
  mostra a situação, mas não bloqueia endereços por conta própria.
- As regras de novas tentativas da 003 (7 tentativas, de 1 minuto a 6 horas) valem para todos os
  e-mails.
- Os tokens dos links continuam guardados só como hash; o link é montado no momento do envio, como
  o convite de turma já faz, o que permite descartar envios de links expirados ou revogados.
- O processamento da fila continua dentro do próprio sistema, como na 003 (sem serviço de filas
  externo).
- A versão visual usa só elementos e estilos aceitos pelos clientes de e-mail comuns, com as cores
  dos tokens do Design System escritas na própria mensagem.
- O formulário de "corrigir o e-mail" de um convite é o caminho que já existe: cancelar o convite e
  convidar o endereço certo.
