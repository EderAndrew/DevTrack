# Feature Specification: 001 — Foundation, Identity & Access

**Feature Branch**: `001-foundation-identity-access`
**Created**: 2026-09-21
**Status**: Draft
**Input**: User description: "Crie a especificação da feature '001 — Foundation, Identity & Access': fundação de identidade, autenticação, autorização e provisionamento de usuários — identidade única multi-papel, sessões, verificação de e-mail, RBAC, provisionamento controlado de MANAGER e TEACHER, autocadastro de STUDENT e bootstrap do primeiro ADMIN, seguindo a Constitution v2.0.0 e sem domínio acadêmico."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Aluno cria a própria conta e verifica o e-mail (Priority: P1)

Um visitante cria sua conta informando nome, e-mail e senha. O sistema cria uma
identidade única com o papel `STUDENT` e envia um link de verificação para o
e-mail. Depois de verificar, o aluno passa a ter acesso normal às funcionalidades
autenticadas.

**Why this priority**: é o fluxo de maior volume (dezenas de alunos por turma) e o
que elimina o cadastro manual de alunos pelo professor. Também é a principal
superfície pública de ataque (elevação de privilégio e enumeração de usuários).

**Independent Test**: criar uma conta pelo fluxo público, confirmar que ela tem
somente `STUDENT`, que o acesso fica restrito até a verificação e que, após
verificar o e-mail, o acesso normal é liberado.

**Acceptance Scenarios**:

1. **Given** um visitante sem conta, **When** ele se cadastra com nome, e-mail e senha
   válidos, **Then** é criado um `User` com apenas o papel `STUDENT`, e-mail não
   verificado, e um link de verificação é enviado.
2. **Given** um cadastro público que inclui campos como `role: "TEACHER"`,
   `roles`, `permissions` ou `isAdmin`, **When** a requisição é processada, **Then**
   esses campos são ignorados ou a requisição é rejeitada, e a conta resultante (se
   criada) tem somente `STUDENT`.
3. **Given** um aluno com e-mail não verificado, **When** ele tenta usar uma
   funcionalidade que exige identidade verificada, **Then** o acesso é negado e ele
   só pode verificar o e-mail, pedir reenvio da verificação ou sair.
4. **Given** um link de verificação válido, **When** o aluno o abre, **Then** o
   e-mail passa a verificado; **When** o mesmo link é usado de novo, **Then** nada
   muda e nenhum efeito adicional ocorre.
5. **Given** um link de verificação expirado, adulterado ou já substituído por um
   reenvio, **When** ele é usado, **Then** a verificação falha e o aluno pode pedir
   um novo link.
6. **Given** um e-mail que já pertence a uma conta, **When** alguém tenta se
   cadastrar com ele (inclusive variando maiúsculas/minúsculas ou espaços), **Then**
   nenhuma nova conta é criada e a resposta pública é idêntica à de um cadastro bem
   sucedido, sem revelar que a conta já existe.
7. **Given** dois cadastros simultâneos com o mesmo e-mail, **When** ambos são
   processados, **Then** existe no máximo um `User` para esse e-mail.

---

### User Story 2 - Usuário autentica e gerencia suas sessões (Priority: P1)

Qualquer usuário (ADMIN, MANAGER, TEACHER ou STUDENT) entra com e-mail e senha,
recebe uma sessão, pode sair da sessão atual, listar e revogar as próprias sessões
ou encerrar todas ("sair de todos os dispositivos").

**Why this priority**: toda outra funcionalidade depende de autenticação e de
sessões revogáveis; eventos de segurança (troca de senha, desativação, tomada de
conta) dependem de conseguir invalidar sessões.

**Independent Test**: autenticar com credenciais válidas e inválidas, usar a sessão
em uma operação protegida, sair e confirmar que a sessão não funciona mais; abrir
duas sessões, revogar uma pelo identificador, encerrar todas e confirmar que nenhuma
funciona; tentar revogar sessão de outro usuário e confirmar 404.

**Acceptance Scenarios**:

1. **Given** um usuário ativo com credenciais corretas, **When** ele se autentica,
   **Then** uma nova sessão é criada e operações protegidas passam a ser
   autorizadas conforme suas permissões.
2. **Given** e-mail inexistente ou senha incorreta, **When** alguém tenta se
   autenticar, **Then** a resposta é a mesma nos dois casos (sem indicar qual campo
   está errado) e nenhuma sessão é criada.
3. **Given** tentativas repetidas de autenticação falhas para o mesmo e-mail a partir
   da mesma origem, **When** o limite é atingido, **Then** novas tentativas dessa
   combinação e-mail + origem são bloqueadas até o fim da janela, e as falhas por
   e-mail em várias origens recebem atraso progressivo e geram alerta de auditoria.
4. **Given** um atacante que esgotou o limite de tentativas contra o e-mail de uma
   pessoa a partir da origem dele, **When** a pessoa legítima se autentica com a
   senha correta a partir de outra origem, **Then** a autenticação é bem sucedida — o
   atacante não consegue bloquear a conta de terceiros.
5. **Given** uma sessão ativa, **When** o usuário sai, **Then** aquela sessão deixa
   de ser aceita imediatamente e as demais continuam válidas.
6. **Given** várias sessões ativas, **When** o usuário escolhe sair de todos os
   dispositivos, **Then** todas as sessões, incluindo a atual, deixam de ser
   aceitas.
7. **Given** várias sessões ativas, **When** o usuário lista as próprias sessões e
   revoga uma específica, **Then** apenas aquela sessão deixa de ser aceita.
8. **Given** o identificador público de uma sessão de **outro** usuário, **When**
   alguém tenta revogá-la ou consultá-la, **Then** recebe 404 e a sessão continua
   intacta.
9. **Given** uma sessão expirada ou revogada, **When** ela é usada, **Then** a
   operação é negada como não autenticada.
10. **Given** um usuário com conta suspensa, **When** ele tenta se autenticar ou usar
    uma sessão existente, **Then** o acesso é negado.

---

### User Story 3 - Bootstrap seguro do primeiro ADMIN (Priority: P1)

Na primeira instalação, o operador executa um comando administrativo no ambiente do
backend, informando um e-mail. Se ainda não houver `ADMIN` válido, o sistema cria ou
localiza a identidade desse e-mail e o torna `ADMIN`, sem senha padrão. Depois disso,
o bootstrap se recusa a rodar novamente.

