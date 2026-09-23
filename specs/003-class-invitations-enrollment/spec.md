# Feature Specification: 003 — Turmas, Convites e Matrículas de Alunos

**Feature Branch**: `003-class-invitations-enrollment`
**Created**: 2026-09-22
**Status**: Draft
**Input**: User description: "Feature: Turmas, Convites e Matrículas de Alunos — o professor cria e administra suas próprias turmas e adiciona alunos informando apenas o e-mail; o sistema envia um convite com link seguro; quem ainda não tem conta conclui o cadastro (nome, RA, senha) e quem já tem se autentica e aceita; a aceitação válida cria a matrícula. Inclui convites (reenvio, cancelamento, expiração), listagem de alunos e convites com pesquisa e filtros, remoção de aluno da turma sem apagar histórico, autorização por recurso, auditoria e contratos compartilhados. Fora de escopo: provas, exercícios, notas, importação de planilhas, integrações externas, IA e transferência entre turmas."

## Clarifications

### Session 2026-09-22

- Q: O autocadastro público de aluno da Fase 001 continua existindo? → A: Não. Ele é desativado: o convite do professor passa a ser a única forma de criar conta de aluno. Exige emenda ao princípio XXV da constituição antes do plano.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Professor cria e administra as próprias turmas (Priority: P1)

Um professor ativo cria uma turma informando nome, código, ano letivo e,
opcionalmente, descrição e período (ex.: "Programação Orientada a Objetos",
`POO-2026-01`, 2026, "2º semestre"). Depois consegue ver a lista das suas turmas
com pesquisa por nome ou código e filtros por ano e situação, abrir cada turma,
editar os dados e mudar a situação entre ativa, inativa e arquivada.

**Why this priority**: sem turma não há onde matricular alunos; é a base de todas
as funcionalidades pedagógicas seguintes (exercícios, provas, notas).

**Independent Test**: com um professor ativo, criar duas turmas, pesquisar e
filtrar a lista, editar uma delas, inativá-la e reativá-la, arquivar a outra;
confirmar que outro professor não vê nem altera nenhuma delas.

**Acceptance Scenarios**:

1. **Given** um professor ativo, **When** ele cria uma turma com nome, código e ano
   válidos, **Then** a turma é criada na situação ativa, pertence a ele e aparece na
   lista das suas turmas.
2. **Given** um professor com turmas, **When** ele pesquisa por parte do nome ou do
   código e filtra por ano e situação, **Then** a lista mostra somente as turmas
   dele que atendem aos critérios, paginada, com a pesquisa feita no servidor.
3. **Given** uma turma do professor, **When** ele edita nome, descrição, código, ano
   ou período, **Then** as alterações são salvas e auditadas; campos que não fazem
   parte da turma (ex.: responsável, situação) enviados junto são rejeitados.
4. **Given** um professor que já tem uma turma com o código `POO-2026-01`, **When**
   ele cria ou edita outra turma com o mesmo código (sem diferenciar maiúsculas),
   **Then** a operação é recusada informando que o código já está em uso.
5. **Given** uma turma ativa, **When** o professor a inativa e depois a reativa,
   **Then** cada mudança de situação é aplicada e auditada; uma turma arquivada não
   volta a ficar ativa nem inativa.
6. **Given** uma turma de outro professor, **When** o professor tenta vê-la, editá-la
   ou mudar sua situação, inclusive informando diretamente o identificador, **Then**
   a resposta é a mesma de uma turma inexistente, sem revelar que ela existe.

---

### User Story 2 - Professor convida aluno informando só o e-mail (Priority: P1)

Na página da turma, o professor escolhe "Convidar aluno", informa o e-mail e
confirma. O sistema cria o convite vinculado à turma e ao e-mail, com prazo de
validade, e envia ao aluno um e-mail com o nome da turma, o professor responsável,
o prazo e o botão "Aceitar convite". O professor vê "Convite enviado." e o convite
aparece como pendente na turma.

**Why this priority**: é o único jeito de um aluno entrar numa turma; o professor
nunca cria a conta nem a senha do aluno.

**Independent Test**: convidar um e-mail novo e confirmar o convite pendente e o
e-mail recebido; tentar convidar de novo o mesmo e-mail e um aluno já matriculado;
simular indisponibilidade do envio de e-mail e confirmar que o convite continua
criado e que o envio é tentado de novo.

**Acceptance Scenarios**:

1. **Given** uma turma ativa do professor, **When** ele convida `aluno@example.test`,
   **Then** um convite pendente é criado para esse e-mail normalizado, com
   validade de 7 dias, e o aluno recebe o e-mail do convite; a interface mostra
   "Convite enviado.".
2. **Given** um e-mail inválido ou campos além do e-mail no pedido, **When** o
   professor envia o convite, **Then** o pedido é recusado com a mensagem junto ao
   campo e nada é criado.
3. **Given** um convite pendente para o mesmo e-mail na mesma turma, **When** o
   professor convida de novo, **Then** nenhum convite novo é criado e a interface
   informa "Já existe um convite pendente para este e-mail.".
4. **Given** um aluno com matrícula ativa na turma, **When** o professor convida o
   e-mail dele, **Then** nenhum convite é criado e a interface informa "Este aluno já
   está matriculado nesta turma.".
5. **Given** duas solicitações simultâneas de convite para o mesmo e-mail e turma,
   **When** ambas são processadas, **Then** existe no máximo um convite pendente.
6. **Given** o serviço de e-mail temporariamente indisponível, **When** o professor
   convida um aluno, **Then** o convite é criado mesmo assim, a falha de envio fica
   registrada e o envio é tentado novamente até ter sucesso ou esgotar as
   tentativas; o professor vê o convite pendente e pode reenviá-lo.
7. **Given** uma turma inativa ou arquivada, **When** o professor tenta convidar um
   aluno, **Then** a operação é recusada informando que a turma não aceita novos
   alunos.
8. **Given** o e-mail do convite, **When** ele é lido, **Then** contém o nome da
   turma, o nome do professor, o prazo e o link de aceite, e não contém senha,
   código separado do link nem dados internos.

---

### User Story 3 - Aluno novo aceita o convite criando a própria conta (Priority: P1)

