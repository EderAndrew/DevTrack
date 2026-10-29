# Feature Specification: Tema claro opcional

**Feature Branch**: `022-light-theme`
**Created**: 2026-10-29
**Status**: Draft
**Input**: User description: "Modo claro opcional, escolhido pelo usuário em "Meu perfil". Hoje o sistema
tem um tema único, escuro (005 FR-013, emenda 2026-10-22, paleta Vice City). Queremos um segundo tema,
claro, que cada usuário pode escolher; o escuro continua o padrão de quem nunca escolheu, e o tema escuro
atual não muda. A escolha (Claro / Escuro) fica em "Meu perfil" (/conta/perfil), já que ainda não há tela
de configurações. Vale para todos os papéis (aluno, professor, gestor, administrador). A preferência é da
conta, guardada no servidor (coluna no usuário, via migration Prisma, e uma rota autenticada da própria
conta, com contrato Zod em packages/contracts); segue o usuário em qualquer navegador e dispositivo. O tema
chega no HTML renderizado pelo servidor, sem piscar o tema errado. Telas sem sessão (entrar, links de
e-mail) ficam no escuro. Paleta do tema claro: #E63946 (vermelho), #F1FAEE (fundo claro), #A8DADC (aqua),
#457B9D (azul), #1D3557 (azul-marinho). Todos os pares de texto/fundo do tema claro precisam de contraste
WCAG AA, verificado pelo test/contrast.test.ts nos dois temas. Medido: #457B9D sobre #F1FAEE dá 4,30 e
#E63946 sobre #F1FAEE dá 3,90 (abaixo de 4,5), e branco sobre #E63946 dá 4,17; para texto e botões usar
tons mais escuros derivados dessas cores, e as cores originais em superfícies, bordas e realces. Os tokens
semânticos (design-system/tokens.css) ganham os valores do tema claro, inclusive sidebar, gráficos
(--chart-*), estados e os oito --syntax-* do realce de código (014) e o Exam Mode; nenhum componente usa
cor literal (regras do design system continuam). O catálogo /design-system mostra os dois temas. A página
de foco (exames e trabalhos CONTROLLED) segue o tema do usuário. Mudar o tema é imediato, sem recarregar,
e não é auditado como evento de segurança (só uma preferência visual); não altera nada de notas,
permissões ou sessões. Emenda da 005 FR-013 ("tema único, escuro") para "tema escuro padrão + tema claro
opcional"."

## Contexto: o que muda

A 005 criou o design system com tokens semânticos e, na emenda de 2026-10-22, fixou um tema único, escuro
(paleta Vice City), que não muda com a preferência do sistema operacional. Os componentes já usam só
tokens (sem cor literal), então um segundo tema é um segundo conjunto de valores para os mesmos tokens.
Esta feature acrescenta o tema claro e a escolha de cada usuário; o tema escuro fica exatamente como está.

| Ponto | Hoje | Depois desta feature |
|-------|------|----------------------|
| Temas | Um, escuro (Vice City) | Escuro (padrão, sem mudança) e claro (paleta nova) |
| Quem escolhe | Ninguém | Cada usuário, em "Meu perfil" |
| Onde a escolha fica | — | Na conta: vale em qualquer navegador e dispositivo |
| Preferência do sistema operacional | Ignorada | Continua ignorada |
| Telas sem sessão (entrar, links de e-mail) | Escuras | Continuam escuras |
| Tela de foco (provas e trabalhos controlados) | Escura | No tema do usuário |
| 005 FR-013 | "Tema único, escuro" | "Tema escuro padrão + tema claro opcional" (emenda) |

```text
Usuário ── "Meu perfil" → Aparência: Claro | Escuro ──▶ preferência da conta (servidor)
                                   │
                                   └─▶ telas com sessão já chegam no tema escolhido (sem piscar)
Sem sessão / nunca escolheu ──────────▶ tema escuro
```

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Escolher o tema claro em "Meu perfil" (Priority: P1)