**Why this priority**: sem um `ADMIN` inicial nenhum `MANAGER` ou `TEACHER` pode ser
provisionado; e um bootstrap inseguro compromete toda a plataforma.

**Independent Test**: em uma base sem `ADMIN`, executar o bootstrap, concluir a
ativação e confirmar o acesso administrativo; executar novamente e confirmar a
recusa; confirmar que não existe nenhuma operação pública que produza `ADMIN`.

**Acceptance Scenarios**:

1. **Given** uma base sem `ADMIN` ativo, **When** o operador executa o bootstrap com
   um e-mail sem conta, **Then** é criado um `User` com o papel `ADMIN` pendente de
   ativação e é emitido um link de ativação de uso único, enviado por e-mail, pelo
   qual a própria pessoa define sua senha; nenhuma senha padrão é gerada.
2. **Given** o mesmo cenário, **When** o operador solicita explicitamente a exibição
   do link no terminal (opção dedicada do comando), **Then** o link também é exibido
   ao operador e o uso dessa opção é registrado na auditoria; sem a opção, o link
   nunca é exibido.
3. **Given** uma base sem `ADMIN` ativo e um e-mail que já pertence a um `User`
   verificado, **When** o bootstrap é executado, **Then** o papel `ADMIN` é
   acrescentado a esse mesmo `User`, sem criar outro e sem alterar sua senha.
4. **Given** um e-mail que pertence a um `User` não verificado, **When** o bootstrap
   é executado, **Then** o papel `ADMIN` só é concedido depois da prova de posse do
   e-mail pelo link de ativação, com redefinição de senha e revogação de todas as
   sessões anteriores dessa conta.
5. **Given** que já existe um `ADMIN` ativo, **When** o bootstrap é executado,
   **Then** ele falha com a mensagem "Bootstrap administrativo já realizado" e
   nenhum papel é atribuído.
6. **Given** duas execuções simultâneas do bootstrap em uma base sem `ADMIN`,
   **When** ambas são processadas, **Then** no máximo uma resulta em `ADMIN`
   pendente ou ativo.
7. **Given** um bootstrap pendente (link ainda não usado, válido ou expirado) e
   nenhum `ADMIN` ativo, **When** o operador executa o bootstrap novamente (com o
   mesmo ou outro e-mail), **Then** o bootstrap pendente anterior é cancelado — seu
   link deixa de funcionar e o `ADMIN` pendente é removido da identidade anterior —,
   um novo bootstrap pendente é criado e ambos os eventos são auditados; nunca
   existem dois `ADMIN`s pendentes.
8. **Given** qualquer requisição pública (cadastro, ativação, verificação, convite),
   **When** ela tenta criar ou promover alguém a `ADMIN`, **Then** nenhuma
   atribuição de `ADMIN` ocorre.
9. **Given** um bootstrap concluído, **When** a trilha de auditoria é consultada,
   **Then** existe o registro do bootstrap (e-mail alvo, data/hora, origem
   operacional), sem senha ou token.

---

### User Story 4 - ADMIN provisiona MANAGER (Priority: P2)

O `ADMIN` convida uma pessoa para ser `MANAGER`. A pessoa aceita o convite e define a
própria senha. O `ADMIN` pode desativar e reativar `MANAGER`s.

**Why this priority**: `MANAGER` é a barreira que controla quem pode ser professor;
é pré-requisito para o provisionamento de `TEACHER` (exceto quando o próprio `ADMIN`
acumula a função).

**Independent Test**: com um `ADMIN`, convidar um `MANAGER`, aceitar o convite,
confirmar as capacidades do `MANAGER`; tentar provisionar `MANAGER` com usuários sem
permissão e confirmar a negação.

**Acceptance Scenarios**:

1. **Given** um `ADMIN` autenticado, **When** ele convida um e-mail para `MANAGER`,
   **Then** é criado um convite pendente vinculado a esse e-mail e o evento é
   auditado.
2. **Given** um convite de `MANAGER` válido, **When** a pessoa o aceita, **Then** ela
   recebe o papel `MANAGER` na identidade correspondente ao e-mail convidado,
   seguindo as mesmas regras de identidade única e proteção contra tomada de conta
   da User Story 6.
3. **Given** um `MANAGER`, `TEACHER` ou `STUDENT`, **When** ele tenta provisionar um
   `MANAGER`, **Then** recebe negação por falta de capacidade (403).
4. **Given** um `ADMIN`, **When** ele desativa um `MANAGER`, **Then** as sessões
   desse `MANAGER` são revogadas, ele perde as capacidades de `MANAGER` e seu
   histórico (convites emitidos, auditoria) é preservado.
5. **Given** um `ADMIN`, **When** ele tenta remover ou desativar o último `ADMIN`
   ativo (inclusive a si mesmo), **Then** a operação é recusada.
6. **Given** um `ADMIN`, **When** ele tenta convidar o próprio e-mail para
   `MANAGER`, **Then** o convite é recusado (autoconvite) e a tentativa é auditada.

---

### User Story 5 - MANAGER convida professor (Priority: P2)

O `MANAGER` cadastra um professor (nome e e-mail) e envia um convite. Ele pode
consultar o status cadastral, reenviar ou revogar convites pendentes e ativar ou
desativar professores. Ele não enxerga nada sobre alunos ou dados pedagógicos.

**Why this priority**: é o único caminho legítimo para existir um `TEACHER`.

**Independent Test**: com um `MANAGER`, criar convite, reenviar (o link anterior
deixa de funcionar), revogar, consultar status; tentar qualquer operação sobre dados
de alunos e confirmar 403.

**Acceptance Scenarios**:

1. **Given** um `MANAGER` autenticado, **When** ele cria um convite de professor para
   um e-mail, **Then** o convite fica pendente, vinculado ao e-mail, com validade
   limitada, e o professor aparece com status `INVITED`.
2. **Given** um convite pendente, **When** o `MANAGER` reenvia o convite, **Then** um
   novo link é emitido, o link anterior deixa de funcionar e a validade é renovada.
3. **Given** um convite pendente, **When** o `MANAGER` o revoga, **Then** o link deixa
   de funcionar e o convite fica com status revogado.
4. **Given** um e-mail que pertence a um aluno, **When** o `MANAGER` cria um convite
   para ele, **Then** a resposta ao `MANAGER` é idêntica à de um e-mail sem conta,
   sem revelar que existe um aluno com esse e-mail.
5. **Given** um `MANAGER` autenticado, **When** ele chama a consulta administrativa
   de contas de usuário (que inclui contas de alunos, FR-056), a consulta de um aluno
   específico ou qualquer operação que exija capacidade que não possui, **Then**
   recebe negação explícita (403 Forbidden), nunca uma lista vazia.