Quem recebe o convite e ainda não tem conta abre o link, vê o nome da turma e o
e-mail convidado (sem poder alterá-lo), informa nome completo, RA, senha e
confirmação da senha e envia. A conta, o cadastro de aluno e a matrícula são
criados de uma vez, o convite passa a aceito e a pessoa entra no sistema já
matriculada, vendo "Você agora faz parte da turma.".

**Why this priority**: é o caminho da maioria dos alunos no primeiro uso e o que
substitui o autocadastro público.

**Independent Test**: convidar um e-mail sem conta, abrir o link, concluir o
cadastro e confirmar conta, aluno, matrícula ativa e convite aceito; reabrir o
link e confirmar que ele não vale mais; forçar uma falha no meio e confirmar que
nada ficou pela metade.

**Acceptance Scenarios**:

1. **Given** um convite pendente e válido para um e-mail sem conta, **When** a
   pessoa abre o link, **Then** vê o nome da turma, o professor e o e-mail do
   convite, e o formulário pede nome completo, RA, senha e confirmação.
2. **Given** o formulário preenchido com dados válidos, **When** a pessoa conclui,
   **Then** são criados, numa única operação, a conta com o e-mail do convite
   (já confirmado, pois o link chegou nesse e-mail), o papel de aluno, o cadastro de
   aluno com o RA e a matrícula ativa, e o convite passa a aceito; ela entra no
   sistema com sessão iniciada.
3. **Given** um pedido que tenta informar outro e-mail, papel ou turma, **When** é
   enviado, **Then** é recusado; o e-mail, a turma e o papel vêm sempre do convite.
4. **Given** um RA já usado por outro aluno, **When** a pessoa conclui, **Then** o
   cadastro é recusado com a mensagem junto ao campo RA e nada é criado.
5. **Given** senha fora da política (tamanho, senha comum) ou confirmação diferente,
   **When** a pessoa conclui, **Then** o cadastro é recusado com a mensagem junto ao
   campo e nada é criado.
6. **Given** uma falha em qualquer etapa da conclusão, **When** ela ocorre, **Then**
   nenhuma parte fica gravada: não existe conta sem matrícula nem matrícula com o
   convite ainda utilizável.
7. **Given** um convite já aceito, **When** o link é aberto ou enviado de novo
   (inclusive dois envios simultâneos), **Then** nada é criado em dobro e a pessoa
   vê que o convite não é mais válido.
8. **Given** qualquer resposta do sistema durante o aceite, **When** é
   inspecionada, **Then** não contém a senha nem qualquer representação dela.

---

### User Story 4 - Aluno que já tem conta aceita o convite (Priority: P2)

Quem já tem conta (por exemplo, aluno de outra turma, ou professor que também
estuda) abre o link, entra na própria conta se ainda não estiver autenticado e
aceita o convite. Nenhuma conta nova é criada: a mesma identidade passa a ter a
nova matrícula e, se ainda não tinha, o papel de aluno.

**Why this priority**: alunos cursam várias turmas; sem este fluxo cada convite
criaria contas duplicadas.

**Independent Test**: com um aluno matriculado na turma A, convidá-lo para a turma
B, aceitar autenticado e confirmar uma só conta com duas matrículas ativas; tentar
aceitar autenticado com outra conta e confirmar a recusa.

**Acceptance Scenarios**:

1. **Given** um convite para um e-mail que já tem conta verificada, **When** a pessoa
   abre o link sem sessão, **Then** é convidada a entrar na conta e, depois de
   entrar, volta ao convite para aceitá-lo; a senha dela não é pedida nem alterada
   pelo convite.
2. **Given** a pessoa autenticada na conta do e-mail convidado, **When** aceita,
   **Then** a matrícula ativa é criada, o convite passa a aceito e nenhuma conta
   nova é criada.
3. **Given** a pessoa autenticada em outra conta, **When** abre o convite, **Then**
   não consegue aceitá-lo e é orientada a sair e entrar com a conta do e-mail
   convidado, sem que o sistema revele dados daquela conta.
4. **Given** uma conta existente sem o papel de aluno (ex.: só professor), **When**
   ela aceita, **Then** recebe o papel de aluno e o cadastro de aluno, mantendo os
   papéis que já tinha.
5. **Given** uma conta existente que ainda não tem RA, **When** aceita o convite,
   **Then** informa o RA uma única vez nesse momento, com a mesma regra de
   unicidade; contas que já têm RA não o informam de novo.
6. **Given** uma conta existente cujo e-mail nunca foi confirmado, **When** o convite
   é aceito, **Then** quem aceita (e, portanto, controla o e-mail) assume a conta
   definindo nova senha, todas as sessões anteriores são encerradas e o e-mail
   passa a confirmado (mesma regra da constituição para convites de professor).
7. **Given** um aluno já matriculado nas turmas A e B, **When** aceita convite para a
   turma C, **Then** passa a ter as três matrículas ativas.
8. **Given** uma conta suspensa, **When** o convite é aberto, **Then** não pode ser
   aceito; a mensagem é a mesma de um convite que não é mais válido.

---

### User Story 5 - Professor acompanha, reenvia e cancela convites (Priority: P2)

Na página da turma, o professor vê os convites com o e-mail, a situação e a
validade, pesquisa por e-mail e filtra pela situação. Pode reenviar um convite
pendente (o link anterior deixa de valer e o prazo recomeça) e cancelar um
convite pendente com confirmação.

**Why this priority**: e-mails se perdem e endereços são digitados errado; sem
reenvio e cancelamento o professor fica sem saída.

**Independent Test**: criar convites, reenviar um e confirmar que só o link novo
funciona; cancelar outro e confirmar que o link dele é recusado; deixar um expirar
e confirmar a recusa e a situação expirada.

**Acceptance Scenarios**:

1. **Given** convites pendentes, aceitos, cancelados e expirados numa turma,
   **When** o professor abre a lista, pesquisa por parte do e-mail e filtra pela
   situação, **Then** vê somente os convites da turma que atendem aos critérios,
   paginados, com a pesquisa feita no servidor.
2. **Given** um convite pendente, **When** o professor o reenvia, **Then** um novo
   link é enviado, o link anterior deixa de valer imediatamente, o prazo de 7 dias
   recomeça, o número de envios aumenta e o reenvio é auditado.
