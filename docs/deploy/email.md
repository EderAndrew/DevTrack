# E-mail em produção: Resend agora, AWS SES depois

Este guia leva o DevTrack do Mailpit local ao envio real de e-mail: primeiro pelo Resend, depois
pelo AWS SES, **só com configuração e DNS**, sem nova versão da API (spec 017, research N1 e N15).

O DevTrack envia seis e-mails transacionais e nenhum outro:

- confirmação de e-mail;
- redefinição de senha;
- convite de professor;
- convite de gestor;
- ativação do administrador;
- convite de turma.

Todos passam pela fila `mail_deliveries`: a primeira tentativa sai logo depois da ação, e as falhas
temporárias são tentadas de novo por até 7 vezes. O envio usa SMTP padrão (`nodemailer`) e nenhuma
biblioteca de provedor, por isso trocar de provedor é trocar variáveis. O provedor avisa o
DevTrack quando um e-mail foi entregue, voltou ou foi marcado como spam, e quem convidou vê
"Não entregue" na lista de convites.

## 1. Antes de começar

- Um domínio seu, com acesso ao DNS (os exemplos usam `devtrack.app`). Use um subdomínio só para
  envio, por exemplo `mail.devtrack.app`: a reputação de envio fica separada do domínio principal.
- O endereço público da API, acessível pela internet com HTTPS (os exemplos usam
  `https://api.devtrack.app`). Os avisos do provedor chegam em `POST /api/mail/notices/<provedor>`.
- Acesso às variáveis de ambiente da API e a um reinício dela.
- Duas caixas de teste em provedores diferentes (por exemplo Gmail e Outlook) para a verificação
  da seção 5.

Desenvolvimento, testes e E2E continuam no Mailpit (`SMTP_URL=smtp://localhost:1025`) e nunca
enviam e-mail de verdade.

## 2. Resend: conta, domínio e envio

### 2.1 Conta e chave

1. Crie a conta em <https://resend.com> com um e-mail da instituição (não pessoal).
2. Em **API Keys**, crie uma chave com permissão **Sending access** restrita ao domínio de envio.
   A chave é a senha SMTP: guarde-a no cofre de segredos do ambiente, nunca no repositório.

### 2.2 Domínio: SPF, DKIM, DMARC e return-path

1. Em **Domains → Add Domain**, informe o subdomínio de envio (`mail.devtrack.app`) e escolha a
   região mais próxima dos destinatários.
2. Publique no DNS os registros que o Resend mostrar:
   - **DKIM**: o registro `TXT` (ou os `CNAME`) `resend._domainkey…` com a chave pública; é a
     assinatura que prova que o e-mail saiu do seu domínio;
   - **SPF**: o `TXT` `v=spf1 include:amazonses.com ~all` no subdomínio de **return-path** (o
     Resend usa `send.mail.devtrack.app`), junto do `MX` desse subdomínio. O return-path é o
     endereço que recebe as devoluções; com ele no seu domínio, o SPF fica alinhado ao remetente;
   - **DMARC**: um `TXT` em `_dmarc.devtrack.app`. Comece com
     `v=DMARC1; p=none; rua=mailto:dmarc@devtrack.app` para só observar os relatórios; depois de
     duas semanas sem falhas de SPF ou DKIM, passe para `p=quarantine` (e, se quiser, `p=reject`).
3. Espere o domínio aparecer como **Verified** no Resend. A propagação do DNS pode levar horas.

### 2.3 Variáveis de envio

```dotenv
SMTP_URL=smtps://resend:<chave da API>@smtp.resend.com:465
MAIL_FROM="DevTrack <nao-responda@mail.devtrack.app>"
# opcional: para onde vão as respostas
MAIL_REPLY_TO=contato@devtrack.app
```

- O usuário SMTP do Resend é sempre `resend`; a senha é a chave da API.
- `smtps://` na porta 465 é TLS desde o início. A alternativa aceita é
  `smtp://resend:<chave>@smtp.resend.com:587?requireTLS=true` (STARTTLS obrigatório).
- Se a chave tiver caracteres como `+`, `/` ou `@`, escreva-os codificados na URL (`%2B`, `%2F`,
  `%40`).