6. **Given** um professor ativo, **When** o `MANAGER` o desativa, **Then** o professor
   perde as capacidades de `TEACHER`, as sessões são revogadas, e identidade,
   perfil e histórico permanecem; se a mesma identidade também for `STUDENT`, as
   capacidades de aluno continuam intactas.
7. **Given** um professor desativado, **When** o `MANAGER` o reativa, **Then** as
   capacidades de `TEACHER` voltam, sem criar nova identidade ou novo perfil.
8. **Given** um `MANAGER`, **When** ele tenta suspender ou alterar a conta (`User`) de
   uma pessoa, alterar sua senha ou atribuir papéis diferentes de `TEACHER`,
   **Then** a operação é negada (403).
9. **Given** um `MANAGER`, **When** ele cria um convite de professor para o próprio
   e-mail, **Then** o convite é recusado (autoconvite) e a tentativa é auditada;
   **And** se um convite com o e-mail do emissor existir por qualquer outro motivo,
   o aceite pelo próprio emissor é recusado — um `MANAGER` nunca se torna `TEACHER`
   por convite próprio.
10. **Given** um professor que também é `STUDENT`, **When** o `MANAGER` consulta o
    cadastro dele, **Then** vê apenas os dados cadastrais docentes (nome, e-mail,
    status do papel `TEACHER`, convites), sem qualquer indicação de outros papéis.
11. **Given** um convite criado, **When** o armazenamento é inspecionado, **Then** o
    token do convite não aparece em nenhuma forma recuperável — apenas seu hash —, e
    o mesmo vale para tokens de verificação, ativação, redefinição e sessão.
12. **Given** um e-mail cujo papel `TEACHER` está suspenso ou inativo, **When** o
    `MANAGER` tenta criar um novo convite para ele, **Then** a criação é recusada com
    orientação para usar a reativação.

---

### User Story 6 - Pessoa aceita convite de professor com identidade única (Priority: P2)

A pessoa convidada abre o link. Se o e-mail ainda não tem conta, ela define sua
senha e passa a ser `TEACHER`. Se já tem conta verificada, ela se autentica nela e
recebe `TEACHER` além dos papéis que já tinha. Se tem conta não verificada, ela
assume a conta com segurança, provando posse do e-mail.

**Why this priority**: concentra os riscos mais graves da feature — duplicação de
identidade, tomada de conta e replay de convite.

**Independent Test**: exercitar os três ramos (e-mail novo, conta verificada, conta
não verificada), aceitar o mesmo convite duas vezes, aceitar com a conta errada, e
aceitar em paralelo, conferindo que não há duplicação nem tomada de conta.

**Acceptance Scenarios**:

1. **Given** um convite válido para e-mail sem conta, **When** a pessoa define a
   senha, **Then** é criado um `User` com e-mail verificado, papel `TEACHER` e
   `TeacherProfile`, e o convite passa a aceito.
2. **Given** um convite válido para e-mail de um `User` verificado com `STUDENT`,
   **When** a pessoa se autentica nessa conta e aceita, **Then** o mesmo `User` passa
   a ter `STUDENT` e `TEACHER`, é criado um `TeacherProfile`, e a senha não muda.
3. **Given** um convite para e-mail de um `User` verificado, **When** alguém tenta
   aceitá-lo sem autenticar ou autenticado em outra conta, **Then** a aceitação é
   recusada e nenhum papel é atribuído a nenhuma conta.
4. **Given** um convite para e-mail de um `User` não verificado, **When** a pessoa
   aceita pelo link (prova de posse do e-mail) e define uma nova senha, **Then** o
   mesmo `User` é mantido, o e-mail passa a verificado, todas as sessões anteriores
   dessa conta são revogadas, e `TEACHER` e `TeacherProfile` são adicionados.
5. **Given** um convite já aceito, **When** o link é usado de novo (replay), **Then**
   nenhum `User`, `TeacherProfile` ou atribuição de papel adicional é criado, e o
   estado permanece consistente.
6. **Given** duas aceitações simultâneas do mesmo convite, **When** ambas são
   processadas, **Then** o resultado é um único `User`, um único `TeacherProfile` e
   uma única atribuição de `TEACHER`.
7. **Given** um convite expirado, revogado, substituído por reenvio ou com token
   adulterado, **When** ele é usado, **Then** a aceitação é recusada sem revelar
   dados da conta.
8. **Given** um convite válido, **When** a requisição de aceitação tenta indicar
   outro e-mail, **Then** o papel só pode ser atribuído à identidade do e-mail
   convidado.
9. **Given** um convite para e-mail de `User` verificado, **When** a aceitação é
   enviada com um campo de nova senha, **Then** esse campo é ignorado e a senha
   existente continua sendo a única válida.
10. **Given** um atacante que pré-registrou uma conta não verificada com o e-mail de
    um professor e está com sessão aberta, **When** o dono real do e-mail aceita o
    convite e define sua senha, **Then** as sessões do atacante são revogadas, a
    senha escolhida pelo atacante deixa de funcionar e a conta passa a pertencer a
    quem controla o e-mail, com o evento auditado.

---

### User Story 7 - Autorização por capacidade e contexto no backend (Priority: P2)

Todas as operações protegidas verificam no backend a autenticação, a permissão
explícita e, quando aplicável, o contexto do recurso. A arquitetura suporta a
distinção entre "não tem a capacidade" (403) e "tem a capacidade, mas o recurso não é
do seu contexto" (404), embora recursos com contexto acadêmico só surjam na
Spec 002.

**Why this priority**: é a garantia transversal de que nenhum fluxo acima pode ser
contornado chamando a API diretamente.

**Independent Test**: para cada operação protegida, chamar a API diretamente com
cada papel e sem sessão, confirmando 401/403 conforme a matriz de permissões;
exercitar a checagem de contexto com sessões de outro usuário (404).

**Acceptance Scenarios**:

1. **Given** uma operação protegida, **When** chamada sem sessão válida, **Then** é
   negada como não autenticada.
2. **Given** um usuário autenticado sem a permissão exigida, **When** chama a
   operação diretamente (sem passar pela interface), **Then** recebe 403.
3. **Given** um usuário com a capacidade geral para um tipo de recurso (ex.:
   revogar as próprias sessões), **When** tenta acessar um recurso fora do seu
   contexto autorizado (ex.: sessão de outro usuário), **Then** recebe 404, sem
   revelar a existência do recurso.
