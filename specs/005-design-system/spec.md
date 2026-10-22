# Feature Specification: 005 — Design System e Identidade Visual (Fundação de UI/UX)

**Feature Branch**: `005-design-system`
**Created**: 2026-09-24
**Status**: Draft
**Input**: User description: "Design System e Identidade Visual — Fundação de UI/UX: identidade visual própria (minimalista, acadêmica, tecnológica, sóbria) e Design System reutilizável antes da expansão das funcionalidades: design tokens (cores semânticas a partir de Primary #2563EB, Primary Dark #172554, Background #F8FAFC, Surface #FFFFFF, Text #0F172A/#64748B, Border #E2E8F0, Success #16A34A, Warning #D97706, Danger #DC2626, Information e Disabled), tipografia Inter e JetBrains Mono com escala oficial, espaçamento em múltiplos de 4px, radius 6/8/12, poucas sombras, Lucide, componentes fundamentais com variantes e estados, componentes do domínio de avaliação (navegação entre questões, estados das questões, salvamento automático, avisos da avaliação, área de código), layouts do professor/administração, do aluno e Exam Mode, foco visível, WCAG 2.2, prefers-reduced-motion, arquitetura pronta para temas, catálogo visual e documentação. Fora de escopo: redesenhar todas as páginas, alterar regras de negócio, autenticação, RBAC, API, persistência, lógica de provas e antifraude."

## Clarifications

### Session 2026-09-24

- Q: Os componentes do domínio de avaliação (navegação entre questões, salvamento,
  cronômetro, aviso de perda de foco, área e editor de código) são construídos nesta
  feature? → A: Não. Nesta feature eles são especificados como contrato visual documentado
  (regiões, hierarquia, estados, textos, anúncios acessíveis e tokens usados), assim como
  o layout de avaliação (Exam Mode); são construídos junto com a feature de avaliações. A
  escolha do editor de código fica para a feature de exercícios de programação.
- Q: Até onde vai a migração das telas existentes? → A: Tokens, fontes e componentes
  fundamentais em todas as telas; as telas internas passam a usar o AppShell e as telas da
  área do aluno o layout do aluno, sem redesenhar o conteúdo nem mudar comportamento.

### Session 2026-09-29 (emenda)

- Q: Um Toast de erro pode sumir sozinho? → A: Sim, quando a tela pede um tempo explícito
  (`duration`); sem ele, o erro continua até ser fechado. O primeiro caso é a recusa do login
  (002, emenda 2026-09-29): Toast `danger` de 5 s no rodapé, que pausa com foco ou mouse e é
  a única exceção à regra "nunca o único lugar de uma informação necessária", porque a
  mensagem é curta e a pessoa pode tentar de novo na mesma tela.

### Session 2026-10-22 (emenda)

- Q: Qual a paleta e quais temas? → A: A identidade passa à paleta Vice City — Ocean Night
  `#0B0F2B` (fundo), Sunset Pink `#FF5CA8` (marca: ação principal, seleção, progresso, links),
  Vice Cyan `#00F0FF` (foco e informação), Neon Purple `#BC6CFF` e Miami Peach `#FFB86B` (atenção e
  sintaxe) — num tema único, escuro, que não muda com a preferência do sistema. O tema claro sai,
  porque as cores neon não atingem 4,5:1 sobre branco. Os mesmos requisitos de contraste (FR-003)
  valem; as cores de sintaxe (014) e as dos e-mails (017) seguem o tema único.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Professor e aluno reconhecem uma identidade única em todas as telas (Priority: P1)

O professor e o aluno passam a ver o sistema com a identidade oficial: a mesma paleta
(neutros predominantes, rosa da marca para ação principal, seleção e progresso, ciano no foco,
cores semânticas só para significado), a mesma tipografia (Inter no texto, JetBrains Mono
só no que é código), a mesma escala de títulos e textos, os mesmos espaçamentos, raios,
bordas, sombras discretas e o mesmo contorno de foco. As telas existentes ganham essa
identidade sem mudar o que fazem.

**Why this priority**: é a base de tudo: sem valores oficiais centralizados, cada nova
tela decide de novo "qual azul", "qual tamanho de título" e "qual espaçamento", e o
produto vira uma coleção de páginas independentes.

**Independent Test**: percorrer as telas existentes (entrar, perfil, turmas, disciplinas,
ementa, calendário, planejamento, administração) e conferir a paleta, a tipografia e o
foco oficiais; conferir, com as verificações automáticas, que todo par de texto e fundo
atinge o contraste mínimo nos temas disponíveis e que os fluxos continuam passando nos
testes existentes.

**Acceptance Scenarios**:

1. **Given** qualquer tela existente, **When** ela é aberta, **Then** usa exclusivamente
   as cores, fontes, tamanhos, espaçamentos, raios, bordas e sombras oficiais do Design
   System, e o comportamento da tela é o mesmo de antes.