3. **Given** reenvios repetidos do mesmo convite ou muitos convites em sequência,
   **When** os limites são ultrapassados, **Then** o pedido é recusado informando
   quanto esperar, sem enviar e-mail.
4. **Given** um convite pendente, **When** o professor confirma o cancelamento,
   **Then** ele passa a cancelado, o link deixa de valer imediatamente e o
   cancelamento é auditado.
5. **Given** um convite aceito, cancelado ou expirado, **When** o professor tenta
   reenviá-lo ou cancelá-lo, **Then** a operação é recusada como transição
   inválida; um aluno matriculado sai da turma pela remoção da matrícula (US6).
6. **Given** um convite cujo prazo passou, **When** alguém abre o link, **Then** vê
   "Este convite expirou." e não consegue aceitar; na lista do professor ele aparece
   como expirado. A validade é decidida pelo servidor.
7. **Given** um link adulterado, inexistente, cancelado ou substituído por reenvio,
   **When** é aberto, **Then** a pessoa vê "Este convite não é mais válido." sem
   indicação de qual desses casos ocorreu nem de dados da turma.

---

### User Story 6 - Professor vê os alunos da turma e remove um aluno (Priority: P2)

A página da turma mostra nome, código, ano, período, situação e quantidade de
alunos ativos, e a lista de alunos matriculados (RA, nome, situação da matrícula)
com pesquisa por nome ou RA e filtro por situação. O professor pode remover um
aluno com confirmação; a matrícula passa a removida, com a data, e a conta e o
cadastro do aluno continuam existindo.

**Why this priority**: o professor precisa saber quem está na turma e corrigir
matrículas indevidas sem apagar histórico.

**Independent Test**: matricular dois alunos, pesquisar e filtrar a lista, remover
um e confirmar matrícula removida com data, contagem atualizada, conta e cadastro
do aluno intactos; convidar de novo o removido e confirmar nova matrícula ativa
preservando a anterior.

**Acceptance Scenarios**:

1. **Given** uma turma com alunos, **When** o professor abre a página, **Then** vê os
   dados da turma, a quantidade de alunos com matrícula ativa, a lista de alunos e os
   convites pendentes, cada um com estado vazio claro quando não houver itens.
2. **Given** a lista de alunos, **When** o professor pesquisa por parte do nome ou
   do RA e filtra pela situação da matrícula, **Then** vê somente as matrículas da
   turma que atendem aos critérios, paginadas, com a pesquisa feita no servidor.
3. **Given** um aluno com matrícula ativa, **When** o professor confirma a remoção,
   **Then** a matrícula passa a removida com a data da remoção, sai da contagem de
   ativos e a remoção é auditada; a conta, o papel e o cadastro de aluno continuam
   intactos, e as outras matrículas do aluno não mudam.
4. **Given** uma matrícula já removida, **When** o professor tenta removê-la de novo,
   **Then** nada muda (a operação é idempotente e não gera nova auditoria).
5. **Given** um aluno removido, **When** o professor o convida de novo e ele aceita,
   **Then** uma nova matrícula ativa é criada e a matrícula removida anterior
   continua registrada no histórico.
6. **Given** uma matrícula de turma de outro professor, **When** o professor tenta
   removê-la ou listar os alunos dessa turma, **Then** a resposta é a mesma de um
   recurso inexistente.

---

### User Story 7 - Aluno vê as turmas de que participa (Priority: P3)

O aluno, depois de aceitar um ou mais convites, vê em "Minhas turmas" a lista das
turmas em que tem matrícula ativa (nome, código, ano, período e professor). Não vê
outros alunos, convites nem dados administrativos da turma.

**Why this priority**: confirma para o aluno que o ingresso deu certo; os recursos
pedagógicos da turma chegam nas specs seguintes.

**Independent Test**: com um aluno matriculado em duas turmas e removido de uma
terceira, confirmar que "Minhas turmas" mostra só as duas ativas e nenhum dado de
outros alunos.

**Acceptance Scenarios**:

1. **Given** um aluno com matrículas ativas em duas turmas e uma matrícula removida,
   **When** abre "Minhas turmas", **Then** vê somente as duas turmas ativas, com
   nome, código, ano, período e nome do professor.
2. **Given** um aluno sem a capacidade de gerir turmas, **When** tenta abrir a página
   administrativa de uma turma (inclusive uma em que está matriculado), **Then**
   recebe 403; um professor que também é aluno recebe, para turma de outro
   professor, a mesma resposta de um recurso inexistente (404).

---

### User Story 8 - Autorização por turma e proteção dos convites no backend (Priority: P1)

Toda operação sobre turma, convite ou matrícula é autorizada no servidor pela
combinação de capacidade (papel com a permissão) e contexto (a turma pertence ao
professor autenticado). O fluxo público do convite não revela se um e-mail tem
conta para quem não possui o link, e o uso repetido de tokens é limitado.

**Why this priority**: turmas e matrículas são a fronteira do isolamento entre
professores e alunos (constituição XXIV); uma falha aqui expõe dados de alunos.

**Independent Test**: executar a matriz de acesso (sem sessão, aluno, professor
dono, outro professor, MANAGER, ADMIN) contra cada operação e conferir 401, 403 ou
404 conforme a regra; tentar identificadores de outras turmas, matrículas e
convites; tentar muitos tokens inválidos em sequência.

**Acceptance Scenarios**:

1. **Given** um visitante sem sessão, **When** chama qualquer operação de turma,
   **Then** recebe 401.
2. **Given** um usuário sem a capacidade (aluno, MANAGER ou ADMIN sem papel de
   professor), **When** chama operações de gestão de turma, **Then** recebe 403,
   inclusive para listar turmas.
3. **Given** um professor com a capacidade, **When** usa identificadores de turma,
   convite ou matrícula de outro professor em qualquer operação, **Then** recebe
   404, sem diferença entre "não existe" e "não é seu".
4. **Given** um professor cujo papel de professor foi suspenso ou desativado, **When**
   tenta qualquer operação de turma, **Then** é recusado; suas turmas, convites e
   matrículas permanecem intactos.
5. **Given** muitas tentativas de abrir ou aceitar convites com tokens inválidos a
   partir da mesma origem, **When** o limite é ultrapassado, **Then** as tentativas
   seguintes são recusadas por um tempo e as tentativas ficam observáveis nos logs,
   sem o token.