4. **Given** um usuário com múltiplos papéis, **When** chama uma operação, **Then**
   suas permissões efetivas são a união das permissões dos papéis ativos que possui.
5. **Given** a atribuição ou remoção de um papel, **When** ela ocorre, **Then** as
   permissões efetivas do usuário mudam a partir da próxima requisição, sem exigir
   novo login.

---

### User Story 8 - Usuário recupera o acesso com "esqueci minha senha" (Priority: P2)

Um usuário que esqueceu a senha informa seu e-mail e recebe um link de uso único
para definir uma nova senha. Ao concluir, todas as sessões anteriores são encerradas.

**Why this priority**: sem recuperação, quem esquece a senha fica permanentemente
sem acesso; o fluxo reaproveita tokens de uso único, envio de e-mail e revogação de
sessões já exigidos por esta feature.

**Independent Test**: pedir recuperação para e-mail existente e inexistente
(respostas idênticas), usar o link para definir nova senha, confirmar que sessões
antigas foram revogadas e que a nova senha funciona; reutilizar o link e confirmar
recusa.

**Acceptance Scenarios**:

1. **Given** qualquer e-mail, **When** alguém solicita recuperação de senha, **Then** a
   resposta pública é sempre a mesma, exista ou não conta para esse e-mail; se
   existir, um link de redefinição é enviado para ele.
2. **Given** um link de redefinição válido, **When** o usuário define uma nova senha
   válida, **Then** a senha é substituída, todas as sessões anteriores do usuário são
   revogadas e o evento é auditado.
3. **Given** uma conta com e-mail ainda não verificado, **When** a redefinição é
   concluída pelo link enviado ao e-mail, **Then** o e-mail passa a verificado (o
   link comprova a posse).
4. **Given** um link de redefinição já usado, expirado, adulterado ou substituído por
   uma nova solicitação, **When** ele é usado, **Then** a redefinição é recusada.
5. **Given** uma conta suspensa, **When** a senha é redefinida, **Then** a conta
   continua sem acesso; a redefinição não reativa a conta nem concede papéis.
6. **Given** solicitações repetidas de recuperação, **When** o limite é atingido,
   **Then** novas solicitações são temporariamente bloqueadas, com a mesma resposta
   pública.

---

### Edge Cases

- **Replay**: links de verificação, convite, ativação e redefinição reutilizados após
  uso não têm efeito adicional; após aceitação o convite não pode ser reaproveitado.
- **Concorrência**: cadastros simultâneos do mesmo e-mail, aceitações simultâneas do
  mesmo convite e execuções simultâneas do bootstrap produzem um único resultado.
- **Reenvio**: um novo link de verificação ou de convite invalida o anterior.
- **Tokens expirados, inválidos ou adulterados**: sempre recusados, com mensagem
  genérica.
- **Enumeração**: cadastro, login, reenvio de verificação, recuperação de senha e
  aceitação de convite não revelam se um e-mail tem conta; tempos de resposta não
  devem diferir de forma explorável entre e-mail existente e inexistente.
- **Elevação vertical**: nenhum campo de requisição pública ou de atualização do
  próprio perfil concede papel ou permissão; ninguém atribui papel a si mesmo, nem
  diretamente nem por autoconvite.
- **Bloqueio de conta por terceiros**: tentativas falhas de um atacante não impedem
  o dono da conta de se autenticar a partir de outra origem.
- **Elevação horizontal**: um usuário não lê nem altera conta, sessões ou perfil de
  outro usuário sem permissão explícita; `MANAGER` não suspende contas de alunos.
- **Sessões revogadas**: deixam de funcionar imediatamente após logout, "sair de
  todos os dispositivos", redefinição de senha, tomada segura de conta,
  desativação ou suspensão.
- **Contas suspensas**: não autenticam. **Papéis desativados**: deixam de conceder
  permissões sem afetar os demais papéis da identidade; professor suspenso ou inativo
  volta por reativação, não por novo convite.
- **Convite para quem já é `TEACHER`**: a criação é recusada com resposta informativa
  ao `MANAGER` (professores são o escopo cadastral dele) — ativo: já é professor;
  suspenso/inativo: usar reativação.
- **Bootstrap pendente**: nova execução cancela o pendente anterior; nunca há dois
  `ADMIN`s pendentes.
- **Último `ADMIN`**: não pode ser removido, desativado nem ter o papel retirado.
- **Normalização de e-mail**: variações de maiúsculas/minúsculas e espaços nas
  extremidades representam a mesma identidade.
- **Falha no envio de e-mail**: a operação não fica em estado inconsistente; o
  usuário ou o `MANAGER` pode reenviar.

## Requirements *(mandatory)*

### Functional Requirements

**Identidade e papéis**

- **FR-001**: O sistema DEVE representar cada pessoa por um único `User`, identificado
  por e-mail normalizado (sem espaços nas extremidades e sem distinção entre
  maiúsculas e minúsculas), com unicidade garantida também sob concorrência.
- **FR-002**: Um `User` DEVE poder acumular múltiplos papéis simultaneamente; papéis
  NÃO DEVEM ser armazenados como atributo único do `User`.
- **FR-003**: O sistema DEVE suportar os papéis `ADMIN`, `MANAGER`, `TEACHER` e
  `STUDENT`, cada um definido como conjunto de permissões explícitas, e DEVE permitir
  adicionar papéis e permissões no futuro sem alterar a estrutura de `User`.
- **FR-004**: As permissões efetivas de um usuário DEVEM ser a união das permissões
  dos papéis ativos que possui; papéis desativados não concedem permissões.
- **FR-005**: O papel `ADMIN` DEVE incluir, por padrão, as permissões de
  provisionamento de professores (acumulando a função de `MANAGER`). O acesso do
  `ADMIN` a contas é restrito ao nível de identidade (FR-056); ele NÃO DEVE acessar
  dados acadêmicos de alunos.
- **FR-006**: `TeacherProfile` e `StudentProfile` DEVEM existir no máximo uma vez por
  `User` e conter apenas o nome de exibição, sem dados acadêmicos nem status.
- **FR-007**: O status de cada papel de um usuário DEVE ter uma única fonte de
  verdade: a atribuição `UserRole`, com estados `ACTIVE`, `SUSPENDED` e `INACTIVE`. O
  estado `INVITED` de um professor é derivado da existência de convite `PENDING` sem
  atribuição ativa, e não é armazenado em outro lugar.