2. **Given** um texto sobre um fundo do sistema, **When** o contraste é medido, **Then**
   atinge 4,5:1 (texto comum) ou 3:1 (texto grande, ícones, bordas de campos e contorno
   de foco); onde um valor base da paleta não atinge o mínimo, é usada a variante
   acessível oficial daquela cor.
3. **Given** qualquer elemento interativo, **When** ele recebe foco pelo teclado,
   **Then** mostra o contorno de foco oficial, claramente visível sobre o fundo em que
   está.
4. **Given** um trecho de código, saída de execução ou console, **When** é exibido,
   **Then** usa a fonte monoespaçada oficial; nenhum outro texto da interface a usa.
5. **Given** a fonte oficial indisponível (bloqueada ou não carregada), **When** a tela é
   exibida, **Then** o texto aparece numa fonte substituta equivalente, sem quebrar o
   layout nem esconder conteúdo.
6. **Given** um usuário com preferência por menos movimento, **When** ele usa o sistema,
   **Then** transições e animações são removidas ou reduzidas ao mínimo.

---

### User Story 2 - Os mesmos significados têm sempre a mesma aparência nos componentes (Priority: P1)

Ações, campos de formulário, avisos, contêineres, dados e navegação usam componentes
fundamentais únicos, com variantes e estados padronizados: o botão principal, o
secundário, o de contorno, o discreto e o de perigo; campos com estados de padrão, foco,
preenchido, desabilitado, erro e sucesso; avisos de informação, sucesso, atenção e
erro; e assim por diante. Uma ação destrutiva nunca parece uma ação comum, e nenhum
estado depende só de cor.

**Why this priority**: consistência é o que o usuário percebe como "um único produto";
sem componentes únicos, "sucesso verde numa tela e azul noutra" volta a acontecer.

**Independent Test**: no catálogo (US4), abrir cada componente fundamental e conferir as
variantes e os estados previstos, o foco pelo teclado, os nomes acessíveis e que erro,
sucesso, atenção e informação combinam cor com ícone ou texto.

**Acceptance Scenarios**:

1. **Given** o componente de botão, **When** exibido nas variantes principal,
   secundária, contorno, discreta e perigo, **Then** cada variante tem os estados padrão,
   passar o mouse, foco, pressionado, carregando e desabilitado, e o estado carregando
   impede um segundo acionamento e é anunciado a tecnologias assistivas.
2. **Given** uma ação destrutiva (excluir, cancelar tentativa, encerrar avaliação),
   **When** apresentada, **Then** usa a variante de perigo, com texto explícito, e quando
   o risco é relevante pede confirmação antes de executar.
3. **Given** um campo de formulário com erro, **When** o erro é mostrado, **Then** o
   campo tem borda de erro, ícone e mensagem em texto ligada ao campo, compreensível e sem
   depender só da cor.
4. **Given** um aviso de informação, sucesso, atenção ou erro, **When** exibido, **Then**
   usa a cor semântica correspondente, um ícone próprio e um título ou texto que nomeia o
   tipo.
5. **Given** um ícone sem texto, **When** o significado não é evidente, **Then** tem nome
   acessível e dica visível ao passar o mouse ou focar.
6. **Given** a lista de componentes fundamentais (ações, formulários, avisos,
   contêineres, dados e navegação), **When** uma tela precisa de um deles, **Then** usa o
   componente do Design System, e não uma variação própria.

---

### User Story 3 - Professor e administração trabalham num AppShell organizado (Priority: P1)

As telas internas do professor e da administração usam um AppShell oficial: menu
lateral (que recolhe para os ícones), barra superior com o contexto da página, cabeçalho
de página com título, trilha de navegação e ações, e área principal com largura e
espaçamento consistentes. O menu mostra só as áreas que o usuário pode abrir, com estados
de padrão, passar o mouse, ativo, foco e recolhido.

**Why this priority**: o professor é quem mais usa o sistema hoje; o AppShell dá o "onde
estou, o que é principal e o que posso fazer" em todas as telas dele.

**Independent Test**: entrar como professor, como gestor e como administrador e conferir,
em cada tela interna, o menu lateral com o item atual marcado, a barra superior, o
cabeçalho com título e trilha, o recolhimento do menu (inclusive pelo teclado) e que o
menu não mostra áreas sem permissão nem áreas que ainda não existem.

**Acceptance Scenarios**:

1. **Given** uma tela interna do professor ou da administração, **When** aberta,
   **Then** mostra o menu lateral, a barra superior e o cabeçalho de página com o título
   da tela, a trilha de navegação e as ações principais da tela.
2. **Given** o menu lateral, **When** o usuário passa o mouse, foca ou está numa área,
   **Then** o item mostra o estado correspondente, e o item da área atual é identificado
   também para tecnologias assistivas.
3. **Given** o menu recolhido, **When** o usuário navega, **Then** cada item mostra só o
   ícone, com nome acessível e dica, e a escolha de recolher é lembrada.