Qualquer usuário com sessão (aluno, professor, gestor ou administrador) abre "Meu perfil" e encontra a
seção "Aparência" com duas opções, "Escuro" (marcada para quem nunca escolheu) e "Claro". Ao escolher
"Claro", a tela inteira (menu lateral, barra superior, conteúdo) passa para o tema claro na hora, sem
recarregar a página, e a escolha fica salva na conta.

**Why this priority**: é a própria feature: sem a escolha, o tema claro não chega a ninguém.

**Independent Test**: entrar com uma conta nova, abrir "Meu perfil", ver "Escuro" marcado, escolher
"Claro" e ver a página mudar sem recarregar; recarregar e ver que continua clara.

**Acceptance Scenarios**:

1. **Given** um usuário que nunca escolheu um tema, **When** ele abre "Meu perfil", **Then** a seção
   "Aparência" mostra "Escuro" e "Claro" como opções exclusivas, com "Escuro" marcada, e o sistema está no
   tema escuro.
2. **Given** o tema escuro, **When** o usuário escolhe "Claro", **Then** a página inteira passa para o tema
   claro em menos de 1 segundo, sem recarregar e sem perder o que estava na tela, e a escolha é salva na
   conta.
3. **Given** o tema claro salvo, **When** o usuário recarrega a página ou navega para outra tela com
   sessão, **Then** a tela já aparece no tema claro desde o primeiro quadro, sem mostrar o escuro antes.
4. **Given** o tema claro, **When** o usuário escolhe "Escuro", **Then** a página volta ao tema escuro na
   hora e a escolha "Escuro" fica salva.
5. **Given** que salvar a escolha falha (sem conexão ou erro do servidor), **When** o usuário escolhe um
   tema, **Then** a tela volta ao tema anterior, a opção anterior volta a ficar marcada e aparece uma
   mensagem dizendo que não foi possível salvar a aparência, para tentar de novo.
6. **Given** um usuário com e-mail ainda não confirmado, **When** ele abre "Meu perfil", **Then** também
   pode escolher o tema (é só uma preferência visual da própria conta).

---

### User Story 2 - A escolha segue o usuário em qualquer dispositivo (Priority: P1)

O professor escolhe o tema claro no computador da escola. Mais tarde entra pelo notebook de casa (outro
navegador, outra sessão) e o sistema já aparece no tema claro. A escolha é da conta, não do navegador.

**Why this priority**: sem isso o usuário teria de escolher de novo em cada dispositivo, e a escolha não
seria "do perfil".

**Independent Test**: escolher "Claro" numa sessão; entrar com a mesma conta em outro navegador e ver a
primeira tela depois do login já no tema claro.

**Acceptance Scenarios**:

1. **Given** um usuário que escolheu "Claro" num navegador, **When** ele entra em outro navegador ou
   dispositivo, **Then** a primeira tela depois do login já aparece no tema claro.
2. **Given** duas sessões abertas da mesma conta, **When** o usuário troca o tema numa delas, **Then** a
   outra passa a usar o novo tema na próxima vez que a página for carregada (recarregar, abrir o sistema
   de novo ou entrar); não muda sozinha na hora nem ao navegar entre telas já abertas.
3. **Given** dois usuários no mesmo navegador (um sai e o outro entra), **When** o segundo entra, **Then**
   ele vê o próprio tema, nunca o do usuário anterior.
4. **Given** um usuário que sai da conta, **When** ele vê a tela de entrada, **Then** ela está no tema
   escuro.

---

### User Story 3 - O tema claro é completo e acessível em todas as telas (Priority: P1)

Em qualquer tela com sessão — os bancos, a turma, a correção, o portal do aluno, a Operação de IA, os
feedbacks, os gráficos, o realce de código, as telas de prova e de trabalho controlado — o tema claro usa a
paleta nova, com texto legível (contraste WCAG AA) e os estados (sucesso, aviso, erro, informação) ainda
identificáveis sem depender só da cor. Nenhuma parte da tela fica "presa" no tema escuro.

**Why this priority**: um tema claro com partes escuras ou texto ilegível é pior que não ter tema claro.

**Independent Test**: no tema claro, percorrer o catálogo do design system e as telas principais de cada
papel; verificar que não há área no tema escuro e que todos os pares de texto e fundo passam no contraste
AA.

