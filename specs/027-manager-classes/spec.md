# Feature Specification: Turmas do gestor e disciplinas da turma

**Feature Branch**: `027-manager-classes`
**Created**: 2026-11-17
**Status**: Draft
**Input**: User description: "O gestor (MANAGER) cria a turma e convida os alunos por e-mail, um a um; os alunos
continuam entrando só por convite. O professor pesquisa a turma na tela de turmas que já existe; se não encontrar, pede
ao gestor (pedido numa área "Solicitações", feature separada). A turma nasce sem disciplina e quem coloca as disciplinas
são os professores, a partir da ementa: uma turma pode ter várias matérias, de um ou de vários professores, mas não
compartilha matérias com outras turmas — uma disciplina da turma pertence a uma turma só, e o professor pode ter várias.
Para o aluno é indiferente. Encerrar e arquivar a turma passam a ser do gestor. O ranking continua como hoje.
Constituição 4.0.0."

## Contexto: o que muda

Hoje, no DevTrack, uma **turma** é a oferta de **uma** disciplina por **um** professor (003, 004 E2): o professor cria
a turma, liga a ela uma disciplina sua, convida os alunos e os remove. Na escola, porém, "ADS 3NA" é um grupo de alunos
com várias matérias e vários professores, e quem cuida desse grupo é a secretaria ou a coordenação. Com o modelo de
hoje, o mesmo aluno recebe um convite por matéria e cada professor recria a mesma turma.

A emenda 4.0.0 da constituição separa dois conceitos:

- **Turma**: o grupo de alunos de um período (ex.: "ADS 3NA 2026.2"). Criada pelo **gestor**, sem disciplina; os
  convites e as matrículas são da turma.