- **FR-008**: A conta (`User`) DEVE ter status próprio, independente dos papéis:
  `ACTIVE` ou `SUSPENDED`. Conta suspensa não autentica, qualquer que seja o status
  dos papéis.

**Autocadastro e verificação de e-mail**

- **FR-010**: O fluxo público de cadastro DEVE criar exclusivamente `User` com o papel
  `STUDENT` e `StudentProfile`, ignorando ou rejeitando qualquer campo de papel,
  permissão ou equivalente enviado pelo cliente.
- **FR-011**: Senhas DEVEM ter no mínimo 12 e no máximo 128 caracteres e NÃO DEVEM
  constar de uma lista de senhas comuns ou vazadas conhecidas; a validação definitiva
  ocorre no backend.
- **FR-012**: O cadastro com e-mail já existente NÃO DEVE criar nova conta e DEVE
  retornar a mesma resposta pública de um cadastro bem sucedido; o titular do e-mail
  PODE ser notificado por e-mail.
- **FR-013**: O sistema DEVE enviar link de verificação de e-mail com token
  criptograficamente seguro, de uso único, com validade de 24 horas, armazenado
  apenas como hash.
- **FR-014**: Usar um link de verificação válido DEVE marcar o e-mail como
  verificado; reutilizá-lo NÃO DEVE produzir efeito adicional; links expirados,
  inválidos ou substituídos DEVEM ser recusados.
- **FR-015**: O usuário DEVE poder pedir reenvio da verificação; cada reenvio invalida
  o link anterior, é limitado por rate limit e retorna resposta genérica
  independentemente de o e-mail existir.
- **FR-016**: Um usuário com e-mail não verificado DEVE conseguir apenas: verificar o
  e-mail, pedir reenvio, consultar o próprio estado de verificação e encerrar a
  sessão; todas as demais operações autenticadas DEVEM ser negadas.

**Autenticação e sessões**

- **FR-020**: O sistema DEVE autenticar por e-mail e senha, armazenando senhas apenas
  com algoritmo de hashing de senha adaptativo e resistente a força bruta; senhas
  nunca são armazenadas ou registradas em texto puro.
- **FR-021**: Falhas de autenticação DEVEM retornar a mesma resposta para e-mail
  inexistente e senha incorreta.
- **FR-022**: O sistema DEVE aplicar rate limiting a autenticação, cadastro, reenvio
  de verificação, recuperação de senha, aceitação de convite e ativação, com os
  limites: no máximo 5 falhas de autenticação por combinação e-mail + origem em 15
  minutos (bloqueio dessa combinação até o fim da janela); no máximo 20 tentativas
  por origem em 15 minutos; e atraso progressivo, com alerta na auditoria, para
  falhas contra o mesmo e-mail vindas de várias origens. Nenhum limite DEVE impedir
  o dono de uma conta de autenticar-se com a senha correta a partir de uma origem
  não bloqueada.
- **FR-023**: Uma autenticação válida de usuário ativo DEVE criar uma sessão com
  identificador secreto imprevisível, armazenado no servidor apenas como hash.
- **FR-024**: Sessões DEVEM expirar após 8 horas de inatividade e, em qualquer caso,
  7 dias após a criação.
- **FR-025**: O usuário DEVE poder encerrar a sessão atual e encerrar todas as suas
  sessões; sessões encerradas DEVEM deixar de ser aceitas imediatamente.
- **FR-026**: Todas as sessões de um usuário DEVEM ser revogadas quando: ele
  redefinir a senha, sua conta for assumida pelo fluxo seguro de posse de e-mail,
  sua conta for suspensa, ou um papel privilegiado dele (`ADMIN`, `MANAGER`,
  `TEACHER`) for suspenso ou desativado.
- **FR-027**: O usuário DEVE poder listar as próprias sessões ativas (criação, último
  uso, expiração, identificador público não secreto) e revogar uma sessão específica
  pelo identificador público. O identificador público NUNCA é o segredo da sessão.
  Sessões de outro usuário DEVEM responder 404 (FR-061).
- **FR-028**: O estado da sessão DEVE ser decidido exclusivamente pelo servidor.

**Recuperação de senha**

- **FR-029a**: Qualquer pessoa DEVE poder solicitar recuperação de senha informando
  um e-mail; a resposta pública DEVE ser idêntica exista ou não conta para ele.
- **FR-029b**: Se existir conta, o sistema DEVE enviar link de redefinição com token
  criptograficamente seguro, de uso único, válido por 1 hora e armazenado apenas como
  hash; uma nova solicitação invalida o link anterior.
- **FR-029c**: Concluir a redefinição DEVE substituir a senha (validada por FR-011),
  revogar todas as sessões do usuário (FR-026), marcar o e-mail como verificado se
  ainda não estiver, e ser auditado.
- **FR-029d**: A redefinição NÃO DEVE reativar contas suspensas nem alterar papéis
  ou permissões.
- **FR-029e**: Solicitações e conclusões de recuperação DEVEM estar sujeitas ao rate
  limiting de FR-022.

**Bootstrap do primeiro ADMIN**

- **FR-030**: NÃO DEVE existir nenhuma operação pública capaz de criar ou promover
  alguém a `ADMIN`.
- **FR-031**: O primeiro `ADMIN` DEVE ser criado exclusivamente por comando
  administrativo executado no ambiente do backend, que recebe apenas o e-mail alvo.
- **FR-032**: O bootstrap DEVE ser permitido somente quando não existir `ADMIN`
  ativo, DEVE ser atômico sob execuções concorrentes e DEVE recusar execução quando
  já existir `ADMIN` ativo. Nunca pode existir mais de um `ADMIN` pendente de
  bootstrap: uma nova execução cancela o pendente anterior (link invalidado, papel
  pendente removido), com auditoria.
- **FR-033**: O bootstrap NÃO DEVE usar senha padrão, credenciais em código-fonte,
  seed ou variáveis de ambiente, nem ser executado automaticamente na inicialização.
- **FR-034**: Para e-mail sem conta, o bootstrap DEVE criar o `User` com `ADMIN`
  pendente e emitir link de ativação de uso único, com validade de 24 horas e
  armazenado como hash, pelo qual a pessoa define a própria senha e comprova a posse
  do e-mail. O link DEVE ser enviado por e-mail e SÓ PODE ser exibido ao operador
  quando ele usar explicitamente a opção dedicada do comando, com esse uso
  registrado na auditoria.
