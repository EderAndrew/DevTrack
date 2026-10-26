# Feature Specification: Feedback dos Alunos

**Feature Branch**: `020-student-feedback`
**Created**: 2026-10-25
**Status**: Draft
**Input**: User description: "Feedback dos alunos. Eles poderão dar um feedback. Esse feedback vai para o
administrador para que possa realizar melhorias no sistema."

## Contexto: o que muda

Hoje o aluno não tem como dizer ao DevTrack o que não funciona, o que falta ou o que ajudou: um problema
na plataforma só chega ao administrador se o aluno contar ao professor e o professor repassar. Na beta,
esse retorno é o que orienta as melhorias.

Esta feature cria um canal direto do aluno para o administrador da plataforma:

- o aluno envia um feedback curto (categoria e texto) de qualquer tela do portal, fora de uma prova ou
  de um trabalho em modo controlado;
- o administrador vê todos os feedbacks numa lista, com quem enviou e de qual tela, e marca a situação
  de cada um;
- o aluno acompanha os próprios feedbacks e a situação de cada um, sem conversa nesta etapa.

O feedback é sobre a plataforma, não sobre a turma: o professor nunca vê os feedbacks, nem os enviados
por alunos das suas turmas. Nenhuma IA lê, resume ou classifica feedbacks.

## Clarifications

### Session 2026-10-25

- Q: O administrador vê quem enviou o feedback? → A: Sim, identificado: o ADMIN vê o nome e o e-mail do
  aluno; o professor nunca vê. Não há envio anônimo nesta etapa.
- Q: O administrador responde ao aluno? → A: Só pela situação (Recebido, Em análise, Resolvido,
  Arquivado), que o aluno vê na lista dos próprios feedbacks; sem resposta escrita nesta etapa.
- Q: Quem pode enviar feedback nesta etapa? → A: Só alunos; professores ficam para uma etapa seguinte.
- Análise (2026-10-25): a entrada fica fora só das telas de prova (018) e de trabalho em modo
  controlado (015), que são a página de foco, sem o menu do aluno; exercícios e trabalhos normais são
  respondidos dentro do portal e mostram a entrada. (Uma emenda do planejamento tinha estendido a
  exclusão a toda tela de responder, supondo que todas usavam a página de foco; foi desfeita.)
- Análise (2026-10-25): uma tela de origem inválida recusa o envio (`400`), como qualquer entrada
  inválida (Constituição I); o portal só envia um caminho que passa na mesma validação, ou nenhum.

## User Scenarios & Testing *(mandatory)*

Atores: **aluno** (conta de aluno criada por convite de turma, 003) e **ADMIN** (administrador da
plataforma, 001). O **professor** e o **gestor de cadastros** não participam: não enviam nem leem
feedbacks.

### User Story 1 - Aluno envia um feedback (Priority: P1)

De qualquer tela do portal do aluno, ele abre "Enviar feedback", escolhe a categoria (Problema,
Sugestão, Elogio ou Outro), escreve o texto e envia. A tela em que ele estava é registrada sozinha, para
o administrador saber onde o problema aconteceu. O aluno recebe a confirmação de que o feedback chegou.

**Why this priority**: sem o envio não há feature; é o que tira o aluno da dependência do professor
para relatar um problema da plataforma.

**Independent Test**: entrar como aluno, enviar um feedback da categoria Problema a partir do Painel e
conferir a confirmação e o feedback gravado com a categoria, o texto, o aluno e a tela.

**Acceptance Scenarios**:

1. **Given** um aluno logado numa tela do portal, **When** ele envia um feedback com categoria e um
   texto de 10 a 2.000 caracteres, **Then** o feedback é gravado como "Recebido", com o aluno, a
   categoria, o texto, a tela de origem e o momento do servidor, e o aluno vê a confirmação.
2. **Given** o formulário de feedback, **When** o aluno envia sem categoria, com menos de 10 ou mais de
   2.000 caracteres, **Then** o envio é recusado com a indicação do campo, e nada é gravado.
3. **Given** um aluno que clica duas vezes em "Enviar" ou cuja conexão repete o pedido, **When** os
   pedidos chegam, **Then** um só feedback é gravado.
4. **Given** um aluno que já enviou 5 feedbacks nas últimas 24 horas, **When** ele tenta enviar o
   sexto, **Then** o envio é recusado com uma mensagem de que o limite volta mais tarde, e nada é
   gravado.