**Acceptance Scenarios**:

1. **Given** o tema claro, **When** o usuário abre qualquer tela com sessão, **Then** fundo, superfícies,
   menu lateral, barra superior, botões, campos, tabelas, diálogos, menus, avisos, selos e gráficos usam os
   valores do tema claro.
2. **Given** o tema claro, **When** se mede o contraste de cada par de texto e fundo do tema, **Then**
   todos atingem pelo menos 4,5:1 (texto normal) e 3:1 (texto grande, ícones e bordas de controles), como
   já se exige do tema escuro.
3. **Given** um código exibido ou editado (014) no tema claro, **When** o usuário o vê, **Then** o realce
   usa as cores de realce do tema claro, cada uma com contraste AA sobre o fundo do código.
4. **Given** uma prova ou um trabalho controlado (015/018) no tema claro, **When** o aluno está na tela de
   foco, **Then** a tela de foco, o cronômetro, os avisos e as caixas de diálogo do modo prova estão no
   tema claro, com as mesmas regras de destaque e contraste do modo prova.
5. **Given** o catálogo do design system (fora de produção), **When** alguém o abre, **Then** ele mostra
   os componentes nos dois temas.
6. **Given** o modo de alto contraste do sistema operacional (cores forçadas), **When** ele está ativo,
   **Then** o comportamento é o mesmo de hoje nos dois temas.

---

### User Story 4 - O tema escuro continua igual (Priority: P2)

Quem nunca escolheu, ou escolheu "Escuro", vê exatamente o sistema de hoje: mesma paleta Vice City, mesmas
cores de realce, mesmos gráficos.

**Why this priority**: o tema escuro é o padrão de todos os usuários atuais; esta feature não pode
mudá-lo.

**Independent Test**: comparar os valores de todos os tokens do tema escuro antes e depois da feature.

**Acceptance Scenarios**:

1. **Given** o tema escuro, **When** se comparam os valores dos tokens com os de antes desta feature,
   **Then** todos são iguais.
2. **Given** um usuário cujo sistema operacional está em modo claro e que nunca escolheu um tema, **When**
   ele entra, **Then** vê o tema escuro (a preferência do sistema operacional continua ignorada).

---

### Edge Cases

- **Sessão expirada ao trocar o tema**: a troca é recusada como qualquer ação sem sessão (`401`); a tela
  volta ao tema anterior e o usuário é levado à tela de entrada, como nas demais ações.
- **Valor inválido enviado à rota** (tema que não existe, campo a mais, corpo vazio): `400`, nada muda.
- **Cliques rápidos alternando o tema**: a última escolha vale; a tela termina no tema da última escolha
  salva, sem ficar trocando.
- **Escolher o tema que já está salvo**: não muda nada e não é erro.
- **Duas sessões trocando ao mesmo tempo**: vale a última gravação; não há conflito a resolver.
- **Prova em andamento**: trocar o tema em outra aba não afeta a prova (a tela de foco não tem menu nem
  perfil); a prova usa o tema na próxima vez que a tela de foco for carregada, sem perder respostas nem
  registrar ocorrência.
- **Telas sem sessão** (entrar, esqueci a senha, aceitar convite, confirmar e-mail, redefinir senha):
  sempre no tema escuro, mesmo que o navegador tenha sido usado por alguém com o tema claro; aberta por
  quem tem sessão válida, segue o tema da conta (FR-004).
- **Conta desativada ou sessão revogada no meio do uso**: o próximo carregamento cai na tela de entrada,
  escura.
- **E-mails enviados pelo sistema (017)**: não mudam; o tema é só das telas.

## Requirements *(mandatory)*

### Functional Requirements

**Temas**

- **FR-001**: O sistema DEVE oferecer dois temas: "Escuro" (o atual, paleta Vice City) e "Claro" (paleta
  nova, FR-008).
- **FR-002**: O tema escuro DEVE continuar exatamente como antes desta feature: nenhum valor de token do
  tema escuro muda.
- **FR-003**: O tema de quem nunca escolheu DEVE ser o escuro; a preferência de tema do sistema
  operacional ou do navegador NÃO DEVE ser considerada.
