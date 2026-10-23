# Beta na VPS da Hostinger (KVM 2): nginx, PM2 e PostgreSQL 17

Este guia sobe o DevTrack em `https://devtrack.nativcode.com.br` numa VPS que já serve outros sites
com nginx e PM2. Os arquivos citados estão em `deploy/hostinger/`.

```
Internet ──443──▶ nginx (certbot) ──▶ web 127.0.0.1:3010 ──/api/*──▶ API 127.0.0.1:4010
                                                                        │
                                              PostgreSQL 17 (Docker) 127.0.0.1:5433
```

- Só o nginx fica exposto. Web, API e banco escutam em `127.0.0.1`.
- O PostgreSQL 16 do sistema, usado pelos outros sites, não é tocado: o DevTrack usa o seu próprio 17 em
  Docker.
- O DevTrack roda com um usuário `devtrack`, com um PM2 próprio, separado dos apps do root.
- O Code Runner fica **desligado** (`CODE_RUNNER_ENABLED=false`): o worker mexe no Docker como root e
  pede uma máquina só para ele (`docs/deploy/code-runner.md`). O "Executar" aparece como indisponível.

## 1. Antes de começar

- **DNS**: um registro `A` de `devtrack` em `nativcode.com.br` com o IP da VPS. Confira com
  `dig +short devtrack.nativcode.com.br`.
- **E-mail**: a conta e o domínio de envio no Resend (`docs/deploy/email.md`, seção 2). Sem isso a API
  não inicia em produção.
- **Firewall**: só 22, 80 e 443 abertos.

  ```bash
  sudo ufw allow OpenSSH && sudo ufw allow 'Nginx Full' && sudo ufw enable && sudo ufw status verbose
  ```

## 2. Swap (root)

O `next build` passa de 1 GB de memória no pico. Sem swap, esse pico pode derrubar processos:

```bash
fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile
echo '/swapfile none swap sw 0 0' >> /etc/fstab
free -h
```

## 3. Usuário `devtrack` com Node 24, pnpm e PM2

```bash
adduser --disabled-password --gecos '' devtrack
sudo -iu devtrack
```

Como `devtrack`:

```bash
curl -fsSL https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.3/install.sh | bash
source ~/.bashrc
nvm install 24
corepack enable
npm install -g pm2
node -v && pnpm -v && pm2 -v
```

## 4. Código (como `devtrack`)

O repositório é privado. Crie uma chave só de leitura para esta VPS:

```bash
ssh-keygen -t ed25519 -N '' -f ~/.ssh/github_devtrack -C devtrack-vps
printf 'Host github.com\n  IdentityFile ~/.ssh/github_devtrack\n  IdentitiesOnly yes\n' >> ~/.ssh/config
cat ~/.ssh/github_devtrack.pub
```

No GitHub, abra **DevTrack → Settings → Deploy keys → Add deploy key**, cole a chave e deixe
**Allow write access** desmarcado. Depois clone o repositório:

```bash
git clone git@github.com:EderAndrew/DevTrack.git ~/devtrack
```

## 5. PostgreSQL 17 (root)

```bash
cd /home/devtrack/devtrack/deploy/hostinger
cp db.env.example db.env && chmod 600 db.env
sed -i "s|<gerar>|$(openssl rand -hex 24)|" db.env
docker compose -f docker-compose.db.yml --env-file db.env up -d
docker compose -f docker-compose.db.yml --env-file db.env ps      # STATUS "healthy"
grep POSTGRES_PASSWORD db.env                                     # a senha vai no DATABASE_URL (passo 6)
```

## 6. Variáveis (como `devtrack`)

```bash
cd ~/devtrack
cp deploy/hostinger/api.env.example apps/api/.env
cp deploy/hostinger/web.env.example apps/web/.env.production.local
chmod 600 apps/api/.env
sed -i "s|APP_HMAC_SECRET=<gerar>|APP_HMAC_SECRET=$(openssl rand -base64 48 | tr -d '\n')|" apps/api/.env
nano apps/api/.env
```

No `nano`, preencha:

- `<POSTGRES_PASSWORD>` no `DATABASE_URL`;
- a chave do Resend no `SMTP_URL`;
- `MAIL_FROM` com o domínio que você verificou no Resend;
- `MAIL_NOTICE_SECRET`: o `whsec_…` do webhook (seção 10). A API exige o formato do Resend (`whsec_` e uma
  chave base64 de ao menos 16 bytes) e não sobe com um texto qualquer. Se o webhook ainda não existe, gere um
  provisório válido e troque-o na seção 10:
  `sed -i "s|^MAIL_NOTICE_SECRET=.*|MAIL_NOTICE_SECRET=whsec_$(openssl rand -base64 24)|" apps/api/.env`;
