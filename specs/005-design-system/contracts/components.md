# Contract: Componentes fundamentais

Todos em `apps/web/components/ui` (shadcn, constituição), usando só tokens
([tokens.md](./tokens.md)). Estados comuns a todo interativo: foco com o contorno oficial,
alvo ≥ 24 px (44 px em botões e campos), nome acessível, nenhum estado só por cor. "Novo"
= arquivo novo; "Ajustado" = componente existente padronizado sem mudar a API usada hoje.

## Ações

### Button (`button.tsx`, ajustado)

- `variant`: `primary` (padrão; `default` continua como alias), `secondary`, `outline`,
  `ghost`, `danger` (`destructive` continua como alias), `link`.
- `size`: `sm` (36), `md` (44, padrão), `icon` (44 × 44; exige `aria-label`).
- Estados: padrão, passar o mouse (`--primary-hover` / fundo sutil), foco, pressionado,
  desabilitado (`--disabled-*`), `loading` (`LoaderCircle` girando, `aria-busy="true"`,
  `disabled`, rótulo mantido, sem segundo acionamento).
- Regras: uma ação `primary` por região; destrutiva só com `danger` e texto explícito
  (FR-020); ícone à esquerda, `aria-hidden`.

## Formulários

| Componente | Situação | Contrato |
|------------|----------|----------|
| `Input` | ajustado | borda `--border-control`, fundo `--surface`, 44 px; estados passar o mouse, foco, preenchido, desabilitado, erro (`aria-invalid` → borda `--danger`), sucesso (`data-state="success"` → borda `--success`) |
| `Textarea` | ajustado | idem, altura mínima 3 linhas |
| `NativeSelect` | novo | `<select>` nativo com os tokens de campo e ícone `ChevronDown` (research V10) |
| `Select` | ajustado | Radix, para listas ricas; mesmos estados |
| `Checkbox` | refeito (nativo) | `<input type="checkbox">` 20 px, `accent-color: var(--primary)`, rótulo clicável, estados desabilitado e erro |
| `Radio` | novo (nativo) | `<input type="radio">`; grupos em `<fieldset>` com `<legend>` |
| `Switch` | novo (Radix) | `role="switch"`, rótulo obrigatório, trilho `--border-control` / `--primary` |
| `Label` | ajustado | `text-label`; marca de obrigatório com texto ("obrigatório"), não só asterisco |
| `FieldMessage` | novo | descrição (`text-caption`, `--text-secondary`) ou erro (`--danger-text` + ícone `CircleAlert`), `id` ligado ao campo |
| `FormField` | novo (`form-field.tsx`) | agrupa rótulo, controle, descrição e mensagem; liga `aria-describedby` e `aria-invalid`. O `Field` de `components/shared/field.tsx` continua, com a mesma API, reconstruído sobre ele |

## Feedback

| Componente | Situação | Contrato |
|------------|----------|----------|
| `Alert` | ajustado | `variant`: `info`, `success`, `warning`, `danger`; fundo `--*-surface`, borda à esquerda `--*`, ícone (`Info`, `CircleCheck`, `TriangleAlert`, `CircleAlert`), título; `role="alert"` só para erro que interrompe, senão `role="status"` |
| `Toast` | novo (Radix Toast) | mesmas variantes, `--z-toast`, some em 5 s (erro fica até fechar), pausa com foco ou mouse, anunciado; nunca o único lugar de uma informação necessária |
| `Progress` | ajustado | trilho `--border`, preenchimento `--primary`, `aria-valuenow` e rótulo |
| `Spinner` | novo | `LoaderCircle` + texto para leitores de tela; `role="status"` |
| `EmptyState` | novo | ícone, título (`text-h3`), texto e uma ação opcional; sem ilustração decorativa |
| `Skeleton` | ajustado | fundo `--border`, pulsa só sem `prefers-reduced-motion`; o contêiner tem `aria-busy` |
| `Tooltip` | ajustado | só complementa; `--z-tooltip`; aparece no foco e no mouse |

## Contêineres

| Componente | Situação | Contrato |
|------------|----------|----------|
| `Card` | ajustado | `--surface`, borda `--border`, `rounded-md`, sem sombra por padrão; usar só para agrupar, separar contexto, interação ou destaque |
| `Dialog` / `AlertDialog` | ajustados | `--overlay`, `rounded-lg`, `shadow-overlay`, `--z-modal`, foco preso e devolvido; `AlertDialog` para confirmação destrutiva com ação `danger` |
| `Sheet` (painel lateral / "drawer") | ajustado | idem, abre pela lateral; menu do celular |
| `Popover` | novo | `shadow-overlay`, `--z-dropdown`, fecha com Esc e clique fora |
| `DropdownMenu` | novo | itens com teclado (setas, Home/End, letra), item destrutivo em `--danger-text` |

## Dados

| Componente | Situação | Contrato |
|------------|----------|----------|
| `Table` | ajustado | cabeçalho `text-label`, linhas `text-body-sm`, divisórias `--border`; `density`: `comfortable` (padrão) ou `compact`; cabeçalhos com `scope`; legenda (`caption`) acessível |
| `Pagination` | novo | `<nav aria-label="Paginação">`, página atual com `aria-current="page"`, anterior/próxima com texto |
| `Badge` | ajustado | `variant`: `neutral`, `info`, `success`, `warning`, `danger`; `text-label`; fundo `--*-surface`, texto `--*-text` |
| `Status` | novo | ponto ou ícone + texto da situação (nunca só o ponto); mesmas variantes do `Badge` |
| `Tabs` | novo (Radix) | setas entre abas, `aria-selected`; para abas por rota (turma) o `ClassTabs` atual segue como `<nav>` de links |

## Navegação

| Componente | Situação | Contrato |
|------------|----------|----------|
| `Sidebar` / `AppSidebar` | ajustados | recolhível para ícones (004), item ativo `--primary-subtle` + `--primary-strong` + `aria-current="page"`, estados passar o mouse e foco |
| `Topbar` | novo (`components/layout/topbar.tsx`) | botão do menu + nome da área atual; `--z-sticky`; altura 56 px |
| `Breadcrumb` | novo | `<nav aria-label="Trilha">`, separador `ChevronRight` `aria-hidden`, página atual com `aria-current="page"` e sem link |
| `PageHeader` | novo (`components/layout/page-header.tsx`) | `breadcrumb?`, `title` (`<h1>`, `text-h1`), `description?`, `actions?` (à direita no desktop, abaixo do título em telas estreitas) |

## Mostruário e documentação

Cada componente acima tem entrada no registro do catálogo e seção em
`design-system/components.md` com: variantes, estados, quando usar, quando não usar,
exemplo e notas de acessibilidade (data-model.md).
