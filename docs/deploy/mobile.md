# Deploy — app do celular (024)

O app do professor (`apps/mobile`) é distribuído internamente por EAS Build, só Android no piloto. Os avisos
saem da API pelo Expo Push (FCM). Este guia cobre o projeto EAS, as credenciais do FCM, a configuração da API no
VPS e a instalação no aparelho do piloto.

## 1. Projeto EAS

```bash
npm i -g eas-cli            # >= 16
eas login                   # conta Expo da organização
cd apps/mobile
eas init                    # cria o projeto; anote o projectId
```

O `projectId` entra no build pela variável `EAS_PROJECT_ID` (`app.config.ts` → `extra.eas.projectId`), que o
`expo-notifications` usa para obter o token de push. Defina-a nos segredos do projeto EAS
(`eas env:create --name EAS_PROJECT_ID --value <id> --environment preview --environment development`).

## 2. Credenciais do FCM (Android)

1. No Firebase Console, crie um projeto e um app Android com o pacote `br.com.nativcode.devtrack`.
2. Em "Contas de serviço", gere uma chave privada (JSON) da API FCM v1.
3. `eas credentials` → Android → `br.com.nativcode.devtrack` → "Google Service Account" → "Push Notifications
   (FCM V1)" → envie o JSON. Ele fica guardado no Expo; não o coloque no repositório nem no VPS.

## 3. API no VPS

No `.env` da API (`~/devtrack/apps/api/.env` do usuário `devtrack`, ver `docs/deploy/hostinger.md`):

```dotenv
PUSH_ENABLED=true
EXPO_ACCESS_TOKEN=<expo.dev → Account settings → Access tokens, um token de robô só para push>
# EXPO_PUSH_BASE_URL fica no padrão (https://exp.host); a API recusa outro valor sem https em produção.
# EXAM_ALERT_INTERVAL_MS=1000   EXAM_ALERT_MAX_AGE_SECONDS=60   RATE_LIMIT_MOBILE_WRITES_PER_MINUTE=30
```

`PUSH_ENABLED=false` é a chave de desligar: os avisos continuam registrados e terminam `SKIPPED`, nada é
enviado, e a prova não muda em nada. Com `PUSH_ENABLED=true` a API não sobe sem `EXPO_ACCESS_TOKEN`. O token
nunca aparece em log. Reinicie com `pm2 restart devtrack-api` e confira `GET /api/health/ready`.

Os jobs de manutenção `exam-alerts` (avisos com mais de 7 dias) e `mobile-devices` (celulares de sessões
vencidas) rodam com os outros; `pnpm --filter api maintenance:run --job exam-alerts` roda um deles na hora.

## 4. Builds

`eas.json` tem dois perfis, ambos `distribution: internal` e APK:

| Perfil | Para quê | API |
|---|---|---|
| `development` | build de desenvolvimento, necessário para testar push localmente (exige instalar o `expo-dev-client` em `apps/mobile`, ainda fora das dependências) | `http://10.0.2.2:4000` (o host do emulador) |
| `internal` | o APK do piloto | `https://devtrack.nativcode.com.br` |

```bash
cd apps/mobile
eas build --profile internal --platform android
```

O `app.config.ts` recusa um perfil que não seja `development` com `EXPO_PUBLIC_API_ORIGIN` fora de `https://`.

## 5. Instalação no piloto

1. Ao fim do build, o EAS mostra um link e um QR code do APK. Abra-o no aparelho do professor.
2. Permita "instalar apps desconhecidos" para o navegador, só durante a instalação.
3. Abra o DevTrack, entre com a conta de professor e permita as notificações.
4. Confira com o celular bloqueado que o aviso mostra só "DevTrack" e "Conteúdo oculto", e que a prova retida
   vibra mais forte (canal `exam-holds`).

Para revogar um aparelho perdido: "Minhas sessões" na web → encerrar a sessão do celular. O celular deixa de
receber avisos no mesmo instante.

## 6. Problemas comuns

- **Nenhum aviso chega**: `PUSH_ENABLED`, o token do Expo, as credenciais FCM no EAS, a permissão de notificações
  no aparelho (o app mostra um aviso permanente se estiver negada) e se a prova não está silenciada.
- **`DeviceNotRegistered`**: o app foi desinstalado ou o token mudou; a API remove o celular sozinha
  (`mobile_device.removed`, `PROVIDER_UNREGISTERED`). Entrar de novo registra o novo token.
