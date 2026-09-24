# Quickstart: 005 — Design System e Identidade Visual

Roteiro de validação depois da implementação. Pré-requisitos do `README.md` (banco,
Mailpit, `.env`, `pnpm install`, `pnpm build`, migrações, um professor e um aluno de teste).

## §1. Verificações automáticas

```bash
pnpm lint && pnpm check-types && pnpm build && pnpm test
pnpm --filter web test -- test/contrast.test.ts test/design-system
pnpm --filter web test:e2e      # jornadas existentes, sem ajuste de comportamento
```

Esperado: tudo verde; `token-usage` sem ocorrências fora de `design-system/exceptions.md`;
contraste AA em todos os pares nos dois temas (SC-001 – SC-006).

## §2. Guarda contra valores arbitrários (US7)

Num arquivo qualquer de `features/`, acrescente temporariamente `className="text-[13px]
bg-red-500 p-3.5"` e `import { FaBeer } from "react-icons/fa"`; rode
`pnpm --filter web test -- test/design-system/token-usage.test.ts` e `pnpm --filter web lint`:
os dois falham apontando arquivo e linha. Desfaça a alteração.

## §3. Catálogo (US2, US4)

```bash
pnpm --filter web dev
```

Abra <http://localhost:3000/design-system>. Percorra todos os grupos só com o teclado:
foco visível em cada controle; cada componente com variantes, estados, erro, carregando,
desabilitado e a faixa de tablet. Em `pnpm --filter web build && pnpm --filter web start`,
a mesma URL responde 404.

## §4. Identidade nas telas existentes (US1, US3)

Entre como professor: "Minhas disciplinas" → disciplina → ementa → turma → calendário →
planejamento. Conferir:
- fonte Inter; títulos na escala; fundo `#F8FAFC`, superfícies brancas, azul só em ação
  principal, seleção e foco;
- `Topbar` com o nome da área; `PageHeader` com trilha, título e ações; menu recolhível
  para ícones (Ctrl/⌘+B) e lembrado ao recarregar;
- tema escuro do sistema operacional: a mesma tela continua legível;
- zoom de 200%: nada cortado; em 768 px o menu vira painel;
- SC-008: no DevTools, bloqueie `/_next/static/media/*.woff2` (Network → Block request URL)
  e recarregue: o texto aparece na fonte substituta sem período invisível; libere e
  recarregue: a troca para a Inter não desloca o layout de forma perceptível.

Entre como gestor e como administrador: só as áreas permitidas no menu.

## §5. Aluno (US5)

Entre como aluno: "Minhas turmas" e "Meu perfil" no layout do aluno, sem menu lateral nem
itens administrativos. Entre como professor que também é aluno: "Minhas turmas" no layout
do aluno, as demais telas no AppShell, o perfil no AppShell.

## §6. Documentação e contrato do modo avaliação (US4, US6)

Leia `apps/web/design-system/`: princípios, tokens, componentes (quando usar e quando
não usar), layouts, exceções e `exam-mode.md`, que traz para cada componente de avaliação
regiões, estados, textos, anúncios e tokens, sem decisão em aberto (SC-007). Monte uma tela
de exemplo só com componentes e tokens (SC-009).

## §7. Movimento reduzido

Ative "reduzir movimento" no sistema: diálogos, menu e esqueletos sem animação (SC-010).
