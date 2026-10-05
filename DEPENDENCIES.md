# Dependências — auditoria do monorepo

Registro exigido pela Constituição (I — *Software Supply Chain Failures*; seção
**Dependências**). Criado na fase 001 (T110) em `apps/api/`; desde a fase 002 (T087) fica na
raiz e cobre as dependências diretas de `apps/api`, `apps/web` e `packages/contracts`. Refazer a
cada dependência nova ou atualização de versão maior.

Última verificação: **2026-10-04** (fase 014, T001), Node 24.12, pnpm 11.25, lockfile do
commit desta tarefa.

## 1. Vulnerabilidades — `pnpm audit --prod --audit-level high`

**Resultado: `No known vulnerabilities found`** (0 altas/críticas), na fase 001, de novo na
fase 002 depois das dependências novas da seção 5 e na fase 004 depois das da seção 6 (T001) e
ao fim da fase (T087).

Na fase 001, a primeira execução apontou 8 achados (6 high, 1 moderate, 1 low), todos em dependências
**transitivas**. Nenhuma dependência direta era vulnerável. Foram corrigidos com `overrides` em
`pnpm-workspace.yaml`, sem trocar versões maiores das dependências diretas:

| Pacote | De → para | Trazido por | Avisos | Exposição antes da correção |
|--------|-----------|-------------|--------|------------------------------|
| `multer` | 2.2.0 → 2.4.x | `@nestjs/platform-express` 11.2.5 (último 11.x) | GHSA-wc9g-mqfw-jrwm, GHSA-535w-7cp7-47q4, GHSA-qfvm-cv95-jqjf (high); GHSA-qvfw-j98x-7q72 (low) | Nenhuma rota usava `FileInterceptor`/multipart na fase 001. Desde a fase 004, o envio de ementa usa o multer (já na 2.4.x corrigida) só nas rotas `@AcceptsMultipart()`, com limites de tamanho, uma parte e nenhum campo extra (E5) |
| `nanoid` | 3.3.17 → 3.3.19 | `next` → `postcss` | GHSA-2v37-7h3g-55p8 (high) | Uso interno do PostCSS no build do web |
| `mysql2` | 3.15.3 → 3.24.x | `prisma` (CLI) | GHSA-3f6p-5ww8-9rcr (high), GHSA-rgwj-5xj2-c3m3 (moderate) | O projeto usa só PostgreSQL; o driver MySQL nunca é carregado |
| `deepmerge-ts` | 7.1.5 → 8.x | `@prisma/config` (CLI) | GHSA-ggr8-5vv4-36mx (high) | Só a CLI do Prisma, mesclando a configuração do próprio repositório |

`deepmerge-ts` 8 é uma versão maior acima da que o `@prisma/config` fixa (7.1.5). Foi validado
com `prisma generate`, `prisma validate`, `prisma migrate status`/`deploy` e a suíte completa
da API. **Remover o override** quando o Prisma passar a depender de `deepmerge-ts` ≥ 8. Os
outros overrides podem sair quando `@nestjs/platform-express`, `next` e `prisma` trouxerem as
versões corrigidas.

## 2. Licenças — `pnpm licenses list --prod`

Allowlist: MIT, ISC, Apache-2.0, BSD-2-Clause, BSD-3-Clause, 0BSD, BlueOak-1.0.0.

Fase 004: 409 pacotes de produção (331 MIT, 32 Apache-2.0, os demais iguais aos da fase 002).
As 15 entradas novas são todas MIT, exceto `pdfjs-dist` (Apache-2.0); a tabela de exceções
abaixo não mudou (seção 6).

Fase 002: 394 pacotes de produção: 317 MIT, 31 ISC, 31 Apache-2.0, 5 BSD-3-Clause,
1 BSD-2-Clause, 1 0BSD, 1 BlueOak-1.0.0 e os 7 da tabela abaixo (na fase 001 eram 317). Todas
as dependências **diretas** estão na allowlist, exceto `nodemailer` (MIT-0, mais permissiva que
MIT). As dependências novas da fase 002 não trouxeram nenhuma licença fora da allowlist: a
tabela abaixo é a mesma da fase 001.

Fora da allowlist, todos **transitivos**:

