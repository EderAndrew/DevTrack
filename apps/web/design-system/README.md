# Design System

Fundação visual do DevTrack (spec `specs/005-design-system`). Identidade minimalista,
acadêmica, tecnológica e sóbria: o conteúdo pedagógico e a tarefa do usuário vêm antes da
decoração.

| Documento | Conteúdo |
|-----------|----------|
| [tokens.md](./tokens.md) | cada token de `tokens.css`, valores nos temas claro e escuro e uso permitido |
| [components.md](./components.md) | cada componente fundamental: variantes, estados, quando usar, quando não usar, exemplo e acessibilidade |
| [layouts.md](./layouts.md) | AppShell e layout do aluno, e como a tela de conta escolhe entre eles |
| [exam-mode.md](./exam-mode.md) | contrato visual do modo avaliação e dos componentes de avaliação (construídos pela feature de avaliações) |
| [exceptions.md](./exceptions.md) | valores fora da escala aceitos no código, com o motivo |
| `/design-system` | catálogo visual (só em desenvolvimento e nos testes), montado de `features/design-system/registry.ts` |

## Princípios

1. **Clareza antes de tudo.** Cada tela tem uma tarefa principal, um título (`<h1>` no
   `PageHeader`) e no máximo uma ação `primary` por região. O texto diz o que acontece
   ("Excluir turma", não "Confirmar").
2. **Significado, não decoração.** Cor, ícone e peso tipográfico comunicam estado e
   hierarquia. Nenhum estado depende só da cor: sempre há texto, ícone ou forma junto.
3. **Uma fonte de verdade.** Todo valor visual vem de `tokens.css`. Nenhuma cor, tamanho,
   espaçamento, raio, sombra ou família de fonte literal nas telas; exceções só com
   `ds-exception: <motivo>` e registro em [exceptions.md](./exceptions.md).
4. **Acessível por padrão (WCAG 2.2 AA).** Contraste de 4,5:1 no texto e 3:1 em ícones de
   estado, bordas de campo e foco, nos dois temas; foco visível em todo elemento
   interativo; alvo de no mínimo 24 × 24 px (44 px de altura em botões e campos); tudo
   operável pelo teclado; nome acessível em todo controle.
5. **Movimento funcional e curto.** Só para abrir, fechar, dar retorno e mudar de estado
   (`--duration-fast`, `--duration-base`, `--ease-standard`), e removido com
   `prefers-reduced-motion`.
6. **Separação por fundo, espaço e borda antes da sombra.** No máximo três sombras; a de
   sobreposição só para o que flutua (diálogo, popover, menu, notificação).
7. **Concentração para o aluno.** O aluno vê só a atividade atual, o progresso, as
   informações essenciais e a próxima ação; nenhum elemento administrativo.
8. **Mostrar ou esconder é experiência de uso.** O menu e o layout seguem as permissões
   que a API já devolve; a autorização continua no servidor.

## Cores e a regra 80/15/5

- **80% neutros**: `--background`, `--surface`, `--foreground`, `--text-secondary`,
  `--border`. São a base de toda tela.
- **15% identidade**: `--primary` e suas variações (`--primary-hover`, `--primary-strong`,
  `--primary-subtle`) para a ação principal, seleção, progresso, links, marca e item ativo
  do menu.
- **5% semânticas**: `--success`, `--warning`, `--danger` e `--info`, só para significado
  (resultado, atenção, erro ou risco, informação), nunca para decoração.

Cada cor semântica tem três papéis: a cor base para ícones, bordas e gráficos
(`--success`), a variante de texto que atinge 4,5:1 (`--success-text`) e o fundo suave dos
avisos e selos (`--success-surface`). Texto nunca usa a cor base. `--border` é só para
divisórias decorativas; campos, caixas, opções e o interruptor usam `--border-control`
(3:1). O tema escuro troca só os valores dos tokens, com os mesmos requisitos de contraste
(`test/contrast.test.ts`).

## Regras contra UI genérica

- Nada de gradientes, sombras de cartão por padrão, vidro fosco, ilustrações decorativas,
  emojis ou ícones enfeitando títulos.
- Um cartão só existe para agrupar, separar um contexto, receber interação ou destacar;
  listas e formulários não ficam dentro de cartões só "para dar acabamento".
- Nada de cor semântica como enfeite (selo verde em algo que não é sucesso, texto vermelho
  para chamar atenção).
- Nenhum botão sem texto de significado não evidente: ícone sozinho só com `aria-label` e
  dica (`Tooltip`).
- Títulos e botões dizem o que acontece, no vocabulário do professor e do aluno, sem
  jargão técnico e sem "Clique aqui".
- Nenhum componente recriado fora de `components/ui` (`<button>`, `<select>`,
  `<textarea>`, `<table>`, caixa de seleção, opção): a guarda
  `test/design-system/token-usage.test.ts` (regra `controles`) falha.
- Densidade não diminui o texto abaixo da escala nem o alvo abaixo do mínimo.

## Arquitetura em camadas

```text
tokens (design-system/tokens.css)
  → ui (components/ui: componentes fundamentais, shadcn/Radix)
    → layout (components/layout: AppShell, StudentLayout, Topbar, PageHeader)
      → features (features/<feature>/components: componentes de domínio)
        → app (app/**: páginas e layouts de rota)
```

Cada camada importa só as de baixo (ESLint, `eslint.config.js`, grupos `UI_LAYER` e
`LAYOUT_LAYER`; `test/lint-boundaries.test.ts` fixa as regras). `components/shared`
(menu lateral, cabeçalho público, avisos) fica entre `ui` e `layout`. Os componentes não
chamam a API nem conhecem regras de negócio; os dados chegam por props ou pelos hooks das
features.

## Como usar

1. **Tela nova**: fica num grupo de rota que já traz a moldura (`app/(app)` para o
   professor e a administração, `app/(student)` para o aluno) e começa com `PageHeader`
   (título, trilha, situação, descrição e ações).
2. **Componente**: procure no catálogo (`pnpm --filter web dev` e abra
   `http://localhost:3000/design-system`) e em [components.md](./components.md). Use a
   variante pelo significado (`variant="danger"` para o que destrói, `Badge`/`Status` pelo
   sentido da situação).
3. **Estilo**: só utilitários gerados pelos tokens (`bg-surface`, `text-body-sm`,
   `rounded-md`, `shadow-overlay`, `p-4`, `gap-3`). As escalas padrão do Tailwind
   (`bg-red-500`, `text-2xl`, `rounded-xl`, `shadow-lg`) não geram CSS.
4. **Componente fundamental novo**: em `components/ui`, com teste (variantes, estados,
   teclado, `vitest-axe`), entrada em `features/design-system/registry.ts` com mostruário
   e seção em [components.md](./components.md). `test/design-system/docs.test.ts` e o teste
   do catálogo falham se algo faltar.
5. **Valor fora da escala**: evite. Se for inevitável, marque a linha com
   `ds-exception: <motivo>` e acrescente a linha em [exceptions.md](./exceptions.md).
6. **Verificação**: `pnpm --filter web test` roda as guardas de tokens, controles,
   contraste, documentação e catálogo; `pnpm lint` roda as camadas.