- **FR-004**: Toda tela aberta sem sessão válida (entrar, esqueci a senha, redefinir senha, confirmar
  e-mail, aceitar convite e as demais públicas, ou qualquer tela com a sessão expirada ou revogada) DEVE
  usar o tema escuro. Uma tela pública aberta por quem tem sessão válida segue o tema da conta.

**Escolha e preferência**

- **FR-005**: "Meu perfil" DEVE ter a seção "Aparência" com as opções exclusivas "Escuro" e "Claro",
  marcando o tema salvo na conta (ou "Escuro" se nunca escolheu), disponível para todo usuário com sessão,
  de qualquer papel, inclusive com e-mail não confirmado.
- **FR-006**: A escolha DEVE ser salva na conta do usuário, no servidor, e valer em qualquer navegador,
  dispositivo e sessão da mesma conta. Só o próprio usuário altera a própria preferência; a rota não
  recebe identificador de usuário (a conta é a da sessão).
- **FR-007**: Ao escolher um tema, a tela DEVE mudar na hora, sem recarregar; se salvar falhar, a tela
  DEVE voltar ao tema anterior com uma mensagem de que não foi possível salvar a aparência. A tela termina
  sempre no tema efetivamente salvo.
- **FR-008**: Toda tela com sessão DEVE chegar ao navegador já no tema da conta, sem mostrar o outro tema
  antes (sem "piscar"), inclusive na primeira tela depois do login e na tela de foco (015/018).

**Paleta e tokens do tema claro**