6. **Given** um pedido com campos não reconhecidos (ex.: responsável, situação,
   papel) em qualquer operação, **When** é enviado, **Then** é recusado como
   inválido sem efeito.
7. **Given** um visitante sem convite, **When** tenta o antigo cadastro público (tela
   ou operação), **Then** a tela não existe e a operação responde como recurso
   inexistente, sem criar conta (FR-048).

---

### Edge Cases

- **Turma inativada com convites pendentes**: os convites continuam pendentes, mas
  não podem ser aceitos enquanto a turma estiver inativa (mensagem de convite não
  mais válido); se a turma for reativada dentro do prazo, voltam a valer.
- **Turma arquivada**: fica somente para consulta; os convites pendentes dela são
  cancelados no arquivamento e as matrículas ficam como estavam (histórico).
  Não recebe novos convites, edições nem remoções.
- **Exclusão de turma**: não existe nesta feature; turmas são inativadas ou
  arquivadas para preservar o histórico.
- **Professor suspenso ou desativado**: perde o acesso às turmas; turmas, convites e
  matrículas ficam preservados e os convites pendentes não podem ser aceitos
  enquanto o professor não estiver ativo. Transferência de turma para outro
  professor fica para spec posterior.
- **E-mail com maiúsculas ou espaços**: normalizado antes de comparar com convites,
  contas e matrículas (mesma regra de normalização da Fase 001).
- **Convite para o e-mail do próprio professor**: permitido; ao aceitar, a mesma
  identidade passa a ter também o papel de aluno.
- **Aluno matriculado entre o convite e o aceite** (por outro convite da mesma
  turma): o segundo aceite não cria matrícula duplicada; o convite é marcado como
  aceito e a pessoa vê que já faz parte da turma.
- **Aceite concorrente** do mesmo convite em duas abas: só um tem efeito; o outro vê
  que o convite não é mais válido ou que já faz parte da turma.
- **Convite aberto depois do prazo com a página já carregada**: o envio é recusado
  pelo servidor mesmo que a página ainda mostre o formulário.
- **Conta criada por outro convite entre o convite e o aceite** (a pessoa aceitou
  antes o convite de outra turma): este convite passa a seguir o fluxo de conta
  existente (US4).
- **Visitante tenta o antigo cadastro público**: a tela e a operação não existem mais
  (FR-048); o caminho para ter conta de aluno é receber um convite.
- **Reenvio para um e-mail que já tem matrícula ativa** (matriculado por outro
  convite): recusado com "Este aluno já está matriculado nesta turma." e o convite
  pendente é cancelado.
- **Nome da turma ou do professor com caracteres especiais**: exibidos como texto
  no e-mail e nas telas, nunca interpretados como marcação.

## Requirements *(mandatory)*

### Functional Requirements

**Turmas**

- **FR-001**: Um professor ativo DEVE poder criar turmas com nome (obrigatório, até
  120 caracteres), código (obrigatório, até 30 caracteres: letras, números, hífen,
  ponto e sublinhado), ano letivo (obrigatório, quatro dígitos), período (opcional,
  até 60 caracteres) e descrição (opcional, até 1.000 caracteres). A turma nasce
  ativa e pertence a quem a criou; o responsável nunca vem do pedido.
- **FR-002**: O código da turma DEVE ser único entre as turmas do mesmo professor,
  sem diferenciar maiúsculas e minúsculas, garantido também sob requisições
  concorrentes.
- **FR-003**: O professor DEVE poder editar nome, código, ano, período e descrição
  das próprias turmas ativas ou inativas; turmas arquivadas não podem ser editadas.
- **FR-004**: A turma DEVE ter ciclo de vida explícito: `ACTIVE`, `INACTIVE` e
  `ARCHIVED`. Transições permitidas: `ACTIVE → INACTIVE`, `INACTIVE → ACTIVE`,
  `ACTIVE → ARCHIVED` e `INACTIVE → ARCHIVED`. `ARCHIVED` é final nesta feature.
  Outras transições DEVEM ser recusadas como transição inválida.
- **FR-005**: Arquivar uma turma DEVE cancelar os convites pendentes dela na mesma
  operação e preservar as matrículas como estão.
- **FR-006**: Turmas NÃO DEVEM ser excluídas fisicamente nesta feature.
- **FR-007**: O professor DEVE poder listar as próprias turmas com paginação,
  pesquisa por parte do nome ou do código (sem diferenciar maiúsculas e acentos) e
  filtros por ano e situação, aplicados no servidor. Por padrão, a lista mostra as
  turmas ativas e inativas, das mais recentes para as mais antigas.
- **FR-008**: A página da turma DEVE mostrar nome, código, ano, período, situação,
  descrição, quantidade de matrículas ativas, a lista de alunos e a lista de
  convites.

**Convites**

- **FR-010**: O professor DEVE poder convidar um aluno para uma turma ativa sua
  informando somente o e-mail. O pedido NÃO DEVE aceitar outros campos.
- **FR-011**: Antes de criar o convite, o sistema DEVE, no servidor: confirmar que a
  turma existe, pertence ao professor e está ativa; normalizar e validar o e-mail;
  recusar se já houver matrícula ativa desse e-mail na turma; recusar se já houver
  convite pendente para o mesmo e-mail na turma.
- **FR-012**: NÃO PODE existir mais de um convite pendente para a mesma turma e o
  mesmo e-mail normalizado, garantido também sob requisições concorrentes.
- **FR-013**: Cada convite DEVE registrar a turma, o e-mail autorizado, quem
  convidou, a validade, a situação, a quantidade de envios e as datas de criação,
  aceite ou cancelamento. Esses dados vêm sempre do servidor, nunca do pedido de
  aceite.
- **FR-014**: O convite DEVE ter ciclo de vida explícito: `PENDING`, `ACCEPTED`,
  `EXPIRED` e `CANCELLED`. Transições: `PENDING → ACCEPTED` (aceite),
  `PENDING → CANCELLED` (cancelamento pelo professor, arquivamento da turma ou
  matrícula ativa já existente no reenvio) e `PENDING → EXPIRED` (fim do prazo).
  Transições a partir de estados finais DEVEM ser recusadas como transição
  inválida.