| Licença | Pacote | Trazido por | Avaliação |
|---------|--------|-------------|-----------|
| MIT-0 | `nodemailer` (direta) | `apps/api` (R11) | Permissiva, sem exigência de atribuição. Recomendo incluir MIT-0 na allowlist |
| LGPL-3.0-or-later | `@img/sharp-libvips-*` | `next` → `sharp` (otimização de imagens) | Binário pré-compilado, não modificado e carregado dinamicamente; a LGPL não se estende ao código do DevTrack. O web não usa `next/image` hoje |
| CC-BY-4.0 | `caniuse-lite` | `next` → `browserslist` | Dados de compatibilidade de navegadores usados no build; atribuição preservada no pacote |
| EPL-2.0 | `elkjs` | `prisma` → `@prisma/studio-core` | Só no Prisma Studio (ferramenta de desenvolvimento da CLI); não é carregado pela API |
| MIT AND ISC | `@visx/vendor` | `prisma` → `@prisma/studio-core` | Ambas permissivas; só no Prisma Studio |
| Unlicense | `robust-predicates` | `prisma` → `@prisma/studio-core` | Domínio público; só no Prisma Studio |
| Unlicense | `postgres` | `prisma` (CLI, servidor de dev `prisma dev`) | Domínio público; a API usa `pg` + `@prisma/adapter-pg` |

**Pendente de decisão do mantenedor:** aceitar essas exceções, sendo que nenhuma exige
alterar ou abrir o código do DevTrack, ou ajustar a allowlist (MIT-0, Unlicense e CC-BY-4.0
são permissivas). O `pnpm licenses list --prod` conta a CLI do Prisma como produção porque
`@prisma/client` declara `prisma` como *peer dependency*.

## 3. Dependências diretas — `apps/api`

| Pacote | Licença | Por quê | Decisão |
|--------|---------|---------|---------|
| `@nestjs/common`, `@nestjs/core`, `@nestjs/platform-express` | MIT | Framework HTTP modular com guards globais (pipeline de autorização) | R2 |
| `reflect-metadata`, `rxjs` | Apache-2.0 | Dependências de pares obrigatórias do NestJS (decorators e interceptors) | R2 |
| `@prisma/client`, `@prisma/adapter-pg`, `pg` | Apache-2.0 / MIT | Acesso tipado ao PostgreSQL; `pg` é o driver usado pelo adapter e pelos locks consultivos | R3 |
| `argon2` | MIT | Hash de senha Argon2id (parâmetros OWASP) | R4 |
| `cookie-parser` | MIT | Leitura do cookie de sessão `__Host-devtrack_session` | R5 |
| `zod` | MIT | Validação de entrada (`ZodValidationPipe`) e da configuração no startup | R10, R13 |
| `nodemailer` | MIT-0 | Envio SMTP; Mailpit em desenvolvimento | R11 |
| `pino`, `pino-http`, `nestjs-pino` | MIT | Logs estruturados com redação de segredos e `requestId` | R12 |

Desenvolvimento: `prisma` (CLI de migrations e geração do client — R3); `@swc/core`,
`@swc/cli`, `chokidar` (build com SWC e modo watch do `swc -w` — R1); `typescript`
(type-check `tsc --noEmit` — R1); `vitest`, `unplugin-swc`, `@nestjs/testing`, `supertest`
(testes contra PostgreSQL real — R17); `eslint`, `globals`, `@repo/eslint-config`,
`@repo/typescript-config` (lint e configurações compartilhadas); `@types/*` (tipos).

## 4. Dependências diretas — `apps/web`

| Pacote | Licença | Por quê | Decisão |
|--------|---------|---------|---------|
| `next` | MIT | App Router, rewrite same-origin `/api/*` e `proxy.ts` | R6, R18 |
| `react`, `react-dom` | MIT | Base do Next.js | R18 |

Desenvolvimento: `vitest`, `jsdom`, `@testing-library/react`, `@testing-library/dom`,
`@testing-library/user-event` (testes de componentes e de teclado — R17, R22); `vitest-axe`
(verificação automatizada de WCAG 2.2 AA — R22); `eslint`, `typescript`, `@types/*`,
`@repo/*`.