4. **Given** um usuário sem a permissão de uma área, **When** o menu é exibido, **Then**
   a área não aparece; e se ele chega à rota por outro caminho, o servidor continua
   decidindo o acesso.
5. **Given** uma área prevista para features futuras (exercícios, avaliações, banco de
   questões, resultados), **When** o menu é exibido, **Then** ela não aparece até que a
   feature exista.
6. **Given** um tablet ou uma tela estreita, **When** a tela interna é aberta, **Then**
   o menu vira um painel que abre e fecha, e o conteúdo principal ocupa a largura.

---

### User Story 4 - A equipe valida o Design System num catálogo e numa documentação (Priority: P2)

Quem desenvolve e revisa o sistema abre um catálogo visual com todos os componentes, cada
um com suas variantes, estados, tamanhos, erro, carregando e desabilitado, e uma
documentação que explica princípios, tokens, cores, tipografia, espaçamento, quando usar
e quando não usar cada componente, exemplos e padrões de acessibilidade.

**Why this priority**: sem catálogo, validar o Design System depende de telas completas;
sem documentação, as regras não sobrevivem à próxima feature.

**Independent Test**: abrir o catálogo, navegar por todos os componentes e estados pelo
teclado, conferir que cada componente listado nesta spec está presente, e conferir que a
documentação cobre cada item do Design System.

**Acceptance Scenarios**:

1. **Given** o catálogo, **When** aberto, **Then** lista todos os componentes
   fundamentais e os layouts construídos (AppShell e aluno), cada um com variantes e
   estados.
2. **Given** um componente no catálogo, **When** exibido, **Then** mostra também os
   estados de erro, carregando e desabilitado quando se aplicam, e a largura de tablet
   quando o componente muda de forma.
3. **Given** a documentação, **When** consultada, **Then** descreve princípios, tokens,
   cores (com a regra de distribuição e o significado de cada cor semântica), tipografia,
   espaçamento, raios, sombras, iconografia, movimento, cada componente (quando usar e
   quando não usar, com exemplo), os padrões de acessibilidade e o contrato visual do modo
   avaliação (US6).
4. **Given** o ambiente de produção, **When** alguém procura o catálogo, **Then** ele não
   está disponível.

---

### User Story 5 - O aluno usa um ambiente simples e focado (Priority: P2)

As telas do aluno usam um layout próprio, com menos complexidade: a atividade atual, o
progresso, as informações essenciais e a próxima ação. Nenhum elemento administrativo
aparece.

**Why this priority**: o aluno precisa de concentração; o layout do professor, mais denso,
não serve para ele.

**Independent Test**: entrar como aluno e conferir que "Minhas turmas" e o perfil usam o
layout do aluno, sem menu administrativo nem atalhos de áreas do professor; entrar como
professor que também é aluno e conferir o layout do aluno em "Minhas turmas" e o AppShell
nas demais telas.

**Acceptance Scenarios**:

1. **Given** um aluno, **When** abre uma tela do aluno, **Then** vê o layout do aluno,
   com navegação reduzida às áreas do aluno, sem elementos administrativos.
2. **Given** um usuário que é professor e aluno, **When** abre uma tela da área do aluno,
   **Then** vê o layout do aluno; nas telas do professor, o AppShell. O layout segue a
   área da tela, nunca uma verificação de papel no navegador.
3. **Given** uma tela de conta comum a todos (perfil, sessões), **When** aberta por um
   usuário sem nenhuma área do professor ou da administração, **Then** usa o layout do
   aluno; com alguma dessas áreas, usa o AppShell (mesmo critério de permissões do menu,
   só experiência de uso).

---

### User Story 6 - As features de avaliação recebem o contrato visual do modo avaliação (Priority: P2)

A documentação do Design System traz o contrato visual do modo avaliação (Exam Mode) e dos
componentes do domínio de avaliação: cabeçalho e rodapé da avaliação, progresso,
navegação entre questões com estados padronizados, cabeçalho, enunciado e área de resposta
da questão (objetiva, discursiva e de código), marcação para revisão, indicador de
salvamento automático, cronômetro, estado da tentativa, alertas da avaliação e o aviso de
perda de foco. Para cada um, o contrato define regiões, hierarquia, estados, textos,
anúncios para tecnologias assistivas e os tokens e componentes fundamentais usados. Os
componentes são construídos junto com a feature de avaliações, seguindo o contrato.

**Why this priority**: as avaliações chegam nas próximas features; elas não devem decidir
de novo como mostrar "questão respondida" ou "resposta salva", mas construir agora, sem
provas reais, seria abstração prematura.

**Independent Test**: revisar a documentação e conferir que cada componente de avaliação
listado tem o contrato completo, sem decisão visual em aberto, e que o contrato só usa
tokens e componentes fundamentais existentes.

**Acceptance Scenarios**:

1. **Given** o contrato do Exam Mode, **When** consultado, **Then** define que a tela
   mostra só o cabeçalho da avaliação, o progresso, a questão (número e estado, enunciado,
   material complementar, área de resposta), o estado de salvamento, a navegação e o
   cronômetro quando houver, sem menu, link ou informação não relacionada, e a ordem de
   prioridade visual dessas regiões.
2. **Given** o contrato da navegação entre questões, **When** consultado, **Then** define
   os estados atual, não respondida, respondida, marcada para revisão, bloqueada e
   invalidada, cada um com cor, forma, ícone ou texto (nunca só cor) e o anúncio acessível
   (ex.: "Questão 4, atual, não respondida").
3. **Given** o contrato do indicador de salvamento, **When** consultado, **Then** define
   os estados salvando, salvo e erro ao salvar, os textos, a discrição visual, o anúncio
   sem roubar o foco e o que o erro orienta o aluno a fazer.
4. **Given** o contrato dos avisos do ambiente controlado (perda de foco, tentativa de
   sair, desconexão, falha de sincronização, tempo acabando, encerramento), **When**
   consultado, **Then** define que cada aviso informa o que aconteceu, se o evento foi
   registrado e o que o aluno deve fazer, com exemplos de texto sem linguagem ameaçadora.
5. **Given** o contrato da questão de programação, **When** consultado, **Then** separa
   visualmente enunciado, área de código, saída, erros e resultado da execução, e restringe
   a fonte monoespaçada à área de código, à saída e aos erros.
6. **Given** o contrato dos componentes que atualizam com frequência (cronômetro,
   salvamento, progresso, editor, estado da avaliação), **When** consultado, **Then** exige
   que a atualização não redesenhe o restante da tela nem mova o foco ou a posição de
   leitura.

---

### User Story 7 - Novas telas não conseguem introduzir valores visuais arbitrários (Priority: P2)

Verificações automáticas impedem que componentes e telas usem cores, tamanhos,
espaçamentos, raios, sombras ou fontes fora dos tokens oficiais, que ícones venham de outra
biblioteca e que componentes recriem um componente que o Design System já oferece.

**Why this priority**: sem guarda automática, o Design System se desfaz na primeira
feature com pressa.

**Independent Test**: introduzir, numa cópia de teste, uma cor hexadecimal num
componente, um espaçamento fora da escala e um ícone de outra biblioteca, e conferir que
as verificações falham apontando o arquivo e a linha; remover e conferir que passam.

**Acceptance Scenarios**:

1. **Given** um componente com uma cor, tamanho de fonte, espaçamento, raio ou sombra
   literal fora dos tokens, **When** as verificações rodam, **Then** falham indicando o
   arquivo e a linha.
2. **Given** um ícone importado de uma biblioteca que não é a oficial, **When** as
   verificações rodam, **Then** falham.
3. **Given** um valor fora da escala tecnicamente necessário, **When** documentado como
   exceção no próprio código, com o motivo, **Then** as verificações o aceitam e ele
   aparece na lista de exceções da documentação.

---

### Edge Cases

- Fonte oficial bloqueada ou lenta: o texto aparece na fonte substituta sem esperar e
  sem saltos de layout perceptíveis.
- Preferência do sistema por tema claro (emenda 2026-10-22): o sistema continua no tema
  único escuro; nenhum componente usa cor fixa fora dos tokens.
- Zoom de 200% e texto ampliado: nenhum conteúdo cortado ou sobreposto; a avaliação
  continua legível sem rolagem horizontal do enunciado.
- Contrato do modo avaliação: prevê enunciado muito longo (com código ou imagem) sem
  perder a hierarquia, navegação com muitas questões (ex.: 80) sem alvos abaixo do mínimo e
  salvamento que muda rapidamente (salvando → salvo em menos de um segundo) sem piscar nem
  anunciar cada troca.
- Usuário com várias funções (professor e aluno): o layout segue a área da tela.
- Rótulos longos (nomes de turma, disciplina): truncados com o texto completo disponível,
  nunca sobrepostos.
- Alta densidade em tabelas administrativas: a densidade compacta não reduz o texto
  abaixo da escala oficial nem os alvos abaixo do mínimo.

## Requirements *(mandatory)*

### Functional Requirements

**Tokens e identidade**

- **FR-001**: O sistema DEVE ter uma definição única e centralizada de design tokens
  para cores, tipografia (famílias, tamanhos, pesos, alturas de linha), espaçamento,
  bordas, raios, sombras, camadas (z-index), pontos de quebra, transições e contorno de
  foco. Todo componente e tela DEVE obter esses valores dos tokens.
