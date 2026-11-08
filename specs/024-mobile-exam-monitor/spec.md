# Feature Specification: Monitoramento de provas no celular

**Feature Branch**: `024-mobile-exam-monitor`
**Created**: 2026-11-07
**Status**: Draft
**Input**: User description: "Monitoramento de provas no celular (018): app mobile Android (distribuição interna
via EAS Build primeiro, iOS depois) em que o professor entra com a própria conta, escolhe uma prova aplicada em
andamento e acompanha a sala como no monitor da web: cada aluno com a situação em palavras, as ocorrências (saída
da tela, tela cheia, área de transferência, inatividade), os avisos 1 a 3 e as provas retidas aguardando decisão.
Somente leitura: as decisões (cancelar, devolver, "Não cancelar") continuam no computador. A cada ocorrência
registrada e a cada prova retida, o celular do professor vibra e toca, também com o app em segundo plano ou a tela
bloqueada, por notificação push enviada pelo servidor. O professor recebe só avisos das provas das próprias turmas
e pode desligar os avisos de uma prova. A notificação não traz conteúdo da prova; os textos nunca dizem "fraude",
"cola" ou "violação"."

## Contexto: o que muda

Hoje o professor acompanha uma prova (018) só no computador, na aba "Chamada e prova": a lista de alunos com a
situação de cada um, atualizada a cada 5 segundos, as ocorrências e as provas encerradas por avisos aguardando
decisão. Para perceber uma ocorrência, ele precisa estar olhando a tela. Esta feature dá ao professor um aplicativo
de celular que mostra essa mesma sala, só para leitura, e avisa (vibra e toca) quando algo acontece, mesmo com o
celular no bolso.

| Ponto | Hoje | Depois desta feature |
|-------|------|----------------------|
| Onde acompanhar a prova | Só no computador | No computador (igual) e no aplicativo do celular |
| Perceber uma ocorrência | Olhando a tela | O celular vibra e toca, também em segundo plano ou bloqueado |
| Decidir uma prova retida (cancelar, devolver, "Não cancelar") | No computador | **Continua só no computador**; o celular mostra que há decisão pendente |
| Chamada, pausar aluno, liberar retorno, corrigir, liberar resultado | No computador | **Continua só no computador** |
| Regras da prova (018), ocorrências, avisos e retenção | — | **Não mudam**: o celular só lê e avisa |
| Aluno, trabalhos, exercícios e demais telas | — | **Fora do aplicativo** |

## Clarifications

### Session 2026-11-07

- Q: O aviso também precisa chegar com o celular bloqueado ou com o app em segundo plano? → A: Sim, por
  notificação enviada pelo servidor.
- Q: No celular, o professor só acompanha ou também decide as provas retidas? → A: Só acompanha; as decisões
  continuam no computador.
- Q: Como o aplicativo chega ao professor no começo? → A: Android, por distribuição interna (piloto), sem loja;
  iOS depois.
- Q: Com o celular bloqueado, o aviso mostra o nome do aluno? → A: Não. Bloqueado, só "Ocorrência na prova
  <título>"; o nome aparece depois de desbloquear (US3-8, FR-016). Emenda do plano (research Y7): bloqueado, o
  celular mostra só o aplicativo e "Conteúdo oculto", também sem o título da prova.
- Q: Por quanto tempo a sessão do celular vale? → A: Política própria: 30 dias sem uso, 90 dias no máximo,
  revogável como a da web; receber aviso não conta como uso (FR-004).

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Professor entra no aplicativo com a própria conta (Priority: P1)

O professor abre o aplicativo no celular e entra com o mesmo e-mail e senha da plataforma. Ao entrar, o
aplicativo pede permissão para mostrar notificações. Ele continua conectado entre usos, até sair, até a sessão
expirar ou até ela ser encerrada pela plataforma (troca de senha, desativação, "sair de todos os dispositivos").
Só quem pode acompanhar provas usa o aplicativo; um aluno ou um gestor que tente entrar vê que o aplicativo é
para professores.

**Why this priority**: sem entrar com a própria conta não há sala nem aviso; é a base das outras histórias.

**Independent Test**: entrar com uma conta de professor e ver a lista de provas; entrar com uma conta de aluno e
ver a recusa; sair e conferir que o celular deixa de receber avisos.

