---
name: owasp-security-auditor
description: Audita código-fonte para identificar vulnerabilidades OWASP, violações de ADRs e problemas de segurança.
disable-model-invocation: false
allowed-tools: Read, Grep, Glob, Bash
---

# OWASP Security Auditor

## Objetivo

Realizar auditorias de segurança nos arquivos de código-fonte alterados, identificando possíveis vulnerabilidades, violações das políticas de segurança e riscos que exijam investigação. Produzir um relatório estruturado e rastreável antes de confirmar a execução da auditoria.

A confirmação indica que o relatório foi produzido e passou pelas validações configuradas. Não significa que o código está livre de vulnerabilidades ou aprovado para produção.

## Referências obrigatórias

- OWASP Top 10, considerando a versão adotada pelo projeto.
- OWASP ASVS, quando aplicável.
- ADRs e políticas de segurança existentes no projeto.
- Documentação oficial dos frameworks utilizados.

Não invente ADRs, políticas, resultados de ferramentas ou evidências. Quando uma referência não estiver disponível, registre a limitação no resumo da auditoria.

## Restrições

- Não modificar código-fonte durante a auditoria.
- Não executar comandos destrutivos nem ações que alterem o ambiente da aplicação.
- Não expor credenciais, tokens, senhas ou outros segredos nos relatórios.
- Não declarar ausência de vulnerabilidades sem evidências suficientes.
- Não considerar o próprio código automaticamente seguro.
- Não alterar hashes artificialmente para forçar uma confirmação.
- Não criar ou editar manualmente o marcador `completed`.
- Não confirmar auditoria incompleta.
- Não utilizar o arquivo global `.claude/hooks/.audit-state/current-session`.
- Utilizar `Bash` apenas para inspeções, cálculos de hash, criação do relatório e execução do script de confirmação autorizados por este procedimento.

## Procedimento

1. Identificar o `SESSION_ID` informado pelo hook `Stop`.
2. Identificar a stack tecnológica e as políticas aplicáveis.
3. Ler os arquivos pendentes da sessão.
4. Ler os ADRs de segurança relevantes, se existirem.
5. Analisar autenticação e autorização, quando aplicável.
6. Verificar validação de entradas e saídas.
7. Investigar injeções, inclusive SQL e comandos.
8. Verificar exposição de dados sensíveis e credenciais.
9. Analisar criptografia, gerenciamento de segredos e configurações inseguras.
10. Examinar tratamento de erros, logs e dependências, conforme o contexto e as ferramentas disponíveis.
11. Registrar achados, evidências, impacto, recomendações e limitações.
12. Gerar e validar o relatório JSON.
13. Confirmar a auditoria somente após concluir as etapas anteriores.

## Identificação e isolamento da sessão

Use exclusivamente o `SESSION_ID` fornecido pelo hook que solicitou a auditoria. Não use identificadores de outras sessões nem selecione automaticamente o diretório mais recente.

Calcule o hash do identificador de sessão com SHA-256. O diretório de estado correspondente é:

```text
.claude/hooks/.audit-state/<SESSION_HASH>/
```

O arquivo com os caminhos pendentes é:

```text
.claude/hooks/.audit-state/<SESSION_HASH>/files
```

O relatório deve ser salvo em:

```text
.claude/hooks/.audit-state/<SESSION_HASH>/audit-report.json
```

Se o `SESSION_ID` não estiver disponível, se o diretório não existir ou se não houver arquivos pendentes, informe a falha e não confirme a auditoria.

## Escopo e verificações de segurança

Analise todos os arquivos listados em `files`, sem omissões. Considere, quando aplicável:

- Controle de acesso, autorização e privilégios.
- Autenticação e gerenciamento de sessões.
- Injeção SQL, comandos e outras entradas não confiáveis.
- Validação e codificação de entradas e saídas.
- Exposição de dados sensíveis e credenciais.
- Criptografia e tratamento de segredos.
- Configurações inseguras.
- Tratamento de erros, mensagens e logs.
- Dependências vulneráveis, somente quando houver dados ou ferramentas para verificá-las.
- SSRF e requisições a destinos não confiáveis.
- Violações de ADRs de segurança disponíveis no projeto.

