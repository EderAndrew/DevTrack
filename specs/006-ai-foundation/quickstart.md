# Quickstart: 006 — AI Foundation

Roteiro para validar a feature depois da implementação. Ambiente: o mesmo da 004
(`specs/004-syllabus-planning/quickstart.md`). Não há agente de domínio nem provedor real:
em produção e no `pnpm dev` o registro fica vazio, e os fluxos de execução são validados
pelos testes automatizados com o agente de referência e o provedor simulado
(`apps/api/test/fixtures/ai/`).

## 1. Subir e migrar

```bash
docker compose up -d postgres postgres-test mailpit
pnpm install && pnpm build
pnpm --filter api prisma migrate deploy      # 15 tabelas ai_*, triggers, permissões ia.*
pnpm dev                                     # web :3000, API :4000
```

Esperado:
- migração aplicada;
- no log da API, um `ai_registry.synced` com `agents: 0`;
- nenhuma variável de credencial de provedor pedida no `.env`.

## 2. Operação de IA (US7)

Entre como administrador → menu "Operação de IA" (`/admin/ia`). Esperado:
- as seções Saúde, Indicadores, Uso e custo, Agentes e Configurações de modelo, com os
  estados vazios ("Nenhum agente registrado…");
- o `Select` de período e "Verificar de novo" operáveis só pelo teclado.

Entre como professor → o item não aparece e `/admin/ia` mostra "sem acesso". Confira com
curl:

```bash
curl -s -o /dev/null -w '%{http_code}\n' -b "<cookie do professor>" http://localhost:3000/api/ai/operations/health   # 403
```

## 3. Execução, isolamento, ferramentas e saída (US1–US4, US6)

```bash
pnpm --filter api test -- test/integration/006-us1-executions.spec.ts
pnpm --filter api test -- test/integration/006-us2-isolation.spec.ts
pnpm --filter api test -- test/integration/006-us3-tools.spec.ts
pnpm --filter api test -- test/integration/006-us4-structured-output.spec.ts
pnpm --filter api test -- test/integration/006-us6-limits.spec.ts
```

Esperado:
- o pedido responde 202 "na fila" em < 1 s, mesmo com o provedor programado para demorar
  (SC-006);
- `runOnce` leva a execução a `COMPLETED`, com as transições gravadas;
- a matriz A × B × administrador dá 404/403 sem conteúdo;
- as ferramentas fora da lista, com argumentos inválidos ou sobre recurso de outra área
  são negadas antes de ler dados;
- as saídas inválidas terminam em falha controlada, sem proposta;
- os dez cenários de resiliência terminam em estado final com código normalizado.

## 4. Propostas (US5)

```bash
pnpm --filter api test -- test/integration/006-us5-proposals.spec.ts test/security/006-ai-concurrency.spec.ts
```

Esperado:
- uma execução L2 gera uma proposta "pronta para revisão";
- aprovar, aprovar em parte e rejeitar gravam autor e data;
- repetir a mesma decisão devolve 200, e uma decisão diferente devolve 409;
- decisões concorrentes têm um só vencedor;
- a proposta vence em 30 dias (relógio controlado);
- nenhuma tabela de domínio muda.

## 5. Versões (US8) e fronteira (FR-001)

```bash
pnpm --filter api test -- test/integration/006-us8-versioning.spec.ts test/security/006-ai-boundary.spec.ts
pnpm lint
```

Esperado:
- trocar a configuração de modelo não muda a definição do agente;
- uma execução antiga continua com as instruções v1;
- mudar o texto de uma versão já usada faz a inicialização falhar;
- um agente L3 é recusado;
- o lint falha numa amostra de `modules/subjects` que importa `openai`.

## 6. Componentes de estado (US9)

`pnpm --filter web dev` → `http://localhost:3000/design-system#ai-execution-status`: grupo
"Inteligência artificial" com os estados de execução e proposta, o indicador, o erro por
código e a revisão de proposta (aprovar, aprovar selecionados, rejeitar, com confirmação),
todos operáveis pelo teclado.

## 7. Suíte completa

```bash
pnpm lint && pnpm check-types && pnpm build && pnpm test
pnpm --filter web test:e2e      # inclui e2e/ai-operations.spec.ts
```

Esperado:
- tudo verde, inclusive as guardas ampliadas (domínio, auditoria, segredos com os
  marcadores de conteúdo e credencial falsa, catálogo de endpoints, rastreabilidade com
  006);
- os testes da 001–005 sem mudança (SC-013);
- nenhuma chamada a provedor real (SC-011).