- **FR-015**: O convite DEVE valer por 7 dias a partir da criação ou do último reenvio
  pelo professor; novas tentativas automáticas de entrega não renovam o prazo.
  Depois disso, NÃO PODE ser aceito, e a validade é decidida pelo servidor. O convite DEVE
  aparecer como expirado para o professor sem depender de ação do aluno.
- **FR-016**: O link do convite DEVE conter um token criptograficamente seguro, com
  alta entropia, imprevisível e de uso único, guardado apenas na forma de hash e
  comparado de forma resistente a ataques de tempo. O token bruto NÃO DEVE ser
  gravado nem registrado em logs, auditoria ou ferramentas de observabilidade, e a
  página do convite NÃO DEVE enviar o link a terceiros (ex.: cabeçalho `Referer`).
- **FR-017**: Em cada momento, um convite DEVE ter no máximo um token válido. Reenvio
  invalida o anterior; aceite, cancelamento e expiração invalidam o atual.
- **FR-018**: O e-mail do convite DEVE informar que a pessoa foi convidada para a
  turma, o nome da turma, o nome do professor, o prazo para aceitar e um botão/link
  "Aceitar convite". NÃO DEVE conter senha, hash, credencial, token separado do link
  nem dados internos.
- **FR-019**: A criação do convite NÃO DEVE depender do envio do e-mail: o convite é
  gravado primeiro e o envio acontece depois, fora do caminho da resposta. Falhas de
  envio DEVEM ficar registradas de forma observável (sem o token) e o envio DEVE ser
  tentado de novo automaticamente, com intervalos crescentes, até ter sucesso ou
  esgotar as tentativas; o professor sempre pode reenviar manualmente. O envio NÃO
  DEVE introduzir infraestrutura nova de filas além da que a constituição permite
  sem spec própria.
- **FR-020**: O professor DEVE poder reenviar um convite pendente; o reenvio gera novo
  token, renova o prazo, incrementa a quantidade de envios e é auditado.
- **FR-021**: Reenvios e criação de convites DEVEM ter limites contra abuso: no máximo
  1 reenvio por convite a cada 60 segundos e 5 envios por convite por dia, e no
  máximo 50 convites criados ou reenviados por professor por hora. Ao ultrapassar,
  o pedido é recusado informando quanto esperar, sem enviar e-mail. Novas tentativas
  automáticas de entrega (FR-019) não contam para esses limites.
- **FR-022**: O professor DEVE poder cancelar um convite pendente, com confirmação na
  interface; o token deixa de valer imediatamente. Convites aceitos NÃO PODEM ser
  cancelados: a saída de um aluno é feita pela remoção da matrícula.
- **FR-023**: O professor DEVE poder listar os convites de uma turma sua com
  paginação, pesquisa por parte do e-mail e filtro por situação, aplicados no
  servidor. Por padrão, a lista mostra os pendentes.

**Aceite do convite**

- **FR-030**: A página pública do convite DEVE, com um token válido, mostrar o nome da
  turma, o nome do professor, o e-mail convidado (sem permitir alteração) e o modo de
  aceite: concluir cadastro (e-mail sem conta) ou entrar na conta (e-mail com
  conta). Com token inválido, expirado, cancelado, substituído ou já usado, DEVE
  mostrar só a mensagem correspondente ("Este convite expirou." para expirado;
  "Este convite não é mais válido." para os demais), sem dados da turma nem da
  conta.
- **FR-031**: Para e-mail sem conta, a conclusão DEVE pedir nome completo, RA, senha e
  confirmação da senha, e criar, numa única operação atômica: a conta com o e-mail do
  convite (marcado como confirmado), o papel `STUDENT`, o cadastro de aluno com o RA,
  a matrícula ativa e o aceite do convite; e iniciar a sessão. Qualquer falha desfaz
  tudo.
- **FR-032**: A senha DEVE seguir a política da Fase 001 (12 a 128 caracteres, fora
  da lista de senhas comuns ou vazadas), validada no servidor. A senha é definida
  exclusivamente pelo aluno: nenhuma operação permite ao professor criar, ver,
  receber, enviar ou redefinir a senha do aluno.
- **FR-033**: Para e-mail com conta, o aceite DEVE exigir sessão na conta desse
  e-mail; sem sessão, a pessoa é levada ao login e volta ao convite. Com sessão em
  outra conta, o aceite DEVE ser recusado sem revelar dados da conta convidada.
- **FR-034**: O aceite por conta existente DEVE, numa única operação atômica: validar
  convite, turma e conta; adicionar o papel `STUDENT` e o cadastro de aluno se
  faltarem (pedindo o RA se a conta não tiver); criar a matrícula ativa; e marcar o
  convite como aceito. NÃO DEVE criar outra conta nem alterar a senha, salvo no caso
  de FR-035.
- **FR-035**: Se a conta do e-mail convidado nunca teve o e-mail confirmado, quem
  aceita o convite DEVE assumir a conta definindo nova senha; todas as sessões
  anteriores são encerradas e o e-mail passa a confirmado (constituição XXV, mesma
  regra dos convites de professor).
- **FR-036**: O aceite DEVE ser recusado se a conta estiver suspensa, se a turma não
  estiver ativa ou se o professor responsável não estiver ativo, com a mesma
  mensagem de convite não mais válido.
- **FR-037**: O aceite DEVE ser idempotente e seguro sob concorrência: aceitar o mesmo
  convite duas vezes, ou dois convites da mesma turma para a mesma pessoa, nunca
  cria duas contas, dois cadastros de aluno, papéis duplicados nem duas matrículas
  ativas.
- **FR-038**: Após o aceite, a pessoa DEVE ver "Você agora faz parte da turma." e ser
  levada a "Minhas turmas".
- **FR-039**: O fluxo público do convite NÃO DEVE permitir descobrir se um e-mail tem
  conta sem possuir um token válido enviado para esse e-mail. Respostas para tokens
  inválidos são idênticas entre si, e a abertura e o aceite de convites DEVEM ter
  rate limiting por origem.

**Aluno e matrícula**

- **FR-040**: O cadastro de aluno DEVE estar ligado a uma única conta e guardar o RA
  e a situação (`ACTIVE` ou `INACTIVE`), sem duplicar nome e e-mail, que continuam
  na conta. Nesta feature todo cadastro de aluno nasce `ACTIVE`; a inativação fica
  para spec posterior.
