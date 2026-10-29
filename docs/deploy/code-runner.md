# Code Runner em produção: o worker, Docker e gVisor

Este guia coloca no ar o Code Runner da spec 019: o botão "Executar" das questões de Código dos
exercícios roda o programa do aluno contra os casos públicos e mostra o resultado de cada caso. Ele
nunca vale pontos nem nota (019/FR-008). Desde a spec 021 o mesmo worker, as mesmas imagens e os mesmos
limites servem também os **trabalhos** aplicados com "Permitir executar o código": nada muda na
instalação, e a capacidade passa a contar os alunos de exercícios e de
trabalhos juntos, já que a fila, a execução pendente por aluno e o limite por minuto são um só.

O código do aluno **nunca** roda na API (constituição IV). Ele roda num processo à parte, o
**worker** (`dist/code-runner/main.js`), que pega os pedidos da tabela `code_runs` e executa cada
etapa (verificação/compilação e depois cada caso público) num contêiner Docker novo e descartável:
sem rede, raiz só leitura, `/tmp` em memória, limites de memória, CPU, processos e tempo, usuário sem
privilégios. Em produção os contêineres rodam no **gVisor** (`runsc`), um kernel em espaço de usuário
entre o programa e o kernel da máquina.

A API não fala com o Docker e não tem o socket dele; ela só grava pedidos e lê resultados. O worker
e a API se comunicam apenas pelo banco (sem Redis, filas ou WebSockets, 019/FR-018).

## 1. Antes de começar

- Uma máquina (ou VM) Linux **só para o worker**, x86-64 ou arm64, com pelo menos 2 vCPUs e 4 GB de
  RAM para `CODE_RUNNER_CONCURRENCY=4` (cada contêiner tem até 256 MB). Não use a máquina da API nem a
  do banco: quem tem o socket do Docker é root nessa máquina.
- Rede de saída dessa máquina só para o PostgreSQL e para o registro de imagens (Docker Hub). Os
  contêineres dos alunos não têm rede nenhuma (`--network none`).
- Node.js 24 e o build da API (`pnpm build`): o worker é o mesmo pacote `apps/api`, iniciado por
  `pnpm --filter api code-runner:start`.
- Acesso ao PostgreSQL como administrador, para criar o papel do worker (seção 4).

## 2. Docker e gVisor na máquina do worker