- `OPENROUTER_API_KEY`, se quiser IA.

Se faltar alguma variável, ou se alguma estiver errada, a API se recusa a iniciar e lista só os **nomes**
das variáveis com problema.

## 7. Build, migrations e processos (como `devtrack`)

```bash
cd ~/devtrack
pnpm install --frozen-lockfile
pnpm build
pnpm --filter api prisma migrate deploy
pm2 start deploy/hostinger/ecosystem.config.cjs
pm2 save
pm2 startup systemd -u devtrack --hp /home/devtrack
```

O último comando imprime uma linha `sudo env PATH=… pm2 startup …`. Rode essa linha **como root**:
ela faz o PM2 do `devtrack` voltar sozinho depois de um reboot. Se o root tiver o próprio PM2 (outros
sites), troque o `pm2` da linha pelo caminho completo do PM2 do `devtrack`
(`/home/devtrack/.nvm/versions/node/<versão>/bin/pm2`). Sem isso, o `PATH` acha antes o PM2 do root, e o
serviço aponta para `/root/.nvm`, que o `devtrack` não lê. Confira com `systemctl status pm2-devtrack`.

Confira:

```bash
pm2 ls                                   # devtrack-api e devtrack-web "online"
pm2 logs devtrack-api --lines 30         # sem "Falha ao iniciar a API"
sudo ss -tlnp | grep -E ':(3010|4010|5433)\b'   # as três em 127.0.0.1
```

## 8. nginx e HTTPS (root)

```bash
cp /home/devtrack/devtrack/deploy/hostinger/nginx-devtrack.conf /etc/nginx/sites-available/devtrack
ln -s /etc/nginx/sites-available/devtrack /etc/nginx/sites-enabled/devtrack
nginx -t && systemctl reload nginx
certbot --nginx -d devtrack.nativcode.com.br --redirect
```

O HTTPS é obrigatório: o cookie de sessão (`__Host-devtrack_session`) é `Secure`, e sem HTTPS ninguém
consegue entrar.

## 9. Primeiro administrador (como `devtrack`)

```bash
cd ~/devtrack
pnpm admin:bootstrap --email <seu e-mail> --print-link
```

O comando envia o e-mail de ativação e também imprime o link, para o caso de o e-mail ainda não estar
chegando. Esse é o único jeito de criar o primeiro administrador.

## 10. Avisos de entrega do Resend

Siga as seções 3 e 5 de `docs/deploy/email.md`:

1. No Resend, crie o webhook para `https://devtrack.nativcode.com.br/api/mail/notices/resend`.
2. Copie o `whsec_…` para o `MAIL_NOTICE_SECRET` de `apps/api/.env`.
3. Rode `pm2 restart devtrack-api`.
4. Confira o primeiro envio.

## 11. Backup diário (root)

```bash
chmod +x /home/devtrack/devtrack/deploy/hostinger/backup.sh
/home/devtrack/devtrack/deploy/hostinger/backup.sh          # um teste agora
( crontab -l 2>/dev/null; echo '30 3 * * * /home/devtrack/devtrack/deploy/hostinger/backup.sh >> /var/log/devtrack-backup.log 2>&1' ) | crontab -
```

Os dumps ficam em `/var/backups/devtrack`, com os últimos 14 dias. Copie-os também para fora da VPS, por
exemplo com um `scp` periódico para o seu computador ou um bucket: um dump no mesmo disco não sobrevive à
perda da máquina. Para restaurar:

```bash
docker exec -i devtrack-prod-postgres-1 pg_restore -U devtrack -d devtrack --clean --if-exists < arquivo.dump
```

## 12. Atualizações

### Automáticas (GitHub Actions)

O workflow `.github/workflows/deploy-hostinger.yml` atualiza a VPS sozinho depois de cada push na `main`
(um merge de PR conta como push), **só se o CI daquele push passar**. Ele entra na VPS como `devtrack`
por SSH, roda o `update.sh` e depois confere `https://devtrack.nativcode.com.br/entrar` e
`/api/health/ready`. Em **Actions → Deploy (Hostinger) → Run workflow** dá para rodar de novo à mão.