**Acceptance Scenarios**:

1. **Given** um professor com conta ativa, **When** ele entra com e-mail e senha no aplicativo, **Then** vê a
   lista das suas provas em andamento e o aplicativo pede permissão para notificações.
2. **Given** e-mail ou senha errados, **When** o professor tenta entrar, **Then** vê a mesma mensagem genérica da
   web, sem revelar se o e-mail existe, e as tentativas contam no mesmo limite de tentativas da web.
3. **Given** uma conta sem a permissão de acompanhar provas (aluno, gestor), **When** tenta entrar, **Then** vê
   "Este aplicativo é para professores acompanharem provas." e nenhuma sessão fica aberta no celular.
4. **Given** o professor conectado no celular, **When** ele escolhe "Sair", **Then** a sessão do celular é
   encerrada no servidor e o celular para de receber avisos na hora.
5. **Given** o professor conectado no celular, **When** ele troca a senha, é desativado ou encerra as sessões de
   todos os dispositivos, **Then** a sessão do celular deixa de valer, o celular para de receber avisos e, ao
   abrir o aplicativo, ele vê a tela de entrada.
6. **Given** a sessão do celular expirada, **When** o professor abre o aplicativo, **Then** vê a tela de entrada
   com "Sua sessão expirou. Entre novamente para voltar a receber avisos."
7. **Given** o professor recusou a permissão de notificações, **When** abre a lista de provas, **Then** vê um
   aviso permanente "As notificações estão desligadas neste celular. Você não receberá avisos." com o caminho
   para ativá-las nas configurações do aparelho.

---

### User Story 2 - Professor acompanha a sala da prova no celular (Priority: P1)