- **FR-035**: Para e-mail de `User` verificado, o bootstrap DEVE acrescentar `ADMIN`
  ao mesmo `User` sem alterar sua credencial; para `User` não verificado, `ADMIN` só
  é efetivado após prova de posse do e-mail, com redefinição de senha e revogação de
  sessões.
- **FR-036**: O bootstrap DEVE ser auditado.

**Provisionamento de MANAGER e TEACHER (convites)**

- **FR-040**: `ADMIN` DEVE poder convidar pessoas para `MANAGER`; `MANAGER` (e `ADMIN`,
  por FR-005) DEVE poder convidar pessoas para `TEACHER`. Nenhum outro papel pode
  emitir convites.
- **FR-040a**: O emissor NÃO DEVE poder convidar o próprio e-mail, e o aceite de um
  convite pela identidade que o emitiu DEVE ser recusado; ambas as tentativas são
  auditadas.
- **FR-041**: Convites DEVEM ser vinculados ao e-mail convidado e ao papel alvo, ter
  token criptograficamente seguro de uso único armazenado apenas como hash, validade
  de 7 dias, e ciclo de vida explícito: `PENDING`, `ACCEPTED`, `EXPIRED`, `REVOKED`.
- **FR-042**: O emissor DEVE poder reenviar (novo token, validade renovada, token
  anterior invalidado) e revogar convites `PENDING`.
- **FR-043**: A criação de convite NÃO DEVE revelar ao emissor se o e-mail pertence a
  um aluno ou a outro usuário não gerenciado por ele. Para convite de professor a um
  e-mail que já possui o papel `TEACHER`, DEVE recusar com resposta informativa:
  ativo → já é professor; suspenso/inativo → usar reativação.
- **FR-044**: A aceitação de convite DEVE ser transacional e idempotente: nunca cria
  mais de um `User`, `TeacherProfile` ou atribuição do mesmo papel, inclusive sob
  aceitações concorrentes ou repetidas.
- **FR-045**: O papel do convite só pode ser atribuído à identidade do e-mail
  convidado.
- **FR-046**: Aceitação para e-mail sem conta DEVE criar `User` com e-mail verificado
  (o link comprova a posse), senha definida pela própria pessoa, o papel do convite e
  o perfil correspondente.
- **FR-047**: Aceitação para e-mail de `User` verificado DEVE exigir autenticação
  nessa conta; NÃO DEVE redefinir sua senha (qualquer campo de senha enviado é
  ignorado); e DEVE ser recusada se a pessoa estiver autenticada em outra conta.
- **FR-048**: Aceitação para e-mail de `User` não verificado DEVE manter o mesmo
  `User`, exigir definição de nova senha (a senha anterior deixa de funcionar),
  marcar o e-mail como verificado somente após o uso válido do link, revogar todas as
  sessões anteriores da conta e então adicionar o papel e o perfil.
- **FR-049**: Convites expirados, revogados, substituídos, já aceitos ou com token
  inválido DEVEM ser recusados com resposta genérica.

**Escopo e ciclo de vida de papéis**

- **FR-050**: Além das operações sobre a própria conta (sessões, logout, senha),
  `MANAGER` DEVE ter apenas as capacidades: visualizar cadastro e status de
  professores, criar, reenviar e revogar convites de professor, ativar e desativar
  professores. Qualquer outra operação DEVE retornar 403. Ao visualizar um
  professor, o `MANAGER` vê apenas dados cadastrais docentes (nome, e-mail, status do
  papel `TEACHER`, convites), nunca outros papéis ou dados da mesma identidade.
- **FR-051**: O ciclo de vida de professor observado pelo `MANAGER` é `INVITED`,
  `ACTIVE`, `SUSPENDED`, `INACTIVE` (FR-007). Suspender ou desativar um professor
  DEVE remover suas capacidades de `TEACHER` e revogar suas sessões, sem afetar
  outros papéis da mesma identidade (ex.: `STUDENT`); reativar restaura o papel sem
  novo convite, nova identidade ou novo perfil.
- **FR-052**: `ADMIN` DEVE poder desativar e reativar `MANAGER`s e suspender ou
  reativar contas de usuário (FR-008); `MANAGER` NÃO DEVE suspender contas de
  usuário.
- **FR-053**: Desativação e suspensão NÃO DEVEM excluir identidade, perfis, convites,
  auditoria ou qualquer registro associado.
- **FR-054**: O sistema NÃO DEVE permitir remover, desativar ou retirar o papel do
  último `ADMIN` ativo.
- **FR-055**: Nenhum usuário DEVE poder atribuir papéis ou permissões a si mesmo,
  nem diretamente nem por autoconvite (FR-040a).
- **FR-056**: `ADMIN` DEVE dispor de consulta administrativa de contas de usuário
  restrita a dados de identidade (nome de exibição, e-mail, status da conta e papéis),
  para provisionamento e resposta a incidentes, sem qualquer dado acadêmico.
  `MANAGER`, `TEACHER` e `STUDENT` que chamarem essa consulta DEVEM receber 403.

**Autorização**

- **FR-060**: Toda operação protegida DEVE verificar no backend: sessão válida,
  e-mail verificado (salvo FR-016), permissão explícita e, quando aplicável, contexto
  do recurso.
- **FR-061**: Ausência de sessão válida DEVE resultar em 401; ausência da permissão
  exigida DEVE resultar em 403 (ex.: `MANAGER` consultando alunos); recurso fora do
  contexto autorizado de quem tem a capacidade geral DEVE resultar em 404.
- **FR-062**: A verificação de contexto DEVE ser um mecanismo reutilizável pelas specs
  seguintes (turmas, matrículas, avaliações), coberto nesta feature pela revogação e
  consulta de sessões por identificador (sessão de outro usuário → 404).
- **FR-063**: Mudanças de papel DEVEM refletir nas permissões efetivas a partir da
  requisição seguinte.

**Auditoria, logs e erros**

- **FR-070**: O sistema DEVE registrar em trilha de auditoria, separada dos logs
  técnicos: bootstrap (incluindo cancelamento de bootstrap pendente e uso da opção de
  exibição do link no terminal); convites (criação, reenvio, revogação, aceitação,
  recusa, tentativa de autoconvite); atribuição e remoção de papéis; ativação,
  desativação e suspensão; login bem sucedido; bloqueios e alertas de rate limit;
  revogação de sessão individual e "sair de todos os dispositivos"; verificação de
  e-mail; tomada segura de conta não verificada; solicitação e conclusão de
  redefinição de senha.
