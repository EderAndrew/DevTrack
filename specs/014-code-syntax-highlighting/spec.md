# Feature Specification: Realce de Sintaxe do Código

**Feature Branch**: `014-code-syntax-highlighting`
**Created**: 2026-10-03
**Status**: Draft
**Input**: User description: "Realce de sintaxe do código (colorir o código). Hoje o CodeEditor do
design system (apps/web/components/ui/assessment/code-editor.tsx) é um Textarea com números de linha,
sem biblioteca, e todo código aparece sem cor: o editor do aluno ao responder uma questão de Código
(Trabalho e Exercício), a solução de referência e o código inicial no gabarito do aluno depois da
conclusão (013), a resposta de código e a solução esperada na tela de correção do professor, e o
código no banco de exercícios e de trabalhos (criação, edição, "Ver como aluno"). Esta feature
escolhe a biblioteca de edição e realce (a spec 005, Clarifications, deixou a escolha para depois) e
colore o código pela linguagem de programação do item (catálogo de linguagens da 010; sem linguagem
conhecida, texto sem realce). As cores de sintaxe (palavra-chave, string, número, comentário, tipo,
função, operador etc.) viram tokens semânticos em tokens.css, com valores para tema claro e escuro e
contraste WCAG AA (contrast.test.ts), sem tema próprio fora dos tokens (exam-mode.md). Mantém as
exigências do CodeEditor: text-code, números de linha em --text-secondary, foco com o contorno
oficial, Tab indenta e Esc seguido de Tab sai do editor (anunciado no rótulo), leitor de tela lê o
código como texto, autosave e buffer offline da 012 inalterados, nada de dangerouslySetInnerHTML (o
realce não pode executar HTML do aluno: XSS da 012/FR-035). Estados nunca só por cor. Fora do escopo:
execução de código, saída e erros (feature de exercícios de programação), autocompletar, lint,
formatação automática, modo controlado de provas. A dependência nova precisa de justificativa em
DEPENDENCIES.md (licença, vulnerabilidades, tamanho no bundle), e o tempo de carregamento da tela de
responder não pode piorar de forma perceptível."

## Contexto: o que muda