- **FR-002**: Os tokens de cor DEVEM ser semânticos (ex.: fundo, superfície, texto
  principal, texto secundário, borda, ação principal, sucesso, atenção, perigo,
  informação, desabilitado), nunca nomeados pela cor. Os valores base (paleta Vice City,
  emenda 2026-10-22) são: ação principal `#FF5CA8`, fundo `#0B0F2B`, superfície `#151A3D`,
  texto principal `#F2EEFF`, texto secundário `#AAA6D4`, borda `#2B305E`, foco e informação
  `#00F0FF`, sucesso `#4ADE9A`, atenção `#FFB86B`, perigo `#FF6B6B`, e tokens de fundo, texto
  e borda para o estado desabilitado.
- **FR-003**: Todo par de texto e fundo DEVE atingir 4,5:1 (3:1 para texto grande), e
  ícones de estado, bordas de campos e o contorno de foco DEVEM atingir 3:1 sobre o fundo
  em que aparecem. Quando um valor base não atinge o mínimo no uso pretendido (ex.:
  sucesso e atenção como texto, borda `#E2E8F0` como limite de campo), o Design System
  DEVE oferecer uma variante acessível oficial para aquele uso, e a borda base fica
  restrita a divisórias decorativas.
- **FR-004**: A distribuição de referência DEVE ser documentada (cerca de 80% neutros,
  15% identidade e 5% semânticas) e as cores semânticas DEVEM ser usadas só para
  significado, nunca para decoração.
- **FR-005**: A tipografia DEVE usar Inter como fonte principal e JetBrains Mono para
  código, saída de execução, console e elementos explicitamente técnicos, com fontes
  substitutas definidas para cada uma, carregadas sem bloquear a exibição do texto.
- **FR-006**: A escala tipográfica oficial DEVE ter as categorias Display (32/700), H1
  (28/700), H2 (22/600), H3 (18/600), Body (16/400), Body Small (14/400), Label (13/500),
  Caption (12/400) e Code (14/400), cada uma com altura de linha própria; textos longos e
  enunciados DEVEM usar altura de linha entre 1,5 e 1,7 e nunca tamanho menor que Body.
- **FR-007**: O espaçamento DEVE seguir a escala de múltiplos de 4 (4, 8, 12, 16, 20, 24,
  32, 40, 48, 64); valores fora da escala só com exceção documentada (FR-032).
- **FR-008**: Os raios oficiais DEVEM ser 6 (pequeno), 8 (médio) e 12 (grande), com
  botões, campos, tabelas e cartões compartilhando a mesma linguagem geométrica.
- **FR-009**: DEVEM existir no máximo três níveis de sombra (discreta, média e
  sobreposição); separação por fundo, espaçamento e borda vem antes da sombra.
- **FR-010**: Os pontos de quebra oficiais DEVEM cobrir ao menos tablet, notebook e
  desktop, e as telas DEVEM funcionar nessas larguras sem reduzir fontes abaixo da escala.
- **FR-011**: O movimento DEVE ser funcional e curto (abrir, fechar, feedback, mudança de
  estado), com durações e curvas oficiais, e DEVE ser removido ou reduzido quando o
  usuário prefere menos movimento.
- **FR-012**: A iconografia DEVE usar exclusivamente a biblioteca oficial de ícones (a
  já adotada pelo projeto), com espessura e tamanhos oficiais; ícones não substituem
  rótulos importantes, e ícones sem texto de significado não evidente DEVEM ter nome
  acessível e dica.
- **FR-013** (emenda 2026-10-22): Os tokens DEVEM definir um tema único, escuro, com a paleta
  Vice City, que não muda com a preferência do sistema, com os requisitos de contraste da FR-003;
  trocar a paleta muda só valores de tokens, sem mudar componentes.

**Componentes fundamentais**

- **FR-014**: DEVE existir um componente de botão com as variantes principal, secundária,
  contorno, discreta e perigo, e os estados padrão, passar o mouse, foco, pressionado,
  carregando (sem novo acionamento, anunciado a tecnologias assistivas) e desabilitado.
- **FR-015**: DEVEM existir componentes de formulário — campo de texto, área de texto,
  seleção, caixa de seleção, opção exclusiva, interruptor, rótulo, mensagem do campo e o
  agrupador de campo — com os estados padrão, passar o mouse, foco, preenchido,
  desabilitado, erro e, quando aplicável, sucesso; o erro DEVE combinar borda, ícone e
  texto ligado ao campo.
- **FR-016**: DEVEM existir componentes de feedback — alerta (informação, sucesso, atenção,
  erro), notificação temporária, progresso, indicador de carregamento, estado vazio,
  esqueleto de carregamento e dica — com cor semântica, ícone e texto.
- **FR-017**: DEVEM existir contêineres — cartão, diálogo, painel lateral, popover e menu
  suspenso — e a documentação DEVE dizer quando um cartão é adequado (agrupamento,
  separação de contexto, interação ou destaque) e quando não é.
- **FR-018**: DEVEM existir componentes de dados — tabela (densidade confortável e
  compacta), paginação, selo, indicador de situação e abas.
- **FR-019**: DEVEM existir componentes de navegação — menu lateral, barra superior,
  trilha de navegação e cabeçalho de página.