- **FR-071**: Cada registro de auditoria DEVE conter evento, ator (quando houver),
  alvo, data/hora e identificador da requisição; NUNCA senhas, tokens em texto puro,
  identificadores de sessão, cookies ou secrets.
- **FR-072**: Logs técnicos DEVEM ser estruturados e NUNCA conter senhas, tokens,
  identificadores de sessão, cookies ou secrets.
- **FR-073**: Erros DEVEM seguir o formato consistente da constituição
  (`statusCode`, `code`, `message`) e nunca expor stack traces, consultas ou detalhes
  de infraestrutura.
- **FR-074**: A aplicação DEVE validar configurações obrigatórias na inicialização e
  falhar imediatamente se estiverem ausentes.

**Fora de escopo (guarda)**

- **FR-080**: Esta feature NÃO DEVE criar entidades, telas ou operações do domínio
  acadêmico (disciplinas, ementas, turmas, períodos, matrículas, aulas, questões,
  exercícios, trabalhos, provas, notas, submissões, IA, Code Runner, analytics,
  adaptações).

### Security, Permissions & Audit *(mandatory if feature has protected operations)*

- **Permissions** (iniciais, nomes ilustrativos a confirmar no plano):
  - `ADMIN`: `managers.convidar`, `managers.revogar_convite`, `managers.ativar`,
    `managers.desativar`, `managers.visualizar`, `usuarios.visualizar` (identidade,
    FR-056), `usuarios.suspender`, `usuarios.reativar` + permissões de `MANAGER`
    (FR-005). Criação de `ADMIN`s adicionais fica para spec futura.
  - `MANAGER`: `professores.visualizar`, `professores.convidar`,
    `professores.reenviar_convite`, `professores.revogar_convite`,
    `professores.ativar`, `professores.desativar`.
  - Todos os papéis: operações sobre a própria conta (`conta.propria.visualizar`,
    `sessoes.proprias.listar`, `sessoes.proprias.revogar`). Para `TEACHER` e
    `STUDENT`, são as únicas nesta feature; permissões pedagógicas chegam nas specs
    seguintes.
- **Resource context**: operações sobre conta, sessões e perfil são restritas ao
  próprio usuário; sessões de outro usuário respondem 404 para quem tem a capacidade
  apenas sobre as próprias. Contexto acadêmico (turma) chega na Spec 002.
- **Audit events**: ver FR-070.
- **Untrusted input**: todo dado de cadastro, login, convite e ativação é validado
  no backend; campos não reconhecidos (ex.: `role`, `permissions`) são ignorados ou
  rejeitados; e-mails normalizados; senhas validadas por FR-011.
- **States & transitions**: convite `PENDING → ACCEPTED | EXPIRED | REVOKED`
  (reenvio mantém `PENDING` com novo token); atribuição de papel (`UserRole`,
  fonte única, FR-007) `ACTIVE ⇄ SUSPENDED`, `ACTIVE | SUSPENDED → INACTIVE → ACTIVE`
  (reativação), com `INVITED` derivado do convite pendente; bootstrap
  `PENDING → COMPLETED | CANCELLED`; conta `User`: `ACTIVE ⇄ SUSPENDED`; e-mail:
  `UNVERIFIED → VERIFIED`. Transições inválidas são rejeitadas.
- **Idempotency**: verificação de e-mail, aceitação de convite, bootstrap,
  redefinição de senha, logout, revogação de sessão e "sair de todos os
  dispositivos" são seguros sob repetição e concorrência.
- **Evidence vs. decisions**: N/A — não há decisões pedagógicas nesta feature.
- **Automation risk level**: N/A — sem IA ou automação.
- **Domain configurability**: nenhuma disciplina, linguagem ou tecnologia é
  modelada; papéis e permissões são dados configuráveis.
- **Sensitive data & adaptations**: nenhuma necessidade individual é tratada. Dados
  pessoais limitados a nome e e-mail; `MANAGER` não acessa dados de alunos.
- **Curricular traceability**: N/A.

### Key Entities *(include if feature involves data)*

- **User**: identidade única da pessoa — e-mail normalizado (único), credencial
  (hash), estado do e-mail (verificado ou não), status da conta (`ACTIVE`,
  `SUSPENDED`, FR-008), datas de criação/atualização. Não contém papel.
- **Role**: papel nomeado (`ADMIN`, `MANAGER`, `TEACHER`, `STUDENT`), extensível.
- **Permission**: capacidade explícita nomeada (ex.: `professores.convidar`).
- **RolePermission**: associação entre papel e permissão.
- **UserRole**: associação entre `User` e `Role`, única por par `User`–`Role`; fonte
  única do status do papel (`ACTIVE`, `SUSPENDED`, `INACTIVE`), quem concedeu e
  quando.
- **TeacherProfile**: dados mínimos de professor (nome de exibição); no máximo um por
  `User`; sem status próprio (FR-007).
- **StudentProfile**: dados mínimos de aluno (nome de exibição); no máximo um por
  `User`.
- **Invitation** (inclui `TeacherInvitation` e convite de `MANAGER`): e-mail
  convidado, papel alvo, emissor, hash do token, status, expiração, criação,
  aceitação, identidade que aceitou.
- **EmailVerification / ActivationToken / PasswordResetToken**: token de uso único
  (hash), finalidade (verificação, ativação, redefinição de senha), `User` alvo,
  expiração, uso.
- **Session**: `User`, hash do segredo da sessão, identificador público não secreto,
  criação, último uso, expiração, revogação (motivo e data).
- **AdminBootstrap**: e-mail alvo, `User` alvo, status (`PENDING`, `COMPLETED`,
  `CANCELLED`), token de ativação associado, datas; no máximo um `PENDING`.
- **AuditEvent**: tipo de evento, ator, alvo, data/hora, identificador da requisição,
  metadados não sensíveis.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Um aluno conclui cadastro e verificação de e-mail em menos de 3 minutos,
  sem ajuda do professor.
- **SC-002**: Um professor convidado conclui a aceitação do convite em menos de 3
  minutos a partir do e-mail recebido.
- **SC-003**: 100% das tentativas automatizadas de elevação de privilégio (campos de
  papel em requisições públicas, autoatribuição, chamadas diretas sem permissão)
  falham.
- **SC-004**: 100% dos cenários de replay e concorrência testados (convite,
  verificação, bootstrap, cadastro) resultam em exatamente uma identidade, um perfil
  e uma atribuição de papel por pessoa.