Na fase 001 nenhuma dependência foi adicionada além das previstas no plano. As
correções de T108 (`postinstall` com `prisma generate`; `.env` carregado com
`process.loadEnvFile` no `prisma.config.ts`) usam só ferramentas já presentes.

## 5. Dependências novas — fase 002 (`specs/002-stack-alignment`, S17)

Cada uma corresponde a uma linha da tabela de stack da Constituição ou é exigida pelos
componentes shadcn. Licenças conferidas no `pnpm licenses list --prod` (produção) e no
`package.json` de cada pacote (desenvolvimento).

| Pacote | Onde | Tipo | Licença | Por quê |
|--------|------|------|---------|---------|
| `zod` (catálogo do pnpm) | contracts, web | prod | MIT | Schemas do contrato; uma só versão no workspace (XXVI, S2) |
| `@repo/contracts` | api, web | prod (workspace) | — | Contratos API↔web compartilhados (XXVI) |
| `@tanstack/react-query` | web | prod | MIT | Server state (stack oficial) |
| `react-hook-form` | web | prod | MIT | Formulários (stack oficial) |
| `@hookform/resolvers` | web | prod | MIT | Integra React Hook Form e Zod |
| `lucide-react` | web | prod | ISC | Ícones (stack oficial) |
| `radix-ui` | web | prod | MIT | Primitivas usadas pelos componentes shadcn |
| `class-variance-authority` | web | prod | Apache-2.0 | Variantes dos componentes shadcn |
| `clsx`, `tailwind-merge` | web | prod | MIT | Utilitário `cn()` do shadcn |
| `tailwindcss`, `@tailwindcss/postcss` | web | dev | MIT | Estilos (stack oficial) |
| `@playwright/test` | web | dev | Apache-2.0 | E2E no navegador (stack oficial) |

Removido: `@repo/ui` (e o diretório `packages/ui`), o pacote de exemplo do template do
Turborepo, que o web não usava. A CLI `shadcn` roda por `pnpm dlx` com versão fixa e não entra
em nenhum `package.json`. `packages/contracts` não tem outras dependências de produção além de
`zod`.

## 6. Dependências novas — fase 004 (`specs/004-syllabus-planning`, E9)

Leitura de ementas enviadas em PDF e DOCX e o calendário de aulas. Instaladas com versão exata
(`pnpm add -E`). `pnpm audit --prod --audit-level high`: nenhum achado.

| Pacote | Onde | Versão | Licença | Para quê | Alternativa descartada |
|--------|------|--------|---------|----------|------------------------|
| `pdfjs-dist` (build `legacy`) | api | 6.3.289 | Apache-2.0 | Texto com posição, número de páginas e detecção de PDF criptografado. Exige ≥ 4.2.67, que corrige a CVE-2024-4367 (execução de código por fonte maliciosa); roda com `isEvalSupported: false` num worker thread (E8) | `pdf-parse` (sem manutenção, sem posição do texto); `unpdf` (embrulha o próprio pdfjs) |
| `fflate` | api | 0.8.3 | MIT | Descompactar o DOCX com limite por entrada e contagem durante a descompressão (zip bomb); também gera as amostras de teste | `jszip` (sem controle da descompressão progressiva); `mammoth` (desempacota sem os nossos limites e traz jszip + xmldom) |
| `fast-xml-parser` | api | 5.11.1 | MIT | Ler `word/document.xml` e `numbering.xml` com `processEntities: false` e sem DTD | analisador manual de XML (frágil); `@xmldom/xmldom` (DOM completo desnecessário) |
| `react-day-picker` | web | 10.0.1 | MIT | Base do componente `Calendar` do shadcn/ui (seleção de várias datas, grade navegável por teclado com ARIA) | calendário próprio (reimplementar navegação por teclado e ARIA de grade) |

Transitivas novas, todas MIT: `fast-xml-parser` traz `@nodable/entities`, `fast-xml-builder`,
`is-unsafe`, `path-expression-matcher`, `strnum` e `xml-naming`; `react-day-picker` traz
`date-fns` (que também fornece o locale pt-BR) e `@date-fns/tz`. `pdfjs-dist` declara
`@napi-rs/canvas` (com o binário nativo da plataforma, por exemplo
`@napi-rs/canvas-darwin-arm64`) como dependência **opcional**: serve para desenhar páginas, o
que a API não faz (só extrai texto). O componente `Calendar` do shadcn lista `date-fns` como
dependência, mas o código não o importa diretamente, então ele não entrou no `package.json` do
web.