- O nome exibido é sempre "DevTrack"; o endereço do `MAIL_FROM` precisa ser do domínio verificado.
- O `Message-ID` de cada e-mail usa o domínio do `MAIL_FROM` (ou `MAIL_MESSAGE_ID_DOMAIN`, se
  definido). É por ele que os avisos do provedor encontram o envio.

## 3. Avisos de entrega (webhook do Resend)

1. Em **Webhooks → Add Endpoint**, cadastre `https://api.devtrack.app/api/mail/notices/resend`.
2. Assine exatamente estes eventos:
   - `email.delivered`: entregue;
   - `email.bounced`: voltou (só a devolução permanente torna o envio "Não entregue");
   - `email.complained`: marcado como spam;
   - `email.failed`: recusado pelo provedor;
   - `email.delivery_delayed`: atraso, só registrado.

   Outros eventos (aberto, clicado, enviado) são aceitos e ignorados.
3. Copie o **Signing secret** do endpoint (começa com `whsec_`) para `MAIL_NOTICE_SECRET` e defina
   `MAIL_NOTICE_PROVIDER=resend`. A API confere a assinatura de cada aviso antes de ler qualquer
   coisa; aviso sem assinatura válida, ou assinado há mais de 5 minutos, recebe `401` e não muda
   nada. Aviso repetido tem efeito uma vez só.
4. Deixe o **rastreamento desligado** no domínio (**Domains → Configuration**): rastreamento de
   abertura (**Open tracking**) e de clique (**Click tracking**) desligados. Os e-mails do
   DevTrack não têm pixel nem link reescrito, e o link de convite ou de senha precisa chegar como
   foi gerado.

Se trocar o segredo no Resend, atualize `MAIL_NOTICE_SECRET` e reinicie a API; os avisos assinados
com o segredo antigo passam a receber `401` e o Resend os tenta de novo.

## 4. Variáveis

Todas ficam em [`apps/api/.env.example`](../../apps/api/.env.example).

| Variável | Padrão | Para quê |
|---|---|---|
| `SMTP_URL` | — | servidor de envio; em produção `smtps://…:465` ou `smtp://…:587?requireTLS=true` |
| `MAIL_FROM` | — | remetente, `DevTrack <nao-responda@<domínio>>` |
| `MAIL_REPLY_TO` | — | endereço de resposta, opcional |
| `MAIL_MESSAGE_ID_DOMAIN` | domínio do `MAIL_FROM` | lado direito do `Message-ID` |
| `MAIL_SENDS_PER_MINUTE` | 120 | envios por minuto somando todas as instâncias; `0` pausa o envio |
| `MAIL_SEND_TIMEOUT_SECONDS` | 20 | tempo-limite de cada envio SMTP; passado, é falha temporária |
| `MAIL_RETRY_INTERVAL_SECONDS` | 30 | intervalo da fila; `0` desliga o timer |
| `MAIL_NOTICE_PROVIDER` | `none` | de quem os avisos são aceitos: `resend` ou `ses` (`none` é recusado em produção) |
| `MAIL_NOTICE_SECRET` | — | segredo de assinatura do Resend (`whsec_…`), obrigatório com `resend` |
| `MAIL_SES_TOPIC_ARN` | — | ARN do tópico SNS, obrigatório com `ses` |
| `RATE_LIMIT_MAIL_NOTICES_PER_MINUTE` | 600 | avisos por minuto por IP na rota de avisos |
| `MAIL_RECORDS_RETENTION_DAYS` | 180 | por quanto tempo os envios finalizados ficam guardados |

Com `NODE_ENV=production`, a API **não sobe** quando:

- o `SMTP_URL` não usa TLS, desliga o TLS (`secure=false`, `ignoreTLS=true`) ou liga o log da
  conversa SMTP (`logger=true`, `debug=true`);
- o `SMTP_URL` aponta para `localhost`, um endereço privado (`10.x`, `172.16–31.x`, `192.168.x`,
  `127.x`, `::1`, …) ou o `mailpit`;
- o `MAIL_FROM` não tem domínio;
- o `MAIL_NOTICE_PROVIDER` é `none`.

