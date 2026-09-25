# Componentes

Uma seção por entrada do catálogo (`features/design-system/registry.ts`), com o mesmo
nome. Todos ficam em `components/ui` (salvo onde indicado) e usam só tokens
([tokens.md](./tokens.md)). Comum a todo interativo: contorno de foco oficial, alvo de no
mínimo 24 × 24 px (44 px de altura em botões e campos), nome acessível e nenhum estado só
por cor. O catálogo (`/design-system`) mostra cada variante e estado listados aqui.

## Button

`components/ui/button.tsx`

### Variantes

- `primary` (padrão; `default` é alias): a ação principal da região.
- `secondary`: ação importante que não é a principal (borda e texto `--primary`).
- `outline`: ação comum, "Cancelar", filtros.
- `ghost`: ação discreta em listas e barras (ícone, "Ver detalhes").
- `danger` (`destructive` é alias): ação que destrói ou remove; borda `--danger`, texto
  `--danger-text`.
- `link`: ação com aparência de link, dentro de texto.

Tamanhos: `sm` (36 px), `md` (44 px, padrão; `default` é alias) e `icon` (44 × 44).

### Estados

Padrão, passar o mouse (`--primary-hover` ou fundo sutil), foco, pressionado (desce 1 px),
desabilitado (`--disabled-*`) e `loading` (ícone girando, `aria-busy="true"`, desabilitado,
rótulo mantido, sem segundo acionamento).

### Quando usar

Para disparar uma ação: salvar, enviar, abrir um diálogo, confirmar. Uma só `primary` por
região; o texto diz o que acontece ("Convidar alunos").

### Quando não usar

Para navegar para outra página (use `Link`/`<a>`); para ações destrutivas com `primary` ou
`outline` (use `danger`, com texto explícito e, se o risco for relevante, `AlertDialog`);
com texto genérico ("OK", "Clique aqui").

### Exemplo

```tsx
<Button type="submit" loading={mutation.isPending}>Salvar</Button>
<Button variant="danger" onClick={openConfirm}>
  <Trash2 aria-hidden="true" />
  Excluir turma
</Button>
<Button size="icon" variant="ghost" aria-label="Editar tópico"><Pencil aria-hidden="true" /></Button>
```

### Acessibilidade

`type` sempre explícito; ícone à esquerda com `aria-hidden`; `size="icon"` exige
`aria-label` e dica (`Tooltip`); `loading` anuncia `aria-busy` e impede novo clique.

## Input

`components/ui/input.tsx`

### Variantes

Uma aparência; o `type` nativo muda o teclado e a validação (`text`, `email`, `password`,
`date`, `number`).

### Estados

Padrão (borda `--border-control`, fundo `--surface`, 44 px), passar o mouse, foco,
preenchido, desabilitado (`--disabled-*`), erro (`aria-invalid` → borda `--danger`) e
sucesso (`data-state="success"` → borda `--success`).

### Quando usar

Para texto curto de uma linha: nome, e-mail, RA, datas.

### Quando não usar

Para texto de várias linhas (`Textarea`); para escolher entre opções conhecidas
(`NativeSelect`, `Radio`); sem rótulo visível.

### Exemplo

```tsx
<FormField id="email" label="E-mail" error={errors.email?.message} required>
  {(control) => <Input type="email" autoComplete="email" {...control} {...register("email")} />}
</FormField>
```

### Acessibilidade

Sempre dentro de `FormField` (ou com `Label` ligado por `htmlFor`); erro com borda, ícone e
texto ligados por `aria-describedby`; `autoComplete` quando o dado é do usuário.

## Textarea

`components/ui/textarea.tsx`

### Variantes

Uma aparência; altura mínima de três linhas (`min-h-24`), cresce com `rows`.

### Estados

Os mesmos do `Input`: padrão, passar o mouse, foco, preenchido, desabilitado, erro e
sucesso.

### Quando usar

Para texto livre de várias linhas: descrição de tópico, observação, texto de ementa.

### Quando não usar

Para uma linha (`Input`); para código (usar `text-code` num editor próprio, da feature de
exercícios).

### Exemplo

```tsx
<FormField id="descricao" label="Descrição do tópico" description="Opcional.">
  {(control) => <Textarea rows={4} {...control} {...register("description")} />}
</FormField>
```

### Acessibilidade

Mesmas regras do `Input`: rótulo, descrição e erro ligados; nunca limite de caracteres só
visual (anuncie o limite na descrição).

## NativeSelect

`components/ui/native-select.tsx`

### Variantes

Uma aparência: `<select>` nativo com os tokens de campo e o ícone `ChevronDown`.

### Estados

Padrão, passar o mouse, foco, desabilitado e erro (`aria-invalid`).

### Quando usar