5. **Given** um aluno fazendo uma prova ou um trabalho em modo controlado, **When** ele está na tela da
   tentativa, **Then** a entrada "Enviar feedback" não aparece; respondendo um exercício ou um trabalho
   normal, ela aparece.

---

### User Story 2 - Administrador lê e trata os feedbacks (Priority: P1)

O administrador abre "Feedbacks" na área administrativa e vê a lista, dos mais recentes para os mais
antigos, com a categoria, a situação, o início do texto, o aluno e a data. Ele filtra por situação e
por categoria, abre um feedback para ler o texto inteiro, o nome e o e-mail do aluno e a tela de origem,
e muda a situação para Em análise, Resolvido ou Arquivado. O menu mostra quantos feedbacks estão
"Recebido".

**Why this priority**: o feedback só tem valor se chega a quem melhora o sistema; sem a leitura do
administrador, o envio é inútil.

**Independent Test**: com feedbacks de dois alunos em categorias diferentes, entrar como ADMIN, filtrar
por Problema, abrir um feedback, marcá-lo "Em análise" e conferir a lista, o contador e o histórico.

**Acceptance Scenarios**:

1. **Given** feedbacks de vários alunos, **When** o ADMIN abre "Feedbacks", **Then** vê todos, dos
   mais recentes para os mais antigos, com categoria, situação, início do texto, nome do aluno e data,
   e o menu mostra o número de feedbacks "Recebido".
2. **Given** a lista de feedbacks, **When** o ADMIN filtra por situação e por categoria, **Then** a
   lista mostra só os feedbacks que atendem aos dois filtros.
3. **Given** um feedback, **When** o ADMIN o abre, **Then** vê o texto inteiro, o nome e o e-mail do
   aluno, a tela de origem, o momento do envio e o histórico das mudanças de situação (quem e quando).
4. **Given** um feedback "Recebido", **When** o ADMIN muda a situação para "Em análise", "Resolvido" ou
   "Arquivado", **Then** a nova situação é gravada com o ADMIN e o momento, e o contador do menu é
   atualizado.
5. **Given** um feedback "Resolvido" ou "Arquivado", **When** o ADMIN o reabre como "Em análise",
   **Then** a mudança é aceita e entra no histórico.
6. **Given** um feedback numa situação, **When** o ADMIN pede a mesma situação de novo ou a volta para
   "Recebido", **Then** o pedido é recusado como transição inválida, sem nova entrada no histórico.

---

### User Story 3 - Aluno acompanha os próprios feedbacks (Priority: P2)

Em "Meus feedbacks", o aluno vê os feedbacks que enviou, dos mais recentes para os mais antigos, com a
categoria, a data, o texto e a situação atual. Assim ele sabe que o feedback foi lido e se o problema
foi resolvido.

**Why this priority**: dá retorno ao aluno sem criar uma conversa; o envio e a leitura do administrador
funcionam sem ela.

**Independent Test**: enviar dois feedbacks como aluno, mudar a situação de um deles como ADMIN e
conferir a lista do aluno.

**Acceptance Scenarios**:

1. **Given** um aluno com feedbacks enviados, **When** ele abre "Meus feedbacks", **Then** vê os
   próprios feedbacks, dos mais recentes para os mais antigos, com categoria, data, texto e situação.
2. **Given** um feedback que o ADMIN marcou "Resolvido", **When** o aluno abre "Meus feedbacks",
   **Then** vê a situação "Resolvido", sem o nome do ADMIN nem o histórico.
3. **Given** dois alunos com feedbacks, **When** um deles abre "Meus feedbacks" ou pede um feedback do
   outro, **Then** vê só os próprios, e o feedback do outro responde como inexistente.

---

### Edge Cases

- **Professor ou gestor tenta ler feedbacks**: recusado por falta de permissão, mesmo para feedbacks de
  alunos das suas turmas; nenhum menu de feedback aparece para eles.
- **Aluno sem turma ativa** (removido de todas as turmas, 003): se ainda consegue entrar, pode enviar e
  acompanhar feedbacks, porque o feedback é sobre a plataforma.
- **Conta suspensa** (001): a pessoa não entra, então não envia; os feedbacks já enviados continuam
  com o ADMIN.
- **Texto com HTML, script ou links**: é guardado como texto e mostrado como texto, nunca interpretado;
  links não ficam clicáveis.
- **Texto só com espaços** ou que só tem 10 caracteres contando espaços nas pontas: as pontas são
  aparadas antes da contagem.