Não afirme que executou uma ferramenta ou uma verificação que não foi efetivamente executada. Registre no resumo final as verificações inconclusivas ou não realizadas.

## Relato dos achados

Para cada vulnerabilidade ou risco identificado, informe no resumo:

- Identificador e categoria OWASP, quando aplicável.
- Severidade e justificativa.
- Arquivo e linha, quando identificáveis.
- Evidência, sem divulgar segredos.
- Impacto provável.
- Correção recomendada.
- Teste sugerido para validar a correção.

Diferencie achados confirmados, suspeitas e verificações inconclusivas. Não classifique uma suspeita como vulnerabilidade comprovada sem evidências.

## Geração do relatório JSON

Após concluir a análise e antes de confirmar, crie `audit-report.json` no diretório da sessão.

Para cada caminho presente em `files`:

1. Preserve o caminho exatamente como registrado no arquivo `files`.
2. Leia o conteúdo atual do arquivo.
3. Calcule o SHA-256 desse conteúdo.
4. Inclua o caminho e o hash no array `files` do relatório.
5. Não inclua caminhos extras nem omita arquivos pendentes.

O formato obrigatório, compatível com a versão atual de `audit-complete.sh`, é:

```json
{
  "schemaVersion": 1,
  "sessionId": "SESSION_ID_REAL",
  "status": "completed",
  "result": "passed",
  "files": [
    {
      "path": "/caminho/absoluto/arquivo.ts",
      "sha256": "HASH_SHA256_REAL_DE_64_CARACTERES"
    }
  ],
  "findings": []
}
```

Use `result: "passed"` somente quando a análise tiver sido concluída sem achados registrados. Esse resultado **não** significa ausência garantida de vulnerabilidades.

Quando houver achados, use `result: "findings"` e preencha `findings` com objetos como:

```json
{
  "rule": "A01:2021",
  "severity": "high",
  "file": "/caminho/absoluto/arquivo.ts",
  "line": 42,
  "description": "Controle de acesso insuficiente na operação analisada.",
  "recommendation": "Validar a autorização no backend antes de executar a operação."
}
```

O campo `line` pode ser omitido quando não houver linha identificável. As severidades aceitas pelo validador atual são `info`, `low`, `medium`, `high` e `critical`. Utilize a categoria OWASP pertinente; o valor `A01:2021` acima é apenas um exemplo.

O esquema atual não possui campos estruturados para verificações inconclusivas ou ferramentas executadas. Informe essas limitações no resumo apresentado ao usuário, sem inventar campos obrigatórios adicionais no JSON.

Se a análise não puder ser concluída, **não** produza um relatório com `status: "completed"` e **não** confirme a auditoria.

## Confirmação da auditoria

A confirmação é a última etapa do processo. Antes dela, verifique que:

1. Todos os arquivos pendentes foram analisados.
2. Os achados e limitações foram registrados.
3. O relatório `audit-report.json` foi salvo no diretório correto.
4. O JSON é válido e respeita o esquema exigido.
5. Os hashes declarados correspondem ao conteúdo efetivamente analisado.
6. Nenhum código-fonte foi modificado durante a auditoria.

Somente depois disso, execute o comando abaixo com o identificador recebido do hook:

```bash
bash .claude/hooks/audit-complete.sh "<SESSION_ID>"
```

Se o comando falhar, investigue a causa. Não altere hashes artificialmente, não crie o marcador `completed` manualmente e não declare a auditoria concluída.

## Resultado apresentado ao usuário

Ao final, informe:

- Arquivos auditados.
- Achados e respectivas severidades.
- Evidências e correções recomendadas.
- Verificações não realizadas ou inconclusivas.
- Resultado da geração e validação do relatório.
- Resultado da confirmação pelo script.

Se houver achados de segurança, não os apresente como aprovação para produção. A confirmação técnica do relatório é diferente da decisão de aceitar ou corrigir os riscos identificados.