- **FR-020**: Ações destrutivas DEVEM usar a variante de perigo com texto explícito e,
  quando o risco é relevante, pedir confirmação; nenhuma ação destrutiva pode ter a mesma
  aparência de uma ação comum.
- **FR-021**: Todo elemento interativo DEVE ter o contorno de foco oficial visível, ser
  operável pelo teclado, ter nome acessível e alvo de no mínimo 24×24 px (WCAG 2.2, 2.5.8);
  nenhum estado pode depender só da cor.

**Layouts**

- **FR-022**: DEVE existir o AppShell do professor e da administração, com menu lateral
  recolhível (lembrando a escolha), barra superior, cabeçalho de página (título, trilha e
  ações) e área principal com largura e espaçamento consistentes. Todas as telas internas
  existentes do professor, do gestor e do administrador DEVEM usá-lo.
- **FR-023**: O menu lateral DEVE mostrar só as áreas que existem e que o usuário tem
  permissão para abrir, com os estados padrão, passar o mouse, ativo (identificado também
  para tecnologias assistivas), foco e recolhido. Mostrar ou esconder itens é só
  experiência de uso: a autorização continua no servidor.
- **FR-024**: DEVE existir o layout do aluno, sem elementos administrativos, priorizando
  atividade atual, progresso, informações essenciais e próxima ação; as telas existentes
  da área do aluno ("Minhas turmas") DEVEM usá-lo. As telas de conta comuns a todos
  (perfil, sessões) usam o layout do aluno quando o usuário não tem nenhuma área do
  professor ou da administração, e o AppShell caso contrário, pelo mesmo critério de
  permissões do menu. O layout segue a área da tela e as permissões já usadas no menu,
  nunca uma verificação de papel, e é só experiência de uso.
- **FR-025**: A documentação DEVE especificar o layout de avaliação (Exam Mode), distinto
  do AppShell e construído junto com a feature de avaliações: sem menu administrativo,
  links, widgets ou navegação não relacionada à avaliação, com maior espaçamento vertical e
  a hierarquia número e estado da questão, enunciado, material complementar, área de
  resposta, estado de salvamento, navegação e informações secundárias.

**Componentes do domínio de avaliação**

- **FR-026**: A documentação DEVE trazer o contrato visual dos componentes de avaliação —
  cabeçalho e rodapé da avaliação, progresso, cronômetro, estado da tentativa, cabeçalho,
  enunciado, estado e marcação para revisão da questão, navegação entre questões, área de
  resposta (objetiva, discursiva e de código), editor de código, indicador de salvamento,
  alerta da avaliação e aviso de perda de foco — com regiões, hierarquia, estados, textos,
  anúncios acessíveis e os tokens e componentes fundamentais usados, sem nenhuma decisão
  visual em aberto. Esses componentes NÃO são construídos nesta feature: a feature de
  avaliações os constrói seguindo o contrato, e a de exercícios de programação escolhe o
  editor de código.
- **FR-027**: O contrato DEVE padronizar os estados das questões — atual, não respondida,
  respondida, marcada para revisão, bloqueada e invalidada — com representação que combina
  cor com forma, ícone ou texto, e o anúncio a tecnologias assistivas com o número e o
  estado da questão.
- **FR-028**: O contrato do indicador de salvamento automático DEVE definir os estados
  salvando, salvo e erro ao salvar, com apresentação discreta, anúncio sem tirar o foco e,
  no erro, o que o aluno pode fazer.
- **FR-029**: O contrato do aviso de perda de foco e dos demais alertas do ambiente
  controlado (tentar sair, desconexão, falha de sincronização, tempo acabando,
  encerramento) DEVE definir um padrão visual próprio em que cada aviso informa o que
  aconteceu, se o evento foi registrado e o que o aluno deve fazer, sem linguagem
  ameaçadora, com exemplos de texto. O componente só exibirá; registrar o evento continua
  sendo responsabilidade do servidor.
- **FR-030**: O contrato DEVE exigir que componentes que atualizam com frequência
  (cronômetro, salvamento, progresso, editor, estado da avaliação) não redesenhem o
  restante da tela nem movam o foco ou a posição de leitura a cada atualização.

**Catálogo, documentação e guardas**

- **FR-031**: DEVE existir um catálogo visual com todos os componentes fundamentais e os
  layouts construídos (AppShell e aluno), com variantes, estados, tamanhos, erro,
  carregando, desabilitado e a largura de tablet quando relevante, operável pelo teclado,
  disponível no desenvolvimento e nos testes e ausente em produção.
- **FR-032**: DEVE existir documentação do Design System com princípios, tokens, cores,
  tipografia, espaçamento, raios, sombras, iconografia, movimento, cada componente
  (variantes, quando usar, quando não usar, exemplo), padrões de acessibilidade, o contrato
  visual do modo avaliação (FR-025 – FR-030), a regra contra UI genérica e a lista de exceções de valores fora da escala com o motivo de cada
  uma.