1. Instale o Docker Engine (pacote oficial da distribuição ou <https://docs.docker.com/engine/install/>).
   O usuário que roda o worker precisa estar no grupo `docker`.
2. Instale o gVisor (<https://gvisor.dev/docs/user_guide/install/>) e registre o runtime:

   ```bash
   sudo runsc install          # escreve "runtimes": { "runsc": … } em /etc/docker/daemon.json
   sudo systemctl restart docker
   ```

3. Confira que o gVisor está mesmo em uso. Dentro do gVisor, o `dmesg` mostra as mensagens do kernel
   do gVisor, não as da máquina:

   ```bash
   docker run --rm --runtime runsc busybox dmesg
   # [    0.000000] Starting gVisor...
   ```

   Se aparecer o log do kernel Linux da máquina (ou um erro de permissão), o `runsc` não está ativo:
   **não** ligue o Code Runner.
4. Confira a rede dos contêineres: `docker run --rm --runtime runsc --network none busybox wget -T 3 -q
   -O- http://example.com` deve falhar.

## 3. Imagens por digest

O worker usa três imagens oficiais, fixadas por digest em `apps/api/src/code-runner/profiles.ts`
(`eclipse-temurin:25-jdk`, `python:3.13-slim`, `node:24-slim`; o digest é o do índice multiarquitetura,
então serve para amd64 e arm64). Baixe-as antes do primeiro uso, para a primeira execução não esperar
o download:

```bash
pnpm --filter api build
pnpm --filter api code-runner:images     # sai com código 1 se alguma imagem falhar
```

Atualizar uma imagem é uma mudança de código (novo digest em `profiles.ts`, testado por
`test:sandbox` no CI), nunca um `docker pull` de uma tag solta na máquina. Rode `code-runner:images`
de novo a cada deploy que mude um digest.

## 4. O papel do worker no PostgreSQL

O worker não usa o usuário da API. Ele se conecta com um papel próprio, que só alcança as tabelas do
Code Runner, os casos de teste da atividade (que ele lê) e a auditoria (onde ele só insere)
(019 research B2). Os gatilhos das tabelas rodam com as permissões de quem escreve, por isso o papel
também lê `code_runs` e `code_run_cases`, que os gatilhos consultam.

```sql
CREATE ROLE devtrack_code_runner LOGIN PASSWORD '<senha forte, guardada no cofre>';
GRANT CONNECT ON DATABASE devtrack TO devtrack_code_runner;
GRANT USAGE ON SCHEMA public TO devtrack_code_runner;

-- A fila: pegar, executar, gravar o resultado e encerrar execuções vencidas.
GRANT SELECT, UPDATE ON code_runs TO devtrack_code_runner;
GRANT SELECT, INSERT ON code_run_cases TO devtrack_code_runner;
-- Os casos públicos da questão, copiados na atividade (012).
GRANT SELECT ON class_activity_test_cases TO devtrack_code_runner;
-- O heartbeat (liveness, versões e limites que o aluno vê).
GRANT SELECT, INSERT, UPDATE, DELETE ON code_runner_heartbeats TO devtrack_code_runner;
-- `code_run.finished`, na mesma transação do resultado.
GRANT INSERT ON audit_events TO devtrack_code_runner;
GRANT USAGE ON SEQUENCE audit_events_id_seq TO devtrack_code_runner;
```

Nada de `INSERT` em `code_runs` (só a API cria pedidos), nem acesso a usuários, sessões, respostas,
notas, pontos ou segredos. As migrações continuam sendo aplicadas pela API (`prisma migrate deploy`),
nunca pelo worker; se uma migração futura criar tabela que o worker precise, ela vem com o seu
`GRANT` neste guia.

## 5. Variáveis

O worker lê o mesmo conjunto de variáveis da API (`apps/api/.env.example`, validado pelo mesmo
esquema), com o `DATABASE_URL` do papel da seção 4. Nenhuma variável chega aos contêineres dos
alunos (`--env-file /dev/null`).

| Variável | Onde | Produção | Significado |
|---|---|---|---|
| `CODE_RUNNER_ENABLED` | API e worker | obrigatória (`true`/`false`) | kill switch (seção 7) |
| `CODE_RUNNER_DOCKER_RUNTIME` | API e worker | `runsc` (obrigatório com o Code Runner ligado) | runtime OCI dos contêineres |
| `DATABASE_URL` | worker | `postgresql://devtrack_code_runner:…@…/devtrack` | o papel restrito |
| `CODE_RUNNER_CONCURRENCY` | worker | 4 | execuções ao mesmo tempo por worker |
| `CODE_RUNNER_POLL_MS` | worker | 500 | intervalo de busca na fila |
| `CODE_RUNNER_LEASE_SECONDS` | worker | 90 | uma execução RUNNING além disso termina `INTERRUPTED` |
| `CODE_RUNNER_TIME_LIMIT_MS` | worker | 2000 | tempo por caso |
| `CODE_RUNNER_COMPILE_LIMIT_MS` | worker | 10000 | verificação/compilação |
| `CODE_RUNNER_MEMORY_MB` | worker | 256 | memória (sem swap) por contêiner |
| `CODE_RUNNER_OUTPUT_LIMIT_BYTES` | worker | 65536 | saída padrão por caso |
| `CODE_RUNNER_PIDS_LIMIT` | worker | 128 | processos por contêiner |
| `RATE_LIMIT_CODE_RUNS_PER_MINUTE` | API | 10 | execuções novas por aluno por minuto |
| `CODE_RUN_QUEUE_DEADLINE_SECONDS` | API | 60 | pedido não iniciado até lá termina `EXPIRED` |
| `CODE_RUNNER_STALE_SECONDS` | API | 15 | heartbeat mais velho que isso = worker fora do ar |
| `CODE_RUN_CONTENT_RETENTION_HOURS` | API | 24 | o job `code-run-content` apaga o conteúdo depois disso |
| `DOCKER_HOST` | worker | (padrão do Docker) | só se o daemon for remoto |

Com `NODE_ENV=production` e `CODE_RUNNER_ENABLED=true`, a configuração recusa iniciar (API e worker)
sem `CODE_RUNNER_DOCKER_RUNTIME=runsc`. Os limites aparecem para o aluno a partir do heartbeat do
worker, então a tela sempre mostra o que o worker de fato aplica.

Para rodar o worker como serviço (systemd), use `WorkingDirectory=…/apps/api`,
`ExecStart=/usr/bin/node --env-file=.env dist/code-runner/main.js`, `Restart=on-failure` e
`KillSignal=SIGTERM` com `TimeoutStopSec=30`: no SIGTERM o worker para de pegar pedidos, espera as
execuções em andamento e apaga o próprio heartbeat.

## 6. Como ler o heartbeat

Cada worker grava, a cada 5 s, uma linha em `code_runner_heartbeats`:

```sql
SELECT worker_id, started_at, last_seen_at, now() - last_seen_at AS idade, executions, limits
FROM code_runner_heartbeats ORDER BY last_seen_at DESC;
```

- `worker_id`: máquina, pid e início do processo.
- `executions`: os perfis que o worker atende agora, com a versão (`[{"key":"python","version":"Python 3.13"}, …]`).
  Lista vazia = o Docker não respondeu ou falta imagem: o worker está vivo, mas não executa nada.
- `limits`: os limites aplicados (`timeMs`, `compileMs`, `memoryMb`, `outputBytes`).
- Uma linha com `idade` acima de `CODE_RUNNER_STALE_SECONDS` (15 s) é um worker fora do ar; a API
  mostra "Execução indisponível no momento" para os perfis que nenhum worker vivo atende. Linhas de
  mais de um dia são apagadas pelo próximo worker que iniciar.

A fila:

```sql
SELECT status, failure_reason, count(*) FROM code_runs
WHERE created_at > now() - interval '1 hour' GROUP BY 1, 2;
```

Muitos `EXPIRED` = workers de menos (aumente `CODE_RUNNER_CONCURRENCY` ou suba outro worker; vários
workers dividem a fila sem pegar a mesma execução). `SANDBOX_ERROR` = o Docker falhou (veja o log do
worker, que traz só códigos, nunca código ou saída de aluno). `INTERRUPTED` = um worker caiu no meio.

## 7. Roteiro de incidente

Algo estranho com execuções (consumo anormal, suspeita de fuga do contêiner, Docker instável):

1. **Pare o worker** (`systemctl stop devtrack-code-runner`, ou `docker`/processo derrubado). Em até
   `CODE_RUNNER_STALE_SECONDS` (15 s) a API vê o heartbeat parado: "Executar" some, a questão mostra
   "Execução indisponível no momento" e todo o resto do exercício funciona como na 013 (responder,
   salvar, concluir, correção, ranking); num trabalho, responder, salvar, modo controlado, ajuda da IA,
   chamada e pausa, entregar, corrigir e liberar seguem iguais (021/SC-007). Pedidos que estavam na fila terminam `EXPIRED` e os que
   estavam rodando terminam `INTERRUPTED`, sem intervenção. Nenhuma mudança na API.
2. **Desligue de vez**: `CODE_RUNNER_ENABLED=false` na API e no worker e reinicie os dois. Os pedidos
   na fila terminam `DISABLED` no próximo acesso, e um pedido novo recebe `409 CODE_RUNNER_UNAVAILABLE`.
   Não precisa de nova versão (019/FR-016).
3. Na máquina do worker, remova contêineres que tenham sobrado:
   `docker rm -f $(docker ps -aq --filter label=devtrack.code-run)` (o worker faz isso ao iniciar e
   depois de cada execução).
4. Investigue com os registros: `audit_events` (`code_run.requested`, `code_run.finished`,
   `code_run.rate_limited`: ids, enums, contagens e durações) e o log do worker. O código e as saídas
   só ficam no banco por até 24 h e nunca vão para logs ou auditoria.
5. Para voltar: confira o gVisor (seção 2, passo 3) e as imagens (seção 3), religue
   `CODE_RUNNER_ENABLED=true` e inicie o worker; o heartbeat volta e "Executar" reaparece.

## 8. Retenção

O job de manutenção `code-run-content` (dentro da API, a cada `MAINTENANCE_INTERVAL_SECONDS`, ou
`pnpm --filter api maintenance:run --job code-run-content`) apaga o código, a mensagem do compilador
e as saídas de cada execução que terminou há mais de 23 h (24 h menos o intervalo da manutenção),
então nenhum conteúdo passa de 24 h (019/FR-019). Ficam só a situação, os vereditos, as contagens e
os tempos.

## 9. Verificação depois do deploy

1. Heartbeat (seção 6) com os três perfis e `idade` abaixo de 5 s.
2. Como professor, um exercício de Código em Python com dois casos públicos e um privado, aplicado a
   uma turma de teste; como aluno, "Executar" com `print(int(input()) * 2)` → "2 de 2 casos públicos
   passaram" em poucos segundos; `while True: pass` → "Tempo esgotado".
3. Num trabalho com uma questão de Código em Python e os mesmos casos, aplicado com "Permitir executar
   o código": como aluno, "Executar" → "2 de 2 casos públicos passaram"; depois de entregar, como
   professor, a correção mostra "1 execução" e os vereditos da última, sem código nem saída.
4. Pare o worker: em até 15 s a questão mostra "Execução indisponível no momento". Inicie de novo.