- **SC-005**: 0 ocorrências de senha, token, identificador de sessão ou cookie em
  logs e trilhas de auditoria, verificado por varredura automatizada nos testes.
- **SC-006**: Respostas públicas de cadastro, login, reenvio, recuperação de senha e
  aceitação são indistinguíveis para e-mails existentes e inexistentes (mesmo
  conteúdo e mesma ordem de grandeza de tempo).
- **SC-007**: Após logout, "sair de todos os dispositivos", desativação ou suspensão,
  100% das sessões afetadas são recusadas na requisição seguinte.
- **SC-008**: 100% dos eventos listados em FR-070 geram registro de auditoria com
  ator, alvo e data/hora.
- **SC-009**: 95% das autenticações bem sucedidas são concluídas em até 2 segundos,
  do ponto de vista do usuário.
- **SC-010**: Todos os critérios de aceite da tabela de rastreabilidade abaixo e os
  cenários de recuperação de senha são cobertos por testes automatizados, incluindo
  casos negativos.
- **SC-011**: Um atacante sem controle do e-mail convidado não obtém nenhum papel nem
  acesso a nenhuma conta em 100% dos cenários de tomada de conta testados
  (pré-registro, aceite com outra conta, replay, autoconvite).

### Acceptance Criteria Traceability

| # | Critério de aceite | Verificado por |
|---|--------------------|----------------|
| 1 | Visitante cria conta somente como `STUDENT` | US1-1; FR-010 |
| 2 | Papéis privilegiados em cadastro público não são atribuídos | US1-2; FR-010; SC-003 |
| 3 | `STUDENT` precisa verificar o e-mail | US1-3, US1-4, US1-5; FR-013–FR-016 |
| 4 | Sem dois `User`s para o mesmo e-mail normalizado | US1-6, US1-7; FR-001 |
| 5 | `User` com múltiplos papéis | US6-2; US7-4; FR-002, FR-004 |
| 6 | `ADMIN` provisiona `MANAGER` | US4-1, US4-2; FR-040 |
| 7 | `MANAGER` convida `TEACHER` | US5-1; FR-040 |
| 8 | `MANAGER` sem acesso a dados de aluno → 403 | US5-5, US5-10; FR-050, FR-056, FR-061 |
| 9 | Convite expira, uso único, token só em hash | US5-2, US5-11, US6-5, US6-7; FR-041 |
| 10 | Convite para e-mail inexistente cria identidade docente | US6-1; FR-046 |
| 11 | Convite para e-mail existente reutiliza o `User` | US6-2, US6-4; FR-044 |
| 12 | `STUDENT` passa a ser também `TEACHER` | US6-2 |
| 13 | Aceite repetido/concorrente sem duplicação | US6-5, US6-6; FR-044; SC-004 |
| 14 | Conta verificada exige autenticação antes de `TEACHER` | US6-3; FR-047 |
| 15 | Convite nunca redefine senha de conta verificada | US6-2, US6-9; FR-047 |
| 16 | Conta não verificada: posse do e-mail, anti-takeover, sessões revogadas | US6-4, US6-10; FR-048; SC-011 |
| 17 | Login só com credenciais permitidas | US2-1, US2-2, US2-10; FR-020, FR-021 |
| 18 | Logout invalida a sessão atual | US2-5; FR-025 |
| 19 | "Sair de todos os dispositivos" invalida todas | US2-6; FR-025 |
| 20 | Endpoints protegidos validam autenticação e autorização | US7-1, US7-2; FR-060 |
| 21 | Chamada direta à API não contorna RBAC | US7-2; US5-8; SC-003 |
| 22 | Bootstrap sem endpoint público | US3-8; FR-030, FR-031 |
| 23 | Bootstrap não se repete com `ADMIN` válido | US3-5, US3-6, US3-7; FR-032 |
| 24 | Sem senhas, tokens, secrets ou cookies em logs/auditoria | US3-9; FR-071, FR-072; SC-005 |
| 25 | Trilha de auditoria dos eventos relevantes | FR-070; SC-008 |
| 26 | Desativar professor preserva identidade e histórico | US5-6, US5-7; FR-051, FR-053 |
| 27 | Sem domínio acadêmico prematuro | FR-080; revisão de Key Entities |
| 28 | Testes automatizados, incluindo negativos (autorização, replay, elevação) | SC-003, SC-004, SC-010, SC-011 |

## Assumptions

- Existe um mecanismo de envio de e-mail transacional disponível para a aplicação; em
  desenvolvimento e testes, os e-mails são capturados localmente. A escolha do
  provedor é decisão do plano.
- `MANAGER` é provisionado por convite, com as mesmas regras de segurança do convite
  de professor, pois a credencial pertence à própria pessoa (Constituição XXV).
- `ADMIN` acumula por padrão as permissões de provisionamento de professores
  (Constituição II: "No início, `ADMIN` PODE acumular as funções de `MANAGER`"), sem
  acesso a dados de alunos.
- Valores padrão (ajustáveis no plano sem mudar o comportamento): senha 12–128
  caracteres; verificação e ativação válidas por 24 h; convite válido por 7 dias;
  redefinição de senha válida por 1 h; sessão expira após 8 h de inatividade ou 7
  dias; rate limit de 5 falhas por e-mail + origem e 20 tentativas por origem em
  15 min, com atraso progressivo por e-mail.
- A interface web desta feature cobre apenas os fluxos listados (cadastro,
  verificação, login/logout, sessões próprias, recuperação de senha, aceitação de
  convite, telas mínimas de ADMIN e MANAGER).
- Não há exigência de MFA nesta feature; o modelo de sessão e identidade não deve
  impedir sua adoção futura.
- Autenticação social/SSO e integração institucional estão fora de escopo.

### Decisões adiadas (não decididas nesta feature)

- **Política de professor desativado com turmas em andamento** (transferência,
  congelamento, somente leitura; afastamento × desligamento × suspensão): spec do
  ciclo de vida de professores e turmas.
- **Fluxo autenticado para criar `ADMIN`s adicionais**: spec posterior; até lá, o
  único `ADMIN` é o do bootstrap.
- **Metadados avançados de sessão** (dispositivo, localização aproximada): avaliação
  futura; listagem e revogação individual já estão nesta feature (FR-027).
- **Troca de e-mail da conta**: fora de escopo; exige fluxo próprio de verificação.
- **Exclusão/anonimização de conta (LGPD)**: princípio definido na constituição;
  fluxo operacional em spec posterior.
- **MFA** para papéis privilegiados: avaliação futura.