`fflate` também gera as amostras de `apps/api/test/fixtures/syllabus/`. O `protegido.pdf` de lá
foi criptografado uma única vez com o pikepdf num ambiente virtual temporário, que não é
dependência do projeto (README da pasta).

## 7. Fontes — fase 005 (`specs/005-design-system`, V5)

Nenhuma dependência npm nova. As fontes são arquivos locais, carregados com `next/font/local`
em `apps/web/app/layout.tsx` (`display: swap`; só a Inter é pré-carregada). A Geist, que vinha
do template, foi removida.

| Fonte | Arquivos (`apps/web/app/fonts`) | Licença | Origem | Uso |
|-------|---------------------------------|---------|--------|-----|
| Inter (variável, 100–900) | `inter-latin-wght-normal.woff2`, `inter-latin-ext-wght-normal.woff2` | SIL OFL 1.1 | Fontsource 5.3.0 | texto (`font-sans`) |
| JetBrains Mono (variável, 100–800) | `jetbrains-mono-latin-wght-normal.woff2`, `jetbrains-mono-latin-ext-wght-normal.woff2` | SIL OFL 1.1 | Fontsource 5.3.0 | código, saída e console (`font-mono`) |

A licença acompanha os arquivos em `apps/web/app/fonts/OFL.txt`. Para atualizar, baixe os
subconjuntos `latin` e `latin-ext` de peso variável do Fontsource e substitua os arquivos com
os mesmos nomes.

## 8. IA — fase 006 (`specs/006-ai-foundation`, A12, A15)

Nenhuma dependência npm nova e nenhum SDK de provedor de modelos. O gateway fala com a
interface `ModelProvider` (`apps/api/src/modules/ai/definitions/types.ts`), e os testes usam
só o provedor simulado de `apps/api/test/fixtures/ai`. O primeiro provedor real entra com a
própria spec, em `apps/api/src/modules/ai/gateway/providers/`. É o único lugar onde o ESLint
e `test/security/006-ai-boundary.spec.ts` aceitam importar um SDK de provedor (`openai`,
`@anthropic-ai/*`, `@google/genai` e afins). A dependência ganha então uma linha nesta tabela,
com versão exata, licença e alternativa descartada.

## 9. Provedor de IA — fase 007 (`specs/007-curriculum-agent`, C2), removido na 008

A fase 007 instalou `@anthropic-ai/sdk` (0.128.0, MIT) em `apps/api` como primeiro provedor
real, com as transitivas `json-schema-to-ts`, `ts-algebra`, `standardwebhooks`,
`@stablelib/base64`, `@babel/runtime` e `fast-sha256`. A fase 008 o removeu (seção 10).

## 10. OpenRouter — fase 008 (`specs/008-ai-gateway-openrouter`, G10, G15)

Nenhuma dependência nova, e `@anthropic-ai/sdk` saiu com as suas transitivas (a exceção
Unlicense de `fast-sha256` na seção 2 deixou de existir). O OpenRouter é o único provedor real
e é chamado pelo `fetch` nativo do Node em
`apps/api/src/modules/ai/gateway/providers/openrouter.provider.ts`. A clarificação da spec
decidiu remover o provedor direto da Anthropic, que ficaria como código morto sob uma exceção
da fronteira, e sem ele a superfície de ataque diminui (constituição IX).

Alternativas descartadas: o SDK `openai` apontado para o OpenRouter (dependência, retries
próprios, e a fronteira o trata como SDK de provedor) e os SDKs `@openrouter/*` (idem).

Regra de fronteira (006 A15): continua valendo para qualquer SDK futuro. `@anthropic-ai/*`
segue na lista proibida do ESLint de `apps/api`, e `test/security/006-ai-boundary.spec.ts`
exige que nem a API nem o web dependam de SDK de provedor. O provedor só é registrado quando
`OPENROUTER_API_KEY` está definida; sem a chave, a IA fica indisponível sem impedir o startup.