- **Disciplina da turma**: a oferta de uma disciplina de um professor numa turma (ex.: "Banco de Dados · ADS 3NA ·
  Prof. Eder"). Só o **professor** a cria, escolhendo uma turma existente e uma disciplina sua. Tudo o que hoje
  pertence à turma do professor — plano, calendário, aulas, atividades, chamada, provas, resultados, notas e ranking —
  passa a pertencer à disciplina da turma, que tem os alunos da turma.

| Ponto | Hoje | Depois desta feature |
|-------|------|----------------------|
| Quem cria a turma | O professor | O gestor (ou o administrador, enquanto acumular a função) |
| Disciplinas por turma | Uma, do professor que criou | Nenhuma ao nascer; várias, de um ou de vários professores |
| Quem convida e remove alunos | O professor da turma | O gestor |
| Convites que o aluno recebe | Um por matéria | Um por turma; ele passa a estar em todas as disciplinas dela |
| Professor: tela "Turmas" | As turmas que criou | As suas disciplinas nas turmas, e a busca de turmas para acrescentar uma |
| Encerrar/arquivar a turma | O professor | O gestor; o professor encerra e arquiva só a sua disciplina da turma, depois do último dia do calendário dela |
| Plano, aulas, atividades, chamada, provas, notas, ranking | Da turma | Da disciplina da turma — **mesmo comportamento** |
| Aluno: Painel, "Minhas atividades", card "Matéria" (026) | Uma opção por turma | Uma opção por disciplina da turma — **mesmo comportamento** |

## Clarifications

### Session 2026-11-17

- Q: Quem cria a turma e convida os alunos? → A: O gestor (MANAGER), um convite por vez (e-mail individual). A conta
  de aluno nasce só pelo aceite do convite; quem já tem conta pode ser incluído direto (ver abaixo).
- Q: Como o professor chega à turma? → A: Pesquisa na tela de turmas; se ela não existir, pede ao gestor numa área
  "Solicitações", com texto livre, como o feedback dos alunos. A área "Solicitações" é uma feature separada (028).
- Q: Quantas disciplinas uma turma tem? → A: Nasce sem nenhuma; quem acrescenta são os professores, a partir da
  ementa. Uma turma pode ter várias, de um ou de vários professores.
- Q: Turmas podem compartilhar uma disciplina? → A: Não. Uma disciplina da turma pertence a uma única turma; o
  professor pode ter várias.
- Q: Quem encerra e arquiva a turma e encerra matrículas? → A: O gestor.
- Q: O ranking muda? → A: Não, por enquanto continua como hoje (por disciplina da turma).
- Q: E as turmas que já existem? → A: Cada uma vira uma turma do gestor com a disciplina que já tem, mantendo alunos,
  atividades, plano e convites pendentes.
- Q: O gestor precisa juntar turmas ou mover uma disciplina da turma para outra turma depois da migração? → A: Não. Na
  instituição a turma (ex.: "ADS 3NA") já é uma só, e cada professor insere nela o curso da sua ementa; não existem
  turmas desdobradas por matéria a reorganizar. Juntar turmas pelo gestor e mover disciplinas da turma ficam fora desta
  feature (a transição reúne sozinha as de mesmo código e ano letivo).
- Q: O professor pode arquivar a sua disciplina da turma? → A: Sim, encerrar e arquivar a sua disciplina da turma, mas
  só depois do último dia do calendário dela (ex.: curso de fevereiro a junho → a partir do dia seguinte ao último dia
  de junho do calendário). Antes disso a opção não aparece e o sistema recusa.
- Q: O que separa uma turma da outra de mesmo nome? → A: O ano letivo: "ADS 3NA" de 2026 não é "ADS 3NA" de 2027. No
  fim do ano letivo o gestor encerra a turma; os alunos continuam acessando o que tiveram nela, identificado pelo ano
  (em 2027 o aluno consulta as suas turmas de 2026).
- Q: Duas turmas de hoje com o mesmo código e o mesmo ano letivo, de professores diferentes, viram o quê na transição?
  → A: Uma turma só, com uma disciplina da turma para cada turma antiga. A turma é uma e tem várias matérias (ex.: "ADS
  3NA" com Java e Python do mesmo professor e Engenharia de IA de outro).
- Q: Como as atividades se ligam à ementa? → A: O professor cria exercícios, trabalhos e provas a partir da ementa
  escolhida e os aplica pela turma e pela ementa, isto é, na disciplina da turma; a atividade fica nela. O aluno escolhe
  a matéria (card "Matéria", 026) e vê só as atividades dela, seja do mesmo professor ou de outro.
- Q: Como o gestor põe numa turma nova um aluno que já tem conta (ex.: a turma de 2027 com alunos de 2026)? → A: Digita o
  e-mail; se já é de uma conta de aluno ativa, vê o nome e o inclui direto na turma, sem convite, e o aluno recebe um
  e-mail avisando. Se não é, segue o convite de hoje. O convite continua sendo a única forma de criar a conta de aluno
  (emenda à constituição 4.1.0).

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Gestor cria e administra as turmas (Priority: P1)

O gestor abre "Turmas", cria "ADS 3NA" (nome, código, ano letivo, período e descrição, como os campos de hoje), vê a
lista de todas as turmas com pesquisa e filtros, edita uma turma, a torna inativa e ativa de novo, e arquiva uma turma
que terminou. A página da turma mostra os seus dados, as disciplinas que os professores acrescentaram (nome da disciplina
e professor), os alunos e os convites.

**Why this priority**: sem a turma do gestor nada mais da feature existe.

**Independent Test**: com uma conta de gestor, criar, pesquisar, editar, inativar, reativar e arquivar uma turma, sem
nenhum professor ou aluno envolvido.

**Acceptance Scenarios**:

1. **Given** um gestor ativo, **When** ele cria a turma "ADS 3NA" com código "ADS-3NA", ano 2026 e período "2026.2",
   **Then** a turma nasce ativa, sem disciplina e sem alunos, e aparece na lista de turmas.
2. **Given** uma turma com o código "ADS-3NA", **When** o gestor cria outra com "ads-3na", **Then** o sistema recusa
   dizendo que o código já está em uso.
3. **Given** turmas de vários anos e situações, **When** o gestor pesquisa por parte do nome ou do código, sem acento
   ou maiúsculas, e filtra por ano e situação, **Then** vê só as turmas que atendem, das mais recentes para as mais
   antigas, ativas e inativas por padrão.
4. **Given** uma turma ativa com uma disciplina de um professor, **When** o gestor a torna inativa e depois ativa,
   **Then** cada mudança vale na hora para a turma e para as disciplinas dela.
5. **Given** uma turma ativa ou inativa, **When** o gestor a arquiva, **Then** os convites pendentes dela são
   cancelados na mesma operação, as matrículas e tudo o que as disciplinas da turma registraram são preservados, e a
   turma deixa de poder ser editada.
6. **Given** a página de uma turma com duas disciplinas de professores diferentes, **When** o gestor a abre, **Then**
   vê o nome de cada disciplina e de seu professor, mas nenhum plano, aula, atividade, entrega, resultado ou nota.

---

### User Story 2 - Gestor põe os alunos na turma (Priority: P1)

Na página da turma, o gestor informa o e-mail de um aluno. Se o e-mail já é de uma conta de aluno ativa, o gestor vê o
nome e inclui o aluno direto na turma; o aluno recebe um e-mail avisando. Se não é, o gestor envia o convite, acompanha
os convites, reenvia e cancela um convite; a pessoa aceita o convite (criando a conta ou com a conta que já tem, como na
003). Em ambos os casos, o aluno passa a estar na turma e em todas as disciplinas dela.

**Why this priority**: é a única forma de um aluno entrar; sem ela a turma do gestor não tem alunos.

**Independent Test**: com uma turma do gestor, convidar um e-mail novo e aceitar o convite; incluir direto o e-mail de
um aluno que já tem conta; ver os dois alunos na turma.

**Acceptance Scenarios**:

1. **Given** uma turma ativa, **When** o gestor convida "ana@exemplo.com", **Then** o convite fica pendente e um e-mail
   sai dizendo que a pessoa foi convidada para a turma "ADS 3NA", com o link e a validade, sem citar professor.
2. **Given** um convite pendente para "ana@exemplo.com" nessa turma, **When** o gestor convida o mesmo e-mail de novo,
   **Then** o sistema recusa dizendo que já existe convite pendente.
3. **Given** um convite pendente, **When** o gestor o reenvia ou o cancela, **Then** acontece o que a 003 e a 017 já
   fazem hoje (novo link e nova validade; ou o link antigo deixa de valer), e a situação de entrega do e-mail aparece
   ao lado do convite, como hoje.
4. **Given** um convite aceito por uma pessoa nova, **When** ela termina o cadastro, **Then** a conta nasce só com o
   papel de aluno e com a matrícula ativa na turma, como na 003.
5. **Given** um aluno matriculado em "ADS 3NA", que tem as disciplinas "Banco de Dados" e "Redes", **When** ele abre o
   Painel, **Then** o card "Matéria" (026) oferece as duas disciplinas, sem ele ter recebido um convite por matéria.
6. **Given** uma turma inativa ou arquivada, **When** o gestor tenta convidar ou incluir um aluno, **Then** o sistema
   recusa.
7. **Given** "bruna@exemplo.com", conta de aluno ativa de "ADS 3NA" de 2026, **When** o gestor informa esse e-mail em
   "ADS 4NA" de 2027, **Then** vê o nome "Bruna" e a opção "Incluir na turma"; ao incluir, ela passa a ter matrícula
   ativa em "ADS 4NA" na hora, sem convite, recebe um e-mail avisando da turma nova e continua com "ADS 3NA" em 2026.
8. **Given** um e-mail sem conta, de uma conta que não é de aluno, com e-mail não verificado ou desativada, **When** o gestor o
   informa, **Then** não há inclusão direta: o caminho é o convite de hoje (003), inclusive para quem já tem outra
   função na plataforma.
9. **Given** um aluno já com matrícula ativa na turma, **When** o gestor tenta incluí-lo de novo, **Then** o sistema
   recusa dizendo que o aluno já está na turma; incluídos ao mesmo tempo, só uma matrícula nasce.

---

### User Story 3 - Professor encontra a turma e acrescenta a sua disciplina (Priority: P1)

O professor abre "Turmas", pesquisa "ADS 3NA" entre as turmas ativas, vê o mínimo para reconhecê-la (nome, código, ano,
período e as disciplinas que ela já tem, com os professores) e acrescenta a ela uma disciplina sua. A partir daí, a
disciplina da turma aparece entre as suas e funciona como a turma de hoje: calendário, plano, aulas, atividades,
chamada, provas.

**Why this priority**: é o que devolve ao professor o seu trabalho de hoje dentro do modelo novo.

**Independent Test**: com uma turma do gestor e um professor com uma disciplina ativa, pesquisar a turma, acrescentar a
disciplina, abrir a disciplina da turma e aplicar uma atividade a ela.

**Acceptance Scenarios**:

1. **Given** turmas ativas, inativas e arquivadas, **When** o professor pesquisa por parte do nome ou do código,
   **Then** vê só as turmas ativas que atendem, com nome, código, ano, período e as disciplinas que já têm (nome da
   disciplina e do professor), sem alunos, convites ou atividades.
2. **Given** uma turma ativa e uma disciplina ativa do professor, **When** ele a acrescenta à turma, **Then** a
   disciplina da turma nasce ativa, pertence a ele, tem como alunos os matriculados na turma e aparece na sua lista.
3. **Given** que o professor já acrescentou "Banco de Dados" a "ADS 3NA", **When** ele tenta acrescentar "Banco de
   Dados" a "ADS 3NA" de novo, **Then** o sistema recusa dizendo que essa disciplina já está na turma.
4. **Given** "Banco de Dados" já em "ADS 3NA", **When** o professor acrescenta "Banco de Dados" a "ADS 3NB", **Then**
   nasce uma outra disciplina da turma, de "ADS 3NB", independente da primeira (plano, aulas e atividades próprios).
5. **Given** "ADS 3NA" com "Banco de Dados" de um professor, **When** outro professor acrescenta "Redes" a ela,
   **Then** a turma passa a ter as duas, e nenhum dos dois vê nada da disciplina do outro além do nome e do professor.
6. **Given** uma pesquisa sem resultado, **When** o professor a vê, **Then** a tela diz que a turma não foi encontrada
   e que ele pode pedir ao gestor que a crie.

---

### User Story 4 - Professor trabalha na sua disciplina da turma como hoje (Priority: P1)

Na disciplina da turma, o professor tem o que tem hoje na turma — calendário, plano, aulas, atividades, chamada, provas,
revisão, notas, ranking —, vê os alunos da turma (só leitura) e, depois do último dia do calendário da sua disciplina
da turma, pode encerrá-la e arquivá-la. Ele não convida nem remove alunos, nem muda os dados da turma.

**Why this priority**: garante que nada do que o professor já faz (004–025) quebra com a mudança.

**Independent Test**: depois de acrescentar a disciplina, percorrer calendário, plano, uma atividade aplicada, a chamada
e o ranking, e confirmar que as ações de convite, remoção de aluno e edição da turma não existem para ele.

**Acceptance Scenarios**:

1. **Given** uma disciplina da turma do professor, **When** ele a abre, **Then** vê o nome da disciplina e o da turma,
   as abas que a turma tem hoje e a lista dos alunos matriculados na turma, sem botões de convidar ou remover.
2. **Given** o professor, **When** ele tenta criar uma turma, convidar um aluno, remover uma matrícula ou editar,
   inativar ou arquivar uma turma, **Then** o sistema recusa por falta de permissão, mesmo fora da tela.
3. **Given** uma disciplina da turma ativa cujo calendário já terminou, **When** o professor a arquiva, **Then** ela
   deixa de aceitar novas atividades e alterações, continua consultável, e a turma e as outras disciplinas dela não
   mudam.
4. **Given** uma atividade aplicada a "Banco de Dados · ADS 3NA", **When** um aluno da turma a abre, **Then** tudo
   segue as regras de hoje (012–025): prazos, chamada, modo controlado, provas, notas, pontos e ranking da disciplina da
   turma.
5. **Given** uma disciplina da turma com calendário de fevereiro a junho, **When** o professor a abre até o último dia
   de junho do calendário (ou ela não tem calendário), **Then** as opções de encerrar e arquivar não aparecem e o
   sistema recusa o pedido, mesmo fora da tela; **When** ele a abre a partir do dia seguinte, **Then** as duas opções
   aparecem.

---

### User Story 5 - Gestor encerra a matrícula de um aluno (Priority: P2)

O gestor remove um aluno da turma (por exemplo, por desistência). O aluno deixa de ver todas as disciplinas da turma,
mas o que ele já fez continua registrado para os professores.

**Why this priority**: necessária para a turma refletir a realidade, mas o fluxo principal funciona sem ela.

**Independent Test**: com um aluno matriculado que tem uma entrega numa disciplina da turma, encerrar a matrícula e
conferir o que o aluno e o professor veem.

**Acceptance Scenarios**:

1. **Given** um aluno com matrícula ativa, **When** o gestor encerra a matrícula, **Then** o aluno deixa de ver todas as
   disciplinas da turma (atividades, Painel, card "Matéria", ranking) e o registro da matrícula fica encerrado, nunca
   apagado.
2. **Given** a matrícula encerrada, **When** o professor de uma disciplina da turma abre a revisão de uma atividade em
   que o aluno entregou, **Then** a entrega, a nota e os fatos registrados continuam lá, como hoje acontece quando o
   professor remove um aluno.
3. **Given** a matrícula encerrada, **When** o gestor convida o mesmo e-mail de novo e o convite é aceito, **Then** o
   aluno volta à turma com uma nova matrícula ativa.

---

### User Story 6 - As turmas de hoje continuam funcionando (Priority: P1)

No dia da mudança, cada turma que já existe vira uma disciplina da turma do mesmo professor, numa turma do gestor —
turmas de hoje com o mesmo código e o mesmo ano letivo viram uma única turma, com uma disciplina da turma para cada uma —, com os mesmos alunos, convites pendentes, calendário, plano, aulas, atividades, entregas, notas,
pontos e ranking. Ninguém precisa refazer nada.

**Why this priority**: o beta já tem professores e alunos usando o sistema; perder ou misturar dados é inaceitável.

**Independent Test**: com uma base com turmas de dois professores (uma delas sem disciplina, uma arquivada, com
atividades, entregas, notas, pontos e convites pendentes), aplicar a mudança e comparar, antes e depois, o que cada
professor e cada aluno vê.

**Acceptance Scenarios**:

1. **Given** uma turma de hoje com a disciplina "Banco de Dados", alunos e atividades, **When** a mudança é aplicada,
   **Then** existe uma turma com o mesmo nome, código, ano, período, descrição e situação, com os mesmos alunos, e uma
   disciplina da turma do mesmo professor com tudo o que a turma tinha.
2. **Given** um convite pendente de uma turma de hoje, **When** a mudança é aplicada, **Then** o link continua valendo
   até a validade de antes e, aceito, matricula o aluno na turma nova.
3. **Given** "ADS 3NA" de 2026 do professor A (Banco de Dados) e "ADS 3NA" de 2026 do professor B (Redes), com um aluno
   nas duas, **When** a mudança é aplicada, **Then** existe uma única turma "ADS 3NA" de 2026 com as duas disciplinas da
   turma, cada uma com tudo o que tinha, e o aluno tem uma matrícula nela e vê as duas matérias; uma "ADS 3NA" de 2027
   continua como outra turma.
4. **Given** uma turma de hoje sem disciplina ligada, **When** a mudança é aplicada, **Then** a disciplina da turma do
   mesmo professor existe sem disciplina, aparece pelo nome da turma, como hoje (026), e o professor pode continuar
   usando-a.

---

### User Story 7 - Cada um só vê o que é seu (Priority: P1)

A separação entre turma e disciplina da turma não abre nenhum acesso novo: o professor não vê disciplinas de outros
professores na mesma turma, o gestor não vê dados pedagógicos, e o aluno só vê as disciplinas das turmas em que está
matriculado.

**Why this priority**: notas e entregas de alunos são os dados mais sensíveis do produto (constituição XXIV).

**Independent Test**: com uma turma com disciplinas de dois professores, tentar, como cada papel, abrir pelo
identificador recursos que não são seus, e conferir as respostas.

**Acceptance Scenarios**:

1. **Given** "ADS 3NA" com "Banco de Dados" (professor A) e "Redes" (professor B), **When** A tenta abrir, pelo
   identificador, o plano, uma atividade, a chamada ou o ranking de "Redes", **Then** a resposta é a mesma de um recurso
   inexistente.
2. **Given** um gestor, **When** ele tenta abrir uma atividade, entrega, nota, plano ou ementa, **Then** o sistema recusa
   por falta de permissão.
3. **Given** um professor, **When** ele tenta abrir, pelo identificador, a página de gestão de uma turma (alunos com
   e-mail, convites), **Then** o sistema recusa por falta de permissão; na sua disciplina da turma ele vê só a lista de
   alunos que vê hoje.
4. **Given** um aluno matriculado em "ADS 3NA" e não em "ADS 3NB", **When** ele tenta abrir uma disciplina, atividade
   ou ranking de "ADS 3NB", **Then** a resposta é a mesma de um recurso inexistente.

---

### User Story 8 - Aluno vê as suas turmas e matérias (Priority: P3)

> Tela redesenhada pela 030 em 2026-11-25 (`specs/030-student-classes-redesign/`): um card por disciplina, filtro de ano
> (o mais recente de início) em vez de seções por ano; o conteúdo e as regras de US8 continuam.

Em "Minhas turmas", o aluno vê cada turma em que está, com as disciplinas dela e seus professores. No Painel e em
"Minhas atividades", o card "Matéria" (026) lista cada disciplina das suas turmas, como "Banco de Dados · ADS 3NA".

**Why this priority**: o aluno já consegue estudar com a 026; aqui só se ajusta o que ele lê.

**Independent Test**: com um aluno numa turma com duas disciplinas, abrir "Minhas turmas" e o card "Matéria".

**Acceptance Scenarios**:

1. **Given** um aluno em "ADS 3NA", com "Banco de Dados" (Prof. Eder) e "Redes" (Prof. Ana), **When** ele abre "Minhas
   turmas", **Then** vê a turma uma vez, com as duas disciplinas e os nomes dos professores.
2. **Given** uma turma do aluno ainda sem disciplina, **When** ele abre "Minhas turmas", **Then** vê a turma com a
   indicação de que ainda não há disciplinas, e o card "Matéria" não oferece essa turma.
3. **Given** um aluno em 2027 com "ADS 3NA" de 2026 encerrada pelo gestor e "ADS 4NA" de 2027 ativa, **When** ele abre
   "Minhas turmas", **Then** vê "ADS 4NA" em 2027 e "ADS 3NA" em 2026, marcada como encerrada, e consegue abrir as
   atividades e notas liberadas de 2026 só para leitura.
4. **Given** "Banco de Dados · ADS 3NA" arquivada pelo professor numa turma ativa, **When** o aluno abre "Minhas
   turmas", **Then** vê a disciplina marcada "Arquivada" e abre as suas notas liberadas só para leitura; o card
   "Matéria" não a oferece.

---

### Edge Cases

- **Turma arquivada pelo gestor** com disciplinas ativas: as disciplinas dela passam a se comportar como arquivadas
  (consultáveis, sem novas atividades ou alterações), sem que o professor precise fazer nada.
- **Turma encerrada (inativa)**: as disciplinas dela não aceitam novas atividades nem entregas; os alunos continuam
  consultando o que tiveram nelas, identificado pelo ano letivo (FR-004, FR-025).
- **Professor desativado** com disciplinas em turmas: segue a regra de hoje para o que pertence a ele; a turma e as
  disciplinas de outros professores não mudam.
- **Disciplina do professor arquivada** depois de acrescentada a uma turma: a disciplina da turma continua existindo
  como hoje acontece com uma turma ligada a uma disciplina arquivada; não se acrescenta uma disciplina arquivada a uma
  turma.
- **Dois professores acrescentam disciplinas à mesma turma ao mesmo tempo**: as duas entram. **O mesmo professor
  acrescenta a mesma disciplina duas vezes ao mesmo tempo**: só uma entra.
- **Gestor arquiva a turma enquanto o professor acrescenta uma disciplina**: ou a disciplina entra antes do arquivamento
  (e passa a se comportar como arquivada, FR-023), ou é recusada com `409 COHORT_NOT_ACTIVE`; nunca é criada depois dele.
- **Gestor encerra uma matrícula durante uma prova ou trabalho em andamento do aluno**: vale o que acontece hoje
  quando o professor remove um aluno nessa situação.
- **Aluno entra na turma depois de atividades já aplicadas**: vale o que acontece hoje para quem entra tarde numa turma
  (012, 016).
- **Pessoa que é gestor e professor ao mesmo tempo**: tem as duas telas, cada uma com as suas regras; ser gestor não
  dá acesso pedagógico às disciplinas de outros professores.
- **Não há gestor cadastrado**: o administrador, que já acumula a função, cria as turmas.
- **Gestor tenta mudar a disciplina ou o professor de uma disciplina da turma, mover uma disciplina da turma para
  outra turma ou juntar duas turmas**: não é possível nesta feature; só o professor acrescenta a sua e a encerra ou
  arquiva depois do fim do calendário dela.
- **Professor altera o fim do calendário** da sua disciplina da turma: a disponibilidade de encerrar e arquivar segue o
  fim que estiver valendo no momento do pedido.

## Requirements *(mandatory)*

### Functional Requirements

**Turma (gestor)**

- **FR-001**: O gestor DEVE poder criar turmas com os campos de hoje (003 FR-001): nome, código, ano letivo, período
  e descrição, com as mesmas regras de tamanho e formato. A turma nasce ativa, sem disciplina e sem alunos; quem a criou
  é registrado, mas a turma não pertence a uma pessoa.
- **FR-002**: O código da turma DEVE ser único dentro do mesmo ano letivo, sem diferenciar maiúsculas e minúsculas,
  garantido também sob requisições concorrentes; o mesmo código pode existir em anos letivos diferentes ("ADS-3NA"
  de 2026 e de 2027 são turmas distintas).
- **FR-003**: O gestor DEVE poder editar os campos de turmas ativas ou inativas; turmas arquivadas não podem ser
  editadas.
- **FR-004**: A turma DEVE manter o ciclo de vida de hoje: `ACTIVE`, `INACTIVE` e `ARCHIVED`, com as transições da 003
  (`ACTIVE ↔ INACTIVE`, `ACTIVE → ARCHIVED`, `INACTIVE → ARCHIVED`; `ARCHIVED` é final). Só o gestor muda a situação.
  Outras transições DEVEM ser recusadas como transição inválida. "Encerrar a turma" (no fim do ano letivo) é torná-la
  inativa: as matrículas continuam como estão, e os alunos continuam consultando, só para leitura, as disciplinas dela
  (atividades, entregas, notas liberadas, pontos e ranking), sem novas atividades ou entregas.
- **FR-005**: Arquivar uma turma DEVE cancelar os convites pendentes dela na mesma operação e preservar matrículas,
  disciplinas da turma e tudo o que elas registraram.
- **FR-006**: O gestor DEVE poder listar todas as turmas com paginação, pesquisa por parte do nome ou do código (sem
  diferenciar maiúsculas e acentos) e filtros por ano e situação, no servidor; por padrão, ativas e inativas, das mais
  recentes para as mais antigas.
- **FR-007**: A página da turma do gestor DEVE mostrar os dados da turma, a quantidade de matrículas ativas, os alunos
  (nome, e-mail e situação da matrícula), os convites (e-mail, situação e entrega, como hoje) e as disciplinas da turma
  (nome da disciplina, nome do professor e situação) — e nada de plano, aulas, atividades, entregas, resultados ou
  notas.
- **FR-008**: Turmas NÃO DEVEM ser excluídas fisicamente.

**Convites e matrículas (gestor)**

- **FR-009**: O gestor DEVE poder convidar um aluno, um e-mail por vez, para uma turma ativa, com as regras de convite
  da 003 (FR-010 a FR-018: validações, um convite pendente por turma e e-mail, ciclo de vida, validade de 7 dias, token
  de uso único guardado como hash) e o envio pela caixa de saída da 017.
- **FR-010**: O e-mail e a página pública do convite DEVEM dizer que a pessoa foi convidada para a turma (nome, código
  e período), sem citar professor ou disciplina, e quem convidou DEVE constar no registro do convite.
- **FR-011**: O gestor DEVE poder reenviar e cancelar convites como o professor faz hoje (003, 017), incluindo
  "Reenviar" de um convite "Não entregue".
- **FR-012**: O aceite do convite NÃO muda (003 FR-030 a FR-041, anti-enumeração incluída): cria a conta de aluno ou usa
  a existente e cria a matrícula ativa **na turma**.
- **FR-013**: Uma matrícula ativa na turma DEVE fazer do aluno um aluno de todas as disciplinas da turma, as atuais e as
  que forem acrescentadas depois, sem nenhum outro convite ou aceite.
- **FR-014**: O gestor DEVE poder encerrar a matrícula de um aluno, com as mesmas regras e efeitos da remoção de aluno
  de hoje (003 FR-044, FR-047), que passam a valer para todas as disciplinas da turma de uma vez.
- **FR-015**: NÃO PODE existir mais de uma matrícula ativa do mesmo aluno na mesma turma (003 FR-043).
- **FR-034** *(acrescentado na clarificação; numerado por último para não renumerar os demais)*: O gestor DEVE poder,
  numa turma ativa, informar um e-mail (exato, sem busca por parte) e, se ele for de uma conta ativa, com o papel de
  aluno e o e-mail verificado, ver o nome e incluí-la direto na turma: a matrícula ativa nasce na hora, sem convite nem
  aceite, e um e-mail de aviso ("você foi incluído na turma <nome> (<código>, <período>)", com o link de entrar, sem
  token) sai pela caixa de saída da 017. Um convite pendente para o mesmo e-mail na turma é cancelado na mesma operação.
  Sem conta, conta sem o papel de aluno, com e-mail não verificado ou desativada → só o convite (FR-009). A inclusão
  nunca cria conta, nunca muda senha, papel ou dados da conta, e responde "já está na turma" quando a matrícula ativa
  existe (FR-015).

**Disciplina da turma (professor)**

- **FR-016**: O professor DEVE poder pesquisar as turmas **ativas** por parte do nome ou do código (sem diferenciar
  maiúsculas e acentos), com paginação, vendo de cada uma apenas nome, código, ano, período e as disciplinas que ela já
  tem (nome da disciplina e do professor). Nunca alunos, convites, atividades ou quantidade de alunos.
- **FR-017**: O professor DEVE poder acrescentar a uma turma ativa uma disciplina **sua** e **ativa**. A disciplina da
  turma nasce ativa, pertence a ele e tem o calendário, o plano e as demais regras que uma turma ligada a uma disciplina
  tem hoje (004). O professor e a turma vêm do servidor e da escolha validada, nunca de um campo livre do pedido.
- **FR-018**: NÃO PODE existir mais de uma disciplina da turma com a mesma turma e a mesma disciplina, garantido também
  sob requisições concorrentes. A mesma disciplina do professor PODE estar em turmas diferentes, cada uma como uma
  disciplina da turma independente.
- **FR-019**: Uma disciplina da turma pertence a uma única turma e a um único professor, que nunca mudam depois de
  criada.
- **FR-020**: A tela "Turmas" do professor DEVE listar as suas disciplinas da turma (nome da disciplina, nome, código e
  período da turma, situação), com pesquisa e filtros como hoje, e oferecer a busca de turmas (FR-016) para acrescentar
  uma disciplina. Quando a pesquisa não encontra nada, a tela DEVE dizer que a turma não foi encontrada e que o gestor
  pode criá-la.
- **FR-021**: A página da disciplina da turma DEVE oferecer ao professor o que a página da turma oferece hoje (004–025)
  e a lista dos alunos matriculados na turma, só para leitura, com os dados que o professor vê hoje de um aluno. Ela NÃO
  DEVE oferecer convite, remoção de aluno, nem edição ou mudança de situação da turma.
- **FR-022**: O professor DEVE poder encerrar (tornar inativa, e reativar enquanto não arquivar) e arquivar a sua
  disciplina da turma **somente depois do último dia do calendário dela**, pela data do relógio do servidor no fuso do
  calendário (004); antes disso, ou sem calendário definido, as opções não aparecem e o pedido é recusado (`409`).
  Arquivada, ela deixa de aceitar novas atividades e alterações e continua consultável, como uma turma arquivada de
  hoje; a turma e as outras disciplinas dela não mudam. Arquivar é final nesta feature.
- **FR-023**: A situação efetiva de uma disciplina da turma DEVE ser a mais restritiva entre a dela e a da turma
  (arquivada > inativa > ativa), derivada a cada leitura, e DEVE produzir os mesmos efeitos que a situação da turma
  produz hoje em calendário, plano, atividades, chamada, provas, alertas e no card "Matéria" do aluno.
- **FR-024**: Plano, calendário, aulas, atividades, chamada, pausas, provas, alertas, resultados, notas, pontos e
  ranking DEVEM pertencer à disciplina da turma e manter o comportamento de hoje; "alunos da turma" nessas regras passa
  a ser "alunos com matrícula ativa na turma da disciplina". O professor aplica uma atividade escolhendo a turma e a
  ementa (a disciplina da turma); trabalhos e provas só são aplicados na disciplina da turma da sua disciplina, como hoje.
  Duas disciplinas da turma do mesmo professor na mesma turma são independentes: atividades, chamada e ranking de uma
  nunca aparecem na outra.

**Aluno**

- **FR-025**: "Minhas turmas" DEVE mostrar cada turma do aluno uma vez, agrupada por ano letivo (o mais recente
  primeiro), com todas as suas disciplinas da turma (nome da disciplina e do professor, situação efetiva), ou a
  indicação de que a turma ainda não tem disciplinas. Turmas e disciplinas inativas ou arquivadas aparecem marcadas
  ("Encerrada"/"Arquivada"), e o aluno abre o que teve nelas só para leitura (atividades, entregas, notas liberadas,
  pontos e ranking), enquanto a sua matrícula na turma estiver ativa (FR-004).
- **FR-026**: O card "Matéria" do Painel e de "Minhas atividades" (026) DEVE oferecer uma opção por disciplina da turma
  das turmas do aluno, com o texto "<disciplina> · <turma>" e as regras da 026 (desempate, opção única, aviso de matéria
  indisponível). Turmas sem disciplina não aparecem no card.

**Transição**

- **FR-027**: A mudança DEVE transformar cada turma existente numa turma do gestor (mesmos nome, código, ano, período,
  descrição, situação, matrículas e convites; as que têm o mesmo código e o mesmo ano letivo formam uma única turma,
  FR-028) e numa disciplina da turma do mesmo professor e da mesma disciplina (ou
  sem disciplina, se não havia), que fica com tudo o que pertencia à turma: calendário, plano, aulas, atividades,
  chamada, pausas, provas, alertas, entregas, notas, pontos, ranking e auditoria. A disciplina da turma migrada herda a
  situação da turma de antes.
- **FR-028**: Turmas de hoje com o mesmo código (sem diferenciar maiúsculas) e o mesmo ano letivo DEVEM virar uma única
  turma, com uma disciplina da turma para cada turma antiga. Nome, período e descrição vêm da turma antiga mais antiga;
  a situação é a mais aberta entre elas (ativa > inativa > arquivada), e cada disciplina da turma mantém a situação da
  sua turma antiga. Os alunos são somados: quem estava em mais de uma tem uma matrícula, ativa se alguma estava ativa,
  e o histórico de matrículas encerradas é preservado. Dois convites pendentes para o mesmo e-mail ficam como um só (o
  de validade mais longa; o outro é revogado pelo sistema). Cada matrícula encerrada e cada convite revogado pela
  reunião gera um evento de auditoria do sistema, com o motivo `MERGED`. A transição NÃO DEVE perder, duplicar ou
  trocar o dono de nenhum registro pedagógico.
- **FR-029**: Convites pendentes de antes da mudança DEVEM continuar válidos até a sua validade, matriculando na turma
  correspondente.
- **FR-030**: Uma disciplina da turma migrada sem disciplina DEVE continuar utilizável pelo professor como hoje; não é
  possível criar novas disciplinas da turma sem disciplina.

**Telas e mensagens**

- **FR-031**: O gestor DEVE ter "Turmas" no seu menu; o professor mantém "Minhas disciplinas" e "Turmas". As telas
  DEVEM usar o sistema de componentes, ter estados claros de carregamento, erro, vazio e sucesso, e atender WCAG 2.2 AA
  (navegação completa por teclado, rótulos visíveis), como a 003.
- **FR-032**: As mensagens DEVEM incluir, com este texto: "Turma criada.", "Turma atualizada.", "Convite enviado.",
  "Disciplina acrescentada à turma.", "Essa disciplina já está nesta turma.", "Esse código de turma já está em uso.",
  "Turma não encontrada. Peça ao gestor que a crie.", "Disciplina da turma arquivada.", "Aluno incluído na turma." e
  "Esse aluno já está na turma.".
- **FR-033**: Os nomes de turma, disciplina e professor DEVEM ser mostrados como texto, nunca interpretados como HTML.

### Security, Permissions & Audit

- **Permissions**:
  - Gestor (`MANAGER`, e `ADMIN` enquanto acumular a função): criar, editar, listar e ver turmas, mudar a situação,
    convidar, reenviar e cancelar convites, encerrar matrículas — as permissões de turma e convite de hoje
    (`turmas.criar`, `turmas.visualizar`, `turmas.editar`, `turmas.alterar_situacao`, `turmas.convidar_aluno`,
    `turmas.reenviar_convite`, `turmas.cancelar_convite`, `turmas.visualizar_alunos`, `turmas.remover_aluno`) passam a
    ser dele, mais a nova de incluir
    um aluno existente (FR-034).
  - Professor (`TEACHER`): perde as de criar e gerenciar turma, convidar e remover aluno; ganha a de pesquisar turmas
    (`turmas.buscar`) e a de criar, encerrar, reativar e arquivar a sua disciplina da turma; mantém todas as de 004–025, agora sobre a
    disciplina da turma.
  - Sem a permissão → `403`, mesmo fora da tela (US4-2, US7-2, US7-3).
- **Resource context**:
  - Gestor: qualquer turma, só os dados de gestão (FR-007); nunca os recursos pedagógicos das disciplinas da turma.
  - Professor: só as suas disciplinas da turma; uma disciplina de outro professor, mesmo na mesma turma, responde como
    inexistente (`404`); a busca de turmas mostra só o mínimo (FR-016).
  - Aluno: só as disciplinas das turmas em que tem matrícula ativa; as demais respondem como inexistentes (`404`).
- **Audit events**: criar, editar e mudar a situação da turma; convidar, reenviar, cancelar e aceitar convite; consultar
  um e-mail para inclusão direta (encontrado ou não) e incluir um aluno existente; encerrar matrícula; criar, encerrar, reativar e arquivar disciplina da turma; a execução da transição (contagens por tipo de registro). Metadados
  só com identificadores, situações e contagens — nunca e-mail, nome ou texto livre; a única exceção é a de hoje da 003:
  `class_invitation.created` mantém o e-mail convidado.
- **Untrusted input**: campos da turma validados como na 003; turma e disciplina da disciplina da turma por
  identificador, conferidos no servidor (turma ativa; disciplina do próprio professor e ativa); professor, gestor e
  situação nunca vindos do corpo do pedido; campos desconhecidos recusados (`400`).
- **States & transitions**: turma `ACTIVE`/`INACTIVE`/`ARCHIVED` (FR-004); disciplina da turma `ACTIVE ⇄ INACTIVE →
  ARCHIVED` sobre a situação própria, só depois do fim do calendário (FR-022), com a situação efetiva derivada (FR-023); convite e matrícula como na 003. Transição inválida → `409`.
- **Idempotency**: código de turma único (FR-002); uma disciplina da turma por turma e disciplina (FR-018); um convite
  pendente por turma e e-mail; aceite idempotente (003); arquivar a turma e acrescentar uma disciplina sob concorrência
  nunca deixam disciplina ativa em turma arquivada; a transição roda uma vez e é verificável.
- **Evidence vs. decisions**: N/A — nenhuma regra automática decide sobre alunos; tudo é ação de gestor ou professor.
- **Automation risk level**: N/A — sem IA.
- **Domain configurability**: turmas, disciplinas e períodos são dados; nenhum nome de curso, turma ou disciplina no
  código.
- **Sensitive data & adaptations**: o gestor vê nome e e-mail dos alunos da turma (para convidar e gerir matrículas) e
  nada pedagógico; só ele (com a permissão de FR-034) sabe se um e-mail exato é de uma conta de aluno, e vê dela só o
  nome — as rotas públicas continuam anti-enumeração (003); o professor vê dos alunos o que vê hoje.
- **Curricular traceability**: a disciplina da turma liga a turma à disciplina e à ementa do professor (004); o escopo
  ensinado e a cobertura passam a ser por disciplina da turma, com as regras de hoje.

### Key Entities

- **Turma**: grupo de alunos de um período, criado pelo gestor. Nome, código (único), ano letivo, período, descrição,
  situação, quem criou. Tem convites, matrículas e disciplinas da turma.
- **Disciplina da turma**: oferta de uma disciplina de um professor numa turma. Turma, professor, disciplina (vazia só
  nas migradas sem disciplina), situação própria. Dona de calendário, plano, aulas, atividades, chamada, provas,
  resultados, notas, pontos e ranking.
- **Convite de turma**: como na 003, agora para a turma do gestor e registrando quem convidou.
- **Matrícula**: aluno × turma, como na 003; dá acesso a todas as disciplinas da turma.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Um aluno numa turma com N disciplinas recebe exatamente 1 convite (antes, N) e vê as N disciplinas no card
  "Matéria" depois do aceite.
- **SC-002**: Depois da transição, 100% das turmas, matrículas, convites pendentes, atividades, entregas, notas, pontos
  e eventos de auditoria de antes estão presentes, cada um ligado ao mesmo professor e aos mesmos alunos; a comparação
  antes/depois do que cada professor e cada aluno vê não tem diferença além dos rótulos, das telas novas e da reunião
  das turmas de mesmo código e ano letivo (FR-028).
- **SC-003**: Em 100% das tentativas, um professor recebe a resposta de recurso inexistente para qualquer recurso de
  uma disciplina da turma de outro professor, inclusive na mesma turma; o gestor recebe recusa por permissão em 100%
  dos recursos pedagógicos.
- **SC-004**: Um professor encontra uma turma existente e acrescenta a sua disciplina em até 1 minuto, com no máximo 3
  interações depois de abrir "Turmas" (pesquisar, escolher a turma, confirmar a disciplina).
- **SC-005**: As suítes de comportamento das features 004–026 continuam passando com a disciplina da turma no lugar da
  turma, sem mudança nas regras que verificam.
- **SC-006**: Sob 20 pedidos simultâneos, nunca existem duas turmas com o mesmo código no mesmo ano letivo nem duas
  disciplinas da turma com a mesma turma e disciplina, e nenhuma disciplina da turma é criada numa turma depois de ela
  ser arquivada (as que já existiam passam a ter situação efetiva arquivada).

## Assumptions

- "Encerrar a turma" é torná-la inativa e "arquivar" é o arquivamento final, como os estados de hoje da 003; nenhum
  estado novo de turma.
- Uma disciplina da turma sem calendário definido não pode ser encerrada nem arquivada pelo professor até ele definir o
  calendário; reativar uma disciplina da turma arquivada fica para depois.
- O pedido de turma ao gestor (área "Solicitações") é a feature 028; até lá, a tela só orienta o professor a pedir ao
  gestor.
- O gestor vê de cada aluno só nome, e-mail e situação de matrícula e convite; RA e demais dados ficam com o professor,
  como hoje.
- A disciplina acrescentada não precisa ter ementa confirmada: vale a regra de hoje para ligar uma disciplina a uma
  turma (004). Calendário, plano e escopo ensinado continuam exigindo o que exigem hoje.
- A inclusão direta (FR-034) segue a emenda 4.1.0 da constituição (ingresso em turma pelo convite **ou** pela
  inclusão, pelo gestor, de uma conta de aluno que já existe); o e-mail de aviso é um novo tipo na caixa de saída da 017,
  sem token.
- O card "Matéria" (026) oferece só as disciplinas da turma de situação efetiva ativa; as demais (de turmas encerradas
  ou arquivadas, ou arquivadas pelo professor) são abertas a partir de "Minhas turmas", no seu ano letivo.
- A transição roda uma vez, no deploy desta feature, sem parar o beta além do tempo do deploy.
- A tela "Minhas turmas" do aluno e o card "Matéria" mudam só o necessário; Painel, "Minhas atividades", Histórico e a
  página da atividade não mudam.
- O ranking continua por disciplina da turma, como hoje por turma.
- Nada muda no app do celular (024/025) além de o nome exibido ser o da disciplina da turma.