- **Tela de origem com dados na URL** (token de convite, filtros): o portal envia só o caminho da tela,
  sem a parte de consulta nem fragmentos; um caminho com consulta ou fragmento é recusado.
- **Dois ADMINs mudam a mesma situação ao mesmo tempo**: uma mudança vence, a outra recebe a transição
  inválida ou é aplicada sobre a vencedora; o histórico nunca tem duas entradas para a mesma mudança.
- **Dados pessoais no texto** (o aluno escreve o próprio telefone ou o nome de um colega): o texto é
  guardado como enviado, só o ADMIN o lê, e ele nunca vai para auditoria, logs ou e-mails.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: O sistema MUST permitir que um aluno envie um feedback com uma categoria (Problema,
  Sugestão, Elogio ou Outro) e um texto de 10 a 2.000 caracteres, contados depois de aparar as pontas.
- **FR-002**: O sistema MUST registrar, junto do feedback, o aluno, o momento do servidor e o caminho da
  tela de origem (sem parte de consulta nem fragmento); o corpo do pedido nunca escolhe o aluno, a
  situação ou o momento.
- **FR-003**: O portal do aluno MUST oferecer a entrada "Enviar feedback" em todas as telas, exceto nas
  telas de tentativa de uma prova (018) e de um trabalho em modo controlado (015), que são a página de
  foco, sem o menu do aluno.
- **FR-004**: O sistema MUST gravar um só feedback para um envio repetido (duplo clique ou nova
  tentativa do mesmo pedido), inclusive sob pedidos simultâneos.
- **FR-005**: O sistema MUST limitar cada aluno a 5 feedbacks em 24 horas, contados pelo relógio do
  servidor; o sexto é recusado, nada é gravado e a recusa é auditada.
- **FR-006**: Todo feedback novo MUST começar como "Recebido"; o ADMIN MUST poder mudá-lo para "Em
  análise", "Resolvido" ou "Arquivado", e reabrir um "Resolvido" ou "Arquivado" como "Em análise".
  Um feedback "Resolvido" ou "Arquivado" só vai para "Em análise" (não direto de um para o outro).
  Voltar para "Recebido" ou pedir a situação atual é transição inválida.
- **FR-007**: Cada mudança de situação MUST ser gravada no histórico do feedback com o ADMIN e o
  momento do servidor, exatamente uma vez.
- **FR-008**: O ADMIN MUST ver a lista de todos os feedbacks, dos mais recentes para os mais antigos,
  paginada, com filtros por situação e por categoria, e o número de feedbacks "Recebido" no menu.
- **FR-009**: O ADMIN MUST ver, no detalhe de um feedback, o texto inteiro, o nome e o e-mail do aluno,
  a tela de origem, o momento do envio e o histórico de situações.
- **FR-010**: O aluno MUST ver a lista dos próprios feedbacks com categoria, data, texto e situação
  atual; nunca o histórico, o nome de quem mudou a situação ou feedbacks de outro aluno.
- **FR-011**: Ninguém além do ADMIN MUST ler feedbacks de outra pessoa: professor, gestor de cadastros
  e outros alunos não têm acesso, nem a feedbacks de alunos das suas turmas.
- **FR-012**: O feedback MUST ser imutável depois de enviado: o aluno não edita nem apaga, e o ADMIN só
  muda a situação.
- **FR-013**: O texto do feedback MUST ser mostrado sempre como texto, nunca interpretado como HTML ou
  formatação, nas telas do aluno e do ADMIN.
- **FR-014**: Nenhuma IA MUST receber, resumir ou classificar feedbacks, e nenhum e-mail é enviado por
  causa de um feedback nesta etapa.
- **FR-015**: Uma rotina de manutenção MUST apagar os feedbacks "Resolvido" ou "Arquivado" há mais de 24
  meses, com o histórico deles; feedbacks "Recebido" ou "Em análise" nunca são apagados por ela.
- **FR-016**: Os formulários e as listas MUST funcionar só com o teclado e com leitor de tela, com
  erros associados aos campos e a situação dita em palavras, nunca só por cor.

### Security, Permissions & Audit *(mandatory if feature has protected operations)*

- **Permissions**: `feedbacks.enviar` e `feedbacks.proprios.listar`, dadas ao papel STUDENT;
  `feedbacks.visualizar` e `feedbacks.alterar_situacao`, dadas ao papel ADMIN. Nenhuma ao TEACHER ou ao
  MANAGER.