## 11. Editor e realce de código — fase 014 (`specs/014-code-syntax-highlighting`, L1, L11)

O editor das questões de Código e o realce de leitura. A spec 005 deixou a escolha da biblioteca
para uma spec; a 014 a fez (L1). Instaladas com versão exata (`pnpm --filter web add -E`), todas
**MIT**, todas em `apps/web`, carregadas só por `import()` dinâmico em
`components/ui/code/load-*.ts` (regra ESLint de L6): as telas sem código não baixam nada delas
(SC-007).

| Pacote | Versão | Para quê | Por que não é trivial |
|--------|--------|----------|-----------------------|
| `@codemirror/state` | 6.7.6 | Documento, seleção e transações do editor | Modelo de edição com histórico e normalização de quebras de linha |
| `@codemirror/view` | 6.43.13 | O editor sobre `contenteditable`: teclado, toque, IME, teclado virtual, `contentAttributes` (ARIA) | Edição acessível em celular e desktop sem `textarea` sobreposto |
| `@codemirror/language` | 6.12.4 | Liga a gramática ao editor e aplica o `HighlightStyle` | Análise incremental enquanto se digita (≤ 50 ms por tecla, SC-004) |
| `@codemirror/commands` | 6.11.1 | `history()` e `insertNewline` (desfazer/refazer, Enter sem indentar) | Histórico de desfazer agrupado por transação |
| `@lezer/highlight` | 1.2.5 | Tags de sintaxe, `tagHighlighter` → classes `text-syntax-*`, `highlightTree` para a leitura (L4, L5) | Liga a árvore da gramática aos tokens do design system sem tema da biblioteca |
| `@codemirror/lang-java` | 6.0.2 | Gramática `java` | Parser Lezer da linguagem |
| `@codemirror/lang-python` | 6.2.1 | Gramática `python` | idem |
| `@codemirror/lang-javascript` | 6.2.5 | Gramáticas `javascript` e `typescript` | idem |
| `@codemirror/lang-cpp` | 6.0.3 | Gramática `cpp` (C e C++) | idem |
| `@codemirror/lang-php` | 6.0.2 | Gramática `php` | idem |
| `@codemirror/lang-rust` | 6.0.2 | Gramática `rust` | idem |
| `@codemirror/lang-go` | 6.0.1 | Gramática `go` | idem |
| `@codemirror/lang-html` | 6.4.12 | Gramática `html` (HTML com CSS e JS embutidos) | idem |

Transitivas novas, todas MIT: `@lezer/common`, `@lezer/lr`, os parsers `@lezer/{java,python,
javascript,cpp,php,rust,go,html,css}`, `@codemirror/lang-css` (CSS dentro do HTML),
`@codemirror/autocomplete` e `@codemirror/lint` (dependências declaradas das gramáticas; o editor
não liga autocompletar nem lint, L2), `crelt`, `style-mod` e `w3c-keyname`.

Tamanho, medido com o rolldown do workspace (minificado / gzip), só nas telas com código: o núcleo
(`state`, `view`, `language`, `commands`, `highlight`) até 290 KB / 92 KB; cada gramática soma de
66 KB / 24 KB (Go, Java) a 274 KB / 95 KB (PHP, que embute HTML, CSS e JS), e só a gramática da
questão aberta é baixada. A medida final das rotas fica em research L12 (T026).

`pnpm audit --prod --audit-level high`: a primeira execução apontou **1 crítica já existente**,
fora das dependências novas: `next` 16.3.4, GHSA-vcvr-r3jv-pc5j (execução remota de código em
`next/og` `ImageResponse`, vulneráveis `>=16.2.0 <16.3.6`; o web não usa `next/og`). Corrigida
subindo `next` para **16.3.6** (patch) e `@next/eslint-plugin-next` para a mesma versão em
`packages/eslint-config`. Depois: `No known vulnerabilities found`.

Alternativas descartadas (L1): Monaco (pesado, fraco no celular, tema próprio); textarea com
camada colorida (react-simple-code-editor + Prism/highlight.js: HTML por
`dangerouslySetInnerHTML`, proibido pela 012/FR-035); Shiki (gramáticas TextMate + WASM, saída
em HTML); CodeMirror 5 (sem manutenção).
