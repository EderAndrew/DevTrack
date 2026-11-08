# Feature Specification: Aviso discreto do professor ao aluno durante a prova

**Feature Branch**: `025-exam-student-nudge`
**Created**: 2026-11-08
**Status**: Draft
**Input**: User description: "Aviso discreto do professor ao aluno durante a prova (amplia o 024 mobile e o 018).
Quando um aluno faz uma prova (018, sempre CONTROLLED) e sai da tela, o professor já recebe o push no app mobile
(024). Quando um mesmo aluno tem 2 ou mais ocorrências contadas na prova, o app mostra um sino ao lado desse aluno
(na sala da prova e no detalhe do aluno). O sino não aparece enquanto a tentativa está retida (4ª ocorrência),
pausada ou encerrada. Ao tocar no sino, só aquele aluno recebe na página da prova um Alert Dialog (shadcn, do
Design System) com texto fixo do web: "<NOME_DO_ALUNO>, o professor está acompanhando suas ações. Não tente fazer
algo que possa prejudicar sua nota." O nome vem do servidor, o professor não escreve texto livre, e não há
"fraude", "cola" ou "violação". Há um aviso pendente por vez para cada aluno; um novo só depois que o aluno fechar
o anterior (se ainda houver um pendente, a resposta é idempotente). O aviso chega pelo polling que a página da
prova já faz (sem WebSocket) e não é mostrado enquanto a tentativa estiver pausada ou retida. O aluno fecha o
aviso e continua a prova: o tempo segue correndo, e o aviso nunca é nota, desconto, bloqueio nem ocorrência. O
envio e o fechamento são auditados só com ids, enums e datas, e aparecem na revisão da prova e na linha do tempo
do aluno. Só o app mobile envia o aviso; o monitor do computador apenas mostra os avisos. É a primeira ação de
escrita do app mobile: revoga de forma explícita a regra "o app é só leitura" do 024, com a nova rota marcada
@MobileAccess() e restrita ao professor da turma."

## Contexto: o que muda

Hoje (018 + 024), quando um aluno sai da tela durante a prova, a ocorrência é registrada, o aluno vê o aviso de 1
a 3 do sistema e o celular do professor vibra. Se o professor quiser chamar a atenção daquele aluno, precisa
falar o nome dele em voz alta ou ir até a carteira, o que distrai a sala inteira. Esta feature dá ao professor, no
celular, um sino ao lado do aluno com 2 ou mais ocorrências: um toque mostra só para aquele aluno, na tela da
prova, um aviso fixo dizendo que o professor está acompanhando.

| Ponto | Hoje | Depois desta feature |
|-------|------|----------------------|
| Chamar a atenção de um aluno durante a prova | Em voz alta ou indo até ele | Um toque no sino do celular; o aviso aparece só na tela daquele aluno |
| Ações do app mobile | Só leitura (024 FR-010), além de silenciar avisos | **Ganha uma ação de escrita**: enviar o aviso ao aluno. Decisões, chamada e pausas **continuam só no computador** |
| Monitor da prova no computador | Situação, ocorrências, decisões | Mostra também os avisos enviados e se o aluno já fechou; **não envia** aviso |
| Ocorrências, avisos 1–3, retenção, tempo (018) | — | **Não mudam**: o aviso do professor nunca é ocorrência, nota, desconto nem bloqueio |
| Revisão da prova e linha do tempo do aluno | Ocorrências e decisões | Mostram também os avisos do professor (enviado, fechado) |