- **FR-041**: O RA DEVE ter de 1 a 20 caracteres (letras, números, ponto, hífen e
  barra), ser comparado sem diferenciar maiúsculas e sem espaços nas pontas, e ser
  único no sistema, garantido também sob concorrência. Uma vez informado, o RA não
  é alterado nesta feature.
- **FR-042**: A matrícula DEVE ligar um cadastro de aluno a uma turma, com situação
  `ACTIVE` ou `REMOVED`, data de ingresso e data de remoção. A relação aluno–turma
  existe somente por matrículas, permitindo várias turmas por aluno.
- **FR-043**: NÃO PODE existir mais de uma matrícula ativa para o mesmo aluno na mesma
  turma, garantido também sob concorrência. Matrículas removidas permanecem e não
  impedem uma nova matrícula ativa.
- **FR-044**: O professor DEVE poder remover um aluno de uma turma sua, com
  confirmação na interface: a matrícula passa de `ACTIVE` para `REMOVED` com a data
  da remoção. A remoção NÃO DEVE excluir nem alterar a conta, os papéis, o cadastro
  de aluno ou outras matrículas. Remover uma matrícula já removida não tem efeito.
- **FR-045**: O professor DEVE poder listar os alunos de uma turma sua com paginação,
  pesquisa por parte do nome ou do RA e filtro pela situação da matrícula, aplicados
  no servidor. Por padrão, a lista mostra as matrículas ativas, ordenadas por nome.
  A lista mostra RA, nome, e-mail, situação e datas da matrícula; nunca dados de
  autenticação.
- **FR-046**: O aluno DEVE poder listar as turmas em que tem matrícula ativa (nome,
  código, ano, período e nome do professor), sem acesso a outros alunos, convites ou
  dados administrativos da turma.
- **FR-047**: Remover matrículas ou arquivar turmas NÃO DEVE apagar registros; o
  histórico de convites e matrículas é preservado para as fases de avaliação.

**Cadastro público**

- **FR-048**: O autocadastro público de aluno da Fase 001 DEVE ser desativado: o
  convite de turma passa a ser a única forma de criar conta de aluno. A tela de
  cadastro e a operação pública de cadastro deixam de existir; pedidos à antiga
  operação DEVEM responder como recurso inexistente, sem criar conta. Substitui os
  requisitos de autocadastro da Fase 001 (FR-010 e FR-012 daquela spec) e exige
  emenda prévia ao princípio XXV da constituição.
- **FR-049**: Contas já criadas pelo autocadastro continuam válidas: entram em turmas
  pelo fluxo de conta existente (US4). Os fluxos de verificação de e-mail,
  recuperação de senha e sessões da Fase 001 continuam disponíveis para elas.

**Interface**

- **FR-050**: As telas DEVEM usar o sistema de componentes do projeto e incluir: lista
  de turmas, criação e edição de turma, página da turma com alunos e convites,
  convite de aluno (diálogo), confirmação de remoção de aluno, confirmação de
  cancelamento de convite, página pública do convite, formulário de conclusão de
  cadastro e "Minhas turmas".
- **FR-051**: Cada tela DEVE ter estados claros de carregamento, erro, sucesso e
  vazio; a página do convite DEVE distinguir convite expirado, convite não mais
  válido (inválido, cancelado, substituído) e convite já usado pela própria pessoa
  ("Você já faz parte desta turma.").
- **FR-052**: As mensagens DEVEM incluir, com este texto: "Convite enviado.", "Este
  aluno já está matriculado nesta turma.", "Já existe um convite pendente para este
  e-mail.", "Este convite expirou.", "Este convite não é mais válido." e "Você agora
  faz parte da turma.".
- **FR-053**: Depois de criar ou editar turma, convidar, reenviar, cancelar convite
  ou remover aluno, as listas e contagens afetadas DEVEM refletir a mudança sem
  recarregar a página.
- **FR-054**: As telas DEVEM atender WCAG 2.2 AA (Fase 001): navegação completa por
  teclado, foco visível, rótulos, erros associados aos campos, diálogos acessíveis
  com foco preso e devolvido ao fechar, e verificação automatizada.
- **FR-055**: O menu lateral DEVE mostrar "Turmas" para quem tem a capacidade de
  gerir turmas e "Minhas turmas" para quem tem matrícula de aluno (UX apenas; a API
  autoriza).

**Contratos, auditoria e observabilidade**

- **FR-060**: Todo formato trocado entre API e web nesta feature (pedidos, respostas,
  situações, paginação e erros) DEVE ser definido uma vez nos contratos
  compartilhados do monorepo, e as respostas DEVEM ser conferidas contra eles nos
  testes (002). Os contratos NÃO DEVEM expor hash de senha, hash de token, detalhes
  de persistência nem estado interno.
- **FR-061**: Devem ser auditados, na mesma operação que os produz, com responsável,
  ação, recurso, identificador, data e hora e contexto mínimo: turma criada, turma
  editada, situação da turma alterada, convite criado, convite reenviado, convite
  cancelado, convite aceito, cadastro de aluno criado e matrícula criada e removida.
  A auditoria NUNCA contém senha, hash, token ou credenciais.
- **FR-062**: DEVEM ficar observáveis em logs estruturados, sem token, senha ou dados
  pessoais além do necessário: falhas de envio e esgotamento de tentativas de
  e-mail, uso de token inválido, expirado ou reutilizado, falha na criação de
  matrícula e recusas de autorização.
- **FR-063**: Erros DEVEM seguir o formato padrão da Fase 001 (código estável e
  mensagem, sem detalhes internos), com códigos próprios para: código de turma em
  uso, turma que não aceita alunos, convite pendente existente, aluno já
  matriculado, RA em uso, convite expirado e convite não mais válido.

### Security, Permissions & Audit *(mandatory if feature has protected operations)*

- **Permissions** (novas; nomes finais confirmados no plano):
  - `TEACHER` ativo: `turmas.criar`, `turmas.visualizar`, `turmas.editar`,
    `turmas.alterar_situacao`, `turmas.convidar_aluno`, `turmas.reenviar_convite`,
    `turmas.cancelar_convite`, `turmas.visualizar_alunos`, `turmas.remover_aluno`.
  - `STUDENT`: `turmas.proprias.listar` (Minhas turmas).
  - `MANAGER` e `ADMIN` NÃO recebem permissões de turma, alunos ou matrículas
    (constituição XXV: MANAGER não acessa dados de alunos; papéis administrativos não
    atravessam o isolamento das turmas implicitamente).
  - Aceite do convite: operação pública protegida pelo token (conta nova) ou pela
    sessão da conta do e-mail convidado (conta existente); não depende de permissão.