- **FR-009**: O tema claro DEVE ser construído a partir da paleta #E63946 (vermelho), #F1FAEE (fundo
  claro), #A8DADC (aqua), #457B9D (azul) e #1D3557 (azul-marinho). Onde uma cor da paleta não atinge o
  contraste exigido como texto ou como fundo de texto (medido: #457B9D sobre #F1FAEE 4,30:1; #E63946
  sobre #F1FAEE 3,90:1; branco sobre #E63946 4,17:1), o tema DEVE usar um tom mais escuro derivado da
  mesma cor; as cores originais ficam para fundos, superfícies, bordas e realces que não carregam texto.
- **FR-010**: O tema claro DEVE definir um valor para cada token de cor que o tema escuro define,
  inclusive menu lateral, gráficos, estados (sucesso, aviso, erro, informação), foco, o realce de código
  (os oito tokens de realce da 014) e o modo prova (005 Exam Mode); nenhum token pode ficar sem valor no
  tema claro.
- **FR-011**: Todos os pares de texto e fundo do tema claro DEVEM atingir o contraste da 005 FR-003 (AA:
  4,5:1 para texto normal, 3:1 para texto grande, ícones e bordas de controles e o indicador de foco), e
  os estados continuam identificáveis sem depender só da cor; a verificação automática de contraste DEVE
  cobrir os dois temas.
- **FR-012**: Nenhum componente ou tela DEVE usar cor literal ou condicionar a aparência ao tema em
  código: trocar o tema muda só os valores dos tokens (regras do design system 005 inalteradas).
- **FR-013**: O modo de cores forçadas (alto contraste do sistema operacional) DEVE continuar funcionando
  como hoje nos dois temas.
- **FR-014**: O catálogo do design system (fora de produção) DEVE mostrar os componentes nos dois temas.

**Efeitos e limites**

- **FR-015**: Escolher um tema NÃO DEVE alterar notas, pontos, permissões, sessões, tentativas ou
  qualquer registro de avaliação, e NÃO DEVE gerar evento de auditoria (é uma preferência visual, não uma
  operação crítica).
- **FR-016**: A rota de preferência DEVE aceitar só os valores de tema existentes, num corpo estrito;
  qualquer outro valor ou campo é recusado com `400` e nada muda.
- **FR-017**: A 005 FR-013 DEVE ser emendada de "tema único, escuro" para "tema escuro padrão e tema claro
  opcional, escolhido pelo usuário", e a documentação do design system (tokens e layouts) DEVE descrever
  os dois temas.

### Security, Permissions & Audit *(mandatory if feature has protected operations)*

- **Permissions**: nenhuma permissão nova. Ler e alterar a própria aparência segue a mesma regra de ler o
  próprio perfil: qualquer sessão válida, só a própria conta, inclusive com e-mail não confirmado.
- **Resource context**: a conta é sempre a da sessão; a rota não aceita identificador de outro usuário.
- **Audit events**: nenhum (FR-015). Os logs não registram nada além do que já registram para qualquer
  requisição.
- **Untrusted input**: só o tema escolhido, um de dois valores; corpo estrito, qualquer outra coisa →
  `400` (FR-016). As demais proteções de escrita valem (Origin permitido e JSON, 001 R6).
- **States & transitions**: nenhum fluxo de estados; a preferência é um valor (Escuro ou Claro), e sem
  escolha vale o escuro.
- **Idempotency**: gravar o mesmo tema de novo não muda nada; gravações concorrentes da mesma conta: vale
  a última.
- **Evidence vs. decisions**: N/A (não produz evidência de avaliação nem decisão).
- **Automation risk level**: N/A (sem IA ou automação).
- **Domain configurability**: N/A (nenhuma disciplina, linguagem ou tecnologia envolvida).
- **Sensitive data & adaptations**: nenhum dado sensível; a preferência de tema não é uma adaptação
  individual de avaliação.
- **Curricular traceability**: N/A.

### Key Entities *(include if feature involves data)*

- **Preferência de aparência da conta**: o tema escolhido pelo usuário ("Escuro" ou "Claro"), um por
  conta; ausente significa "Escuro". Faz parte dos dados da própria conta que o usuário já lê ao carregar
  as telas com sessão.
- **Tema**: um conjunto de valores para os tokens semânticos de cor do design system. Dois temas: escuro
  (Vice City, atual) e claro (paleta desta feature).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Ao escolher um tema em "Meu perfil", a tela inteira muda em menos de 1 segundo, sem
  recarregar a página.
- **SC-002**: 100% dos pares de texto e fundo dos dois temas atingem o contraste AA (4,5:1 texto normal;
  3:1 texto grande, ícones, bordas de controles e foco), incluindo as oito cores de realce de código.
- **SC-003**: Em 100% das telas com sessão carregadas com o tema claro salvo, o primeiro quadro exibido já
  está no tema claro (nenhum quadro no tema escuro antes).
- **SC-004**: Depois de escolher o tema claro, entrar com a mesma conta em outro navegador mostra a
  primeira tela já no tema claro, sem nova escolha.
- **SC-005**: 0 valores de token do tema escuro diferentes de antes desta feature.
- **SC-006**: 0 cores literais e 0 tokens de cor sem valor no tema claro, verificados pelas varreduras do
  design system.
- **SC-007**: As telas sem sessão aparecem no tema escuro em 100% dos casos, inclusive logo depois de um
  usuário com o tema claro sair da conta.

## Assumptions

- Só duas opções, "Escuro" e "Claro"; não há a opção "Seguir o sistema" (o usuário escolheu escuro como
  padrão e a preferência do sistema operacional continua ignorada, como na 005).
- "Meu perfil" é o lugar provisório da escolha até existir uma tela de configurações; mover a escolha
  depois não muda a preferência salva.
- A preferência é lida junto com os dados da própria conta que as telas com sessão já carregam; não há
  atualização em tempo real entre sessões abertas (sem WebSockets nem polling): outra sessão aberta pega o
  novo tema no próximo carregamento da página.
- Os e-mails do sistema (017) e as telas sem sessão não ganham tema claro.
- A paleta de cinco cores é a base; os tons derivados (mais escuros para texto e botões, e os neutros de
  borda e superfície) são definidos no plano, desde que respeitem FR-009 e FR-011.
- O realce de código e os gráficos do tema claro usam cores derivadas da paleta quando ela não tem cores
  distintas suficientes; a regra é o contraste e a distinção entre categorias, não o uso exclusivo das
  cinco cores.
- Contas existentes começam sem escolha, portanto no tema escuro (nenhuma mudança visível para quem não
  abrir "Aparência").