Na lista, o professor vê as provas das suas turmas que estão em andamento (aplicadas, já publicadas e ainda não
encerradas nem canceladas), com a turma, o título e o horário de encerramento. Ao escolher uma, vê a sala como na
web: cada aluno com a situação em palavras ("Respondendo — 25 min restantes — 2 ocorrências", "Encerrada por
avisos — aguardando decisão", "Pausado — desde 10:12 — 18 min restantes", "Entregou"...), as provas retidas
primeiro, depois os pausados, e a contagem de ocorrências. Ao tocar num aluno, vê as ocorrências dele, cada uma
com o tipo em palavras e o horário do servidor. A sala se atualiza sozinha enquanto está aberta. Nada pode ser
alterado pelo celular: para decidir uma prova retida, o aplicativo indica "Decida no computador".

**Why this priority**: é o que o professor precisa ver quando o aviso chega; sem a sala, o aviso não tem contexto.

**Independent Test**: com uma prova em andamento e alunos em situações diferentes, abrir a sala no celular e
conferir que cada situação, contagem e ocorrência é a mesma da web, na mesma ordem; provocar uma ocorrência e
conferir que a sala muda em até 10 segundos.

**Acceptance Scenarios**:

1. **Given** um professor com duas turmas, cada uma com uma prova em andamento, e uma prova de outra turma de
   outro professor, **When** ele abre a lista, **Then** vê só as duas provas das suas turmas.
2. **Given** a sala aberta no celular, **When** um aluno tem uma ocorrência registrada, **Then** em até 10 segundos
   a contagem do aluno muda, igual à web.
3. **Given** um aluno com a prova retida, **When** a sala é exibida, **Then** ele aparece primeiro, com
   "Encerrada por avisos — aguardando decisão" e "Decida no computador", sem botão de decisão.
4. **Given** a sala aberta, **When** o professor toca num aluno, **Then** vê as ocorrências dele ("Saiu da tela",
   "Saiu da tela cheia", "Tentou copiar/colar", "Sem interação por 45 s"), cada uma com o horário do servidor, e
   em que aviso de 1 a 3 cada uma resultou.
5. **Given** o tempo restante de cada aluno, **When** exibido, **Then** vem do relógio do servidor, nunca do
   relógio do celular.
6. **Given** a prova encerrada ou cancelada enquanto a sala está aberta, **When** a sala se atualiza, **Then** o
   professor vê "Esta prova foi encerrada." e a prova sai da lista de provas em andamento.
7. **Given** o celular sem conexão, **When** a sala está aberta, **Then** o aplicativo mostra "Sem conexão — os
   dados podem estar desatualizados" com o horário da última atualização e volta a atualizar sozinho quando a
   conexão volta.
8. **Given** qualquer texto da sala, **When** exibido, **Then** nunca usa "fraude", "cola" ou "violação", e a
   situação de um aluno nunca é indicada só por cor.

---

### User Story 3 - O celular vibra e toca a cada ocorrência e a cada prova retida (Priority: P1)

Durante a prova, a cada ocorrência registrada de um aluno e a cada prova retida (4ª ocorrência), o servidor envia
um aviso ao celular do professor, que vibra e toca, com o aplicativo aberto, em segundo plano ou com a tela
bloqueada. A prova retida tem um aviso próprio, distinto do de uma ocorrência. Tocar no aviso abre a sala da prova
com o aluno em destaque. O aviso diz o que aconteceu, nunca o conteúdo da prova.

**Why this priority**: é a razão da feature: o professor não precisa ficar olhando o computador.

**Independent Test**: com o aplicativo fechado e o celular bloqueado, provocar uma ocorrência e depois a 4ª
ocorrência de um aluno; conferir os dois avisos distintos, a vibração e o som, e que tocar no aviso abre a sala no
aluno.

**Acceptance Scenarios**:

1. **Given** o celular bloqueado e um aluno respondendo a prova, **When** uma ocorrência dele é contada, **Then**
   o celular vibra, toca e mostra um aviso "Ocorrência na prova" com o aviso de 1 a 3 a que ela corresponde.
2. **Given** um aluno com 3 ocorrências, **When** acontece a 4ª e a prova é retida, **Then** o celular recebe o
   aviso "Prova retida — decisão pendente", distinto do aviso de ocorrência.
3. **Given** um sinal que o servidor agrupa como uma única ocorrência (sair da tela cheia e perder o foco ao
   mesmo tempo), **When** registrado, **Then** chega um único aviso.
4. **Given** uma ocorrência registrada enquanto a prova está retida (que não conta, 018), **When** registrada,
   **Then** não gera aviso.
5. **Given** o aviso recebido, **When** o professor toca nele, **Then** o aplicativo abre a sala daquela prova
   com o aluno em destaque (pedindo para entrar antes, se a sessão expirou).
6. **Given** o professor conectado em dois celulares, **When** acontece uma ocorrência, **Then** os dois recebem
   o aviso.
7. **Given** uma ocorrência de uma prova de outra turma, que não é do professor, **When** registrada, **Then** o
   celular dele não recebe nada.
8. **Given** o aviso exibido, **When** lido em qualquer lugar (inclusive na tela bloqueada), **Then** não contém
   enunciado, resposta, nota, e-mail nem RA, e nunca diz "fraude", "cola" ou "violação". Com o celular
   bloqueado, o aviso mostra só o aplicativo e "Conteúdo oculto", sem o nome do aluno nem o título da prova
   (emenda do plano, research Y7: o celular não permite um texto próprio para a tela bloqueada); depois de
   desbloquear, mostra "Ocorrência na prova" ou "Prova retida — decisão pendente" com o nome, o aviso e a prova
   ("Ana Souza — Aviso 2 de 3 — <título>").
9. **Given** o envio do aviso falha (celular desligado, sem rede, serviço de notificação indisponível), **When**
   isso acontece, **Then** a ocorrência e a prova não mudam em nada; o aviso pode ser perdido, e a sala continua
   sendo a fonte da verdade.

---

### User Story 4 - Professor desliga os avisos de uma prova (Priority: P2)

Na sala de uma prova, o professor pode desligar os avisos daquela prova ("Silenciar avisos desta prova") e
religá-los depois. Os avisos vêm ligados para toda prova em andamento das suas turmas. Desligar não muda nada na
prova nem na web e vale para os celulares do professor.

**Why this priority**: evita barulho quando outro professor ou o próprio professor está acompanhando pelo
computador, mas o essencial (ver e ser avisado) já existe sem ela.

**Independent Test**: silenciar uma de duas provas em andamento, provocar ocorrências nas duas e conferir que só a
outra gera aviso; religar e conferir que volta a avisar.

**Acceptance Scenarios**:

1. **Given** duas provas em andamento, **When** o professor silencia uma, **Then** as ocorrências dela deixam de
   gerar aviso e as da outra continuam gerando.
2. **Given** uma prova silenciada, **When** o professor religa os avisos, **Then** a próxima ocorrência volta a
   gerar aviso; as que aconteceram enquanto estava silenciada não geram aviso atrasado.
3. **Given** uma prova silenciada, **When** a sala é exibida, **Then** ela mostra "Avisos silenciados" e continua
   se atualizando normalmente.
4. **Given** o professor com dois celulares, **When** silencia a prova num deles, **Then** os dois deixam de
   receber os avisos dela.
5. **Given** silenciar ou religar duas vezes seguidas, **When** repetido, **Then** o resultado é o mesmo, sem
   erro.

---

### Edge Cases

- O professor que não marcou presença de ninguém ainda vê a prova na lista; a sala mostra os alunos "Não marcado".
- Uma prova aplicada mas ainda não publicada (agendada) não aparece na lista; aparece quando começa.
- Uma prova cujo professor perdeu o acesso à turma (turma arquivada, professor removido) sai da lista e para de
  gerar avisos na hora.
- Muitas ocorrências em sequência numa sala grande (40 alunos): cada ocorrência contada gera um aviso; o aviso de
  uma mesma prova se agrupa no celular (o celular agrupa os avisos do aplicativo), para não encher a tela.
- O professor devolve a prova pelo computador: o aluno volta a "Respondendo"; uma nova ocorrência gera aviso de
  novo e uma nova retenção gera o aviso de prova retida de novo.
- O celular volta a ter conexão depois de perder avisos: a sala aberta mostra o estado atual; avisos perdidos não
  são reenviados em lote.
- O professor está conectado no celular com uma conta e outro professor entra no mesmo celular: o celular passa a
  receber só os avisos da conta conectada agora.
- A permissão de notificações é retirada nas configurações do aparelho depois de concedida: o aplicativo mostra o
  aviso de notificações desligadas na próxima abertura.

## Requirements *(mandatory)*

### Functional Requirements

**Acesso**

- **FR-001**: O aplicativo DEVE permitir entrar com o e-mail e a senha da conta da plataforma, com a mesma
  identidade, as mesmas permissões, a mesma resposta genérica para credenciais erradas e o mesmo limite de
  tentativas da web.
- **FR-002**: Só uma conta com a permissão de acompanhar provas (a mesma que dá acesso à sala na web) DEVE poder
  usar o aplicativo; as demais veem "Este aplicativo é para professores acompanharem provas." e nenhuma sessão é
  criada.
- **FR-003**: A sessão do celular DEVE ser opaca, revogável no servidor e guardada no aparelho só em armazenamento
  seguro; toda revogação que vale para a web (sair, troca de senha, desativação, remoção do papel, "sair de todos
  os dispositivos") DEVE valer também para ela.
- **FR-004**: A sessão do celular DEVE ter política própria: expira após 30 dias sem uso ou 90 dias depois de
  criada, o que vier primeiro, e continua revogável como a da web (FR-003). Receber um aviso não conta como uso;
  abrir o aplicativo e ler a sala contam. A política da web (8 h sem uso, 7 dias) não muda.
- **FR-005**: Aceitar as requisições do aplicativo NÃO DEVE enfraquecer as proteções das requisições da web.

**Sala da prova (somente leitura)**

- **FR-006**: O aplicativo DEVE listar as provas em andamento das turmas do professor (publicadas, não encerradas
  e não canceladas), com turma, título e horário de encerramento; nunca uma prova de outra turma.
- **FR-007**: A sala no aplicativo DEVE mostrar, para cada aluno, a mesma situação em palavras, a mesma contagem de
  ocorrências, o mesmo tempo restante e a mesma ordem (retidos primeiro, depois pausados) que a sala da web, a
  partir das mesmas informações do servidor.
- **FR-008**: A sala DEVE se atualizar sozinha a cada 5 segundos enquanto estiver aberta e visível, e mostrar o
  horário da última atualização quando estiver sem conexão.
- **FR-009**: Tocar num aluno DEVE mostrar as ocorrências dele com o tipo em palavras, o horário do servidor e o
  aviso de 1 a 3 correspondente, com os mesmos textos da web.
- **FR-010**: O aplicativo NÃO DEVE oferecer nenhuma ação que altere a prova, a chamada, uma pausa ou uma decisão;
  uma prova retida mostra "Decida no computador".
- **FR-011**: Tempos e situações DEVEM vir do relógio do servidor, nunca do relógio do celular.

**Avisos**

- **FR-012**: A cada ocorrência contada de um aluno numa prova em andamento das turmas do professor, o servidor
  DEVE enviar um aviso a cada celular conectado com a conta dele, exceto se a prova estiver silenciada.
- **FR-013**: Ao reter uma prova (4ª ocorrência), o servidor DEVE enviar um aviso de prova retida, distinto do aviso
  de ocorrência, com prioridade de alerta (vibração e som também com a tela bloqueada).
- **FR-014**: Uma ocorrência agrupada pelo servidor (018) DEVE gerar um único aviso; uma ocorrência registrada sem
  contar (prova retida, depois do fim) NÃO DEVE gerar aviso.
- **FR-015**: O envio do aviso DEVE acontecer depois que a ocorrência ou a retenção for gravada, fora do caminho da
  requisição do aluno; uma falha no envio NUNCA DEVE desfazer, atrasar ou mudar a ocorrência, a retenção ou a
  prova.
- **FR-016**: O aviso DEVE trazer só o necessário para o professor saber o que aconteceu e abrir a sala certa: o
  tipo do aviso, o título da prova, a turma, o aviso de 1 a 3 e, só na versão de tela desbloqueada, o nome do
  aluno; nunca enunciado, resposta, nota, e-mail, RA ou dado de contato. A versão de tela bloqueada NÃO DEVE
  trazer o nome do aluno (US3-8).
- **FR-017**: Tocar no aviso DEVE abrir a sala da prova com o aluno em destaque, depois de entrar se a sessão
  tiver expirado; o aplicativo DEVE confirmar no servidor que o professor ainda tem acesso antes de mostrar
  qualquer dado.
- **FR-018**: O celular DEVE ser registrado para receber avisos quando o professor entra e deixar de receber no
  "Sair", na expiração e em toda revogação da sessão, e quando outra conta entra no mesmo celular.
- **FR-019**: Avisos perdidos (celular desligado, sem rede, serviço indisponível) NÃO DEVEM ser reenviados em
  lote depois; a sala é a fonte da verdade.

**Silenciar**

- **FR-020**: O professor DEVE poder silenciar e religar os avisos de uma prova; o padrão é ligado; a escolha vale
  para todos os celulares dele, é idempotente e não muda a prova nem a web.
- **FR-021**: Ocorrências de uma prova silenciada NÃO DEVEM gerar aviso, nem depois de religar.

**Textos e design**

- **FR-022**: Todo texto do aplicativo e dos avisos DEVE estar em português, NUNCA usar "fraude", "cola" ou
  "violação", e nenhuma situação pode ser indicada só por cor.
- **FR-023**: O aplicativo DEVE seguir o Design System da plataforma, com os temas escuro e claro, e respeitar o
  tema escolhido pelo professor em "Aparência" (022).

### Security, Permissions & Audit *(mandatory if feature has protected operations)*

- **Permissions**: usar o aplicativo e ler a sala exigem a mesma permissão que dá acesso à sala da prova na web
  (`chamada.registrar`); silenciar avisos de uma prova exige a mesma permissão. Nenhuma permissão de decidir
  (`provas.encerramentos.decidir`) é usada pelo aplicativo. Nenhuma permissão nova é criada para ler.
- **Resource context**: toda leitura e todo silenciamento são do professor responsável pela turma da prova
  (fora dela → 404, sem revelar a prova); o envio de avisos usa o mesmo vínculo no momento do envio (um professor
  que perdeu a turma não recebe mais).
- **Audit events**: entrada, recusa e saída no celular têm eventos próprios de sessão do celular, com os mesmos
  dados (só ids) dos eventos de sessão da web; registrar e remover um celular para avisos (inclusive a remoção
  causada por uma revogação de sessão) são auditados só com ids e motivo (nunca o identificador de envio do
  aparelho);
  silenciar/religar e os envios de avisos não são auditados (preferência e efeito colateral, sem mudança de
  estado acadêmico).
- **Untrusted input**: o corpo do registro do celular aceita só o identificador de envio do aparelho e a
  plataforma (formato validado, tamanho limitado); o silenciamento aceita só a prova pelo caminho e o estado
  desejado. Nenhum corpo aceita usuário, turma ou permissão.
- **States & transitions**: avisos de uma prova: ligado ↔ silenciado (por professor). Celular para avisos: ativo →
  removido (no logout, expiração, revogação ou entrada de outra conta); um celular removido nunca recebe aviso.
  Nenhum estado da prova (018) muda.
- **Idempotency**: registrar o mesmo celular duas vezes mantém um só registro; silenciar uma prova silenciada não
  muda nada; cada ocorrência contada gera no máximo um aviso por celular, mesmo com reenvio dos eventos do aluno.
- **Evidence vs. decisions**: as ocorrências e a retenção continuam FACT/RULE_RESULT da 018; o aviso é só um
  sinal, nunca evidência nem decisão; as decisões (HUMAN_DECISION) continuam no computador.
- **Automation risk level**: N/A (sem IA; o envio de aviso é determinístico).
- **Domain configurability**: nada de disciplina, linguagem ou tecnologia no aplicativo.
- **Sensitive data & adaptations**: o aviso e o aplicativo nunca mostram e-mail, RA, enunciado, resposta ou nota;
  o nome do aluno só aparece com o celular desbloqueado (US3-8); nenhuma adaptação individual é tocada.
- **Curricular traceability**: N/A.

### Key Entities *(include if feature involves data)*

- **Sessão do celular**: a sessão de um professor aberta pelo aplicativo; opaca, revogável, com a mesma
  identidade da web; guardada no aparelho só em armazenamento seguro.
- **Celular para avisos**: o vínculo entre uma sessão do celular e o identificador de envio do aparelho, com a
  plataforma (Android, depois iOS); ativo enquanto a sessão vale; removido no logout, na expiração e na revogação.
- **Silenciamento de prova**: a escolha de um professor de não receber avisos de uma prova aplicada; um por
  professor e prova.
- **Aviso enviado**: o registro de que um aviso de uma ocorrência ou retenção foi enviado a um celular, para
  garantir no máximo um aviso por ocorrência e celular; sem conteúdo da prova.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Em 95% das ocorrências, o celular do professor recebe o aviso em até 10 segundos depois de a
  ocorrência ser registrada, com o celular conectado, inclusive bloqueado.
- **SC-002**: Em 100% das provas retidas, o aviso de prova retida é enviado, distinto do aviso de ocorrência.
- **SC-003**: A sala no celular mostra a mesma situação, contagem e ordem de alunos que a sala da web em 100% das
  verificações feitas no mesmo instante, e reflete uma mudança em até 10 segundos com o aplicativo aberto.
- **SC-004**: Nenhum aviso chega a um professor que não seja responsável pela turma da prova, nem depois do
  "Sair" ou da revogação da sessão (0 casos nos testes).
- **SC-005**: Nenhum aviso nem tela do aplicativo contém enunciado, resposta, nota, e-mail, RA, "fraude", "cola"
  ou "violação" (0 ocorrências nas varreduras).
- **SC-006**: Uma falha no envio de avisos nunca muda uma ocorrência, uma retenção ou uma prova (0 diferenças nos
  testes com o envio falhando).
- **SC-007**: No piloto, um professor consegue entrar no aplicativo e abrir a sala de uma prova em andamento em
  menos de 1 minuto, sem ajuda.

## Assumptions

- O aplicativo é só para o professor acompanhar provas (018); trabalhos (015/016/023), exercícios, chamada, pausas,
  decisões, correção e qualquer tela do aluno ficam fora.
- Android primeiro, por distribuição interna para o piloto; iOS e lojas ficam para depois, sem mudar as regras
  desta spec.
- O aviso é enviado por um serviço de notificação do sistema do celular; a entrega não é garantida pelo sistema,
  por isso a sala é a fonte da verdade (FR-019) e SC-001 mede celulares conectados.
- A sala do aplicativo lê as mesmas informações que a sala da web já oferece; as regras de ocorrência, aviso,
  agrupamento de 2 s e retenção da 018 não mudam.
- A atualização da sala a cada 5 segundos segue a da web (sem conexões permanentes).
- O tema do aplicativo segue a preferência "Aparência" da conta (022).
- O professor tem um celular Android com acesso à internet durante a prova.