- **FR-033**: Verificações automáticas DEVEM falhar, apontando arquivo e linha, quando um
  componente ou tela usar cor, tamanho de fonte, espaçamento, raio, sombra ou família de
  fonte literal fora dos tokens (salvo exceção documentada), importar ícones de outra
  biblioteca ou recriar um componente fundamental já existente.
- **FR-034**: A arquitetura DEVE separar tokens, componentes fundamentais, componentes de
  domínio, layouts e páginas, com dependência só de cima para baixo (páginas usam layouts
  e componentes; componentes não dependem de páginas), preservando a organização atual do
  projeto e verificada automaticamente.
- **FR-035**: Nenhuma dependência de UI paralela à já adotada DEVE ser introduzida;
  componentes funcionais existentes são padronizados, não substituídos por preferência
  estética.

**Preservação**

- **FR-036**: Esta feature NÃO DEVE alterar regras de negócio, autenticação, permissões,
  API, persistência nem textos de mensagens do catálogo; todos os testes funcionais, de
  acessibilidade e de teclado existentes DEVEM continuar passando.
- **FR-037**: As telas existentes DEVEM receber, nesta feature, os tokens, as fontes e os
  componentes fundamentais; as telas internas passam a usar o AppShell e as da área do
  aluno o layout do aluno (FR-022, FR-024). O conteúdo das telas não é redesenhado e o
  comportamento não muda; novas composições de conteúdo ficam para as features
  seguintes.

### Security, Permissions & Audit *(mandatory if feature has protected operations)*

- **Permissions**: nenhuma nova. Nenhuma operação protegida é criada ou alterada.
- **Resource context**: inalterado. Menus, botões e layouts escondidos ou exibidos são só
  experiência de uso; toda autorização continua no servidor (FR-023, constituição).
- **Audit events**: nenhum novo.
- **Untrusted input**: nenhum novo dado é aceito. Conteúdo exibido pelos componentes
  (enunciados, código, nomes) continua tratado como texto e escapado; o catálogo usa só
  dados de exemplo fixos.
- **States & transitions**: estados visuais de componentes e, no contrato, das questões
  (FR-027, FR-028) são só apresentação; os estados reais de tentativas e questões pertencem às
  features de avaliação.
- **Idempotency**: o estado carregando do botão impede um segundo acionamento
  (FR-014); a garantia definitiva continua no servidor.
- **Evidence vs. decisions**: N/A (nenhum fato, regra ou decisão é registrado). O contrato
  do aviso de perda de foco prevê que ele só exiba o que o servidor registrou (FR-029).
- **Automation risk level**: N/A.
- **Domain configurability**: nenhuma disciplina, linguagem ou tecnologia fixa; o
  contrato do editor de código não presume linguagem.
- **Sensitive data & adaptations**: nenhum dado pessoal novo; o catálogo não usa dados
  reais. Preferências de movimento e de tema vêm do sistema do usuário.
- **Curricular traceability**: N/A.

### Key Entities *(include if feature involves data)*

- **Design token**: valor visual oficial com nome semântico (categoria, nome, valor por
  tema, uso permitido).
- **Componente**: elemento reutilizável com variantes, estados, tamanhos, requisitos de
  acessibilidade e orientação de uso.
- **Layout**: estrutura de tela (AppShell e aluno, construídos; avaliação, especificado)
  com as regiões que oferece e as áreas de tela que o usam.
- **Contrato visual de componente de avaliação**: regiões, hierarquia, estados, textos,
  anúncios acessíveis e tokens de um componente a construir com a feature de avaliações.
- **Estado visual de questão** (no contrato): atual, não respondida, respondida, marcada para revisão,
  bloqueada e invalidada, com a combinação de cor, forma, ícone e texto e o anúncio
  acessível.
- **Exceção de valor**: valor fora da escala aceito com motivo documentado.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% das cores, tamanhos de fonte, espaçamentos, raios, sombras e famílias
  de fonte usados nos componentes e telas vêm dos tokens, salvo exceções documentadas
  (verificado automaticamente).
- **SC-002**: 100% dos pares de texto e fundo atingem 4,5:1 (3:1 para texto grande,
  ícones de estado, bordas de campos e foco) nos temas disponíveis (verificado
  automaticamente).
- **SC-003**: 100% dos componentes do catálogo e das telas existentes passam na
  verificação automática de acessibilidade, sem violações.
- **SC-004**: 100% dos elementos interativos do catálogo são alcançáveis e operáveis só
  pelo teclado, com foco visível.
- **SC-005**: 100% dos componentes fundamentais listados nesta spec (FR-014 a FR-019) e os
  layouts construídos estão no catálogo com as variantes e estados previstos.
- **SC-006**: nenhuma tela existente muda de comportamento: 100% dos testes funcionais,
  de acessibilidade, de teclado e E2E existentes continuam passando.