- **Resource context**: o aluno só lê os próprios feedbacks; o feedback de outro aluno responde `404`
  (não revela que existe). O ADMIN lê todos: o feedback é da plataforma, não de uma turma.
- **Audit events**: feedback enviado (ids e categoria), envio recusado pelo limite (id do aluno),
  situação mudada (id do feedback, situação anterior e nova). Os metadados levam só ids e enums: nunca
  o texto do feedback nem a tela de origem.
- **Untrusted input**: categoria só da lista fechada; texto de 10 a 2.000 caracteres, guardado e
  mostrado como texto; o caminho da tela é opcional, limitado em tamanho e aos caracteres de um caminho,
  sem consulta nem fragmento, e um caminho inválido recusa o envio (`400`); aluno, situação e momento vêm do servidor.
- **States & transitions**: `RECEIVED → IN_REVIEW | RESOLVED | ARCHIVED`, `IN_REVIEW → RESOLVED |
  ARCHIVED`, `RESOLVED | ARCHIVED → IN_REVIEW`; qualquer outra (inclusive a mesma situação e a volta a
  `RECEIVED`) é `409 INVALID_STATE_TRANSITION`.
- **Idempotency**: um envio repetido grava um só feedback (FR-004); uma mudança de situação é aplicada
  uma só vez sob ADMINs simultâneos (FR-007).
- **Evidence vs. decisions**: o feedback é FACT (o relato do aluno); a situação é HUMAN_DECISION do
  ADMIN. Um feedback nunca altera nota, ponto, ranking, matrícula ou conta.
- **Automation risk level**: N/A (sem automação nem IA).
- **Domain configurability**: as categorias são uma lista fechada da plataforma, não de uma
  disciplina; nenhuma disciplina, linguagem ou tecnologia aparece no código.
- **Sensitive data & adaptations**: o texto pode trazer dados pessoais que o aluno decide escrever; só
  o ADMIN o lê; ele não vai para auditoria, logs, e-mails nem IA, e é apagado pela retenção (FR-015).
- **Curricular traceability**: N/A.

### Key Entities *(include if feature involves data)*

- **Feedback**: o relato de um aluno sobre a plataforma: aluno, categoria, texto, caminho da tela de
  origem, momento do envio e situação atual. Imutável, exceto a situação.
- **Mudança de situação do feedback**: uma entrada do histórico: feedback, situação anterior e nova,
  ADMIN e momento. Só acrescentada, nunca alterada.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Um aluno envia um feedback, a partir de qualquer tela permitida do portal, em menos de 1
  minuto e com no máximo 3 interações depois de escrever o texto.
- **SC-002**: Um feedback enviado aparece na lista do ADMIN e no contador do menu na próxima vez que ele
  abre ou atualiza a área de feedbacks, em 100% dos casos.
- **SC-003**: 100% dos pedidos de professores, gestores e alunos a feedbacks de outra pessoa são
  recusados (403 sem a permissão, 404 para o feedback de outro aluno), verificado por testes
  automatizados.
- **SC-004**: Zero ocorrências do texto de um feedback ou da tela de origem nos registros de auditoria
  e nos logs (varredura automatizada).
- **SC-005**: 10 envios simultâneos do mesmo pedido gravam exatamente 1 feedback; o sexto envio de um
  aluno em 24 horas é recusado em 100% dos casos, sem afetar outro aluno.
- **SC-006**: A entrada "Enviar feedback" não aparece em 100% das telas de tentativa de prova e de
  trabalho em modo controlado, e aparece nas de exercício e trabalho normal.
- **SC-007**: O aluno envia e acompanha feedbacks, e o ADMIN filtra e muda a situação, só com o teclado
  e com leitor de tela, sem violações de acessibilidade nas verificações automatizadas.

## Assumptions

- O feedback é sempre identificado ao ADMIN; envio anônimo fica fora desta etapa.
- Não há resposta escrita do ADMIN nem conversa; o retorno ao aluno é só a situação.
- Só alunos enviam nesta etapa; professores e gestores ficam para uma etapa seguinte.
- Sem anexos nem capturas de tela; sem informações do navegador ou do aparelho além da tela de origem.
- O ADMIN não recebe e-mail por feedback novo; ele vê o contador no menu.
- A retenção de 24 meses depois de fechado é o padrão desta etapa e pode mudar por configuração mais
  tarde.
- O limite de 5 feedbacks por aluno em 24 horas é fixo nesta etapa.
- As mudanças chegam às telas na próxima abertura ou atualização; não há atualização em tempo real.
