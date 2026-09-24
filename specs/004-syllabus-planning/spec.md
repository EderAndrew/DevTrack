# Feature Specification: 004 — Área do Professor: Disciplinas, Ementas, Calendário de Aulas e Tópicos

**Feature Branch**: `004-syllabus-planning`
**Created**: 2026-09-23
**Status**: Draft
**Input**: User description: "Área Privada do Professor, Ementas, Calendário Letivo e Tópicos de Aula — área acadêmica privada do professor com disciplinas, turmas (ofertas por semestre), envio da ementa institucional (PDF, DOCX, PNG, JPG) preservada como documento original, processamento assíncrono que extrai o conteúdo, revisão do conteúdo extraído pelo professor, calendário em que o professor marca os dias em que realmente terá aula (sem cálculo de feriados), proposta inicial de tópicos a partir da ementa e do número de encontros, e edição completa dos tópicos (editar, reordenar, mover de aula, juntar, dividir, criar, arquivar) sem alterar a ementa. Isolamento total por professor (ADMIN sem acesso ao conteúdo pedagógico), auditoria e segurança de upload. Os tópicos serão a base curricular obrigatória de questões e exercícios nas specs seguintes; provas e trabalhos poderão abranger vários tópicos. Fora de escopo: banco de questões, exercícios, IA, provas, trabalhos, notas, presença e feriados."

## Clarifications

### Session 2026-09-23

- Q: Como a ementa é interpretada e os tópicos propostos? → A: Nesta feature, os
  tópicos são criados somente pelo professor, manualmente. A geração de tópicos por
  IA fica para a próxima fase. O envio da ementa é obrigatório nos dois casos: sem
  ementa confirmada não há planejamento.
- Q: Em que fase fica a leitura do conteúdo da ementa? → A: Leitura simples agora,
  sem IA: o sistema lê PDF e DOCX com texto (seções, listas numeradas e com
  marcadores) e o professor revisa e confirma. Imagens e PDFs escaneados não têm
  reconhecimento de texto; o professor digita os itens vendo o arquivo ao lado. Os
  tópicos manuais se ligam aos itens, com resumo de cobertura. A IA, que interpreta
  melhor e gera os tópicos, vem na próxima fase.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Professor organiza disciplinas e liga turmas a elas (Priority: P1)