- **SC-007**: 100% dos componentes de avaliação listados em FR-026 têm contrato visual
  completo (regiões, hierarquia, estados, textos, anúncio acessível e tokens), sem decisão
  visual em aberto e usando só tokens e componentes fundamentais existentes, conferido na
  revisão.
- **SC-008**: o texto de todas as telas aparece em até 100 ms após o conteúdo chegar,
  mesmo antes de a fonte oficial carregar (sem texto invisível esperando a fonte).
- **SC-009**: uma nova tela de exemplo é montada só com componentes e tokens do Design
  System, sem nenhuma decisão visual nova (cor, tamanho, espaçamento, raio, botão, erro,
  estado de questão), conferido na revisão.
- **SC-010**: com preferência por menos movimento, nenhuma animação passa de 0,01 s.

### Acceptance Criteria Traceability

| # | Critério de aceite | Verificado por |
|---|--------------------|----------------|
| 1 | Definição centralizada de design tokens | US1-1; FR-001 |
| 2 | Cores principais não duplicadas | US7-1; FR-002, FR-033; SC-001 |
| 3 | Escala tipográfica oficial | US1-1; FR-006 |
| 4 | Inter como fonte principal | US1-5; FR-005; SC-008 |
| 5 | JetBrains Mono para código | US1-4, US6-5; FR-005 |
| 6 | Sistema oficial de espaçamento | US7-1; FR-007 |
| 7 | Padrões de raio, borda e sombra | US1-1; FR-008, FR-009 |
| 8 | Lucide padronizado | US2-5, US7-2; FR-012 |
| 9 | Botão com variantes e estados | US2-1; FR-014 |
| 10 | Formulários com estados consistentes | US2-3; FR-015 |
| 11 | Feedbacks com padrão visual | US2-4; FR-016 |
| 12 | Layout base administrativo | US3-1–US3-6; FR-022, FR-023 |
| 13 | Layout base do aluno | US5-1–US5-3; FR-024 |
| 14 | Layout de Exam Mode (especificado) | US6-1; FR-025; SC-007 |
| 15 | Navegação entre questões (especificada) | US6-2; FR-026, FR-027; SC-007 |
| 16 | Estados das questões padronizados | US6-2; FR-027; SC-007 |
| 17 | Padrão de salvamento automático | US6-3; FR-028; SC-007 |
| 18 | Padrão de alertas de avaliação | US6-4; FR-029; SC-007 |
| 19 | Foco visível | US1-3; FR-021; SC-004 |
| 20 | Acessibilidade dos componentes fundamentais | US2-1–US2-5; FR-021; SC-003 |
| 21 | Sem cores fixas quando existe token | US7-1; FR-033; SC-001 |
| 22 | Arquitetura pronta para temas | US1-2; FR-013; SC-002 |
| 23 | Documentação mínima | US4-3; FR-032 |
| 24 | Regras de negócio inalteradas | FR-036; SC-006 |
| 25 | Autorização não depende da interface | US3-4; FR-023 |
| 26 | Build, lint e testes funcionando | FR-036; SC-006 |

## Assumptions

- A stack de interface já adotada (utilitários de estilo, componentes base e a
  biblioteca de ícones Lucide) é mantida; o Design System padroniza e estende o que existe
  em vez de introduzir uma segunda biblioteca (FR-035).
- Os valores da paleta são os valores base da identidade; onde não atingem o contraste
  exigido pela constituição (WCAG 2.2 AA) num uso, o Design System define variantes
  acessíveis para esse uso, em vez de relaxar o contraste (FR-003).
- Desde a emenda de 2026-10-22 há um só tema, escuro (Vice City), com teste de contraste; o
  tema claro e um seletor manual de tema não fazem parte do sistema.
- O catálogo visual é parte do próprio aplicativo web, disponível no desenvolvimento e nos
  testes e fora da produção, para não trazer uma ferramenta pesada à parte; se o plano
  mostrar que uma ferramenta dedicada é compatível e leve, ela pode substituí-lo.
- Os itens do menu citados para o futuro (visão geral, alunos, exercícios, avaliações,
  banco de questões, resultados, configurações) só aparecem quando as features existirem.
- A fonte Inter substitui a fonte atual; as fontes são servidas pelo próprio sistema, sem
  depender de serviços de terceiros em tempo de execução.
- O tamanho mínimo de alvo segue WCAG 2.2 (24×24 px); o projeto mantém alvos de 44 px
  onde já os usa.
- A densidade padrão é confortável; tabelas administrativas podem usar a compacta; o Exam
  Mode usa espaçamento vertical maior.
- Mensagens de erro continuam vindo do catálogo de mensagens existente; esta feature não
  muda textos de erro.
- Os componentes de avaliação e o layout Exam Mode são construídos pela feature de
  avaliações, que deve seguir o contrato visual desta feature; nenhuma dependência de
  editor de código é adicionada agora.