- **Resource context**: toda turma, convite e matrícula é acessível somente ao
  professor responsável pela turma, conferido no servidor em cada operação a partir
  da sessão (`authenticatedUser → capacidade → turma do professor`). Sem capacidade
  → 403; com capacidade e recurso fora do contexto → 404. O aluno acessa somente as
  próprias matrículas ativas. Identificadores enviados pelo cliente nunca bastam.
- **Audit events**: `CLASS_CREATED`, `CLASS_UPDATED`, `CLASS_STATUS_CHANGED`,
  `CLASS_INVITATION_CREATED`, `CLASS_INVITATION_RESENT`,
  `CLASS_INVITATION_CANCELLED`, `CLASS_INVITATION_ACCEPTED`,
  `STUDENT_REGISTERED`, `ENROLLMENT_CREATED`, `ENROLLMENT_REMOVED`, e os eventos de
  papel da Fase 001 quando o aceite adiciona `STUDENT` ou assume conta não
  verificada (nomes finais seguem a convenção do catálogo de auditoria existente).
- **Untrusted input**: pedidos de turma, convite, aceite e filtros de listagem são
  validados no servidor por formato e tamanho; campos desconhecidos são recusados
  (400) sem efeito; e-mail, turma, papel e responsável do aceite vêm do convite; o
  responsável da turma vem da sessão; textos exibidos são escapados.
- **States & transitions**: turma `ACTIVE ⇄ INACTIVE → ARCHIVED` (FR-004); convite
  `PENDING → ACCEPTED | CANCELLED | EXPIRED` (FR-014); cadastro de aluno `ACTIVE`
  (`INACTIVE` reservado); matrícula `ACTIVE → REMOVED`, com nova matrícula ativa
  possível depois (FR-043). Transições inválidas → 409 `INVALID_STATE_TRANSITION`.
- **Idempotency**: aceite de convite (FR-037), convite pendente único por turma e
  e-mail (FR-012), matrícula ativa única por aluno e turma (FR-043), RA único
  (FR-041), código de turma único por professor (FR-002) e remoção de matrícula
  repetida sem efeito (FR-044) — todos garantidos pelo banco de dados, não apenas
  por verificação prévia.
- **Evidence vs. decisions**: nenhuma decisão pedagógica; convites e matrículas são
  FACT registrados com o responsável humano (professor ou aluno).
- **Automation risk level**: L1 apenas (expiração e novas tentativas de envio de
  e-mail); nenhuma IA.
- **Domain configurability**: turmas são dados do professor (nome, código, período);
  nenhuma disciplina, linguagem ou tecnologia fixa no código.
- **Sensitive data & adaptations**: RA e e-mail de alunos são visíveis somente ao
  professor responsável pela turma e ao próprio aluno; nenhuma necessidade individual
  é tratada nesta feature; nada é enviado a IA.
- **Curricular traceability**: N/A (ementas, conteúdos e avaliações chegam nas specs
  seguintes).

### Key Entities *(include if feature involves data)*

- **Turma**: grupo de alunos administrado por um professor. Nome, código (único por
  professor), ano letivo, período e descrição opcionais, situação
  (`ACTIVE`/`INACTIVE`/`ARCHIVED`), professor responsável, datas de criação e
  atualização.
- **Convite de turma**: autorização para um e-mail ingressar numa turma. Turma,
  e-mail normalizado, hash do token, situação
  (`PENDING`/`ACCEPTED`/`EXPIRED`/`CANCELLED`), validade, quantidade de envios,
  quem convidou, datas de criação, último envio, aceite e cancelamento, e a conta
  que aceitou. Separado dos convites de professor e gestor da Fase 001, que têm outra
  finalidade.
- **Cadastro de aluno**: dados acadêmicos de uma conta com o papel de aluno — RA
  (único), situação (`ACTIVE`/`INACTIVE`) e datas. Estende o perfil de aluno já
  existente na Fase 001; nome e e-mail continuam na conta.
- **Matrícula**: participação de um aluno numa turma. Aluno, turma, situação
  (`ACTIVE`/`REMOVED`), data de ingresso, data de remoção, quem removeu, convite de
  origem e datas. Várias matrículas por aluno; no máximo uma ativa por turma.
- **Tentativa de envio de convite**: registro de cada envio do e-mail de um convite,
  com situação, quantidade de tentativas, próxima tentativa e erro resumido (sem
  token), para dar observabilidade e permitir novas tentativas.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Um professor cria uma turma e envia o primeiro convite em menos de 2
  minutos, com no máximo 3 ações depois de abrir a turma (Convidar aluno → e-mail →
  Enviar).
- **SC-002**: Um aluno novo sai do e-mail do convite e entra na turma em menos de 3
  minutos, preenchendo apenas nome, RA, senha e confirmação.
- **SC-003**: Em 100% dos testes da matriz de acesso, um professor não consegue ver,
  alterar ou listar nada de turma, convite ou matrícula de outro professor, e as
  respostas para "não existe" e "não é seu" são indistinguíveis.
- **SC-004**: Em 100% dos testes de concorrência (convites, aceites e remoções
  simultâneos), não surgem contas, cadastros de aluno, papéis, convites pendentes ou
  matrículas ativas duplicados, nem estados parciais.
- **SC-005**: 100% dos links expirados, cancelados, substituídos, usados ou
  adulterados são recusados.
- **SC-006**: Nenhuma senha, hash de senha, token bruto ou hash de token aparece em
  respostas, logs, auditoria ou mensagens de envio, verificado por varredura
  automatizada durante as jornadas da feature.
- **SC-007**: Com o serviço de e-mail indisponível, 100% dos convites continuam
  criados, e o e-mail é entregue automaticamente quando o serviço volta dentro do
  período de novas tentativas.
- **SC-008**: As listas de turmas, alunos e convites respondem em até 1 segundo para
  uma turma com 200 alunos e um professor com 100 turmas.