Para escolher uma opção numa lista curta e conhecida (turno, turma, ação em lote). É a
escolha padrão: funciona com teclado, leitor de tela e celular sem código extra.

### Quando não usar

Para listas que precisam de busca, grupos ricos ou ícones (`Select`); para duas ou três
opções que o usuário precisa comparar (`Radio`).

### Exemplo

```tsx
<FormField id="turno" label="Turno">
  {(control) => (
    <NativeSelect {...control} {...register("shift")}>
      <option value="MORNING">Manhã</option>
      <option value="EVENING">Noite</option>
    </NativeSelect>
  )}
</FormField>
```

### Acessibilidade

Comportamento nativo do navegador; o ícone é `aria-hidden`; opção vazia com texto
("Selecione") quando não há padrão.

## Select

`components/ui/select.tsx` (Radix)

### Variantes

Tamanho do gatilho: `default` e `sm`.

### Estados

Padrão, foco, aberto, desabilitado e erro (`aria-invalid` → borda `--danger`).

### Quando usar

Para listas ricas em que o `<select>` nativo não basta: itens com descrição, grupos
rotulados, conteúdo formatado.

### Quando não usar

Na maioria dos formulários (`NativeSelect` é o padrão); para ações (`DropdownMenu`).

### Exemplo

```tsx
<Label htmlFor="disciplina">Disciplina</Label>
<Select value={value} onValueChange={setValue}>
  <SelectTrigger id="disciplina"><SelectValue placeholder="Selecione" /></SelectTrigger>
  <SelectContent>
    <SelectItem value="poo">Programação Orientada a Objetos</SelectItem>
  </SelectContent>
</Select>
```

### Acessibilidade

O gatilho tem `role="combobox"` e recebe o rótulo por `htmlFor`; setas, Home/End e letras
navegam; Esc fecha e devolve o foco.

## Checkbox

`components/ui/checkbox.tsx`

### Variantes

Uma aparência: `<input type="checkbox">` nativo de 20 px com `accent-color: var(--primary)`.

### Estados

Desmarcado, marcado, foco, desabilitado e erro (`aria-invalid` com mensagem ligada).

### Quando usar

Para uma escolha independente de sim ou não ("Enviar convite agora") ou para várias
escolhas numa lista.

### Quando não usar

Para uma preferência que tem efeito imediato (`Switch`); para escolher uma entre várias
opções (`Radio`).

### Exemplo

```tsx
<div className="flex items-center gap-2">
  <Checkbox id="arquivados" {...register("showArchived")} />
  <Label htmlFor="arquivados">Mostrar arquivados</Label>
</div>
```

### Acessibilidade

O rótulo é clicável (`htmlFor`); várias caixas relacionadas ficam num `<fieldset>` com
`<legend>`; o erro liga a mensagem por `aria-describedby`.

## Radio

`components/ui/radio.tsx`

### Variantes

`Radio` (`<input type="radio">` nativo) e `RadioGroup` (`<fieldset>` com `<legend>`).

### Estados

Não marcado, marcado, foco e desabilitado (a opção ou o grupo inteiro).

### Quando usar

Para escolher uma entre poucas opções (até cinco) que o usuário precisa ver ao mesmo tempo
("Mover para outra aula" ou "Arquivar").

### Quando não usar

Para muitas opções (`NativeSelect`); para escolhas independentes (`Checkbox`).

### Exemplo

```tsx
<RadioGroup legend="Ação no tópico">
  <div className="flex items-center gap-2">
    <Radio id="mover" name="acao" value="MOVE" defaultChecked />
    <Label htmlFor="mover">Mover para outra aula</Label>
  </div>
</RadioGroup>
```

### Acessibilidade

O grupo recebe o nome pelo `<legend>`; Tab entra no grupo e as setas trocam a opção;
opções do mesmo grupo compartilham `name`.

## Switch

`components/ui/switch.tsx` (Radix)

### Variantes

Uma aparência: trilho `--border-control` desligado e `--primary` ligado.

### Estados

Desligado, ligado, foco e desabilitado.

### Quando usar