Na sua área privada, o professor cria disciplinas (ex.: "Programação Orientada a
Objetos") e liga a cada uma as turmas em que ela é ministrada, cada turma
correspondendo a uma oferta num período ("2026.1 — Turma A", "2026.2 — Turma B"),
com data de início e de término. As turmas continuam sendo as da feature 003, com
seus alunos e convites.

**Why this priority**: ementa, calendário e tópicos pertencem a uma disciplina e a
uma turma; sem essa estrutura não há onde guardar o planejamento.

**Independent Test**: com um professor ativo, criar a disciplina POO, criar uma
turma nova já ligada a ela com período e datas, ligar uma turma antiga (sem
disciplina) a ela, e conferir que outro professor e um administrador não veem
nada disso.

**Acceptance Scenarios**:

1. **Given** um professor ativo, **When** ele cria a disciplina "Programação
   Orientada a Objetos" com uma descrição, **Then** a disciplina é criada ativa,
   pertence a ele e aparece na lista das suas disciplinas.
2. **Given** um professor que já tem a disciplina "Algoritmos", **When** ele cria ou
   renomeia outra para "algoritmos " (outra caixa e espaços), **Then** a operação é
   recusada informando que o nome já está em uso.
3. **Given** uma disciplina do professor, **When** ele cria uma turma escolhendo a
   disciplina e informando período ("2026.1"), data de início e data de término,
   **Then** a turma é criada ligada à disciplina e aparece na página da disciplina
   junto com as outras ofertas.
4. **Given** uma turma criada antes desta feature, sem disciplina, **When** o
   professor a liga a uma disciplina sua e informa as datas de início e término,
   **Then** ela passa a aceitar ementa, calendário e tópicos; sem disciplina e
   datas, essas seções mostram o que falta preencher.
5. **Given** datas de término anteriores à de início, **When** o professor salva a
   turma, **Then** a gravação é recusada indicando o campo.
6. **Given** uma disciplina com turmas, **When** o professor a desativa, **Then** ela
   deixa de ser oferecida para turmas novas, e as turmas e planejamentos existentes
   continuam intactos; reativá-la a devolve às opções.
7. **Given** uma disciplina ativa e turmas do professor já criadas na tela Turmas,
   **When** ele abre "Turmas da disciplina", **Then** pode criar uma turma nova já
   ligada à disciplina ou escolher uma das suas turmas existentes para ligá-la a
   ela; uma turma que já tem ementa selecionada ou tópicos não arquivados em outra
   disciplina é recusada (FR-004).

---

### User Story 2 - Professor envia a ementa e o documento original é preservado (Priority: P1)

Na turma (ou na disciplina), o professor escolhe "Enviar ementa" e seleciona ou
arrasta um PDF, DOCX, PNG ou JPG. O arquivo é validado, guardado como documento
original imutável da disciplina e entra na fila de processamento; o professor vê a
situação ("Enviado", "Processando", "Processado", "Falhou") atualizar sem
recarregar a página e pode baixar o original quando quiser.

**Why this priority**: a ementa é a fonte curricular de todo o planejamento; sem
ela não há conteúdo a organizar.

**Independent Test**: enviar um PDF válido e acompanhar até "Processado"; tentar
enviar um executável renomeado para `.pdf`, um arquivo acima do limite e um nome de
arquivo malicioso; baixar o original e comparar com o enviado.

**Acceptance Scenarios**:

1. **Given** uma turma ligada a uma disciplina, **When** o professor envia
   `ementa-poo.pdf` válido, **Then** o documento é guardado como nova versão da
   ementa da disciplina, aparece como "Enviado" e depois "Processando", sem a página
   ficar esperando o processamento; depois de revisado e confirmado, a turma de onde
   ele foi enviado passa a usá-lo.
2. **Given** um arquivo cujo conteúdo não corresponde ao tipo declarado ou à
   extensão (ex.: executável renomeado para `.pdf`, imagem com extensão `.docx`),
   **When** o professor o envia, **Then** o envio é recusado informando que o tipo
   não é aceito, e nada é guardado.
3. **Given** um arquivo acima do tamanho máximo, corrompido, protegido por senha,
   um DOCX com macros ou um DOCX cujo conteúdo descompactado excede o limite,
   **When** o professor o envia, **Then** o envio é recusado com a razão, e nada é
   guardado nem processado.
4. **Given** um nome de arquivo como `../../etc/passwd.pdf` ou com caracteres de
   controle, **When** o arquivo é enviado, **Then** o nome nunca determina onde o
   arquivo é guardado; ele é exibido apenas como texto saneado.
5. **Given** um documento enviado, **When** o professor o baixa, **Then** recebe
   exatamente o arquivo enviado (mesmo conteúdo verificado por soma de
   verificação), como download, com o nome original saneado.
6. **Given** a mesma disciplina, **When** o professor envia de novo um arquivo
   idêntico a uma versão existente, **Then** nenhuma versão nova é criada e ele é
   informado de que o arquivo já foi enviado (versão N).
7. **Given** qualquer operação posterior (revisar conteúdo, editar, juntar ou
   arquivar tópicos), **When** ela é concluída, **Then** o documento original
   continua byte a byte igual ao enviado.

---

### User Story 3 - Professor revisa e confirma o conteúdo extraído (Priority: P1)

Quando o processamento termina, o professor vê o conteúdo extraído organizado em
seções — título da disciplina, ementa (texto), competência e objetos de
aprendizagem em grupos e itens — lado a lado com o documento original. Ele corrige
o que a extração errou (texto, grupos, itens, ordem), acrescenta ou remove itens e
confirma. Se o processamento falhar ou não encontrar texto, ele pode tentar de novo
ou preencher o conteúdo manualmente.

**Why this priority**: a extração pode errar; o planejamento só é confiável se partir
de um conteúdo revisado pelo professor.

**Independent Test**: processar a ementa de exemplo de POO, corrigir um item e
juntar dois itens, confirmar; enviar um arquivo que falhe no processamento e
preencher o conteúdo manualmente; conferir que o documento original não mudou.

**Acceptance Scenarios**:

1. **Given** a ementa de POO processada, **When** o professor abre a revisão,
   **Then** vê os 4 grupos de objetos de aprendizagem ("Fundamentos de POO",
   "Padrões de Design em POO", "POO em Ambientes Reais", "Práticas de
   Implementação") com os itens de cada um, além do texto da ementa e da
   competência.
2. **Given** a revisão aberta, **When** o professor edita o texto de um item, move
   um item para outro grupo, reordena, acrescenta e remove itens e salva, **Then**
   o conteúdo revisado é guardado separado do conteúdo extraído original e do
   documento, e a revisão pode continuar depois.
3. **Given** um conteúdo revisado com ao menos um item, **When** o professor
   confirma, **Then** o conteúdo fica "Confirmado", deixa de ser editável e passa a
   poder ser usado no planejamento; confirmar sem nenhum item é recusado.
4. **Given** um processamento que falhou (arquivo ilegível, tempo esgotado), **When**
   o professor abre a ementa, **Then** vê a razão em linguagem simples e as opções
   "Tentar novamente" e "Preencher manualmente"; **Given** uma imagem ou um PDF
   escaneado, **When** o processamento termina sem texto, **Then** ele vê "Não foi
   possível ler o texto deste arquivo. Preencha o conteúdo manualmente." e o arquivo
   ao lado do formulário.
5. **Given** a opção "Preencher manualmente", **When** o professor digita grupos e
   itens e confirma, **Then** o conteúdo confirmado fica ligado ao mesmo documento
   original, marcado como preenchido manualmente.
6. **Given** um conteúdo confirmado com um erro percebido depois, **When** o
   professor precisa corrigi-lo, **Then** ele envia uma nova versão ou cria uma nova
   revisão a partir da versão confirmada; a versão confirmada anterior e os
   planejamentos que a usam não mudam.

---

### User Story 4 - Professor marca no calendário os dias em que terá aula (Priority: P1)

Na turma, o professor abre o calendário, que cobre o período da oferta mês a mês, e
marca os dias em que realmente terá aula. O sistema mostra o total de encontros
selecionados e numera os encontros em ordem cronológica. Não há feriados, recessos
nem eventos: o professor simplesmente não marca esses dias.

**Why this priority**: o número real de encontros é a capacidade disponível para o
planejamento.

**Independent Test**: numa turma de fevereiro a junho, marcar 18 quartas-feiras
deixando uma de fora, conferir "Total de aulas selecionadas: 18" e a numeração;
desmarcar uma data sem tópico e uma com tópico.

**Acceptance Scenarios**:

1. **Given** uma turma de 01/02/2027 a 30/06/2027, **When** o professor marca 18
   datas e salva, **Then** são criados 18 encontros "Planejado", numerados de 1 a 18
   em ordem de data, e a tela mostra "Total de aulas selecionadas: 18".
2. **Given** aula toda quarta-feira com 18/03 sendo evento da faculdade, **When** o
   professor marca 04/03, 11/03 e 25/03, **Then** o sistema considera 3 encontros,
   sem pedir motivo para 18/03.
3. **Given** uma data fora do período da turma ou repetida, **When** ela é enviada,
   **Then** é recusada; cada data tem no máximo um encontro na turma.
4. **Given** encontros já criados, **When** o professor acrescenta uma data entre
   duas existentes, **Then** o novo encontro entra na posição correta e os demais
   são renumerados; os tópicos continuam ligados aos mesmos encontros.
5. **Given** um encontro sem tópico, **When** o professor desmarca a data, **Then**
   o encontro é removido e os demais renumerados.
6. **Given** um encontro com tópicos ligados, **When** o professor desmarca a data,
   **Then** nada é removido ainda: a interface mostra os tópicos ligados e pede,
   para cada um, mover para outra aula, deixar sem data, juntar com outro tópico ou
   arquivar; só depois da escolha o encontro é removido, sem nenhum tópico apagado.
7. **Given** a mudança das datas de início ou término da turma, **When** encontros
   ficariam fora do novo período, **Then** a mudança segue a mesma regra do cenário
   6 e só é concluída depois que esses encontros forem resolvidos.

---

### User Story 5 - Professor cria os tópicos a partir da ementa confirmada (Priority: P1)

Com a ementa confirmada e os encontros marcados, o professor monta o planejamento
criando tópicos: dá título e descrição, escolhe os itens da ementa que o tópico
cobre e, se quiser, a aula. O resumo de cobertura mostra os itens da ementa ainda
não cobertos, e de cada um ele pode começar um tópico já com o item escolhido. Sem
ementa confirmada, não há planejamento. A geração de tópicos por IA chega na
próxima fase.

**Why this priority**: os tópicos são a base curricular de questões e exercícios;
sem eles a feature não entrega o planejamento.

**Independent Test**: com a ementa de POO confirmada (16 itens) e 18 encontros,
criar tópicos cobrindo todos os itens, alguns com mais de um item e um item em dois
tópicos, e conferir o resumo de cobertura; tentar criar um tópico numa turma sem
ementa confirmada.

**Acceptance Scenarios**:

1. **Given** a ementa confirmada e 18 encontros, **When** o professor cria o tópico
   "Classes, objetos e métodos", escolhe o item "Conceitos de classes, objetos e
   métodos" e a aula 02, **Then** o tópico é criado em rascunho, origem "Manual",
   ligado ao item e ao encontro 02.
2. **Given** uma turma sem ementa confirmada selecionada, **When** o professor tenta
   criar um tópico, **Then** a criação é recusada, e a interface o leva a enviar e
   confirmar a ementa.
3. **Given** o resumo de cobertura com itens não cobertos, **When** o professor
   escolhe "Criar tópico com este item", **Then** o formulário abre com o item
   escolhido e o título preenchido com o texto do item, editável antes de salvar.
4. **Given** um tópico que cobre "Encapsulamento, herança e polimorfismo", **When** o
   professor cria mais dois tópicos com o mesmo item, **Then** os três ficam ligados
   ao item, que conta uma vez como coberto.
5. **Given** tópicos criados sem aula, **When** o planejamento é exibido, **Then**
   eles aparecem em "Sem data", em ordem, até o professor escolher a aula.
6. **Given** a tela de planejamento, **When** o professor a abre, **Then** não há
   geração automática de tópicos nesta feature; a origem "Gerado" fica reservada à
   geração por IA da próxima fase.

---

### User Story 6 - Professor edita e reorganiza os tópicos (Priority: P2)

Na tela de planejamento da turma, o professor vê os encontros em ordem com seus
tópicos e os tópicos sem data. Ele edita título e descrição, muda a ordem, move um
tópico para outra aula, deixa um encontro sem tópico, junta dois ou mais tópicos,
divide um tópico em dois, cria tópicos manuais, arquiva e restaura — sem nunca
alterar a ementa.

**Why this priority**: o planejamento muda ao longo do semestre; o professor
precisa reorganizá-lo sem perder a ligação com a ementa.

**Independent Test**: sobre um planejamento com tópicos, juntar "Herança" e "Modificadores
de acesso", dividir "SOLID" em três, criar um tópico manual, arquivar "Introdução a
bibliotecas", mover um tópico para outra aula e reordenar; conferir os itens de
ementa de origem de cada tópico e que o conteúdo confirmado da ementa não mudou.

**Acceptance Scenarios**:

1. **Given** um tópico, **When** o professor edita título e descrição e salva,
   **Then** o tópico é atualizado e auditado; o conteúdo da ementa e o documento
   original não mudam.
2. **Given** os tópicos "Herança" (aula 05) e "Modificadores de acesso" (aula 06),
   **When** o professor escolhe "Juntar tópicos", revisa título ("Herança +
   Modificadores de Acesso"), descrição, itens da ementa (união dos dois) e aula
   (05), e confirma, **Then** fica um único tópico ativo com esses dados e os itens
   de origem dos dois, e o outro fica arquivado indicando em qual tópico foi
   juntado.
3. **Given** o tópico "SOLID: LSP, ISP e DIP", **When** o professor o divide em
   "SOLID — LSP" e "SOLID — ISP + DIP", distribuindo os itens da ementa e as aulas,
   **Then** existem dois tópicos, ambos com rastreabilidade para os itens de origem
   (um item pode ficar nos dois).
4. **Given** o planejamento, **When** o professor cria um tópico manual, com ou sem
   itens da ementa e com ou sem aula, **Then** o tópico é criado com origem
   "Manual"; um tópico sem item da ementa (ex.: "Apresentação da disciplina") é
   permitido.
5. **Given** o tópico "Introdução a bibliotecas para POO", **When** o professor o
   arquiva, **Then** ele sai do planejamento ativo, o item continua no conteúdo da
   ementa e aparece como "não coberto pelo planejamento"; restaurar o tópico o
   devolve.
6. **Given** tópicos em ordem, **When** o professor reordena pelos botões Subir e Descer ou pelo teclado, ou move um tópico para outra aula, **Then** a nova ordem e as aulas são
   salvas numa única operação; um encontro pode ficar sem tópico e um tópico sem
   aula.
7. **Given** o mesmo planejamento aberto em duas abas, **When** uma aba salva uma
   alteração e a outra tenta salvar sobre o estado antigo, **Then** a segunda é
   recusada (409) com "O planejamento foi alterado depois que você o abriu.
   Atualize a página antes de continuar.", sem perder a alteração da primeira.
8. **Given** qualquer tópico, **When** alguém tenta excluí-lo definitivamente,
   **Then** não existe operação de exclusão: tópicos só são arquivados.

---

### User Story 7 - Professor confirma e acompanha o planejamento (Priority: P2)

Depois de revisar, o professor confirma o planejamento ("Pronto"), inicia-o quando o
semestre começa ("Em andamento") e o arquiva quando a oferta termina. Ajustes
continuam permitidos em "Pronto" e "Em andamento" e são auditados. Os tópicos ativos
de um planejamento confirmado ficam disponíveis para as próximas features (banco de
questões, exercícios, geração futura por IA).

**Why this priority**: a confirmação marca a revisão humana obrigatória antes de os
tópicos virarem base curricular.

**Independent Test**: confirmar um planejamento e conferir que os tópicos passam a
ativos; iniciar, fazer um ajuste auditado, arquivar e conferir que ele fica somente
leitura.

**Acceptance Scenarios**:

1. **Given** um planejamento em rascunho com ao menos um tópico, **When** o
   professor confirma, **Then** o planejamento passa a "Pronto" e todos os tópicos
   em rascunho passam a ativos.
2. **Given** um planejamento sem nenhum tópico não arquivado, **When** o professor
   tenta confirmar, **Then** a confirmação é recusada.
3. **Given** um planejamento "Pronto", **When** o professor o reabre, **Then** ele
   volta a rascunho, e os tópicos continuam ativos.
4. **Given** um planejamento "Pronto", **When** o professor o inicia, **Then** ele
   passa a "Em andamento"; tópicos criados a partir daí já nascem ativos.
5. **Given** um planejamento "Em andamento", **When** o professor edita, junta ou
   move tópicos, **Then** as alterações são aceitas e auditadas.
6. **Given** um planejamento, **When** o professor o arquiva, **Then** ele fica
   somente leitura (tópicos, encontros e ementa selecionada), e nenhuma transição
   o tira de arquivado.
7. **Given** um planejamento, **When** o professor abre o resumo de cobertura,
   **Then** vê quais itens da ementa estão cobertos por tópicos não arquivados e
   quais não estão.

---

### User Story 8 - Área privada isolada no backend (Priority: P1)

Todo o conteúdo pedagógico — disciplinas, ementas (documentos e conteúdos),
encontros, planejamentos e tópicos — pertence ao professor que o criou. Nenhum
outro professor, gestor, administrador ou aluno o acessa, mesmo manipulando
requisições.

**Why this priority**: o conteúdo pedagógico do professor é privado por princípio
da plataforma; o isolamento tem de existir desde o primeiro arquivo enviado.

**Independent Test**: com a matriz de acesso, chamar todas as operações da feature
como professor dono, outro professor, administrador, gestor e aluno, conferindo as
recusas e que respostas de "não existe" e "não é seu" são indistinguíveis,
inclusive no download do documento.

**Acceptance Scenarios**:

1. **Given** um administrador (sem papel de professor), um gestor ou um aluno,
   **When** ele chama qualquer operação da feature, **Then** recebe acesso negado
   (403), sem nenhum dado pedagógico.
2. **Given** a disciplina, a ementa, o documento, os encontros, o planejamento ou
   um tópico de outro professor, **When** um professor tenta vê-los, baixá-los ou
   alterá-los, inclusive informando identificadores diretamente, **Then** a
   resposta é a mesma de um recurso inexistente.
3. **Given** um pedido que liga recursos de professores diferentes (ex.: turma
   própria com disciplina alheia, tópico próprio com item de ementa alheio ou com
   encontro de outra turma), **When** ele chega à API, **Then** é recusado como se o
   recurso alheio não existisse.
4. **Given** pedidos com campos controlados pelo servidor (dono, situação de
   processamento, soma de verificação, local de armazenamento, origem do tópico) ou
   campos desconhecidos, **When** chegam à API, **Then** são recusados (400) sem
   efeito.
5. **Given** um professor que ultrapassa o limite de envios de arquivo ou de novas
   tentativas de processamento, **When** ele tenta mais uma, **Then** ela é recusada (429)
   com o tempo de espera.
6. **Given** um usuário que é administrador e professor, **When** ele usa a área do
   professor, **Then** vê somente o próprio conteúdo, como qualquer professor.

---

### Edge Cases

- Turma arquivada (003): a turma e o planejamento ficam somente leitura; o
  planejamento não é apagado.
- Disciplina trocada numa turma que já tem planejamento: recusada enquanto houver
  ementa selecionada ou tópicos não arquivados.
- Nova versão da ementa enviada enquanto um planejamento usa a versão anterior: o
  planejamento continua na versão que usava; trocar a versão usada exige confirmação
  e mantém os tópicos, apontando os itens de origem que não existem na nova versão.
- Processamento travado (servidor reiniciado durante a extração): volta a ser
  tentado automaticamente; depois do máximo de tentativas, fica "Falhou".
- Processamento concluído depois que o professor escolheu "Preencher manualmente":
  o resultado automático fica disponível como sugestão, sem sobrescrever o que ele
  já preencheu.
- PDF só com imagens (digitalizado) e fotos da ementa: tratados conforme FR-020;
  sem texto reconhecível, o resultado é "sem texto" com a opção de preencher
  manualmente.
- Documento em outro idioma (ex.: inglês, como o exemplo "Object-Oriented
  Programming"): extraído como está; nada é traduzido.
- Itens da ementa com numeração mista (1., 1.1, a), -, •): reconhecidos como
  grupos e itens quando possível; o professor corrige na revisão.
- Calendário com mais de 200 datas marcadas: recusado acima do limite.
- Datas passadas: podem ser marcadas (planejamento iniciado no meio do semestre).
- Juntar tópicos de turmas diferentes ou tópico arquivado: recusado.
- Dividir um tópico sem itens da ementa: permitido; as partes ficam sem itens.
- Encontro removido enquanto outra aba move um tópico para ele: uma das operações
  recebe conflito; nenhum tópico fica ligado a encontro inexistente.
- Professor desativado ou que perdeu o papel: todo o conteúdo é preservado e fica
  inacessível; ninguém o herda nesta feature.

## Requirements *(mandatory)*

### Functional Requirements

**Área do professor e disciplinas**

- **FR-001**: O sistema DEVE oferecer ao professor uma área privada ("Minha área"
  ou equivalente) com suas disciplinas, e em cada disciplina as turmas (ofertas),
  a ementa e os planejamentos. Todo recurso desta feature pertence ao professor que
  o criou; o dono vem sempre da sessão, nunca do pedido.
- **FR-002**: O professor DEVE poder criar disciplinas com nome (1 a 120
  caracteres, único entre as dele sem diferenciar maiúsculas e ignorando espaços
  nas pontas) e descrição opcional, editar, desativar e reativar. Não há exclusão.
  Disciplinas desativadas não são oferecidas para turmas novas e continuam nas
  existentes.
- **FR-003**: A turma da feature 003 DEVE ser a oferta da disciplina: ela passa a
  ter uma disciplina do mesmo professor, um período letivo (texto livre, ex.:
  "2026.1") e datas de início e término (término ≥ início). A disciplina e as datas
  são opcionais na criação para preservar as turmas existentes e os fluxos da 003,
  e obrigatórias para usar ementa, calendário e planejamento.
- **FR-004**: A disciplina de uma turma só PODE ser trocada enquanto a turma não
  tiver ementa selecionada nem tópicos não arquivados.
- **FR-005**: A página da disciplina DEVE listar suas turmas (ofertas) com período,
  datas, situação da turma e situação do planejamento, e oferecer "Nova turma" e
  "Vincular turma existente" (uma das turmas do professor que ainda não é desta
  disciplina).

**Ementa: documento original**

- **FR-006**: O professor DEVE poder enviar a ementa da disciplina a partir da
  disciplina ou da turma, selecionando ou arrastando um arquivo PDF, DOCX, PNG ou
  JPG/JPEG. Cada envio aceito é uma nova versão da ementa da disciplina (1, 2,
  3...), reutilizável pelas turmas dessa disciplina. Quando o envio parte de uma turma
  que ainda não usa ementa, a confirmação do conteúdo (FR-023) oferece usá-lo nessa
  turma.
- **FR-007**: O servidor DEVE validar cada arquivo antes de aceitá-lo: tipo
  permitido, coerência entre extensão, tipo declarado e assinatura do conteúdo,
  tamanho máximo, integridade (arquivo legível), ausência de proteção por senha,
  DOCX sem macros e com conteúdo descompactado dentro do limite, e imagens dentro
  do limite de dimensões. Qualquer falha recusa o envio (400, ou 413 para tamanho)
  com a razão, sem guardar nada.
- **FR-008**: O nome enviado NUNCA DEVE determinar o local de armazenamento: cada
  arquivo recebe um identificador interno e uma chave de armazenamento gerada pelo
  servidor. O nome original é guardado apenas para exibição, saneado (sem
  separadores de caminho nem caracteres de controle, até 255 caracteres).
- **FR-009**: O conteúdo binário DEVE ficar num armazenamento de arquivos separado da tabela de documentos (tabela própria ou serviço de arquivos), nunca servido publicamente; o banco guarda
  os metadados: nome original saneado, tipo, tamanho, soma de verificação, chave de
  armazenamento, versão, situação de processamento, quem enviou e datas.
- **FR-010**: O documento original DEVE ser imutável: nenhuma operação desta
  feature o altera ou substitui, e a soma de verificação guardada no envio DEVE
  continuar correspondendo ao conteúdo armazenado.
- **FR-011**: O envio de um arquivo idêntico (mesma soma de verificação) a uma
  versão existente da mesma disciplina NÃO DEVE criar nova versão; a resposta
  indica a versão existente.
- **FR-012**: O professor DEVE poder baixar o documento original. O download DEVE
  ser servido como anexo, com o tipo validado no envio, sem permitir que o navegador
  o interprete como outro tipo nem o execute na origem da aplicação.
- **FR-013**: Documentos e versões da ementa NÃO DEVEM ter operação de exclusão
  nesta feature.

**Ementa: processamento e conteúdo extraído**

- **FR-014**: Cada documento aceito DEVE ser processado fora da requisição de envio,
  com as situações `UPLOADED` ("Enviado"), `PROCESSING` ("Processando"),
  `PROCESSED` ("Processado") e `FAILED` ("Falhou"). O envio responde assim que o
  arquivo é guardado.
- **FR-015**: O processamento DEVE ter tempo máximo por tentativa, novas tentativas
  automáticas para falhas transitórias (incluindo reinício do servidor durante a
  extração) até um máximo, e terminar sempre numa situação conhecida. A razão da
  falha é guardada numa categoria (arquivo ilegível, tempo esgotado, erro
  interno), sem detalhes técnicos na interface. O processamento
  DEVE poder ser desligado por configuração sem perder documentos (envios continuam
  aceitos e ficam "Enviado").
- **FR-016**: A interface DEVE atualizar a situação do processamento sem que o
  professor recarregue a página, e o professor DEVE poder pedir "Tentar novamente"
  num documento "Falhou".
- **FR-017**: O resultado do processamento DEVE ser um conteúdo extraído
  estruturado — título, texto da ementa, competência e objetos de aprendizagem em
  grupos ordenados, cada grupo com itens ordenados — guardado separado do documento
  original e preservado como foi produzido, mesmo depois da revisão.
- **FR-018**: O conteúdo extraído é dado, nunca instrução: textos do documento são
  tratados como texto simples, escapados na exibição, e nunca executados nem
  interpretados como comandos.
- **FR-019**: O processamento DEVE ser determinístico e sem IA: ele lê o texto de
  PDFs com camada de texto e de DOCX e reconhece a estrutura por regras genéricas
  (títulos de seção como "Ementa", "Competência" e "Objetos de aprendizagem", listas
  numeradas e com marcadores). O mesmo documento produz o mesmo conteúdo extraído.
  Nada do documento é enviado a terceiros.
- **FR-020**: PNG, JPG e PDFs sem camada de texto NÃO DEVEM passar por
  reconhecimento de texto nesta feature: o processamento termina "Processado" com
  resultado "sem texto", e a interface mostra "Não foi possível ler o texto deste
  arquivo. Preencha o conteúdo manualmente." com o arquivo exibido ao lado do
  formulário de preenchimento.

**Revisão do conteúdo**

- **FR-021**: O professor DEVE poder revisar o conteúdo extraído ao lado do
  documento original: editar título, textos, grupos e itens; mover, reordenar,
  acrescentar e remover itens e grupos; salvar e continuar depois. A revisão é
  guardada como conteúdo revisado, separado do extraído e do original.
- **FR-022**: Quando o processamento falhar ou não encontrar texto, o professor
  DEVE poder preencher o conteúdo manualmente, ligado ao mesmo documento e marcado
  como "preenchido manualmente".
- **FR-023**: O professor DEVE confirmar o conteúdo revisado para usá-lo no
  planejamento; a confirmação exige ao menos um item. O conteúdo confirmado é
  imutável; correções depois disso geram uma nova revisão a partir dele (nova
  versão confirmada), sem alterar a anterior.
- **FR-024**: Cada item de objeto de aprendizagem confirmado DEVE ter identificação
  estável, para que tópicos referenciem de que itens vieram.

**Calendário de encontros**

- **FR-025**: O professor DEVE poder marcar e desmarcar, num calendário mensal que
  cobre o período da turma, os dias em que terá aula. Cada data marcada é um
  encontro da turma; uma data tem no máximo um encontro; datas fora do período ou
  acima de 200 encontros são recusadas.
- **FR-026**: O sistema NÃO DEVE conhecer feriados, recessos nem eventos, nem pedir
  motivo para datas não marcadas.
- **FR-027**: Encontros DEVEM ser numerados em ordem cronológica (1, 2, 3...), e a
  numeração é refeita quando datas são acrescentadas ou removidas; a tela mostra
  "Total de aulas selecionadas: N".
- **FR-028**: Encontros DEVEM ter as situações `PLANNED` ("Planejado") e, preparadas
  para specs futuras, `COMPLETED` e `CANCELLED`; nesta feature todos nascem e ficam
  planejados. Presença não faz parte desta feature.
- **FR-029**: Remover um encontro (desmarcando a data ou mudando o período da turma)
  que tenha tópicos ligados DEVE ser recusado (409) até o professor resolver cada tópico; a interface identifica os tópicos ligados antes de salvar: mover para outro encontro, deixar sem data, juntar
  com outro tópico ou arquivar. A interface oferece essas escolhas e aplica tudo
  numa única operação. Nenhum tópico é apagado automaticamente.
- **FR-030**: As alterações do calendário DEVEM ser salvas numa única operação por
  gravação (acrescentar e remover várias datas de uma vez).

**Planejamento e tópicos**

- **FR-031**: Cada turma DEVE ter um planejamento com a ementa confirmada que usa
  (disciplina e versão), seus encontros e seus tópicos, e as situações `DRAFT`
  ("Rascunho"), `READY` ("Pronto"), `ACTIVE` ("Em andamento") e `ARCHIVED`
  ("Arquivado"). Transições: rascunho → pronto (confirmar, exige ao menos um tópico
  não arquivado), pronto → rascunho (reabrir), pronto → em andamento (iniciar),
  qualquer situação → arquivado; arquivado é final e somente leitura. Repetir a
  transição já aplicada não tem efeito; outras transições inválidas → 409
  `INVALID_STATE_TRANSITION`.
- **FR-032**: Tópicos só PODEM ser criados num planejamento que tenha ementa
  confirmada selecionada; sem ela, a criação é recusada (422) indicando que a ementa
  é obrigatória. Esta feature NÃO DEVE gerar tópicos automaticamente: todo tópico é
  criado pelo professor.
- **FR-033**: O resumo de cobertura DEVE permitir começar um tópico a partir de um
  item não coberto, com o item escolhido e o título preenchido com o texto do item,
  editáveis antes de salvar.
- **FR-034**: Tópicos DEVEM ter título (1 a 200 caracteres), descrição opcional (até
  5.000 caracteres, texto simples), posição no planejamento, encontro opcional (da
  mesma turma), itens da ementa de origem (zero ou mais, do conteúdo confirmado usado
  pelo planejamento), origem (`MANUAL` "Manual"; `GENERATED` "Gerado" fica
  reservado à geração por IA da próxima fase) e situação (`DRAFT`, `ACTIVE`,
  `ARCHIVED`). Um encontro pode ter zero, um ou vários tópicos
  ordenados.
- **FR-035**: O professor DEVE poder criar tópicos manuais, editar título,
  descrição, itens de origem e encontro, reordenar e mover tópicos entre encontros
  (reordenação salva numa única operação) e deixar encontros sem tópico.
- **FR-036**: "Juntar tópicos" DEVE combinar dois ou mais tópicos não arquivados do
  mesmo planejamento num tópico, com título, descrição, encontro e itens (por padrão
  a união) revisados pelo professor antes de confirmar; os demais ficam arquivados
  com a referência do tópico em que foram juntados.
- **FR-037**: "Dividir tópico" DEVE transformar um tópico em dois ou mais, com
  título, descrição, encontro e itens de origem definidos pelo professor para cada
  parte; um item pode ficar em mais de uma parte; o tópico original continua como a
  primeira parte, e as demais registram de qual tópico vieram.
- **FR-038**: Tópicos NÃO DEVEM ser excluídos: o professor arquiva e restaura. Um
  tópico arquivado continua existindo e identificável, para que referências futuras
  (questões, exercícios, provas) nunca fiquem órfãs.
- **FR-039**: Ao confirmar o planejamento, todos os tópicos em rascunho DEVEM passar
  a ativos; tópicos criados, divididos ou restaurados com o planejamento pronto ou em
  andamento já ficam ativos.
- **FR-040**: Nenhuma operação sobre tópicos, encontros ou planejamento DEVE alterar
  o documento original nem o conteúdo confirmado da ementa. O resumo de cobertura
  DEVE mostrar quais itens da ementa estão em tópicos não arquivados e quais não
  estão.
- **FR-041**: Toda gravação sobre o planejamento (tópicos, ordem, encontros) DEVE
  informar a revisão do planejamento a partir da qual foi feita; se o planejamento
  mudou desde então, a gravação é recusada (409 `PLAN_REVISION_CONFLICT`) sem
  efeito, com a mensagem "O planejamento foi alterado depois que você o abriu.
  Atualize a página antes de continuar.".
- **FR-042**: Trocar a ementa usada por um planejamento para outra versão confirmada
  DEVE exigir confirmação, manter os tópicos e indicar os itens de origem que não
  existem na nova versão.

**Base para as próximas features**

- **FR-043**: Tópicos ativos de planejamentos prontos ou em andamento DEVEM ser
  identificáveis de forma estável pela turma, pela disciplina e pelo professor, para
  que as specs seguintes exijam que toda questão e todo exercício se liguem a pelo
  menos um tópico válido do mesmo professor (questões com um ou mais tópicos), e que
  provas e trabalhos possam abranger vários tópicos ou nenhum. Esta feature não cria
  questões, exercícios, provas nem trabalhos.

**Autorização, limites e auditoria**

- **FR-044**: Toda operação desta feature DEVE exigir permissão explícita (ver
  Security). `ADMIN`, `MANAGER` e `STUDENT` NÃO DEVEM ter nenhuma delas; quem acumula
  `ADMIN` e `TEACHER` age só como professor sobre o próprio conteúdo. Sem permissão
  → 403; recurso de outro professor → tratado como inexistente (404), inclusive em
  ligações entre recursos (disciplina, turma, ementa, item, encontro, tópico).
- **FR-045**: Pedidos DEVEM ser validados no servidor com o contrato compartilhado;
  campos desconhecidos ou controlados pelo servidor (dono, situação de
  processamento, soma de verificação, chave de armazenamento, origem, versão) são
  recusados (400) sem efeito.
- **FR-046**: Envios de arquivo e novas tentativas de processamento DEVEM ter
  limites por professor; acima deles, o pedido é recusado (429) com o tempo de
  espera.
- **FR-047**: DEVEM gerar registro de auditoria, na mesma transação da operação:
  `SUBJECT_CREATED`, `SUBJECT_UPDATED` (inclui desativar e reativar),
  `CLASS_OFFERING_UPDATED` (disciplina, período ou datas da turma),
  `CURRICULUM_UPLOADED`, `CURRICULUM_PROCESSED`, `CURRICULUM_PROCESS_FAILED`,
  `CURRICULUM_EXTRACTION_CONFIRMED`, `CLASS_MEETINGS_UPDATED` (uma por gravação do
  calendário, com as quantidades acrescentadas e removidas), `TOPIC_CREATED`, `TOPIC_UPDATED`, `TOPIC_MERGED`,
  `TOPIC_SPLIT`, `TOPIC_ARCHIVED`, `TOPIC_RESTORED`, `TOPICS_REORDERED`,
  `PLANNING_SYLLABUS_SELECTED` (ementa usada pelo planejamento) e
  `PLANNING_STATUS_CHANGED` (nomes finais na convenção do catálogo de auditoria). Os metadados contêm identificadores, versões,
  quantidades e situações — nunca textos da ementa, títulos ou descrições de tópicos,
  nomes de arquivo nem conteúdo do documento.
- **FR-048**: Logs técnicos NÃO DEVEM conter conteúdo do documento nem textos
  pedagógicos; recusas de envio (com a razão), falhas de processamento (com a
  categoria), recusas de autorização e conflitos DEVEM ficar observáveis.
- **FR-049**: Erros DEVEM seguir o formato padrão (código estável e mensagem, sem
  detalhes internos), com códigos próprios para: nome de disciplina em uso; tipo de
  arquivo não aceito; arquivo grande demais; arquivo ilegível ou protegido; turma
  sem disciplina ou datas; data fora do período; encontro com tópicos ligados;
  ementa obrigatória ou não confirmada; conflito de revisão; e
  planejamento arquivado.

**Interface**

- **FR-050**: O menu DEVE mostrar "Minhas disciplinas" para quem tem permissão de
  ver disciplinas; a turma ganha as seções "Ementa", "Calendário" e
  "Planejamento", ao lado das de alunos e convites da 003.
- **FR-051**: O envio DEVE aceitar selecionar e arrastar arquivos, mostrar
  progresso e informar tipos e tamanho aceitos antes do envio; a situação do
  processamento é anunciada a leitores de tela quando muda.
- **FR-052**: O calendário DEVE ser operável só com teclado (setas para navegar entre
  dias, Espaço para marcar), mostrar o mês com dia da semana, o total selecionado e
  a numeração dos encontros.
- **FR-053**: A reordenação de tópicos DEVE ter alternativa ao arrastar (botões ou
  teclado para subir e descer e para escolher a aula).
- **FR-054**: Contratos de pedido e resposta DEVEM ficar no pacote de contratos
  compartilhados; os dados vêm sempre da API pela camada oficial de estado do
  servidor, sem cópia em estado global.
- **FR-055**: Todas as telas novas DEVEM atender WCAG 2.2 AA e ser operáveis só com
  teclado.

### Security, Permissions & Audit *(mandatory if feature has protected operations)*

- **Permissions** (novas; nomes finais confirmados no plano), todas do `TEACHER`
  ativo: `disciplinas.visualizar`, `disciplinas.criar`, `disciplinas.editar`,
  `ementas.enviar`, `ementas.visualizar`, `ementas.revisar`,
  `calendario.gerenciar`, `planejamento.visualizar`, `planejamento.editar`,
  `planejamento.alterar_situacao`. `ADMIN`, `MANAGER` e `STUDENT`: nenhuma (403). A
  edição da turma como oferta (disciplina, período, datas) usa `turmas.editar` da
  003.
- **Resource context**: o professor dono, derivado da sessão, é a fronteira de todo
  o conteúdo pedagógico ("área do professor"). Cada operação confere no servidor que
  disciplina, turma, documento, conteúdo, encontro, planejamento e tópico são dele e
  que as ligações entre eles pertencem à mesma disciplina e turma. Sem capacidade →
  403; fora do contexto → 404.
- **Audit events**: FR-047, sem conteúdo pedagógico nos metadados.
- **Untrusted input**: arquivos validados por tipo, assinatura, tamanho,
  integridade, macros e descompactação (FR-007); nome do arquivo nunca usado como
  caminho (FR-008); download como anexo com tipo fixo (FR-012); conteúdo extraído
  tratado como dado e escapado (FR-018); pedidos validados pelo contrato com recusa
  de campos desconhecidos (FR-045); limites por professor (FR-046).
- **States & transitions**: documento `UPLOADED → PROCESSING → PROCESSED | FAILED`,
  `FAILED → UPLOADED` (tentar de novo; o processamento recomeça); conteúdo da ementa `em revisão →
  confirmado` (imutável); encontro `PLANNED` (`COMPLETED`, `CANCELLED` reservados);
  planejamento `DRAFT ⇄ READY → ACTIVE`, qualquer → `ARCHIVED` (FR-031); tópico
  `DRAFT → ACTIVE`, `DRAFT | ACTIVE → ARCHIVED → situação anterior`. Transições
  inválidas → 409 `INVALID_STATE_TRANSITION`.
- **Idempotency**: envio do mesmo arquivo não cria versão (FR-011); uma data por
  encontro na turma; processamento de cada documento reservado por um único executor
  por vez; transições repetidas sem efeito; revisão do planejamento contra gravações
  concorrentes (FR-041) — garantidos pelo banco de dados.
- **Evidence vs. decisions**: o conteúdo extraído é SUGESTÃO; a revisão e
  confirmação do conteúdo e a criação e confirmação do planejamento são
  HUMAN_DECISION do professor (constituição XI, XIII). Nada vira base curricular sem
  confirmação.
- **Automation risk level**: a extração determinística é L2 (sugestão revisada pelo
  professor, sem estado definitivo). Nenhuma IA nesta feature; a geração de tópicos
  por IA é da próxima fase.
- **Domain configurability**: disciplinas, ementas, itens e tópicos são dados do
  professor; nenhuma disciplina, linguagem ou tecnologia é fixa no código; a
  extração reconhece estruturas genéricas (seções, listas numeradas e com
  marcadores), não conteúdos de uma área.
- **Sensitive data & adaptations**: nenhum dado de aluno nem necessidade individual
  é tratado. Ementas e planejamentos são conteúdo privado do professor; nada é
  enviado a terceiros nesta feature.
- **Curricular traceability**: esta feature cria a referência curricular da
  constituição XXIII — ementa versionada da disciplina, plano de ensino por turma
  que referencia a versão usada, encontros e tópicos ligados aos itens de origem
  (objetos de aprendizagem). As specs seguintes ligam questões e exercícios a tópicos
  (FR-043).

### Key Entities *(include if feature involves data)*

- **Disciplina**: área de ensino do professor, reutilizável entre semestres. Nome
  (único por professor), descrição, situação ativa/inativa, professor dono, datas.
- **Turma (oferta)**: a turma da 003, agora ligada a uma disciplina, com período
  letivo e datas de início e término; continua com alunos, convites e matrículas.
- **Documento de ementa**: arquivo original enviado, imutável. Disciplina, versão,
  nome original saneado, tipo, tamanho, soma de verificação, chave de
  armazenamento, situação de processamento, tentativas, categoria de falha, quem
  enviou, datas.
- **Conteúdo da ementa**: estrutura extraída ou preenchida à mão a partir de um
  documento — título, texto da ementa, competência, grupos e itens de objetos de
  aprendizagem com identificação estável. Três estados: extraído (preservado como
  produzido), em revisão e confirmado (imutável, versionado).
- **Encontro**: um dia de aula da turma. Turma, data (única na turma), número de
  ordem, situação, datas.
- **Planejamento**: plano de ensino de uma turma. Turma, conteúdo de ementa
  confirmado usado, situação, revisão (para edições concorrentes), datas.
- **Tópico**: conteúdo planejado. Planejamento, encontro opcional, título,
  descrição, posição, origem, situação, itens da ementa de origem (N:N), tópico em
  que foi juntado ou de que foi dividido, datas de criação, atualização e
  arquivamento.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Um professor sai de "disciplina criada" a "planejamento confirmado"
  com 18 tópicos criados à mão para 18 encontros, a partir de uma ementa em PDF com
  texto, em menos de 30 minutos.
- **SC-002**: Em 100% dos testes da matriz de acesso, administrador, gestor e aluno
  são recusados em todas as operações, e um professor não vê, baixa, altera nem liga
  nada da área de outro professor, com respostas indistinguíveis entre "não existe"
  e "não é seu".
- **SC-003**: 100% das amostras maliciosas de envio (executável com extensão
  trocada, tipo declarado falso, nome com caminho relativo, arquivo acima do limite,
  DOCX com macros, DOCX com descompactação excessiva, arquivo corrompido e protegido
  por senha) são recusadas sem nada ser guardado.
- **SC-004**: Depois de qualquer sequência de revisão, criação, edição, junção,
  divisão e arquivamento, 100% dos documentos originais continuam com a mesma soma
  de verificação do envio e 100% dos conteúdos confirmados continuam iguais.
- **SC-005**: Para a ementa de exemplo de POO em PDF e DOCX com texto, 100% dos 4
  grupos e 16 itens aparecem no conteúdo extraído, na ordem.
- **SC-006**: O envio responde em até 2 segundos para um arquivo de 10 MB, e o
  processamento de um documento de até 10 páginas com texto termina em até 1
  minuto.
- **SC-007**: Em 100% dos testes de junção e divisão, os tópicos resultantes mantêm
  todos os itens da ementa de origem, e o resumo de cobertura continua correto.
- **SC-008**: Em 100% dos testes de remoção de encontro e de mudança de período, nenhum
  tópico é apagado nem fica ligado a encontro inexistente.
- **SC-009**: Em 100% dos testes de concorrência (gravações simultâneas no mesmo
  planejamento, dois executores processando o mesmo
  documento), não surgem tópicos duplicados, encontros repetidos nem estados
  parciais.
- **SC-010**: 100% das operações auditáveis produzem exatamente um registro de auditoria cada (a gravação do calendário com resoluções produz o registro do calendário e um por tópico afetado), sem conteúdo pedagógico, e nenhum texto da ementa aparece em logs,
  verificado por varredura automatizada.
- **SC-011**: As jornadas críticas (disciplina e turma → envio de PDF → revisão e
  confirmação → calendário → criar tópicos → juntar, dividir, arquivar → confirmar
  planejamento; envio de imagem → preenchimento manual) passam de ponta a ponta no
  navegador.
- **SC-012**: Todas as telas novas passam na verificação automatizada de
  acessibilidade WCAG 2.2 AA e são operáveis só com teclado, incluindo calendário e
  reordenação de tópicos.

### Acceptance Criteria Traceability

| # | Critério de aceite | Verificado por |
|---|--------------------|----------------|
| 1 | Cada professor possui área isolada | US8-2, US8-3; FR-001, FR-044; SC-002 |
| 2 | ADMIN não visualiza conteúdo pedagógico | US8-1, US8-6; FR-044 |
| 3 | Criar disciplina e oferta/turma | US1-1, US1-3, US1-4; FR-002, FR-003 |
| 4 | Enviar PDF, DOCX, PNG e JPG | US2-1; FR-006, FR-007 |
| 5 | Documento original preservado | US2-5, US2-7; FR-010; SC-004 |
| 6 | Conteúdo extraído separado do original | US3-2; FR-017, FR-021 |
| 7 | Professor revisa o resultado | US3-1–US3-3; FR-021, FR-023 |
| 8 | Selecionar dias manualmente no calendário | US4-1; FR-025 |
| 9 | Número real de encontros | US4-1, US4-2; FR-027 |
| 10 | Nenhuma lógica de feriados | US4-2; FR-026 |
| 11 | Planejamento a partir de ementa + encontros | US5-1–US5-3; FR-032, FR-033 |
| 12 | Tópicos editáveis | US6-1; FR-035 |
| 13 | Tópicos reordenáveis | US6-6; FR-035 |
| 14 | Tópicos unidos | US6-2; FR-036; SC-007 |
| 15 | Tópicos removidos/arquivados | US6-5, US6-8; FR-038 |
| 16 | Tópicos criados manualmente | US5-1, US6-4; FR-035 |
| 17 | Tópicos não modificam o documento institucional | US2-7, US6-1; FR-040; SC-004 |
| 18 | Base para exigir tópico em exercícios e questões | FR-024, FR-038, FR-043 |
| 19 | Provas e trabalhos não limitados a um tópico | FR-043 |
| 20 | Testes de isolamento entre professores | US8-1–US8-3; SC-002 |
| 21 | Segurança de upload | US2-2–US2-4; FR-007–FR-009, FR-012; SC-003 |
| 22 | Processamento assíncrono com falhas controladas | US2-1, US3-4; FR-014–FR-016; SC-006 |
| 23 | Remoção de data sem perda de conteúdo | US4-6, US4-7; FR-029; SC-008 |
| 24 | Estados do planejamento com ajustes auditados | US7-1–US7-6; FR-031, FR-047 |
| 25 | Auditoria sem conteúdo pedagógico | FR-047, FR-048; SC-010 |

## Assumptions

- **Turma = oferta**: a constituição (XXIII) define a turma como a oferta da
  disciplina num período. Em vez de criar uma entidade "oferta" paralela, a turma da
  003 ganha disciplina, período e datas. "Nome da turma" continua sendo o nome da
  turma.
- **Ementa da disciplina, versionada**: a constituição (XXIII) diz que a ementa é
  importada para a disciplina, pode ser reutilizada nas turmas do professor, é
  versionada e o plano referencia a versão usada. Por isso o documento pertence à
  disciplina, e cada planejamento de turma escolhe a versão confirmada que usa.
- **Área do professor**: é a fronteira de posse (tudo pertence ao professor da
  sessão); o plano decide se ela vira uma entidade própria. Não há compartilhamento
  entre professores nesta feature.
- **Armazenamento de arquivos**: exige um local de armazenamento de arquivos novo
  (constituição IX: infraestrutura só com spec que a exija). O plano escolhe a
  solução e as dependências de leitura de PDF, DOCX e imagens, justificando cada uma.
- **Processamento assíncrono**: reutiliza o padrão de trabalho em segundo plano com
  novas tentativas já adotado na 003 (sem filas nem infraestrutura dedicadas),
  salvo justificativa no plano.
- **Limites padrão** (ajustáveis por configuração): arquivo até 10 MB; DOCX com até
  50 MB descompactados; imagens até 40 megapixels; PDF até 50 páginas; 20 envios
  por hora por professor; 3 tentativas
  automáticas de processamento com espera crescente; 2 minutos por tentativa; 200
  encontros por turma; 300 tópicos por planejamento; 500 itens por conteúdo de
  ementa.
- **Varredura de malware**: não faz parte desta feature; os arquivos nunca são
  executados, só lidos para extração e devolvidos como anexo.
- **Estados do planejamento**: as transições são manuais (o sistema não inicia nem
  arquiva planejamentos por data).
- **Idioma e textos**: interface e mensagens em português; os textos do documento
  são exibidos no idioma original.

### Regras obrigatórias para as próximas specs

- Toda questão e todo exercício, criado à mão, por IA ou importado, DEVE se ligar a
  pelo menos um tópico válido do mesmo professor e contexto; questões podem ter
  vários tópicos (relação N:N), com um tópico principal na interface.
- Trabalhos e provas podem abranger nenhum, um ou vários tópicos; tópico não é
  ligação obrigatória deles.
- A geração de tópicos por IA (próxima fase) parte da ementa confirmada e dos
  encontros, com origem `GENERATED`, em rascunho, e só vale depois da revisão do
  professor; a ementa continua obrigatória.
- A IA futura recebe como contexto autorizado somente disciplina, conteúdo
  confirmado da ementa, tópico selecionado e sua descrição, nível e configurações
  permitidas, e tudo o que ela produzir nasce ligado ao tópico, em rascunho.

### Decisões adiadas (não decididas nesta feature)

- Geração de tópicos e interpretação avançada da ementa por IA (próxima fase).
- Reconhecimento de texto (OCR) em imagens e PDFs escaneados.
- Presença, encontros realizados e cancelados (`COMPLETED`, `CANCELLED`).
- Coprofessores e compartilhamento de disciplinas ou planejamentos.
- Copiar o planejamento de uma turma para outra da mesma disciplina.
- Visão dos tópicos pelos alunos.
- Exclusão de documentos, disciplinas e tópicos sem uso.
- Varredura de malware e armazenamento externo gerenciado.
