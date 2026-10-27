# `@repo/eslint-config`

Configurações de ESLint (flat config) compartilhadas pelos workspaces.

| Arquivo | Export | Uso |
|---------|--------|-----|
| `base.js` | `config` | regras de JavaScript, `eslint-config-prettier`, `eslint-plugin-turbo` e `eslint-plugin-only-warn` |
| `next.js` | `nextJsConfig` | a base mais React Hooks e as regras do Next.js (`recommended` e `core-web-vitals`), usada por `apps/web` |
| `react-internal.js` | `config` | a base para bibliotecas React internas |

Com `eslint-plugin-only-warn`, toda regra aparece como aviso; quem reprova a execução é o
`--max-warnings 0` dos scripts `lint`. As regras próprias de cada app (camadas do web, controllers
sem Prisma na API) ficam no `eslint.config.js` do app.