Para uma preferência que liga ou desliga na hora, sem botão "Salvar" ("Receber avisos por
e-mail").

### Quando não usar

Dentro de formulários que só valem ao enviar (`Checkbox`); para escolher entre valores que
não são ligado e desligado.

### Exemplo

```tsx
<div className="flex items-center gap-3">
  <Switch id="avisos" checked={enabled} onCheckedChange={setEnabled} />
  <Label htmlFor="avisos">Receber avisos por e-mail</Label>
</div>
```

### Acessibilidade

`role="switch"` com `aria-checked`; rótulo obrigatório; Espaço alterna.

## Label

`components/ui/label.tsx`

### Variantes

Uma aparência (`text-label`); prop `required` acrescenta " (obrigatório)".

### Estados

Padrão e obrigatório.

### Quando usar

Para nomear qualquer controle de formulário, sempre visível acima do campo (ou ao lado de
caixas e opções).

### Quando não usar

Como título de seção (use `h2`/`h3`); só com asterisco para marcar obrigatório; como
substituto por `placeholder`.

### Exemplo

```tsx
<Label htmlFor="email" required>E-mail</Label>
```

### Acessibilidade

`htmlFor` aponta para o `id` do controle; a marca de obrigatório é texto, lido pelo leitor
de tela.

## FieldMessage

`components/ui/field-message.tsx`

### Variantes

`tone`: `description` (descrição, `text-caption` em `--text-secondary`), `error` (ícone
`CircleAlert` e texto `--danger-text`) e `success` (ícone `CircleCheck` e texto
`--success-text`). No catálogo: descrição, erro e sucesso.

### Estados

Estático; aparece e some com a validação.

### Quando usar

Para o texto sob um campo: como preencher, o que está errado e como corrigir, ou a
confirmação de um valor verificado.

### Quando não usar

Para avisos da página inteira (`Alert`); sozinho, sem `id` ligado ao campo.

### Exemplo

```tsx
<FieldMessage id="email-erro" tone="error">Informe um e-mail válido.</FieldMessage>
```

### Acessibilidade

O `id` entra no `aria-describedby` do campo (o `FormField` faz isso); erro combina ícone,
cor e texto.

## FormField

`components/ui/form-field.tsx` (o `Field` de `components/shared/field.tsx` usa a mesma API)

### Variantes

Uma estrutura: rótulo, controle, descrição e mensagem de erro ou sucesso.

### Estados

Com descrição, erro, sucesso, obrigatório e desabilitado (o controle desabilitado).

### Quando usar

Em todo campo de formulário: liga rótulo, descrição e mensagem ao controle, e marca
`aria-invalid` e `data-state="success"`.

### Quando não usar

Para caixas e opções em grupo (`RadioGroup` ou `<fieldset>`); para controles sem rótulo
visível.

### Exemplo

```tsx
<FormField id="ra" label="RA" description="Só números." error={errors.ra?.message} required>
  {(control) => <Input inputMode="numeric" {...control} {...register("ra")} />}
</FormField>
```

### Acessibilidade

Ids previsíveis (`<id>-dica`, `<id>-erro`, `<id>-sucesso`), usados também pelo
`ErrorSummary` para levar o foco ao campo; `aria-describedby` só existe quando há texto.

## Alert

`components/ui/alert.tsx`

### Variantes

`info` (padrão; `default` é alias), `success`, `warning` e `danger` (`destructive` é
alias). Fundo `--*-surface`, borda `--*`, ícone próprio (`Info`, `CircleCheck`,
`TriangleAlert`, `CircleAlert`) e título.

### Estados

Estático. `role="status"` por padrão; `role="alert"` em `danger`; o `role` passado
prevalece.

### Quando usar

Para uma mensagem que fica na página: resultado de uma ação, pendência, erro que impede
continuar, informação importante do contexto.

### Quando não usar

Para confirmações passageiras (`Toast`); para erro de um campo (`FieldMessage`); para
decorar ou chamar atenção sem significado.

### Exemplo

```tsx
<Alert variant="warning">
  <AlertTitle>Ementa com itens sem tópico.</AlertTitle>
  <AlertDescription>Revise a cobertura antes de confirmar o plano.</AlertDescription>
</Alert>
```

### Acessibilidade

Ícone `aria-hidden`; `role="alert"` só para erro que interrompe; um aviso que já está na
página ao carregar pode usar `role="note"` para não ser anunciado.

## Toast

`components/ui/toast.tsx` (Radix Toast; `Toaster` em `app/providers.tsx`, `useToast()`)

### Variantes

`info`, `success`, `warning` e `danger`, com o ícone e a borda do `Alert`.

### Estados

Aberto, pausado (com foco ou mouse) e fechado. Some em 5 s; `danger` fica até ser fechado.

### Quando usar

Para confirmar uma ação concluída que não muda a tela ("Convite reenviado.").

### Quando não usar

Como o único lugar de uma informação necessária; para erros de formulário; para algo que o
usuário precisa ler com calma (`Alert`).

### Exemplo

```tsx
const { toast } = useToast();
toast({ variant: "success", title: "Plano confirmado." });
```

### Acessibilidade

Anunciado sem tirar o foco; região "Notificações" alcançável por F8; botão "Fechar
notificação"; pausa com foco ou mouse.

## Progress

`components/ui/progress.tsx`

### Variantes

Uma aparência: trilho `--border`, preenchimento `--primary`.

### Estados

Vazio, em andamento e completo (pelo `value`).

### Quando usar

Para mostrar quanto de algo mensurável está feito: cobertura da ementa, andamento do
plano.

### Quando não usar

Para espera sem medida (`Spinner`); como enfeite ao lado de números que já dizem tudo.

### Exemplo

```tsx
<Progress value={coverage} aria-label={`Cobertura da ementa: ${coverage}%`} />
```

### Acessibilidade

`role="progressbar"` com `aria-valuenow`; nome acessível obrigatório; o valor também
aparece em texto perto da barra.

## Spinner

`components/ui/spinner.tsx`

### Variantes

Só leitor de tela (padrão) ou com texto visível (`showLabel`).

### Estados

Carregando (o ícone gira só com movimento permitido) e com texto.

### Quando usar

Para uma espera curta sem medida: carregar uma lista, processar um envio.

### Quando não usar

Dentro de botões (use `loading` do `Button`); para carregar uma área com forma conhecida
(`Skeleton`).

### Exemplo

```tsx
<Spinner label="Carregando turmas…" />
```

### Acessibilidade

`role="status"` com o texto; ícone `aria-hidden` com `motion-safe:animate-spin`.

## EmptyState

`components/ui/empty-state.tsx`

### Variantes

Com ou sem ação; título `h2` (padrão) ou `h3` (`headingLevel`).

### Estados

Com ação e sem ação.

### Quando usar

Quando uma lista ou área não tem nada ainda, dizendo por quê e qual é o próximo passo
("Crie a primeira turma").

### Quando não usar

Para erro de carregamento (`Alert` `danger`); com ilustração decorativa; com mais de uma
ação.

### Exemplo

```tsx
<EmptyState
  icon={Inbox}
  title="Nenhuma turma ainda"
  description="Crie a primeira turma para convidar os alunos."
  action={<Button asChild><Link href="/turmas/nova">Nova turma</Link></Button>}
/>
```

### Acessibilidade

Ícone `aria-hidden` (`size-6`); título na hierarquia da página; a ação é um controle
normal.

## Skeleton

`components/ui/skeleton.tsx`

### Variantes

Uma aparência: fundo `--border`; a forma vem de `className` (altura e largura).

### Estados

Carregando (pulsa só com movimento permitido).

### Quando usar

Para reservar o espaço de um conteúdo com forma conhecida enquanto carrega (lista,
cartão), evitando que a página pule.

### Quando não usar

Para esperas de ação do usuário (`loading` do `Button`); por mais de alguns segundos sem
outra indicação.

### Exemplo

```tsx
<section aria-busy="true" aria-label="Carregando a lista de turmas">
  <Skeleton className="h-6 w-1/2" />
  <Skeleton className="h-4 w-full" />
</section>
```

### Acessibilidade

Cada esqueleto é `aria-hidden`; o contêiner tem `aria-busy="true"` e um nome.

## Tooltip

`components/ui/tooltip.tsx` (Radix)

### Variantes

Uma aparência, na camada `--z-tooltip`.

### Estados

Fechado e aberto (no foco pelo teclado ou no mouse).

### Quando usar

Para complementar um controle só de ícone com o nome dele, ou explicar uma sigla.

### Quando não usar

Para informação necessária (fica fora do alcance no toque); com conteúdo interativo
(`Popover`); em textos que já estão visíveis.

### Exemplo

```tsx
<Tooltip>
  <TooltipTrigger asChild>
    <Button size="icon" variant="ghost" aria-label="Arquivar tópico"><Archive aria-hidden="true" /></Button>
  </TooltipTrigger>
  <TooltipContent>Arquivar tópico</TooltipContent>
</Tooltip>
```

### Acessibilidade

O controle já tem nome próprio (`aria-label`); a dica abre no foco e fecha com Esc.

## Card

`components/ui/card.tsx`

### Variantes

Uma aparência: `--surface`, borda `--border`, `rounded-md`, sem sombra. Partes:
`CardHeader`, `CardTitle`, `CardDescription`, `CardAction`, `CardContent`, `CardFooter`.

### Estados

Agrupamento e com ação.

### Quando usar

Para agrupar informações de um mesmo objeto, separar um contexto, receber interação (um
item clicável numa grade) ou destacar um resumo.

### Quando não usar

Em volta da página inteira ou de um formulário só "para dar acabamento"; cartão dentro de
cartão; lista longa de linhas iguais (use `Table` ou lista).

### Exemplo

```tsx
<Card>
  <CardHeader>
    <CardTitle>ADS3 — Noite</CardTitle>
    <CardDescription>Programação Orientada a Objetos · 2026.2</CardDescription>
  </CardHeader>
  <CardContent>32 alunos matriculados.</CardContent>
</Card>
```

### Acessibilidade

`CardTitle` não é título por padrão: use o nível de título certo quando o cartão abre uma
seção; um cartão clicável tem um único link ou botão com nome claro.

## Dialog

`components/ui/dialog.tsx` (Radix)

### Variantes

Uma aparência: `--surface`, `rounded-lg`, `shadow-overlay`, fundo `--overlay`, camada
`--z-modal`; `showCloseButton` para o botão de fechar.

### Estados

Fechado e aberto (foco preso dentro e devolvido ao gatilho ao fechar).

### Quando usar

Para uma tarefa curta que precisa de atenção sem sair da página: renomear, mover um
tópico, um formulário de poucos campos.

### Quando não usar

Para confirmar algo destrutivo (`AlertDialog`); para conteúdo longo ou navegação (página
própria); para mensagens simples (`Alert`, `Toast`).

### Exemplo

```tsx
<Dialog>
  <DialogTrigger asChild><Button variant="outline">Renomear tópico</Button></DialogTrigger>
  <DialogContent>
    <DialogHeader>
      <DialogTitle>Renomear tópico</DialogTitle>
      <DialogDescription>O novo nome aparece no plano e no calendário.</DialogDescription>
    </DialogHeader>
    …
  </DialogContent>
</Dialog>
```

### Acessibilidade

`DialogTitle` obrigatório (nome do diálogo) e `DialogDescription` quando há contexto; Esc
fecha; o foco volta ao gatilho.

## AlertDialog

`components/ui/alert-dialog.tsx` (Radix)

### Variantes

Uma aparência, a do `Dialog`; `AlertDialogAction` aceita `variant` (use `danger` para o
destrutivo) e `AlertDialogCancel` é `outline`.

### Estados

Fechado e aberto; o foco começa em "Cancelar".

### Quando usar

Para confirmar uma ação destrutiva ou irreversível, dizendo o que será perdido ("Remover
Ana Souza da turma?").

### Quando não usar

Para ações comuns ou reversíveis; para formulários (`Dialog`); como aviso que não pede
decisão.

### Exemplo

```tsx
<AlertDialog>
  <AlertDialogTrigger asChild><Button variant="danger">Remover aluno</Button></AlertDialogTrigger>
  <AlertDialogContent>
    <AlertDialogHeader>
      <AlertDialogTitle>Remover Ana Souza da turma?</AlertDialogTitle>
      <AlertDialogDescription>A matrícula é encerrada. A conta continua existindo.</AlertDialogDescription>
    </AlertDialogHeader>
    <AlertDialogFooter>
      <AlertDialogCancel>Cancelar</AlertDialogCancel>
      <AlertDialogAction variant="danger">Remover aluno</AlertDialogAction>
    </AlertDialogFooter>
  </AlertDialogContent>
</AlertDialog>
```

### Acessibilidade

`role="alertdialog"`; não fecha clicando fora; a ação repete o verbo do gatilho.

## Sheet

`components/ui/sheet.tsx` (Radix Dialog)

### Variantes

`side`: `right` (padrão), `left`, `top`, `bottom`.

### Estados

Fechado e aberto (foco preso e devolvido).

### Quando usar

Para detalhes ou ações de um item sem perder a lista de vista; é também o menu lateral em
telas estreitas.

### Quando não usar

Para confirmações (`AlertDialog`); para fluxos longos (página própria).

### Exemplo

```tsx
<Sheet>
  <SheetTrigger asChild><Button variant="outline">Ver detalhes da aula</Button></SheetTrigger>
  <SheetContent>
    <SheetHeader>
      <SheetTitle>Aula 7 — 14/10</SheetTitle>
      <SheetDescription>Herança e polimorfismo · 2 tópicos</SheetDescription>
    </SheetHeader>
  </SheetContent>
</Sheet>
```

### Acessibilidade

As mesmas do `Dialog`: título obrigatório, Esc fecha, foco devolvido.

## Popover

`components/ui/popover.tsx` (Radix)

### Variantes

Uma aparência: `--surface`, `shadow-overlay`, camada `--z-dropdown`.

### Estados

Fechado e aberto; fecha com Esc e clique fora.

### Quando usar

Para um conteúdo complementar ligado a um controle: um detalhe, um calendário, um
pequeno formulário de filtro.

### Quando não usar

Para ações em lista (`DropdownMenu`); para conteúdo necessário ou longo; dentro de um
`Dialog` (a camada `--z-dropdown` fica abaixo de `--z-modal`).

### Exemplo

```tsx
<Popover>
  <PopoverTrigger asChild><Button variant="outline">Cobertura da ementa</Button></PopoverTrigger>
  <PopoverContent>12 de 15 itens da ementa têm tópico no plano.</PopoverContent>
</Popover>
```

### Acessibilidade

O gatilho indica `aria-expanded`; o foco vai para o conteúdo e volta ao gatilho.

## DropdownMenu

`components/ui/dropdown-menu.tsx` (Radix)

### Variantes

Itens `default` e `danger` (texto `--danger-text`); rótulo e separador.

### Estados

Fechado e aberto; item com foco e item desabilitado.

### Quando usar

Para agrupar ações secundárias de um item ("Ações do tópico": renomear, mover, arquivar).

### Quando não usar

Para a ação principal (deixe-a visível como `Button`); para navegação principal; para
escolher um valor de formulário (`NativeSelect`).

### Exemplo

```tsx
<DropdownMenu>
  <DropdownMenuTrigger asChild>
    <Button size="icon" variant="ghost" aria-label="Ações do tópico"><Ellipsis aria-hidden="true" /></Button>
  </DropdownMenuTrigger>
  <DropdownMenuContent>
    <DropdownMenuItem>Renomear</DropdownMenuItem>
    <DropdownMenuItem variant="danger">Arquivar tópico</DropdownMenuItem>
  </DropdownMenuContent>
</DropdownMenu>
```

### Acessibilidade

Setas, Home/End e a primeira letra navegam; Enter ativa; Esc fecha e devolve o foco; o
item destrutivo diz o que faz, não só a cor.

## Table

`components/ui/table.tsx`

### Variantes

`density`: `comfortable` (padrão) e `compact`. Cabeçalho `text-label`, linhas
`text-body-sm`, divisórias `--border`.

### Estados

Linha padrão e linha selecionada (`data-state="selected"`, fundo `--muted`).

### Quando usar

Para dados que se comparam por coluna: alunos, convites, usuários.

### Quando não usar

Para layout de página; para poucos itens sem colunas (lista); `compact` em telas usadas
pelo aluno.

### Exemplo

```tsx
<Table density="compact">
  <TableCaption>Alunos da turma ADS3 — Noite</TableCaption>
  <TableHeader><TableRow><TableHead>Nome</TableHead><TableHead>RA</TableHead></TableRow></TableHeader>
  <TableBody>{rows}</TableBody>
</Table>
```

### Acessibilidade

`TableHead` tem `scope="col"` por padrão; `TableCaption` nomeia a tabela; a densidade
compacta não reduz o texto nem os alvos; a tabela rola na horizontal dentro do contêiner.

## Pagination

`components/ui/pagination.tsx`

### Variantes

Uma aparência: "Anterior", páginas próximas da atual (as demais viram "…") e "Próxima".

### Estados

Primeira página ("Anterior" desabilitado), página do meio e última página ("Próxima"
desabilitado).

### Quando usar

Para listas longas vindas do servidor em páginas.

### Quando não usar

Para listas curtas (mostre tudo); para passos de um fluxo (use botões com texto).

### Exemplo

```tsx
<Pagination page={page} totalPages={data.totalPages} onPageChange={setPage} />
```

### Acessibilidade

`<nav aria-label="Paginação">`; página atual com `aria-current="page"`; cada botão diz
"Página N"; anterior e próxima em palavras.

## Badge

`components/ui/badge.tsx`

### Variantes

`neutral` (padrão), `info`, `success`, `warning` e `danger`; fundo `--*-surface`, texto
`--*-text`, `text-label`.

### Estados

Estático.

### Quando usar

Para a situação de um objeto em poucas palavras, perto do nome dele ("Confirmado", "Em
revisão").

### Quando não usar

Como botão ou link; para enfeitar; com cor semântica que não corresponde ao sentido.

### Exemplo

```tsx
<Badge variant="success">Confirmado</Badge>
```

### Acessibilidade

O texto diz a situação; a cor só reforça.

## Status

`components/ui/status.tsx`

### Variantes

As do `Badge`: `neutral`, `info`, `success`, `warning` e `danger`; ponto colorido e texto.

### Estados

Estático.

### Quando usar

Para situação em tabelas e listas densas, onde um selo pesaria demais.

### Quando não usar

Só com o ponto, sem texto; como controle.

### Exemplo

```tsx
<Status variant="warning">Convite pendente</Status>
```

### Acessibilidade

O ponto é `aria-hidden`; o texto é o que conta.

## Tabs

`components/ui/tabs.tsx` (Radix)

### Variantes

Uma aparência: aba ativa com borda inferior `--primary` e texto `--foreground`.

### Estados

Padrão, aba ativa, foco e aba desabilitada.

### Quando usar

Para alternar entre visões do mesmo conteúdo dentro de uma página (itens da ementa e
texto extraído).

### Quando não usar

Para seções que são rotas (as abas da turma seguem como `<nav>` de links); para passos em
sequência; com uma aba só.

### Exemplo

```tsx
<Tabs defaultValue="itens">
  <TabsList aria-label="Ementa">
    <TabsTrigger value="itens">Itens</TabsTrigger>
    <TabsTrigger value="texto">Texto extraído</TabsTrigger>
  </TabsList>
  <TabsContent value="itens">…</TabsContent>
</Tabs>
```

### Acessibilidade

`role="tablist"` com nome; setas trocam a aba; `aria-selected` marca a atual; Tab vai da
aba ao painel.

## Sidebar

`components/ui/sidebar.tsx` (shadcn) e `components/shared/app-sidebar.tsx` (o menu do
AppShell)

### Variantes

Expandido e recolhido para ícones (`collapsible="icon"`); abaixo de `md` vira `Sheet`.

### Estados

Item padrão, passar o mouse, foco, ativo (`--primary-subtle` + `--primary-strong`,
`aria-current="page"`) e recolhido (nomes como dica). A escolha fica no cookie
`sidebar_state`.

### Quando usar

Como menu das telas do professor e da administração, dentro do `AppShell`.

### Quando não usar

Na área do aluno (`StudentLayout`); para ações da página (`PageHeader`); com itens de
áreas que ainda não existem ou que o usuário não pode abrir.

### Exemplo

```tsx
<SidebarProvider defaultOpen={defaultOpen}>
  <AppSidebar me={me} />
  <SidebarInset>…</SidebarInset>
</SidebarProvider>
```

### Acessibilidade

`<nav aria-label="Menu principal">`; Ctrl/⌘+B alterna; recolhido, cada item mantém o nome
acessível; mostrar ou esconder itens é só experiência de uso.

## Topbar

`components/layout/topbar.tsx`

### Variantes

Uma aparência: 56 px, `--surface`, borda inferior, camada `--z-sticky`.

### Estados

Com o nome da área (pela rota, `areaFor` em `lib/navigation`) ou sem ele fora das áreas
conhecidas.

### Quando usar

No topo da área principal do `AppShell`, com o botão do menu e o nome da área.

### Quando não usar

Fora do `AppShell` (precisa do `SidebarProvider`); para ações da página (`PageHeader`).

### Exemplo

```tsx
<SidebarInset>
  <Topbar />
  <main id="conteudo">…</main>
</SidebarInset>
```

### Acessibilidade

O botão "Abrir ou fechar o menu" tem nome; a barra é o `banner` da página.

## Breadcrumb

`components/ui/breadcrumb.tsx`

### Variantes

Uma aparência: separador `ChevronRight`, links `--primary`, página atual `--foreground`.

### Estados

Dois ou mais níveis; o último é a página atual, sem link.

### Quando usar

Em páginas abaixo do primeiro nível de uma área (detalhe da turma, nova disciplina),
dentro do `PageHeader`.

### Quando não usar

Na página inicial de uma área; como substituto do menu.

### Exemplo

```tsx
<Breadcrumb items={[{ label: "Turmas", href: "/turmas" }, { label: "ADS3 — Noite" }]} />
```

### Acessibilidade

`<nav aria-label="Trilha">` com lista ordenada; separador `aria-hidden`; página atual com
`aria-current="page"`.

## PageHeader

`components/layout/page-header.tsx`

### Variantes

Só título, ou com trilha, situação, descrição e ações.

### Estados

Só título, completo e largura de tablet (as ações descem para baixo do título abaixo de
`md`).

### Quando usar

No início de toda página interna: é o único `<h1>` da página.

### Quando não usar

Para títulos de seção (`h2`); mais de uma vez na mesma página.

### Exemplo

```tsx
<PageHeader
  breadcrumb={[{ label: "Turmas", href: "/turmas" }, { label: turma.name }]}
  title={turma.name}
  status={<Badge variant="success">Ativa</Badge>}
  actions={<Button>Convidar alunos</Button>}
/>
```

### Acessibilidade

O `<h1>` tem só o título (a situação fica fora dele); a ordem de foco é trilha, ações e
conteúdo.

## AiExecutionStatus

`components/shared/ai/ai-execution-status.tsx` (006, grupo "Inteligência artificial")

### Variantes

Uma por situação da execução, sempre com ícone Lucide e texto:
- Na fila (`Clock`, `neutral`);
- Processando (`Loader`, `info`), para `RUNNING`, `WAITING_TOOL` e `VALIDATING_OUTPUT`;
- Concluída (`CircleCheck`, `success`);
- Falhou (`CircleX`, `danger`);
- Cancelada (`Ban`, `neutral`);
- Tempo esgotado (`TimerOff`, `warning`).

### Estados

"Cancelando…" (`Ban`, `warning`) quando `cancelRequested` e a execução ainda não chegou a
uma situação final; a situação final vence.

### Quando usar

Em toda tela de agente que mostra o andamento de uma execução, e nas listas de execuções.

### Quando não usar

Para situações que não são de uma execução de IA (use `Status` ou `Badge`); com texto
próprio no lugar do rótulo padrão.

### Exemplo

```tsx
<AiExecutionStatus status={execution.status} cancelRequested={execution.cancelRequested} />
```

### Acessibilidade

`role="status"` com `aria-live="polite"`: a troca de situação é anunciada sem mover o foco.
O ícone é `aria-hidden`; o texto é o que conta. O ícone de Processando só gira com
movimento permitido (`motion-safe`).

## AiProposalStatus

`components/shared/ai/ai-proposal-status.tsx` (006, grupo "Inteligência artificial")

### Variantes

Pronta para revisão (`Clock`, `info`), Aprovada (`CircleCheck`, `success`), Aprovada em
parte (`CircleDashed`, `success`), Rejeitada (`CircleX`, `neutral`) e Expirada (`TimerOff`,
`warning`).

### Estados

Estático.

### Quando usar

Para a situação de uma proposta de agente (L2), em listas e na revisão.

### Quando não usar

Para a situação da execução que gerou a proposta (use `AiExecutionStatus`).

### Exemplo

```tsx
<AiProposalStatus status={proposal.status} />
```

### Acessibilidade

`role="status"` com `aria-live="polite"`; ícone `aria-hidden` e situação sempre em texto.

## AiProcessingIndicator

`components/shared/ai/ai-processing-indicator.tsx` (006, grupo "Inteligência artificial")

### Variantes

Uma aparência: ícone `Loader` na cor `--primary` e texto visível em `text-body-sm`.

### Estados

Padrão ("Processando com IA…") e texto próprio (`label`).

### Quando usar

Enquanto a tela espera uma execução de IA que não informa progresso.

### Quando não usar

Com porcentagem ou etapas (a IA não informa progresso; use `Progress` só quando houver um
valor real); para carregamentos comuns de dados (use `Spinner` ou `Skeleton`).

### Exemplo

```tsx
{isRunning ? <AiProcessingIndicator label="Lendo a ementa…" /> : null}
```

### Acessibilidade

`role="status"`, `aria-live="polite"` e `aria-busy="true"`, sem `aria-valuenow`. O ícone só
gira com movimento permitido; o texto fica sempre visível.

## AiErrorState

`components/shared/ai/ai-error-state.tsx` (006, grupo "Inteligência artificial")

### Variantes

Uma: `Alert variant="danger"` com título (o que aconteceu) e orientação (o que o professor
pode fazer), tirados de `AI_ERROR_GUIDANCE` em `lib/messages/error-messages.ts` pelo código
normalizado.

### Estados

Sem nova tentativa, e com o botão "Tentar de novo" quando há `onRetry`.

### Quando usar

Quando uma execução de IA termina com `errorCode`, ou quando o pedido é recusado com um
código `AI_*`.

### Quando não usar

Com texto vindo da API, do provedor ou do modelo; para erros que não são de IA (use `Alert`
com `messageForError`).

### Exemplo

```tsx
<AiErrorState code={execution.errorCode} onRetry={() => request.mutate(input)} />
```

### Acessibilidade

`role="alert"` do `Alert` de perigo; o código nunca aparece no texto; "Tentar de novo" é
um `Button` comum, alcançado por Tab.

## AiProposalReview

`components/shared/ai/ai-proposal-review.tsx` (006, grupo "Inteligência artificial")

### Variantes

Uma base: título "Proposta da IA", a `AiProposalStatus`, a lista de itens (`label` e
`description` opcional) e as ações "Aprovar tudo" (`primary`), "Aprovar selecionados"
(`secondary`) e "Rejeitar" (`danger`).

### Estados

Em revisão (todos os itens marcados; "Aprovar selecionados" só aparece com um subconjunto
próprio marcado), enviando (`pending`: caixas e ações desabilitadas) e decidida (somente
leitura, sem caixas nem ações).

### Quando usar

Como base da revisão de uma proposta L2 na tela de cada agente, que decide com
`useDecideAiProposal`.

### Quando não usar

Para aplicar a proposta ao domínio: aprovar só registra a decisão do professor; a aplicação
é um fluxo do módulo de domínio.

### Exemplo

```tsx
<AiProposalReview
  items={proposal.payload.items}
  status={proposal.status}
  pending={decide.isPending}
  onDecide={(decision, acceptedIds) => decide.mutate({ decision, acceptedIds })}
/>
```

### Acessibilidade

Cada caixa tem `Label` e a descrição ligada por `aria-describedby`. Toda ação abre um
`AlertDialog` que prende o foco e o devolve ao botão. O conteúdo vem de um modelo e é
mostrado só como texto, nunca como HTML.