- **SC-009**: 100% das operações auditáveis da feature produzem exatamente um
  registro de auditoria cada, na mesma operação.
- **SC-010**: As quatro jornadas críticas (professor cria turma e convida; aluno novo
  aceita; aluno existente aceita segundo convite; professor remove aluno) passam de
  ponta a ponta no navegador.
- **SC-011**: Todas as telas novas passam na verificação automatizada de
  acessibilidade WCAG 2.2 AA e são operáveis só com teclado.

### Acceptance Criteria Traceability

| # | Critério de aceite | Verificado por |
|---|--------------------|----------------|
| 1 | Professor cria e administra suas turmas | US1-1–US1-5; FR-001–FR-008 |
| 2 | Convite informando somente o e-mail | US2-1, US2-2; FR-010; US8-7 e FR-048 (convite é a única forma de criar conta de aluno) |
| 3 | Convite seguro associado à turma | FR-013, FR-016 |
| 4 | Convite enviado ou com envio agendado | US2-1, US2-6; FR-019; SC-007 |
| 5 | Convite expira | US5-6; FR-015 |
| 6 | Token de uso único | US3-7; FR-016, FR-017 |
| 7 | Token bruto não persistido | FR-016; SC-006 |
| 8 | Aluno novo cria a própria conta | US3-1, US3-2; FR-031 |
| 9 | Aluno novo define a própria senha | US3-2, US3-5; FR-032 |
| 10 | Professor nunca acessa a senha do aluno | US3-8; FR-032; SC-006 |
| 11 | Sem conta duplicada para aluno existente | US4-2; FR-034, FR-037 |
| 12 | Aluno existente aceita convite de nova turma | US4-1, US4-2 |
| 13 | Aluno em várias turmas | US4-7; FR-042 |
| 14 | Aceite cria matrícula | US3-2, US4-2; FR-031, FR-034 |
| 15 | Sem matrícula ativa duplicada | FR-043; SC-004 |
| 16 | Sem convite pendente duplicado | US2-3, US2-5; FR-012 |
| 17 | Professor vê alunos da turma | US6-1, US6-2; FR-045 |
| 18 | Professor vê convites pendentes | US5-1; FR-023 |
| 19 | Professor cancela convite pendente | US5-4; FR-022 |
| 20 | Reenvio com controles de segurança | US5-2, US5-3; FR-020, FR-021 |
| 21 | Professor remove aluno | US6-3; FR-044 |
| 22 | Remoção não exclui a conta | US6-3; FR-044 |
| 23 | Histórico de matrícula preservado | US6-5; FR-047 |
| 24 | Sem acesso a turma de outro professor | US1-6, US6-6, US8-3; SC-003 |
| 25 | Autorização validada no backend | US8-1–US8-4 |
| 26 | Listagens com paginação, pesquisa e filtros | US1-2, US5-1, US6-2; FR-007, FR-023, FR-045 |
| 27 | Contratos compartilhados | FR-060 |
| 28 | Validação conforme a arquitetura | FR-060; US8-6 |
| 29 | Estado do servidor pela camada oficial | FR-053; Assumptions |
| 30 | Dados da API sem cópia em estado global | Assumptions |
| 31 | Operações críticas transacionais | US3-6; FR-031, FR-034, FR-037 |
| 32 | Auditoria das operações relevantes | FR-061; SC-009 |
| 33 | Sem segredos em logs e auditoria | FR-016, FR-061, FR-062; SC-006 |
| 34 | Testes das regras de negócio | SC-003–SC-006, SC-009 |
| 35 | Testes E2E das jornadas críticas | SC-010 |
| 36 | Respeito à constituição e às specs anteriores | Security, Permissions & Audit; Assumptions; FR-048 (com emenda ao princípio XXV) |

## Assumptions

- **Tecnologia**: a feature reutiliza integralmente a stack e os padrões das fases 001
  e 002 (contratos compartilhados, camada oficial de estado do servidor no web,
  formulários com validação compartilhada, componentes do design system, E2E e CI).
  Nenhum estado global de cliente é necessário: turmas, alunos, convites e matrículas
  vêm sempre da API, sem cópia em estado global.
- **Envio assíncrono**: não há fila dedicada no projeto; o envio "depois da gravação,
  com novas tentativas" será resolvido no plano com os recursos já existentes (banco
  de dados e rotinas de manutenção da Fase 001), sem nova infraestrutura (constituição
  IX).
- **Validade e limites**: 7 dias de validade, como os convites da Fase 001; os limites
  de FR-021 são padrões ajustáveis por configuração, não por código.
- **Professor**: somente contas com papel `TEACHER` ativo gerenciam turmas; o
  professor responsável é quem criou a turma. Coprofessores, transferência de turma
  e acesso de coordenação ficam para specs posteriores.
- **RA**: identificador acadêmico único no sistema (uma instituição); formato livre
  dentro de FR-041. Contas criadas pelo antigo autocadastro da Fase 001 não têm RA até
  aceitarem o primeiro convite.
- **Emenda constitucional**: o princípio XXV ("Alunos PODEM ter autocadastro…") e o
  roteiro da Fase 001 na constituição precisam ser emendados por
  `/speckit-constitution` antes do plano, para que FR-048 não viole a constituição.
- **Perfil de aluno existente**: o "cadastro de aluno" desta feature estende o perfil
  de aluno da Fase 001 (RA e situação) em vez de criar uma segunda entidade para a
  mesma pessoa.
- **Convites separados**: os convites de turma são uma entidade própria, distinta dos
  convites de professor e de gestor da Fase 001.
- **Contas não verificadas**: a exclusão automática de contas não verificadas da Fase
  001 não atinge contas que aceitaram convite de turma (o aceite confirma o e-mail).
- **Idioma e textos**: interface, e-mails e mensagens em português, com os textos de
  FR-052.

### Decisões adiadas (não decididas nesta feature)

- Transferência de alunos entre turmas.
- Coprofessores e acesso de coordenação às turmas.
- Política de turmas de professor desativado (transferência, congelamento); nesta
  feature elas ficam preservadas e inacessíveis.
- Desarquivamento de turmas e exclusão de turmas sem histórico.
- Inativação do cadastro de aluno e alteração de RA.
- Importação de alunos por planilha e integração com sistemas acadêmicos.