**Emenda à 024**: a regra "o aplicativo é só leitura" (024 FR-010, Assumptions e a regra do CLAUDE.md "the app is
read-only") passa a ter **uma exceção explícita**: enviar o aviso desta spec. Nenhuma outra ação de escrita entra
no aplicativo por esta spec.

## Clarifications

### Session 2026-11-08

- Q: O que liga o sino? → A: 2 ou mais ocorrências contadas daquele aluno na prova (avisos 1–3 da 018). O sino
  não aparece com a tentativa retida (4ª ocorrência), pausada ou encerrada.
- Q: O texto é fixo ou o professor escreve? → A: Fixo, definido no web; o nome do aluno vem do servidor. Sem texto
  livre do professor; nunca "fraude", "cola" ou "violação".
- Q: Quantos avisos o professor pode mandar? → A: Um aviso pendente por vez por aluno; um novo só depois que o
  aluno fechar o anterior. Tocar de novo com um pendente devolve o mesmo aviso, sem criar outro.
- Q: Como o aviso chega ao aluno? → A: Por consulta periódica da tela da prova, a cada 5 s (sem conexões
  permanentes); não é mostrado com a tentativa pausada ou retida. Emenda do plano (research N2): uma consulta
  própria no ritmo da consulta da pausa, porque esta pertence à chamada (016).
- Q: O professor vê o histórico? → A: Sim: envio e fechamento são auditados e aparecem na revisão da prova e na
  linha do tempo do aluno (web e celular).
- Q: O monitor do computador também envia? → A: Não. Só o aplicativo do celular envia; o computador só mostra.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Professor envia o aviso pelo sino no celular (Priority: P1)

Na sala da prova no celular (024), o aluno que já tem 2 ou mais ocorrências contadas e está respondendo mostra um
sino ao lado do nome, na lista e no detalhe do aluno. O professor toca no sino, confirma ("Enviar aviso para Ana
Souza?") e o aviso é enviado só para aquele aluno. O sino passa a indicar "Aviso enviado — aguardando o aluno" até
o aluno fechar o aviso; depois volta a ficar disponível e mostra "Último aviso fechado às 10:14".

**Why this priority**: é a ação que o professor pediu; sem ela não há o que mostrar ao aluno.

**Independent Test**: com uma prova em andamento e um aluno com 2 ocorrências, tocar no sino no celular e
conferir que o aviso fica pendente para aquele aluno e para nenhum outro; tocar de novo e conferir que nenhum
segundo aviso é criado.

**Acceptance Scenarios**:

1. **Given** um aluno respondendo a prova com 1 ocorrência contada, **When** a sala é exibida no celular, **Then**
   não há sino ao lado dele.
2. **Given** um aluno respondendo com 2 ou 3 ocorrências contadas, **When** a sala é exibida, **Then** há um sino
   ao lado dele na lista e no detalhe do aluno, com nome acessível "Enviar aviso para <nome>".
3. **Given** o sino disponível, **When** o professor toca e confirma, **Then** um aviso pendente é criado para a
   tentativa daquele aluno e o sino mostra "Aviso enviado — aguardando o aluno".
4. **Given** um aviso pendente para o aluno, **When** o professor toca de novo (ou dois toques chegam juntos),
   **Then** a resposta é o mesmo aviso pendente, nenhum outro é criado e nenhum segundo evento é auditado.
5. **Given** o aluno fechou o aviso, **When** a sala se atualiza, **Then** o sino volta a ficar disponível com
   "Último aviso fechado às HH:MM" (horário do servidor), e um novo toque cria um novo aviso.
6. **Given** a tentativa retida (4ª ocorrência), pausada, entregue, encerrada por tempo ou cancelada, **When** a
   sala é exibida, **Then** não há sino; se o professor enviar mesmo assim (tela desatualizada), o servidor recusa
   com `409` e a sala mostra "Não é possível enviar o aviso agora." e se atualiza.
7. **Given** um aluno de uma prova de outra turma, ou de um trabalho ou exercício, **When** o professor tenta
   enviar o aviso, **Then** recebe `404`, sem revelar a tentativa.
8. **Given** o professor no computador, **When** abre o monitor da prova, **Then** não há botão de enviar aviso;
   uma tentativa de enviar com a sessão da web é recusada (`403`).
9. **Given** o envio do aviso, **When** concluído, **Then** nenhuma notificação push é enviada por causa dele e
   nada muda nas ocorrências, nos avisos 1–3, no tempo ou na situação da tentativa.

---

### User Story 2 - Aluno vê o aviso, fecha e continua a prova (Priority: P1)

Na tela da prova, na próxima atualização, o aluno vê um aviso em diálogo, no centro da tela, sem sair da tela
cheia: "Ana Souza, o professor está acompanhando suas ações. Não tente fazer algo que possa prejudicar sua nota."
com um único botão "Entendi". Ao fechar, ele volta para a questão em que estava, com as respostas intactas; o
tempo continuou correndo. Os colegas não veem nada.

**Why this priority**: é o efeito que o professor quer, sem falar o nome do aluno em voz alta.

**Independent Test**: com um aviso pendente, abrir a tela da prova do aluno, conferir o diálogo com o nome em até
10 segundos, fechá-lo, conferir que não volta a aparecer (nem depois de recarregar) e que nenhuma ocorrência foi
registrada.

**Acceptance Scenarios**:

1. **Given** um aviso pendente para o aluno e a tentativa em andamento, **When** a tela da prova se atualiza,
   **Then** em até 10 segundos aparece o diálogo com o texto fixo e o nome do aluno vindo do servidor.
2. **Given** o diálogo aberto, **When** o aluno escolhe "Entendi" (ou fecha pelo teclado), **Then** o aviso fica
   fechado no servidor com o horário do servidor, o diálogo some e o foco volta para onde estava.
3. **Given** o aviso fechado, **When** o aluno recarrega a página ou abre a prova em outra aba, **Then** o aviso
   não aparece de novo.
4. **Given** o diálogo aberto em tela cheia, **When** ele aparece e quando é fechado, **Then** a tela cheia não é
   encerrada e nenhuma ocorrência é registrada por causa do aviso; enquanto o diálogo está aberto, a inatividade
   não conta.
5. **Given** o diálogo aberto, **When** o tempo continua, **Then** o cronômetro segue visível e correndo; se o
   tempo acabar com o diálogo aberto, a prova se encerra como na 018 e o aviso deixa de ser mostrado.
6. **Given** o aviso pendente e a tentativa pausada ou retida, **When** a tela da prova se atualiza, **Then** o
   aviso não aparece; se a tentativa voltar a em andamento (retorno liberado, prova devolvida), ele aparece na
   atualização seguinte.
7. **Given** o aviso pendente e a tentativa entregue, encerrada por tempo, cancelada ou com a prova encerrada,
   **When** isso acontece, **Then** o aviso termina como "Não visto" e nunca é mostrado.
8. **Given** o diálogo, **When** exibido, **Then** usa o Alert Dialog do Design System, é anunciado por leitores de
   tela como alerta, prende o foco até ser fechado, funciona nos temas escuro e claro e nunca diz "fraude", "cola"
   ou "violação".
9. **Given** outro aluno da mesma prova, **When** a tela dele se atualiza, **Then** ele não recebe nada sobre o
   aviso do colega.

---

### User Story 3 - Professor acompanha os avisos na sala, na linha do tempo e na revisão (Priority: P2)

No monitor da prova no computador e na sala do celular, o professor vê, por aluno, quantos avisos enviou e se há
um pendente. Na linha do tempo do aluno (celular e computador), os avisos aparecem entre as ocorrências:
"Aviso do professor enviado — 10:12" e "Aviso fechado pelo aluno — 10:13" (ou "Não visto"). Na revisão da prova,
depois do fim, o mesmo histórico aparece junto das ocorrências e decisões.

**Why this priority**: dá contexto às decisões do professor, mas o essencial (enviar e o aluno ver) já existe sem
ela.

**Independent Test**: enviar dois avisos a um aluno (o segundo depois de ele fechar o primeiro), abrir a linha do
tempo no celular e no computador e a revisão depois do fim, e conferir os quatro registros com os horários do
servidor.

**Acceptance Scenarios**:

1. **Given** avisos enviados a um aluno, **When** o professor abre a linha do tempo do aluno no celular ou no
   computador, **Then** vê cada aviso com o horário de envio e o de fechamento (ou "Aguardando o aluno" / "Não
   visto"), na ordem do tempo junto das ocorrências.
2. **Given** o monitor da prova no computador, **When** um aluno tem aviso pendente, **Then** a linha dele mostra
   "Aviso pendente", sem botão de envio, e a contagem de avisos enviados.
3. **Given** a revisão da prova depois do fim, **When** o professor abre a tentativa, **Then** vê os avisos com
   seus horários junto das ocorrências e decisões.
4. **Given** qualquer tela, **When** um aviso é exibido ao professor, **Then** fica claro que não é ocorrência, não
   entra na contagem de 1–3 e nunca é indicado só por cor.
5. **Given** o aluno, **When** vê o resultado liberado, **Then** não vê o histórico de avisos do professor (só o
   que a 018 já mostra).

---

### Edge Cases

- O aluno tem 2 ocorrências, o professor envia o aviso e logo acontece a 4ª (retenção): o aviso fica pendente e não
  é mostrado; se o professor devolver a prova, o aviso aparece; se cancelar, termina "Não visto".
- O aluno tem a prova aberta em duas abas: o diálogo pode aparecer nas duas; fechar numa fecha no servidor, e a
  outra o esconde na próxima atualização. Fechar duas vezes não gera segundo fechamento nem segundo evento.
- O aluno fecha o aviso sem conexão: o diálogo fecha na hora e a prova continua respondível (o aviso nunca bloqueia,
  FR-013); o fechamento é reenviado em segundo plano até o servidor aceitar, e a tela não volta a mostrar, nesse
  aparelho, o aviso que o aluno já fechou. Até o servidor aceitar, o professor vê "Aguardando o aluno".
- O professor envia, a tela do celular está desatualizada e o aluno acabou de entregar: `409`, nada é criado.
- O professor perdeu a turma (turma arquivada, professor removido) ou a sessão do celular foi revogada: o envio é
  recusado como as leituras da 024 (`404`/`401`).
- Uma prova silenciada (024 US4) continua mostrando o sino: silenciar só desliga os pushes.
- O aluno foi desmarcado da chamada antes de iniciar: não tem tentativa, logo não tem sino.
- O sino em salas grandes: cada aluno elegível tem o próprio sino; o envio é sempre de um aluno por vez.

## Requirements *(mandatory)*

### Functional Requirements

**Sino e envio (celular)**

- **FR-001**: A sala da prova no aplicativo DEVE mostrar um sino ao lado do aluno, na lista e no detalhe do aluno,
  somente quando a tentativa dele estiver em andamento (não retida, não pausada, não encerrada, dentro do tempo) e
  tiver 2 ou mais ocorrências contadas; a elegibilidade DEVE vir do servidor, derivada na leitura.
- **FR-002**: Tocar no sino DEVE pedir confirmação com o nome do aluno e, confirmado, criar um aviso pendente para
  a tentativa daquele aluno.
- **FR-003**: Cada tentativa DEVE ter no máximo um aviso pendente; um envio com um pendente DEVE devolver o mesmo
  aviso, sem criar outro e sem novo evento, também sob envios simultâneos.
- **FR-004**: O servidor DEVE recusar o envio com `409` quando a tentativa não estiver elegível (FR-001), sem criar
  nada, e com `404` quando a tentativa não for de uma prova da turma do professor.
- **FR-005**: O envio DEVE ser aceito só de uma sessão do celular do professor responsável pela turma; a interface
  da web NÃO DEVE oferecer o envio e o servidor DEVE recusar o envio feito com sessão da web (`403`).
- **FR-006**: O pedido de envio NÃO DEVE aceitar texto, nome, aluno, turma ou prova no corpo: a tentativa vem do
  caminho e tudo o mais do servidor.
- **FR-007**: Esta é a única ação de escrita sobre a prova que o aplicativo ganha; decidir, chamada, pausa e
  retorno continuam só no computador (024 FR-010 emendado).

**Aviso na tela do aluno**

- **FR-008**: A tela da prova do aluno DEVE receber o aviso pendente por consulta periódica ao servidor a cada 5 s,
  como a da pausa (016), só com a página visível e sem conexões permanentes (atraso máximo de 10 s), e mostrá-lo em um diálogo de alerta do Design System com o texto fixo "<nome>, o professor está
  acompanhando suas ações. Não tente fazer algo que possa prejudicar sua nota." e um único botão "Entendi".
- **FR-009**: O nome mostrado DEVE ser o nome do próprio aluno vindo do servidor; a visão do aluno DEVE carregar só
  o id do aviso e esse nome (lista fechada de campos), nunca quem enviou, quantos avisos houve ou as ocorrências.
- **FR-010**: O aviso NÃO DEVE ser mostrado enquanto a tentativa estiver pausada ou retida; volta a ser mostrado se
  a tentativa voltar a em andamento.
- **FR-011**: Fechar o aviso DEVE esconder o diálogo na hora e registrar o fechamento no servidor com o horário do
  servidor (reenviado até ser aceito se a conexão falhar); repetir o fechamento DEVE ser idempotente; o aviso fechado
  nunca volta a aparecer.
- **FR-012**: Um aviso pendente cuja tentativa termine (entrega, tempo, cancelamento, prova encerrada) DEVE passar
  a "Não visto" na leitura, sem job, e nunca ser mostrado.
- **FR-013**: O aviso NUNCA DEVE ser ocorrência, nota, desconto, bloqueio ou motivo de retenção; não muda o tempo, a
  contagem 1–3, a tela cheia, as respostas ou a situação da tentativa. O aparecimento e o fechamento do diálogo
  NÃO DEVEM gerar ocorrência, e a inatividade NÃO DEVE contar enquanto ele estiver aberto.
- **FR-014**: Fechar o aviso DEVE ser aceito só do próprio aluno, na própria tentativa em andamento, e recusado como
  as escritas da 018 quando a tentativa estiver pausada, retida ou encerrada.

**Histórico para o professor**

- **FR-015**: A sala no celular, o monitor da prova no computador, a linha do tempo do aluno (celular e computador)
  e a revisão da prova DEVEM mostrar os avisos do aluno com o horário de envio e a situação (aguardando, fechado com
  horário, não visto), distintos das ocorrências.
- **FR-016**: O aluno NÃO DEVE ver o histórico de avisos em nenhum momento (nem depois da liberação do resultado).

**Textos e design**

- **FR-017**: Todo texto desta feature DEVE estar em português, NUNCA usar "fraude", "cola" ou "violação", e
  nenhuma situação pode ser indicada só por cor; os textos ficam no web e no aplicativo, nunca no servidor. Para o
  aluno, o diálogo se chama "Mensagem do professor" (distinto do "Aviso n de 3" da 018); para o professor, os
  rótulos dizem "aviso do professor" (distinto dos avisos push da 024).
- **FR-018**: O diálogo e o sino DEVEM seguir o Design System (web e `@repo/design-tokens` no celular), nos temas
  escuro e claro, acessíveis por teclado e leitor de tela.

### Security, Permissions & Audit *(mandatory if feature has protected operations)*

- **Permissions**: enviar o aviso exige uma permissão própria do professor (`provas.avisos.enviar`), além do
  acesso à sala da 024 (`chamada.registrar`), ambas checadas na rota; nenhuma checagem usa nome de papel. Fechar o aviso exige
  `atividades.proprias.responder` (012), como as demais escritas da tentativa.
- **Resource context**: envio — professor responsável pela turma da prova, tentativa de uma atividade EXAM dessa
  turma (fora → `404`); fechamento — aluno dono da tentativa, com matrícula ACTIVE e presença registrada (016).
- **Audit events**: aviso enviado (professor, ator; ids da tentativa, da atividade e do aviso) e aviso fechado
  (aluno, ator; mesmos ids), na mesma transação da gravação; envio recusado por inelegibilidade é auditado com o
  código. Metadados só com ids, enums, contagens e horários; nunca nome nem texto do aviso. O envio idempotente
  (aviso já pendente) não gera evento.
- **Untrusted input**: o envio não tem corpo além de `{}`; o fechamento identifica o aviso pelo caminho; campos
  extras são recusados (`400`). Nenhum horário vem do cliente.
- **States & transitions**: aviso: PENDENTE → FECHADO (pelo aluno); PENDENTE → NÃO VISTO derivado na leitura quando
  a tentativa termina. "Mostrável" (pendente e tentativa em andamento) é derivado. Transições inválidas → `409`.
  Nenhum estado da tentativa (018) muda.
- **Idempotency**: um pendente por tentativa garantido pelo banco (índice único parcial) e envio serializado com
  as escritas da tentativa; fechamento repetido devolve o mesmo resultado sem segundo evento.
- **Evidence vs. decisions**: o envio é HUMAN_DECISION do professor (um sinal ao aluno, sem efeito acadêmico); o
  fechamento é FACT. Ocorrências e retenção continuam FACT/RULE_RESULT da 018.
- **Automation risk level**: N/A (sem IA, sem automação: só o professor envia).
- **Domain configurability**: nada de disciplina, linguagem ou tecnologia.
- **Sensitive data & adaptations**: o aviso mostra ao aluno só o próprio nome; o professor vê só o que a sala da
  024 já mostra; nenhum e-mail, RA, enunciado ou resposta; nada vai para push, logs ou auditoria além de ids.
- **Curricular traceability**: N/A.

### Key Entities *(include if feature involves data)*

- **Aviso do professor**: sinal enviado por um professor a uma tentativa de prova; guarda a tentativa, quem
  enviou, o horário de envio e, quando houver, o horário de fechamento pelo aluno. No máximo um pendente por
  tentativa; nunca texto (o texto é fixo nas interfaces).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Em 95% dos envios, o aluno vê o aviso em até 10 segundos com a tela da prova aberta e conectada.
- **SC-002**: O aviso aparece apenas na tela do aluno escolhido: 0 casos de aviso exibido a outro aluno nos testes.
- **SC-003**: Um aviso nunca muda ocorrências, contagem 1–3, tempo, respostas, situação ou nota da tentativa (0
  diferenças nos testes comparando tentativas com e sem aviso).
- **SC-004**: Envios repetidos ou simultâneos com um aviso pendente nunca criam um segundo aviso nem um segundo
  evento (0 duplicatas nos testes de concorrência).
- **SC-005**: O sino aparece em 100% dos alunos elegíveis (em andamento, 2+ ocorrências) e em 0% dos demais nas
  verificações da sala.
- **SC-006**: Nenhuma tela, aviso, log ou evento desta feature contém "fraude", "cola", "violação", e-mail, RA,
  enunciado ou resposta (0 ocorrências nas varreduras).
- **SC-007**: No piloto, o professor envia o aviso a um aluno em menos de 5 segundos a partir da sala aberta, sem
  falar em voz alta.

## Assumptions

- O sino depende da sala do celular (024); quem não usa o aplicativo não envia aviso nesta feature.
- O limite é só um pendente por vez; não há teto de avisos por tentativa, porque cada novo exige que o aluno tenha
  fechado o anterior.
- O nome mostrado é o nome da conta do aluno, o mesmo da lista da turma.
- A tela da prova em andamento já consulta o servidor a cada 5 s só para a pausa (016); o aviso tem uma consulta
  leve própria no mesmo ritmo, sem conexões permanentes (emenda do plano, research N2: a consulta da pausa pertence
  à chamada e não pode carregar dados da prova).
- O envio não gera push nem e-mail para ninguém.
- Trabalhos (015/016/023) e exercícios ficam fora: o aviso existe só em provas (018).
- Os registros de aviso seguem a retenção das ocorrências da prova (018).
