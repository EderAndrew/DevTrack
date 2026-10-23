# ADR-0003 — Arquitetura de Auditoria Automatizada por Hooks

**Status:** Proposta  
**Data:** 2026-10-23  
**Decisores:** Equipe responsável pela arquitetura e segurança do projeto  
**Relacionada:** ADR-0002 — Política de Segurança OWASP Top 10 e ASVS

## 1. Contexto

O projeto utiliza Claude Code para auxiliar no desenvolvimento de software. Alterações realizadas por agentes de IA precisam ser submetidas a uma auditoria de segurança rastreável, sem depender exclusivamente de solicitações manuais.

Para atender a essa necessidade, foi implementado um mecanismo de auditoria baseado nos hooks `PostToolUse` e `Stop`, integrado à Skill `owasp-security-auditor`.

A arquitetura já foi submetida a testes funcionais, incluindo detecção de alterações, isolamento por sessão, geração de relatórios JSON, confirmação de auditoria e identificação de divergências SHA-256.

Entretanto, ainda não existem controles completos de aprovação por severidade, ferramentas SAST integradas ou garantias de proteção contra adulterações realizadas por processos com acesso aos mecanismos de auditoria.

## 2. Decisão arquitetural

Adotar uma arquitetura de auditoria automatizada baseada em eventos do Claude Code, com estado isolado por sessão e confirmação explícita de integridade.

O processo será composto por:

1. Detecção de alterações por `PostToolUse`.
2. Registro dos arquivos modificados.
3. Solicitação de auditoria pelo hook `Stop`.
4. Execução da Skill `owasp-security-auditor`.
5. Geração de relatório JSON.
6. Validação do relatório pelo `audit-complete.sh`.
7. Registro das assinaturas SHA-256.
8. Verificação final pelo hook `Stop`.
9. Encerramento da pendência somente após validação.

A confirmação de integridade não representa aprovação de segurança.

## 3. Componentes da arquitetura

### 3.1. Configuração dos hooks

**Arquivo:** `.claude/settings.json`

Responsável por configurar os eventos do Claude Code que acionam o mecanismo de auditoria.

O hook `PostToolUse` acompanha as operações configuradas de escrita e edição.

O hook `Stop` verifica se existem alterações pendentes e solicita a auditoria quando necessário.

### 3.2. Hook de segurança

**Arquivo:** `.claude/hooks/security-check.sh`

Responsabilidades:

- Identificar a sessão.
- Registrar arquivos modificados.
- Gerenciar o estado de auditoria.
- Solicitar a execução da Skill.
- Verificar confirmações.
- Validar hashes de código e relatório.
- Registrar falhas e resultados.
- Preservar pendências quando a validação falhar.

### 3.3. Skill de auditoria

**Arquivo:** `.claude/skills/owasp-security-auditor/SKILL.md`

Responsabilidades:

- Consultar as ADRs aplicáveis.
- Analisar os arquivos pendentes.
- Identificar possíveis vulnerabilidades.
- Registrar evidências e severidades.
- Declarar limitações da análise.
- Gerar o relatório estruturado.
- Solicitar a confirmação pelo script autorizado.

A Skill não deverá modificar o código-fonte durante a auditoria.

### 3.4. Script de confirmação

**Arquivo:** `.claude/hooks/audit-complete.sh`

Responsabilidades:

- Receber o identificador explícito da sessão.
- Validar a existência de uma auditoria pendente.
- Validar a estrutura do relatório JSON.
- Comparar os arquivos declarados com os arquivos pendentes.
- Verificar hashes individuais.
- Calcular o hash agregado do código.
- Calcular o hash do relatório.
- Registrar a confirmação.

### 3.5. Armazenamento de estado

**Diretório:** `.claude/hooks/.audit-state/`

Cada sessão utilizará um diretório identificado por:

`SESSION_HASH = SHA256(SESSION_ID)`

A identificação da sessão deverá ser obtida exclusivamente do evento correspondente.

Não será utilizado um ponteiro global `current-session`.

## 4. Fluxo da auditoria

```text
Claude Code
    |
    v
Write / Edit / MultiEdit
    |
    v
PostToolUse
    |
    v
security-check.sh
    |
    v
Registra arquivos pendentes
    |
    v
Stop
    |
    v
Solicita auditoria OWASP
    |
    v
owasp-security-auditor
    |
    v
Analisa arquivos e ADRs
    |
    v
audit-report.json
    |
    v
audit-complete.sh
    |
    v
Valida relatório e hashes
    |
    v
Registra completed
    |
    v
Stop
    |
    v
Valida código e relatório
    |
    v
Remove pendência
```

## 5. Modelo de estado

Os arquivos de controle incluem:

| Arquivo | Finalidade |
|---|---|
| `session-id` | Identificador da sessão |
| `files` | Arquivos pendentes de auditoria |
| `pending` | Indica auditoria pendente |
| `requested` | Indica solicitação de auditoria |
| `attempts` | Contabiliza tentativas sem confirmação |
| `completed` | Registra hashes e data da confirmação |
| `audit-report.json` | Contém resultado e evidências da análise |

O marcador `completed` utiliza o formato:

`HASH_DO_CODIGO HASH_DO_RELATORIO DATA_UTC`

Após a validação final, os marcadores transitórios são removidos e a lista de arquivos pendentes é esvaziada.

O relatório JSON permanece armazenado.

## 6. Isolamento de sessões

Cada auditoria deverá operar exclusivamente sobre os arquivos associados ao seu `SESSION_ID`.

É proibido:

- Utilizar identificadores de outras sessões.
- Selecionar automaticamente a sessão mais recente.
- Utilizar um ponteiro global de sessão.
- Confirmar auditorias sem o identificador exigido.
- Compartilhar marcadores de confirmação entre sessões.

O isolamento por diretório reduz interferências entre sessões, mas não constitui uma fronteira de segurança contra processos com acesso de escrita ao armazenamento de estado.

## 7. Integridade e confirmação

O mecanismo utiliza SHA-256 para detectar alterações nos arquivos auditados e no relatório.

A confirmação somente poderá ser aceita quando:

1. A auditoria estiver pendente.
2. O relatório JSON existir e for válido.
3. Os arquivos declarados corresponderem aos arquivos pendentes.
4. Os hashes individuais forem consistentes.
5. O marcador de confirmação possuir os hashes esperados.
6. O conteúdo atual corresponder às assinaturas registradas.

Quando houver divergência, a confirmação deverá ser invalidada e a pendência preservada.

Os hashes não fornecem, isoladamente, autenticação da origem do relatório ou proteção contra adulterações coordenadas.

## 8. Tratamento de falhas

O mecanismo deverá adotar comportamento conservador diante de:

- Relatórios ausentes.
- JSON inválido.
- Arquivos pendentes ausentes.
- Hashes divergentes.
- Confirmações inválidas.
- Identificadores de sessão ausentes.
- Auditorias não confirmadas.

O script não deverá declarar uma auditoria concluída quando essas condições impedirem a validação.

O mecanismo atual utiliza um limite de tentativas para sinalizar necessidade de intervenção manual.

Esse limite não autoriza ignorar a auditoria ou remover automaticamente a pendência.

## 9. Política de aprovação

O encerramento técnico da auditoria e a aprovação de segurança deverão ser tratados como operações distintas.

Atualmente, o mecanismo aceita relatórios válidos com resultados `passed` ou `findings`.

Isso significa que um relatório com achados pode ser confirmado tecnicamente.

A aprovação por severidade será implementada em etapa posterior, conforme a política estabelecida na ADR-0002.

## 10. Evidências e observabilidade

O mecanismo deverá registrar informações relevantes para diagnóstico e rastreabilidade.

Os registros incluem:

- Solicitação de auditoria.
- Identificador derivado da sessão.
- Confirmação registrada.
- Hash do código.
- Hash do relatório.
- Divergências identificadas.
- Validação final.
- Falhas de execução.

A preservação histórica, a retenção dos relatórios e a proteção contra alterações não autorizadas serão tratadas em ADR específica.

## 11. Limitações conhecidas

A implementação atual possui as seguintes limitações:

- A análise de segurança depende principalmente da avaliação realizada pelo agente.
- Ainda não existe integração obrigatória com ferramentas SAST.
- Não há bloqueio automático de aprovação por severidade.
- O relatório é gerado pelo próprio agente auditor.
- Os arquivos de estado e scripts locais podem ser modificados por processos com permissões suficientes.
- A cobertura depende dos eventos e ferramentas configurados nos hooks.
- Ainda não existe mecanismo independente de assinatura digital ou armazenamento imutável das evidências.
- A resistência a condições de corrida e modificações concorrentes exige avaliação adicional.

Essas limitações deverão ser consideradas antes de utilizar o mecanismo como controle exclusivo de segurança em ambientes críticos.

## 12. Alternativas consideradas

### Auditoria manual

Permite revisão contextual, mas depende da disciplina de execução e dificulta a padronização.

### Auditoria somente por prompt

É simples de implementar, mas não fornece controle consistente do ciclo de alterações.

### Auditoria exclusivamente por ferramentas SAST

Oferece verificações reproduzíveis, mas não substitui análise contextual e arquitetural.

### Auditoria por hooks com análise contextual

Integra a auditoria ao fluxo de desenvolvimento e permite registrar evidências por sessão.

Esta é a abordagem adotada, com previsão de integração futura a ferramentas independentes.

## 13. Consequências

### Positivas

- Auditoria integrada ao desenvolvimento.
- Redução da dependência de solicitações manuais.
- Isolamento lógico por sessão.
- Rastreabilidade das alterações.
- Detecção de divergências de integridade.
- Base para políticas de aprovação automatizadas.

### Negativas

- Maior complexidade operacional.
- Dependência da configuração correta dos hooks.
- Possibilidade de interrupções no fluxo de desenvolvimento.
- Necessidade de manutenção dos scripts.
- Necessidade de testes após mudanças no mecanismo de auditoria.

## 14. Critérios de aceitação

Esta ADR poderá ser considerada implementada quando:

1. Os hooks detectarem as alterações configuradas.
2. As sessões forem isoladas corretamente.
3. A Skill executar a auditoria dos arquivos pendentes.
4. O relatório JSON for gerado e validado.
5. Os hashes de código e relatório forem verificados.
6. Divergências impedirem a confirmação.
7. Auditorias não confirmadas permanecerem pendentes.
8. Os testes positivos e negativos forem documentados.

A aprovação por severidade e a integração SAST são evoluções relacionadas, mas não constituem requisitos para considerar a arquitetura básica de hooks implementada.

## 15. Referências

- ADR-0001 — Arquitetura de IA do projeto.
- ADR-0002 — Política de Segurança OWASP Top 10 e ASVS.
- `.claude/settings.json`
- `.claude/hooks/security-check.sh`
- `.claude/hooks/audit-complete.sh`
- `.claude/skills/owasp-security-auditor/SKILL.md`
- OWASP Application Security Verification Standard — https://owasp.org/www-project-application-security-verification-standard/