A chave do GitHub só consegue rodar o `update.sh`: no `authorized_keys` ela tem um comando forçado e
`restrict` (sem terminal, sem túnel, sem outro comando). O workflow envia `deploy <sha>`, o commit cujo
CI passou; o `update.sh` só publica esse commit se ele estiver na `main` e não for mais antigo que o
publicado (sem rollback). Se a chave vazar, o máximo que alguém faz é avançar a VPS para um commit da
`main`.

**1. Chave só de deploy (na VPS, como `devtrack`)**

```bash
ssh-keygen -t ed25519 -N '' -f ~/.ssh/github_actions_deploy -C github-actions-deploy
printf 'restrict,command="/home/devtrack/devtrack/deploy/hostinger/update.sh" %s\n' \
  "$(cat ~/.ssh/github_actions_deploy.pub)" >> ~/.ssh/authorized_keys
chmod 600 ~/.ssh/authorized_keys
cat ~/.ssh/github_actions_deploy
```

Copie a chave privada impressa (de `-----BEGIN` a `-----END … KEY-----`, inclusive) para o segredo
`SSH_KEY` do passo 2. Depois apague os dois arquivos; a VPS só precisa da linha no `authorized_keys`:

```bash
rm ~/.ssh/github_actions_deploy ~/.ssh/github_actions_deploy.pub
```

**2. GitHub**

Em **DevTrack → Settings → Secrets and variables → Actions → Repository secrets → New repository
secret**, crie:

| Segredo | Valor |
|---|---|
| `VPS_HOST` | `76.13.166.45` |
| `VPS_PORT` | `22` (sem ele, o workflow usa 22) |
| `VPS_USER` | `devtrack` (o dono do `authorized_keys` do passo 1) |
| `SSH_KEY` | a chave privada do passo 1 |

`VPS_HOST`, `VPS_PORT` e `VPS_USER` também podem ficar em **Variables**; o `SSH_KEY` só em **Secrets**.
O workflow lê a chave da VPS na hora (`ssh-keyscan`) e mostra a impressão digital no log, que você pode
comparar com `ssh-keygen -lf /etc/ssh/ssh_host_ed25519_key.pub` na VPS. Uma VPS falsa não ganharia
nada: a chave só roda o `update.sh` e o SSH não entrega a chave privada ao servidor.

O GitHub Actions precisa estar funcionando na conta (Settings → Billing & plans): sem isso, nem o CI nem
o deploy rodam.

**3. Primeiro teste**

Em **Actions → Deploy (Hostinger) → Run workflow**, rode na `main` e acompanhe o log: ele termina com
"DevTrack <commit> no ar." e as duas verificações.

### À mão (como `devtrack`)

```bash
~/devtrack/deploy/hostinger/update.sh
```

O script avança para o topo da `main` (`git fetch` + `git merge --ff-only`), faz o `pnpm install`, `pnpm build`, aplica as migrations e roda o `pm2 reload`.
Uma execução manual e a do GitHub esperam uma pela outra (trava em `/tmp/devtrack-update.lock`).
Durante o `next build`, o site pode responder com erro por alguns segundos.

## 13. Problemas comuns

| Sintoma | Causa provável |
|---|---|
| `502 Bad Gateway` | `devtrack-web` parado: `pm2 logs devtrack-web` |
| Deploy do GitHub falha com `Host key verification failed` | a chave da VPS mudou entre o `ssh-keyscan` e a conexão, ou `VPS_PORT` errado |
| Deploy do GitHub falha com `Permission denied (publickey)` | linha da chave fora do `~/.ssh/authorized_keys` do `devtrack` ou segredo `SSH_KEY` incompleto, ou `VPS_USER` diferente de `devtrack` |
| Deploy do GitHub falha em `git pull --ff-only` | alguém editou arquivos versionados na VPS: `git status` em `~/devtrack` |
| "Falha ao iniciar a API" com nomes de variáveis | variável faltando ou inválida em `apps/api/.env` (seção 6) |
| `SMTP_URL` recusado em produção | sem TLS: precisa ser `smtps://…:465` |
| Login não mantém a sessão | site aberto sem HTTPS (seção 8) |
| `403 ORIGIN_NOT_ALLOWED` | `ALLOWED_ORIGINS` diferente do endereço do navegador |
| E-mail parado em `PENDING`, `ETIMEDOUT` | saída pela porta 465 bloqueada: confira o firewall da Hostinger |
| Upload da ementa dá `413` no nginx | falta o `client_max_body_size 11m` (seção 8) |