A spec 005 definiu o contrato visual do editor de código e deixou a escolha da biblioteca para
depois (Clarifications: "a escolha do editor de código fica para a feature de exercícios de
programação"). A 012 entregou um editor provisório, sem biblioteca: um campo de texto com números de
linha. Esta feature **antecipa só a parte de edição e realce** daquela decisão, sem execução de
código.

| Onde o código aparece | Hoje | Depois desta feature |
|-----------------------|------|----------------------|
| Aluno responde uma questão de Código (Trabalho 012, Exercício 013) | Texto sem cor | Editor com realce pela linguagem da questão |
| Gabarito do aluno depois da conclusão (013): solução de referência, código inicial, a própria resposta | Texto sem cor | Leitura com realce |
| Professor: tentativa do aluno (resposta de código e solução esperada), detalhe da atividade | Texto sem cor | Leitura com realce |
| Banco de exercícios (010) e de trabalhos (011): código inicial e solução esperada ao criar e editar | Campo de texto comum | Editor com realce |
| Banco: ver o exercício ou trabalho, rascunhos da IA, "Ver como aluno" | Texto sem cor | Leitura com realce |
| Vitrine do design system | Editor sem cor | Editor e leitura com realce, com os tokens de sintaxe |

O que **não muda**: o texto do código (o que é salvo, enviado e comparado é exatamente o que a pessoa
digitou), o salvamento automático e o buffer offline da 012, as regras de gabarito da 011–013 e os
casos de teste (entrada e saída continuam texto simples).

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Aluno responde uma questão de Código com o código colorido (Priority: P1)

Ao responder uma questão de Código de um Trabalho ou de um Exercício, o aluno digita no editor e vê
o código colorido pela linguagem da questão (palavras-chave, textos entre aspas, números,
comentários com cores próprias), como num editor de programação. Tudo que já funcionava continua:
números de linha, Tab que indenta, Esc seguido de Tab para sair, salvamento automático, buffer
offline e entrega ou conclusão.

**Why this priority**: é onde o aluno passa mais tempo com o código; o realce ajuda a ler e achar
erros de digitação (aspas abertas, comentário sem fechar) antes de entregar.

**Independent Test**: aplicar um Exercício com uma questão de Código em Java, responder como aluno e
conferir as cores, o Tab, o Esc + Tab, o salvamento depois de recarregar a página e o texto salvo
idêntico ao digitado.

**Acceptance Scenarios**:

1. **Given** uma questão de Código em Java com código inicial, **When** o aluno abre a questão,
   **Then** vê o código inicial colorido pela linguagem, com números de linha, e o rótulo do editor
   informa a linguagem e como sair dele com o teclado.
2. **Given** o editor com o foco, **When** o aluno digita `String nome = "Ana"; // aluno`, **Then**
   a palavra-chave, o texto entre aspas e o comentário aparecem cada um com a sua cor enquanto ele
   digita, sem atraso perceptível.
3. **Given** o editor com o foco, **When** o aluno pressiona Tab, **Then** o código é indentado e o
   foco fica no editor; **When** pressiona Esc e depois Tab, **Then** o foco vai para o próximo
   controle da página.
4. **Given** uma resposta digitada, **When** o salvamento automático roda, a página é recarregada ou
   a conexão cai e volta, **Then** a resposta volta exatamente como foi digitada (mesmos espaços,
   quebras de linha e caracteres), como na 012.
5. **Given** uma questão de Código de uma linguagem do catálogo sem regra de realce, **When** o aluno
   responde, **Then** o editor funciona igual, só sem cores.
6. **Given** o aluno colando um código que contém `<script>alert(1)</script>` ou HTML, **When** o
   código aparece no editor, **Then** aparece como texto, nada é executado nem vira elemento da
   página.

---

### User Story 2 - Aluno e professor leem código colorido (Priority: P2)

Onde o código só é lido — o gabarito do aluno depois da conclusão de um Exercício (solução de
referência, código inicial e a própria resposta), a tentativa do aluno na tela de correção do
professor, o detalhe da atividade, o banco de exercícios e de trabalhos, os rascunhos gerados pela IA
e "Ver como aluno" —, o código aparece colorido pela linguagem do item, com números de linha, sem
poder ser editado.

**Why this priority**: o professor compara a resposta do aluno com a solução esperada e o aluno
compara a sua com o gabarito; o realce torna a comparação mais rápida, mas o ciclo funciona sem ele.

**Independent Test**: concluir um Exercício de Código como aluno, abrir o resultado e a tela de
correção do professor e conferir as cores nos dois lados, em modo só leitura.

**Acceptance Scenarios**:

1. **Given** um Exercício de Código concluído, **When** o aluno vê o resultado, **Then** a sua
   resposta e a solução de referência aparecem coloridas, com números de linha, em modo só leitura,
   e Tab move o foco (não indenta).
2. **Given** a tentativa de um aluno com resposta de Código, **When** o professor a abre para marcar
   certo ou errado, **Then** a resposta do aluno e a solução esperada aparecem coloridas lado a lado
   (ou uma abaixo da outra em telas estreitas).
3. **Given** um exercício ou um trabalho com questão de Código no banco, **When** o professor o vê,
   vê um rascunho gerado pela IA ou usa "Ver como aluno", **Then** o código inicial (e, para o
   professor, a solução esperada) aparece colorido; "Ver como aluno" continua sem a solução.
4. **Given** um código só para leitura, **When** a pessoa seleciona e copia um trecho, **Then** o
   que vai para a área de transferência é o texto do código, sem cores, números de linha ou
   marcação.

---

### User Story 3 - Professor escreve código colorido no banco (Priority: P2)

Ao criar ou editar um exercício ou uma questão de Código de um trabalho, o professor escreve o código
inicial e a solução esperada num editor com realce pela linguagem escolhida. Trocar a linguagem
muda o realce na hora, sem perder o texto.

**Why this priority**: o professor escreve o gabarito que o aluno vai ler; errar uma aspa ou um
comentário no gabarito é visível com cores. O banco funciona sem isso, por isso não é P1.

**Independent Test**: criar um exercício de Código em Python no banco, digitar o código inicial e a
solução, trocar a linguagem para JavaScript e conferir que o texto continua e o realce muda; salvar
e reabrir.

**Acceptance Scenarios**:

1. **Given** o formulário de exercício com o tipo Código, **When** o professor escolhe a linguagem
   e digita no código inicial e na solução esperada, **Then** os dois campos mostram o código
   colorido pela linguagem escolhida, com números de linha e as mesmas regras de teclado do editor
   do aluno.
2. **Given** código já digitado, **When** o professor troca a linguagem, **Then** o realce muda para
   a nova linguagem e o texto não muda.
3. **Given** um erro de validação no campo (por exemplo, solução esperada vazia), **When** o
   professor salva, **Then** a mensagem aparece ligada ao campo e anunciada como nos demais campos do
   formulário (005), e o foco vai para o editor.
4. **Given** um código salvo pelo editor, **When** o exercício é reaberto, aplicado a uma turma e
   respondido, **Then** o texto é exatamente o digitado (a cópia congelada da 012 não muda).

---

### User Story 4 - Cores acessíveis em qualquer tema (Priority: P3)

As cores do código vêm do design system, com valores para o tema claro e o escuro, todas legíveis
sobre o fundo do editor; nada depende só da cor para ser entendido, e com o alto contraste do
sistema operacional o código aparece nas cores do sistema.

**Why this priority**: é requisito de qualidade de toda a interface (005); vem por último porque as
histórias anteriores já precisam cumpri-lo, e esta história verifica o conjunto.

**Independent Test**: abrir a vitrine do design system e uma questão de Código nos dois temas,
medir o contraste de cada cor de sintaxe e conferir com o leitor de tela e com o alto contraste do
sistema.

**Acceptance Scenarios**:

1. **Given** o tema claro ou o escuro, **When** um código com todas as categorias de sintaxe
   aparece, **Then** cada categoria tem contraste de pelo menos 4,5:1 com o fundo do editor.
2. **Given** um leitor de tela, **When** a pessoa chega ao editor ou a um código só para leitura,
   **Then** ouve o rótulo (com a linguagem), lê o código como texto linha a linha e não ouve
   nomes de cores nem marcação.
3. **Given** o modo de alto contraste do sistema, **When** o código aparece, **Then** usa as cores
   do sistema e continua legível, com o contorno de foco visível.
4. **Given** uma tela de celular (360 px), **When** o código tem linhas longas, **Then** o editor
   rola na horizontal por dentro e a página não ganha rolagem horizontal.

---

### Edge Cases

- **Linguagem do catálogo que é um framework ou um conjunto** (Angular, Nest, Node, "HTML & CSS"):
  usa a regra de realce associada a ela no catálogo (por exemplo, a de TypeScript, JavaScript ou
  HTML com CSS); sem regra associada, o código aparece sem cor.
- **Item sem linguagem**: não ocorre hoje (questão de Código sempre tem linguagem na 010/011); se
  ocorrer, sem cor.
- **Código muito longo** (até o limite de 10 000 caracteres dos campos da 010/011): o realce não
  trava a digitação nem a rolagem.
- **Código vazio**: o editor mostra uma linha numerada e o campo vazio, como hoje.
- **Código com tabulações, espaços no fim da linha e linhas em branco**: o texto salvo é o recebido;
  o realce não normaliza nada. **Quebras de linha do Windows** (`\r\n`) viram `\n` ao editar, como o
  campo de texto atual já faz (regra do HTML para campos de texto); nas telas só de leitura o texto
  aparece como foi guardado.
- **Código com caracteres acentuados, emoji ou outros alfabetos**: aparecem e são salvos sem
  alteração.
- **Código com HTML, `<script>` ou sequências que parecem marcação** (inclusive em "HTML & CSS"):
  aparecem como texto, em todas as telas.
- **Resposta digitada antes desta feature**: aparece colorida, sem migração de dados.
- **Falha ao carregar a parte de realce** (rede lenta ou erro do navegador): o aluno continua podendo
  ler, digitar, salvar e entregar no editor sem cores; nenhuma resposta se perde.
- **Editor desabilitado** (atividade encerrada, turma inativa): o código aparece colorido, sem
  edição, com o estado desabilitado indicado por texto ou atributo, não só pela cor.
- **Modo de prova controlado**: fora do escopo; o editor continua no modo NORMAL da 012.

## Requirements *(mandatory)*

### Functional Requirements

**Onde e como o código é colorido**

- **FR-001**: O código DEVE aparecer colorido em todos os pontos da tabela "Contexto": o editor do
  aluno (Trabalho e Exercício), o gabarito do aluno depois da conclusão (013), a tentativa e o
  detalhe da atividade para o professor, os formulários e as telas de leitura do banco de exercícios
  e de trabalhos (incluindo rascunhos da IA e "Ver como aluno") e a vitrine do design system.
- **FR-002**: A regra de realce DEVE vir da linguagem de programação do item no catálogo da 010:
  cada linguagem do catálogo DEVE ter, como dado do catálogo, a regra de realce que usa (ou nenhuma).
  Linguagem sem regra, ou item sem linguagem, aparece sem cor e com todo o resto igual.
- **FR-003**: Os frameworks e conjuntos do catálogo (Angular, Nest, Node, "HTML & CSS") DEVEM usar a
  regra da linguagem em que o código é escrito (TypeScript, TypeScript, JavaScript e HTML com CSS,
  respectivamente), e C DEVE usar a regra de C++, definidas como dado do catálogo.
- **FR-004**: O realce DEVE distinguir pelo menos: palavra-chave, texto entre aspas, número,
  comentário, tipo, função, operador e pontuação, e o texto comum. Cada categoria DEVE ter uma cor
  semântica própria do design system.
- **FR-005**: O realce DEVE acompanhar a digitação, sem atraso perceptível, até o limite de tamanho
  dos campos de código (10 000 caracteres).
- **FR-006**: Trocar a linguagem de um formulário do banco DEVE mudar o realce na hora, sem mudar o
  texto.

**O texto do código**

- **FR-007**: O texto salvo, enviado, copiado para a área de transferência e comparado DEVE ser
  exatamente o digitado ou recebido: o realce não altera espaços, tabulações nem caracteres, não
  acrescenta marcação e não completa nem indenta nada sozinho (Enter quebra a linha sem indentar;
  aspas e parênteses não se fecham sozinhos). A única normalização é a que o campo de texto atual
  já faz: quebra de linha do Windows vira `\n` ao editar.
- **FR-008**: O salvamento automático, as revisões, o buffer offline, a entrega (012) e a conclusão
  (013) DEVEM funcionar exatamente como hoje com o novo editor, inclusive a regra de "em branco" da
  012 (código igual ao inicial conta como em branco).
- **FR-009**: Todo código DEVE ser mostrado como texto: nenhum trecho de código (do aluno, do
  professor ou gerado pela IA) pode virar elemento da página ou ser executado, em nenhuma linguagem
  (012/FR-035). Nenhuma tela desta feature pode inserir HTML a partir do código.

**O editor**

- **FR-010**: O editor DEVE manter o contrato da 005/012: fonte de código do design system, números
  de linha na cor secundária, contorno de foco oficial, Tab indenta (dois espaços, como hoje), Esc
  seguido de Tab sai do editor e Shift+Tab volta, e o rótulo anuncia a linguagem e como sair.
- **FR-011**: No modo só leitura, Tab DEVE mover o foco (não indentar), o texto DEVE ser selecionável
  e copiável e não deve haver o aviso de Tab.
- **FR-012**: O editor DEVE funcionar com mouse, teclado, toque e o teclado virtual do celular,
  incluindo selecionar, recortar, copiar, colar, desfazer e refazer.
- **FR-013**: Erros de validação dos campos de código nos formulários DEVEM ser ligados ao editor e
  anunciados como nos demais campos (005), com o foco indo para o editor no envio.
- **FR-014**: Se a parte de realce não carregar, o editor DEVE continuar permitindo ler, digitar,
  salvar e entregar o código sem cores.
- **FR-015**: Linhas longas DEVEM rolar dentro do editor; a página não pode ganhar rolagem
  horizontal em 360 px (012/FR-034).

**Design system e acessibilidade**

- **FR-016**: As cores de sintaxe DEVEM ser tokens semânticos do design system, com valor para o
  tema claro e para o escuro, documentados com os demais tokens. Nenhuma cor do editor pode vir de
  fora dos tokens (nenhum tema pronto da biblioteca), e a verificação automática de uso de tokens
  DEVE continuar sem exceções novas.
- **FR-017**: Cada cor de sintaxe DEVE ter contraste de pelo menos 4,5:1 com o fundo do editor nos
  dois temas, verificado pelo teste automático de contraste do design system.
- **FR-018**: O código DEVE ser lido pelo leitor de tela como texto, sem nomes de cores nem marcação,
  e o significado do código NUNCA pode depender só da cor (o código sem cores é o mesmo código).
- **FR-019**: No modo de alto contraste do sistema operacional, o código DEVE usar as cores do
  sistema e continuar legível, com o foco visível.
- **FR-020**: O editor e a leitura de código DEVEM ser componentes do design system (com entrada no
  catálogo, vitrine e documentação), usados pelas telas em vez de recriados (regra `controles` da
  005), e passar na verificação de acessibilidade automática e de teclado da vitrine.

**Dependência e desempenho**

- **FR-021**: A biblioteca nova de edição e realce DEVE ser justificada em `DEPENDENCIES.md` (licença
  compatível, auditoria de vulnerabilidades sem pendência alta ou crítica, tamanho acrescentado ao
  carregamento), como as demais dependências diretas.
- **FR-022**: A parte de realce DEVE ser carregada só nas telas que mostram código, sem aumentar o
  carregamento das demais telas.
- **FR-023**: A tela de responder uma atividade NÃO PODE ficar perceptivelmente mais lenta para
  abrir e começar a digitar (limite em SC-004).

**Fora do escopo**

- **FR-024**: Esta feature NÃO inclui execução de código, saída, erros de execução nem resultado de
  casos de teste (feature de exercícios de programação, Code Runner), autocompletar, sugestões,
  verificação de erros (lint), formatação automática, temas de cor escolhidos pelo usuário nem o
  modo de prova controlado. Os casos de teste continuam como texto simples.

### Security, Permissions & Audit *(mandatory if feature has protected operations)*

- **Permissions**: nenhuma permissão nova e nenhuma rota nova; cada tela continua com as permissões
  e o contexto que já tem (012, 013, 010, 011).
- **Resource context**: inalterado; esta feature só muda como o código já autorizado é mostrado.
- **Audit events**: nenhum evento novo; as operações de salvar, entregar, concluir e editar o banco
  continuam com os eventos atuais.
- **Untrusted input**: o código do aluno, do professor e da IA é dado não confiável: mostrado sempre
  como texto (FR-009), sem execução e sem interpretar HTML; o texto do código não muda (FR-007).
- **States & transitions**: None.
- **Idempotency**: inalterada (salvamento por revisão, entrega e conclusão idempotentes da 012/013).
- **Evidence vs. decisions**: inalterado; o realce é só apresentação, nada é registrado.
- **Automation risk level**: N/A — nenhuma operação de IA ou automação nova.
- **Domain configurability**: nenhuma linguagem fica no código como condição: a regra de realce de
  cada linguagem é dado do catálogo (010), e uma linguagem nova do catálogo pode ganhar ou não uma
  regra sem mudar telas.
- **Sensitive data & adaptations**: None — nada novo é guardado ou enviado; o código continua visto
  só por quem já via.
- **Curricular traceability**: N/A.

### Key Entities *(include if feature involves data)*

- **Linguagem de programação (010)**: ganha a regra de realce associada (ou nenhuma), como dado do
  catálogo; nome, chave e apelidos não mudam.
- **Tokens de sintaxe (design system)**: uma cor semântica por categoria de sintaxe (palavra-chave,
  texto entre aspas, número, comentário, tipo, função, operador, pontuação, texto comum), com valor
  claro e escuro.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Em 100% dos pontos da tabela "Contexto", o código de uma linguagem com regra de realce
  aparece colorido, e o de uma linguagem sem regra aparece sem cor e funcionando.
- **SC-002**: Em 100% dos testes de ida e volta (digitar ou colar → salvar → recarregar, offline →
  reconectar, entregar ou concluir, aplicar a cópia congelada), o texto do código fica idêntico,
  caractere por caractere.
- **SC-003**: Em 100% das telas com código, um código com `<script>`, HTML ou marcação aparece como
  texto e nada é executado.
- **SC-004**: A tela de responder uma atividade com questão de Código fica pronta para digitar em no
  máximo 300 ms a mais do que hoje, e as cores aparecem enquanto se digita sem atraso perceptível
  (até 50 ms por tecla) num código de 10 000 caracteres.
- **SC-005**: 100% das cores de sintaxe têm contraste de pelo menos 4,5:1 com o fundo do editor nos
  temas claro e escuro, e a vitrine passa na verificação automática de acessibilidade sem violações.
- **SC-006**: Uma pessoa responde, entra e sai do editor e lê o gabarito só com o teclado, e com
  leitor de tela ouve o código como texto, em celular e desktop.
- **SC-007**: As telas sem código não ficam mais pesadas para carregar do que hoje.

## Assumptions

- A escolha da biblioteca (editor com realce para escrever e realce para ler, ou uma só para os
  dois) é do plano, com as restrições desta spec: licença compatível, sem cores próprias fora dos
  tokens, acessível por teclado e leitor de tela, carregada só onde há código.
- As regras de realce das linguagens do catálogo atual são as da biblioteca escolhida; a ligação
  linguagem → regra fica no catálogo (13 entradas: 9 linguagens com regra própria, C usando a de
  C++ e os 4 frameworks/conjuntos apontando para a da sua linguagem). Uma linguagem nova sem regra
  disponível fica sem cor.
- Não há escolha de tema de cores pelo usuário: as cores seguem o tema claro ou escuro da plataforma
  e o alto contraste do sistema.
- Os casos de teste (entrada e saída esperada) não são código de uma linguagem e continuam em campos
  de texto simples.
- As respostas e os códigos já salvos não precisam de migração: são texto e passam a aparecer
  coloridos.
- O modo de prova controlado e a execução de código são de features futuras, que vão reaproveitar
  este editor.