A mensagem de erro cita só o nome da variável, nunca o valor. A senha do `SMTP_URL` e o
`MAIL_NOTICE_SECRET` nunca aparecem em logs, auditoria, respostas ou mensagens de erro. Atrás de
um proxy, ajuste `TRUST_PROXY_HOPS` para o limite por IP dos avisos contar o IP do provedor, e não
o do proxy.

## 5. Verificação do primeiro envio

1. Peça uma redefinição de senha (ou convide um professor) para cada caixa de teste.
2. Confira que o e-mail chegou na **caixa de entrada**, não no spam, e abra o original ("Mostrar
   original" no Gmail, "Exibir código-fonte" no Outlook). O cabeçalho `Authentication-Results`
   precisa trazer:
   - `spf=pass`, com o domínio do return-path alinhado;
   - `dkim=pass`, com `d=mail.devtrack.app`;
   - `dmarc=pass`.
3. Confira as duas versões do e-mail (HTML e texto), o mesmo link nas duas e nenhuma imagem
   externa.
4. No banco, o envio passa de `SENT` para `DELIVERED` quando o aviso chega (em geral, segundos):

   ```sql
   SELECT kind, status, attempts, sent_at, delivered_at
   FROM mail_deliveries ORDER BY created_at DESC LIMIT 5;
   ```

5. Convide um aluno com o endereço de teste `bounced@resend.dev`: o envio fica `UNDELIVERED`
   (`undelivered_reason = BOUNCED`) e a aba de convites da turma mostra "Não entregue". O endereço
   `complained@resend.dev` simula a marcação como spam (`COMPLAINED`).
6. Se o envio ficar em `PENDING` com `last_error_code = EAUTH`, a chave está errada; com
   `ECONNECTION` ou `ETIMEDOUT`, a API não alcança o servidor (porta 465 bloqueada na saída é o caso
   mais comum).

## 6. Limites

- **Resend**: o plano define um teto por dia e por mês, e a API aceita um número de requisições
  por segundo (na data deste guia, o plano gratuito tinha 100 e-mails por dia e 3 000 por mês, e
  o limite padrão era de 2 requisições por segundo; confira os valores atuais no painel).
- **AWS SES**: no sandbox, 200 e-mails a cada 24 horas e 1 por segundo, só para endereços
  verificados; fora dele, a cota da conta aparece em **Account dashboard**.
- **DevTrack**: `MAIL_SENDS_PER_MINUTE` (120, ou 2 por segundo) limita os envios de todas as
  instâncias juntas; ajuste para ficar abaixo do limite do provedor. Depois de uma queda longa, a
  fila sai em ordem de criação dentro desse limite, e os links já vencidos são descartados.
  `RATE_LIMIT_MAIL_NOTICES_PER_MINUTE` (600) limita os avisos por IP.
- Uma recusa por falta de cota chega, em geral, como resposta SMTP `4xx` (ou `5xx` fora do
  destinatário): é falha temporária e o envio volta para a fila.

## 7. Troca para o AWS SES

A troca não pede nova versão da API: os envios pendentes saem pelo SES depois do reinício, e os
envios antigos mantêm a situação que tinham. Faça os passos 1 a 6 antes de mudar as variáveis.

1. **Identidade**: em **SES → Identities → Create identity**, crie a identidade de domínio
   `mail.devtrack.app` na região `sa-east-1` (São Paulo).
2. **DKIM**: escolha **Easy DKIM** (RSA 2048) e publique os três `CNAME` `…._domainkey…`.
3. **MAIL FROM personalizado**: em **Custom MAIL FROM domain**, use `bounce.mail.devtrack.app` (não
   o `send.mail…` do Resend, que segue em uso até a troca) e publique o `MX` e o `TXT` SPF
   (`v=spf1 include:amazonses.com ~all`) que o SES mostrar. É o return-path do SES, que deixa o SPF
   alinhado para o DMARC. O DMARC do domínio continua o mesmo.
4. **Saída do sandbox**: em **Account dashboard → Request production access**, descreva o uso
   (e-mails transacionais de uma plataforma de ensino, só para quem tem conta ou foi convidado, sem
   lista de marketing, devoluções e reclamações tratadas pelos avisos). Até a aprovação, o SES só
   envia para endereços verificados.
5. **Credenciais SMTP**: em **SMTP settings → Create SMTP credentials**, crie um usuário IAM só para
   envio. O usuário e a senha SMTP gerados são da região `sa-east-1`; guarde-os no cofre.
6. **Sem rastreamento e com avisos**:
   - crie um **configuration set** sem rastreamento de abertura nem de clique e torne-o o padrão
     da identidade (**Default configuration set**);
   - crie um tópico **SNS** (por exemplo `devtrack-ses-notices`) e, na identidade, em
     **Notifications**, aponte `Bounce`, `Complaint` e `Delivery` para ele com
     **Include original headers** (incluir cabeçalhos originais) ligado: é nos cabeçalhos originais
     que o SES devolve o nosso `Message-ID`;
   - assine o tópico com o protocolo **HTTPS** em `https://api.devtrack.app/api/mail/notices/ses`.
     A API confirma a assinatura sozinha, mas só depois do passo 7 (antes disso, a rota do SES
     responde `404`; reenvie a confirmação pelo console do SNS).
7. **Variáveis** (e reinício da API):

   ```dotenv
   SMTP_URL=smtps://<usuário SMTP>:<senha SMTP codificada>@email-smtp.sa-east-1.amazonaws.com:465
   MAIL_NOTICE_PROVIDER=ses
   MAIL_SES_TOPIC_ARN=arn:aws:sns:sa-east-1:<conta>:devtrack-ses-notices
   ```

   A senha SMTP do SES costuma ter `+` e `/`: codifique-os na URL. O `MAIL_FROM` continua o mesmo
   se o domínio for o mesmo; o `MAIL_NOTICE_SECRET` deixa de ser usado.
8. **Depois da troca**:
   - a rota do Resend passa a responder `404`; apague o webhook no Resend;
   - refaça a seção 5 com os endereços de teste do SES (`success@simulator.amazonses.com`,
     `bounce@simulator.amazonses.com`, `complaint@simulator.amazonses.com`);
   - quando nenhum envio pendente restar do período do Resend, remova do DNS os registros DKIM e
     return-path do Resend e revogue a chave.

Para voltar ao Resend, o caminho é o mesmo ao contrário: `SMTP_URL` do Resend,
`MAIL_NOTICE_PROVIDER=resend` e `MAIL_NOTICE_SECRET`.

## 8. LGPD: o provedor como operador

O provedor de e-mail trata dados pessoais em nome da instituição que opera o DevTrack: é
**operador** (LGPD, art. 5º, VII, e art. 39), e a instituição é a controladora.

- **O que o provedor recebe**: o endereço do destinatário, o nome dele no corpo do e-mail e o link
  com um token de uso único. Nenhuma nota, resposta ou conteúdo das turmas sai por e-mail.
- **O que formalizar**: o contrato de tratamento de dados (DPA) com o provedor (o Resend publica o
  seu; na AWS, o DPA faz parte dos termos do serviço), registrado no inventário de tratamentos
  (ROPA) da instituição, com a finalidade (e-mails transacionais da conta e dos convites) e a base
  legal.
- **Onde ficam os dados**: no Resend, na região escolhida para o domínio (fora do Brasil, é
  transferência internacional: registre o mecanismo, como as cláusulas-padrão da ANPD, Resolução
  CD/ANPD nº 19/2024); no SES em `sa-east-1`, o envio é processado no Brasil.
- **Por quanto tempo**: o DevTrack não guarda nada do e-mail (nem endereço, nem assunto, nem
  link) nas tabelas de envio. Os envios finalizados ficam `MAIL_RECORDS_RETENTION_DAYS` dias (180)
  e os avisos 90 dias, apagados pelo job `mail-records`. No provedor, os registros de envio seguem
  a retenção do plano (o Resend mostra o histórico no painel; no SES, não ligue o arquivamento de
  mensagens nem logs com o corpo). Registre essas retenções no ROPA.
- **Pedidos do titular**: um pedido de eliminação no DevTrack não apaga o histórico do provedor;
  peça a remoção pelo canal do provedor quando for o caso.
